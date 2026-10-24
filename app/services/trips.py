"""선택한 장소를 출발지 기준 직선거리 근접 순으로 정렬한다(greedy nearest-neighbor).

- 좌표: 카탈로그 location 의 lat/lng 가 있으면 그대로, 없으면 공식 주소를 NAVER 지오코딩(기존 maps 모듈)으로 찾는다.
- 지오코딩 키 없음·결과 없음·실패는 unlocated 사유로 드러낸다. 가짜 좌표를 만들지 않는다.
- product·guide 는 위치가 없는 준비물·안내이므로 checklist 로 돌린다.
"""

from __future__ import annotations

import logging
import math
from datetime import datetime, timezone
from urllib.parse import quote

import httpx

from app.schemas.discovery import Catalog, CatalogItem
from app.schemas.trips import (
    MapLinks,
    TripChecklistItem,
    TripOriginResolved,
    TripPlanRequest,
    TripPlanResponse,
    TripStop,
    TripUnlocated,
)
from app.services import maps as maps_svc

logger = logging.getLogger(__name__)
EARTH_RADIUS_M = 6_371_000


class UnknownItems(Exception):
    def __init__(self, ids: list[str]) -> None:
        super().__init__(f"Unknown item_ids: {', '.join(ids)}")
        self.ids = ids


def haversine_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lng1, lat2, lng2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(h))


async def _locate(client: httpx.AsyncClient, query: str) -> tuple[tuple[float, float] | None, str | None, str]:
    """(좌표, 정규 주소, 상태). 상태: ok | geocode_unavailable | geocode_no_result | geocode_failed."""
    try:
        res = await maps_svc.geocode(client, query)
    except maps_svc.LiveNotConfigured:
        return None, None, "geocode_unavailable"
    except maps_svc.LiveUpstreamError:
        return None, None, "geocode_failed"
    if not res.results:
        return None, None, "geocode_no_result"
    top = res.results[0]
    return (top.lat, top.lng), top.address, "ok"


def _links(item: CatalogItem, here: tuple[float, float], prev: tuple[float, float] | None) -> MapLinks:
    loc = item.location
    q = " ".join(x for x in (loc.name if loc else item.title, loc.address if loc else None) if x)
    dest = f"{here[0]:.6f},{here[1]:.6f}"
    google = f"https://www.google.com/maps/dir/?api=1&destination={dest}&travelmode=transit"
    if prev is not None:
        google += f"&origin={prev[0]:.6f},{prev[1]:.6f}"
    return MapLinks(naver_search=f"https://map.naver.com/p/search/{quote(q)}", google_directions=google)


async def plan(req: TripPlanRequest, catalog: Catalog, client: httpx.AsyncClient, now: datetime | None = None) -> TripPlanResponse:
    by_id = {i.id: i for i in catalog.items}
    unknown = [i for i in req.item_ids if i not in by_id]
    if unknown:
        raise UnknownItems(unknown)
    items = [by_id[i] for i in req.item_ids]

    checklist = [TripChecklistItem(item_id=i.id, title=i.title, kind=i.kind) for i in items if i.kind != "place"]
    located: list[tuple[CatalogItem, tuple[float, float], str | None, str]] = []
    unlocated: list[TripUnlocated] = []
    for item in (i for i in items if i.kind == "place"):
        loc = item.location
        if loc and loc.lat is not None and loc.lng is not None:
            located.append((item, (loc.lat, loc.lng), loc.address, "catalog"))
            continue
        if not (loc and loc.address):
            unlocated.append(TripUnlocated(item_id=item.id, title=item.title, reason="no_address"))
            continue
        point, address, status = await _locate(client, loc.address)
        if point is None:
            unlocated.append(TripUnlocated(item_id=item.id, title=item.title, reason=status))
        else:
            located.append((item, point, address or loc.address, "geocode"))

    origin, origin_status, start = None, "none", None
    if req.origin is not None:
        if req.origin.lat is not None:
            origin = TripOriginResolved(label="Your starting point", lat=req.origin.lat, lng=req.origin.lng, source="input")
            origin_status = "ok"
        else:
            point, address, origin_status = await _locate(client, req.origin.address)
            if point is not None:
                origin = TripOriginResolved(label=address or req.origin.address, lat=point[0], lng=point[1], source="geocode")
        if origin is not None:
            start = (origin.lat, origin.lng)

    # greedy nearest-neighbor. 동률이면 요청 순서(안정 정렬). 출발지가 없으면 첫 위치 확인 장소에서 시작한다.
    remaining = list(located)
    ordered: list[tuple[CatalogItem, tuple[float, float], str | None, str, float | None]] = []
    current = start
    while remaining:
        if current is None:
            nxt = remaining.pop(0)
            dist = None
        else:
            idx = min(range(len(remaining)), key=lambda k: (haversine_m(current, remaining[k][1]), k))
            nxt = remaining.pop(idx)
            dist = haversine_m(current, nxt[1])
        ordered.append((*nxt, dist))
        current = nxt[1]

    stops, prev = [], start
    for n, (item, point, address, source, dist) in enumerate(ordered, 1):
        stops.append(TripStop(
            order=n, item_id=item.id, title=item.title, address=address, lat=point[0], lng=point[1],
            location_source=source, distance_from_previous_m=round(dist) if dist is not None else None,
            map_links=_links(item, point, prev),
        ))
        prev = point

    notes = ["Order is by straight-line distance only. It is not a travel-time or road-route optimization.",
             "Opening hours and bookings are not checked."]
    if req.origin is not None and origin is None:
        notes.append("We could not place your starting point, so the order starts from the first located place.")
    logger.info("[Trips] plan stops=%d unlocated=%d checklist=%d origin=%s", len(stops), len(unlocated), len(checklist), origin_status)
    stamp = (now or datetime.now(timezone.utc)).isoformat(timespec="seconds")
    return TripPlanResponse(origin=origin, origin_status=origin_status, stops=stops, unlocated=unlocated,
                            checklist=checklist, notes=notes, generated_at=stamp)

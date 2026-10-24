"""POST /v1/trips/plan 계약 — 선택한 카탈로그 항목을 출발지 기준 가까운 순으로 정렬한다.

직선거리 기반 근접 정렬이다. 이동시간·도로 경로·예약을 뜻하지 않는다(method·distance_source 로 구분).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

MAX_TRIP_ITEMS = 20
# 한국 범위(대략 경계). 범위 밖 좌표는 거절한다 — 국내 장소만 다루는 서비스 범위(이 파일 국소 상수)
KOREA_LAT = (33.0, 39.0)
KOREA_LNG = (124.0, 132.0)


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class TripOrigin(_Strict):
    address: str | None = Field(default=None, min_length=1, max_length=200)
    lat: float | None = None
    lng: float | None = None

    @model_validator(mode="after")
    def _one_kind(self) -> "TripOrigin":
        has_coords = self.lat is not None or self.lng is not None
        if self.address is None and not has_coords:
            raise ValueError("origin needs an address or lat/lng")
        if self.address is not None and has_coords:
            raise ValueError("origin takes either an address or lat/lng, not both")
        if has_coords:
            if self.lat is None or self.lng is None:
                raise ValueError("origin needs both lat and lng")
            if not (KOREA_LAT[0] <= self.lat <= KOREA_LAT[1] and KOREA_LNG[0] <= self.lng <= KOREA_LNG[1]):
                raise ValueError("origin coordinates must be inside South Korea")
        return self


class TripPlanRequest(_Strict):
    item_ids: list[str] = Field(min_length=1, max_length=MAX_TRIP_ITEMS)
    origin: TripOrigin | None = None

    @model_validator(mode="after")
    def _dedupe(self) -> "TripPlanRequest":
        seen: list[str] = []
        for i in self.item_ids:
            if not i.strip():
                raise ValueError("item_ids must not contain empty ids")
            if i not in seen:
                seen.append(i)
        self.item_ids = seen
        return self


class MapLinks(_Strict):
    naver_search: str
    google_directions: str


class TripStop(_Strict):
    order: int
    item_id: str
    title: str
    address: str | None
    lat: float
    lng: float
    location_source: Literal["catalog", "geocode"]
    distance_from_previous_m: int | None  # 첫 정류장은 출발지가 있을 때만 값이 있다
    map_links: MapLinks


UnlocatedReason = Literal["no_address", "geocode_unavailable", "geocode_no_result", "geocode_failed"]


class TripUnlocated(_Strict):
    item_id: str
    title: str
    reason: UnlocatedReason


class TripChecklistItem(_Strict):
    item_id: str
    title: str
    kind: Literal["product", "guide"]


class TripOriginResolved(_Strict):
    label: str
    lat: float
    lng: float
    source: Literal["input", "geocode"]


class TripPlanResponse(_Strict):
    method: Literal["proximity"] = "proximity"
    distance_source: Literal["straight_line"] = "straight_line"
    origin: TripOriginResolved | None
    origin_status: Literal["none", "ok", "geocode_unavailable", "geocode_no_result", "geocode_failed"]
    stops: list[TripStop]
    unlocated: list[TripUnlocated]
    checklist: list[TripChecklistItem]
    notes: list[str]
    generated_at: str

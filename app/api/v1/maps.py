from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from app.schemas.live import DirectionsResponse, GeocodeResponse, MapsConfig
from app.services import maps as svc

router = APIRouter(prefix="/maps", tags=["maps"])


async def get_live_client() -> AsyncIterator[httpx.AsyncClient]:
    """maps·evidence·fx 공용. 테스트는 app.dependency_overrides 로 MockTransport 클라이언트를 주입한다."""
    async with svc.new_client() as client:
        yield client


def to_http_error(exc: Exception) -> HTTPException:
    if isinstance(exc, svc.LiveNotConfigured):
        return HTTPException(status_code=503, detail=str(exc))
    if isinstance(exc, svc.LiveNotEnabled):
        return HTTPException(status_code=501, detail=str(exc))  # 키는 있으나 콘솔에서 상품 미활성 — 503(키 없음)과 구분
    return HTTPException(status_code=502, detail=str(exc))  # LiveUpstreamError: 본문·키·URL 미포함 메시지


@router.get("/config")
async def get_config() -> MapsConfig:
    return svc.public_config()  # 공개 식별자만. 비밀키는 응답 모델에 필드가 없다


@router.get("/geocode")
async def get_geocode(
    query: str = Query(min_length=2, max_length=200),
    client: httpx.AsyncClient = Depends(get_live_client),
) -> GeocodeResponse:
    try:
        return await svc.geocode(client, query)
    except (svc.LiveNotConfigured, svc.LiveUpstreamError) as exc:
        raise to_http_error(exc) from None


# "lng,lat" — 경도·위도 숫자 쌍. 범위는 아래에서 한 번 더 본다(대한민국 부근만).
_POINT = r"-?\d{1,3}(?:\.\d+)?,-?\d{1,2}(?:\.\d+)?"


def _in_korea(point: str) -> bool:
    lng, lat = (float(v) for v in point.split(","))
    return 122.0 <= lng <= 133.0 and 32.0 <= lat <= 45.0


@router.get("/directions")
async def get_directions(
    start: str = Query(pattern=f"^{_POINT}$"),
    goal: str = Query(pattern=f"^{_POINT}$"),
    waypoints: str | None = Query(default=None, pattern=rf"^{_POINT}(?:\|{_POINT}){{0,4}}$"),
    option: Literal["trafast", "tracomfort", "traoptimal"] = "trafast",
    client: httpx.AsyncClient = Depends(get_live_client),
) -> DirectionsResponse:
    points = [start, goal, *(waypoints.split("|") if waypoints else [])]
    if not all(_in_korea(p) for p in points):
        raise HTTPException(status_code=422, detail="Invalid request: coordinates must be lng,lat inside South Korea")
    try:
        return await svc.directions(client, start, goal, waypoints, option)
    except (svc.LiveNotConfigured, svc.LiveNotEnabled, svc.LiveUpstreamError) as exc:
        raise to_http_error(exc) from None

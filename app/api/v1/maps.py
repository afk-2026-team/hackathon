from __future__ import annotations

from collections.abc import AsyncIterator

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from app.schemas.live import GeocodeResponse, MapsConfig
from app.services import maps as svc

router = APIRouter(prefix="/maps", tags=["maps"])


async def get_live_client() -> AsyncIterator[httpx.AsyncClient]:
    """maps·evidence·fx 공용. 테스트는 app.dependency_overrides 로 MockTransport 클라이언트를 주입한다."""
    async with svc.new_client() as client:
        yield client


def to_http_error(exc: Exception) -> HTTPException:
    if isinstance(exc, svc.LiveNotConfigured):
        return HTTPException(status_code=503, detail=str(exc))
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

from __future__ import annotations

from typing import Literal

import httpx
from fastapi import APIRouter, Depends, Query

from app.api.v1.maps import get_live_client, to_http_error
from app.schemas.live import BlogResponse, VideoResponse
from app.services import evidence as svc
from app.services.maps import LiveNotConfigured, LiveUpstreamError

router = APIRouter(prefix="/evidence", tags=["evidence"])


@router.get("/blog")
async def get_blog(
    query: str = Query(min_length=2, max_length=100),
    display: int = Query(default=6, ge=1, le=20),
    client: httpx.AsyncClient = Depends(get_live_client),
) -> BlogResponse:
    try:
        return await svc.search_blog(client, query, display)
    except (LiveNotConfigured, LiveUpstreamError) as exc:
        raise to_http_error(exc) from None


@router.get("/videos")
async def get_videos(
    query: str = Query(min_length=2, max_length=100),
    lang: Literal["en", "ko"] = Query(default="en"),
    max: int = Query(default=6, ge=1, le=10),
    client: httpx.AsyncClient = Depends(get_live_client),
) -> VideoResponse:
    try:
        return await svc.search_videos(client, query, lang, max)
    except (LiveNotConfigured, LiveUpstreamError) as exc:
        raise to_http_error(exc) from None

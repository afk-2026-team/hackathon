from __future__ import annotations

from typing import Literal

import httpx
from fastapi import APIRouter, Depends, Query

from app.api.v1.maps import get_live_client, to_http_error
from app.schemas.live import FxResponse
from app.services import fx as svc
from app.services.maps import LiveUpstreamError

router = APIRouter(tags=["fx"])


@router.get("/fx")
async def get_fx(
    base: Literal["KRW"] = Query(default="KRW"),  # KRW 만 허용, 그 외 422
    client: httpx.AsyncClient = Depends(get_live_client),
) -> FxResponse:
    try:
        return await svc.krw_rates(client)
    except LiveUpstreamError as exc:
        raise to_http_error(exc) from None

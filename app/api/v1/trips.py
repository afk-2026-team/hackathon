"""POST /v1/trips/plan — 선택 항목의 근접 순서 계획(직선거리). 지오코딩은 기존 maps 클라이언트를 재사용한다."""

from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from app.api.v1.discovery import _catalog
from app.api.v1.maps import get_live_client
from app.schemas.trips import TripPlanRequest, TripPlanResponse
from app.services import trips as svc

router = APIRouter(prefix="/trips", tags=["trips"])


@router.post("/plan", response_model=TripPlanResponse)
async def post_plan(body: TripPlanRequest, client: httpx.AsyncClient = Depends(get_live_client)):
    try:
        return await svc.plan(body, _catalog(), client)
    except svc.UnknownItems as exc:
        # 다른 오류와 같은 {error:{message,param}} 형태 + 어떤 id 가 없는지 목록
        return JSONResponse(status_code=422, content={"error": {"message": str(exc), "param": "item_ids", "unknown_ids": exc.ids}})

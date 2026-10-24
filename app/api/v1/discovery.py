from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from app.schemas.discovery import Catalog, RecommendationRequest, RecommendationResponse
from app.services import discovery as svc
from app.utils.logger import AGENT_LOGGER_NAME

logger = logging.getLogger(AGENT_LOGGER_NAME)

router = APIRouter(prefix="/discovery", tags=["discovery"])


def _catalog() -> Catalog:
    try:
        return svc.load_catalog()
    except svc.CatalogUnavailable as exc:
        # 대체 데이터를 만들지 않는다: 화면이 오류와 재시도를 보여줄 수 있게 503 으로 드러낸다
        logger.error(f"[Discovery] ❌ {exc}")
        raise HTTPException(status_code=503, detail=f"Discovery catalog unavailable: {exc}") from exc


@router.get("/catalog")
async def get_catalog() -> Catalog:
    return _catalog()


@router.post("/recommendations")
async def post_recommendations(body: RecommendationRequest) -> RecommendationResponse:
    # 프로필은 로그에 남기지 않는다(개인 조건). 결과 수와 국가 맥락 상태만 남긴다.
    result = svc.recommend(body, _catalog())
    logger.info(f"[Discovery] ✅ items={len(result.items)} country_context={result.country_context.status}")
    return result

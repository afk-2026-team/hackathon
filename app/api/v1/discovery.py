from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException

from app.schemas.discovery import Catalog, CompareRequest, CompareResponse, ExplainResponse, RecommendationRequest, RecommendationResponse, ReferenceCatalog
from app.services import discovery as svc
from app.services import discovery_compare as cmp
from app.services import discovery_explain as exp
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


def _data(loader):
    try:
        return loader()
    except svc.CatalogUnavailable as exc:
        logger.error(f"[Discovery] ❌ {exc}")
        raise HTTPException(status_code=503, detail=f"Discovery data unavailable: {exc}") from exc


@router.get("/reference-products")
async def get_reference_products() -> ReferenceCatalog:
    return _data(cmp.load_references)


def _compare(body: CompareRequest) -> tuple[CompareResponse, Catalog, ReferenceCatalog]:
    catalog, refs = _catalog(), _data(cmp.load_references)
    try:
        return cmp.compare(body, catalog, refs, _data(cmp.load_facts)), catalog, refs
    except cmp.CompareNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/compare")
async def post_compare(body: CompareRequest) -> CompareResponse:
    result, _, _ = _compare(body)
    # 사용자가 입력한 제품명·프로필은 로그에 남기지 않는다
    logger.info(f"[Discovery] ✅ compare current={result.current_status} common={len(result.common)} country_context={result.country_context.status}")
    return result


def get_explain_llm():
    """테스트는 dependency_overrides 로 가짜 모델을 넣는다. 키가 없으면 None → fallback."""
    try:
        return exp.default_llm()
    except Exception as exc:  # 모델 선언·클라이언트 생성 실패도 사실 문장으로 대체한다
        logger.warning(f"[Explain] ⚠️ llm unavailable ({type(exc).__name__})")
        return None


@router.post("/explain")
async def post_explain(body: CompareRequest, llm=Depends(get_explain_llm)) -> ExplainResponse:
    result, _, _ = _compare(body)
    prefs = body.profile.preferences
    out = await exp.explain(result, prefs.budget_krw if prefs else None, llm)
    logger.info(f"[Discovery] ✅ explain mode={out.mode} reason={out.fallback_reason}")
    return out

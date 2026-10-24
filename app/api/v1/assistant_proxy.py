"""discovery_server(8001) → app.serve(8000) `/v1/responses` 명시적 프록시.

브라우저는 같은 origin 의 /v1 만 부른다(Vite 프록시 대상은 8001). AI 그래프와 모델 키는 app.serve 에만 있으므로
여기서는 입력을 검증하고 그대로 넘긴 뒤 원인 있는 오류로 돌려준다. 가짜 응답을 만들지 않는다.

- 업스트림: JINSEONMI_AI_UPSTREAM (기본 http://127.0.0.1:8000)
- 비스트리밍만 지원(stream=false). 프로필은 metadata.profile={language,country,gender?,age_band?} + 선택 선호
  {currency?,interests?,budget_krw?,current_product?}(검증 한도는 app/api/v1/inputs.py 가 정본).
- 질문이 있든 없든 같은 프로필로 공식 카탈로그 추천 후보를 고르고, 업스트림에는 id 만
  metadata.catalog_candidate_ids 로 넘긴다. B 가 자기 카탈로그로 [Official catalog] 블록을 다시 만들어 respond 턴에만
  넣는다(Jev 분류기는 원문 질문만 본다). 응답 metadata.candidates·recommended_ids 로 실제 카탈로그 id 와 출처를 돌려준다.
  기존 Crawling_DB 검색 근거는 AI 그래프 쪽 기존 workflow 그대로이며 여기서 새로 넣지 않는다.
- 실패 매핑: 업스트림 미기동 503 · 시간 초과 504 · 읽을 수 없는 응답 502 · 업스트림 오류는 상태와 메시지 유지.
"""

from __future__ import annotations

import logging
import os
from collections.abc import AsyncIterator
from typing import Annotated, Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.api.v1.inputs import MAX_BUDGET_KRW, MAX_INTEREST_CHARS, MAX_INTERESTS, MAX_PRODUCT_CHARS
from app.schemas.discovery import Preferences, Profile, RecommendationRequest
from app.services import discovery as discovery_svc
from app.services.catalog_context import CATALOG_IDS_KEY, MAX_CATALOG_IDS
from app.services import discovery_compare as compare_svc
from app.services import question_match
from app.services.discovery_i18n import msg, ui_lang

router = APIRouter()
logger = logging.getLogger(__name__)

DEFAULT_UPSTREAM = "http://127.0.0.1:8000"
DEFAULT_MODEL = "kbeauty-sonnet"
AI_TIMEOUT_S = 60.0  # LLM 응답 대기 상한(이 파일에서만 쓰는 국소 상수)
MAX_INPUT_CHARS = 2000
THREAD_HEADER = "X-Thread-Id"  # 업스트림 multi_turn 이 켜졌을 때만 의미가 있다 — 있으면 그대로 넘긴다
MAX_CANDIDATES = 5  # 질문 없는 Home 요청에서 AI 문맥·응답 metadata 에 넣는 카탈로그 후보 수(이 파일 국소 상수)
MAX_PER_CATEGORY = MAX_CATALOG_IDS // 2  # 질문이 있을 때 beauty·medical 각각 넣는 후보 수 — 관심사가 질문 범위를 고정하지 않게
# 추천 계산은 통화를 쓰지 않는다. 프로필에 통화가 없을 때 discovery 스키마 필수값을 채우는 자리표시자다(응답에는 쓰지 않음)
CURRENCY_PLACEHOLDER = "KRW"

Interest = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_INTEREST_CHARS)]


class AssistantProfile(BaseModel):
    model_config = ConfigDict(extra="forbid")
    language: str = Field(min_length=2, max_length=8)
    country: str = Field(min_length=2, max_length=2)
    gender: str | None = Field(default=None, max_length=32)  # 추천·적합성 계산에 쓰지 않는다
    age_band: str | None = Field(default=None, max_length=16)  # 추천·적합성 계산에 쓰지 않는다
    currency: str | None = Field(default=None, pattern=r"^[A-Za-z]{3}$")
    interests: list[Interest] | None = Field(default=None, max_length=MAX_INTERESTS)
    budget_krw: float | None = Field(default=None, gt=0, le=MAX_BUDGET_KRW)
    current_product: str | None = Field(default=None, max_length=MAX_PRODUCT_CHARS)


class AssistantMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")
    profile: AssistantProfile


class AssistantRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    model: str = Field(default_factory=lambda: os.environ.get("JINSEONMI_AI_MODEL", DEFAULT_MODEL), min_length=1, max_length=64)
    input: str | None = Field(default=None, max_length=MAX_INPUT_CHARS)
    stream: Literal[False] = False
    metadata: AssistantMetadata


def upstream_base() -> str:
    return os.environ.get("JINSEONMI_AI_UPSTREAM", DEFAULT_UPSTREAM).rstrip("/")


async def get_ai_client() -> AsyncIterator[httpx.AsyncClient]:
    """테스트는 app.dependency_overrides 로 MockTransport 클라이언트를 주입한다."""
    async with httpx.AsyncClient(timeout=AI_TIMEOUT_S, follow_redirects=False) as client:
        yield client


def _upstream_message(resp: httpx.Response) -> str | None:
    try:
        body = resp.json()
    except ValueError:
        return None
    err = body.get("error") if isinstance(body, dict) else None
    msg = err.get("message") if isinstance(err, dict) else None
    return msg if isinstance(msg, str) and msg else None


def _catalog_candidates(profile: AssistantProfile, question: str | None) -> tuple[list[dict], str]:
    """같은 프로필로 공식 카탈로그 추천을 계산해 후보를 돌려준다. 실패하면 빈 목록과 상태를 드러낸다(가짜 후보 없음).

    질문이 있으면 beauty·medical 을 각각 MAX_PER_CATEGORY 개씩 고르되, 질문 단어와 카탈로그 태그가 맞는 항목을
    먼저 세운다(question_match — 결정론, 품질·인기 순위 아님). 클리닉을 물으면 의료 장소를 안내 문서보다 앞에 둔다.
    없으면(Home) 전체 상위 MAX_CANDIDATES 개.
    """
    prefs = Preferences(
        interests=profile.interests or None,
        budget_krw=profile.budget_krw,
        current_product=(profile.current_product or "").strip() or None,
    )
    req = RecommendationRequest(profile=Profile(
        country=profile.country, language=profile.language,
        currency=(profile.currency or CURRENCY_PLACEHOLDER), preferences=prefs,
    ))
    try:
        catalog = discovery_svc.load_catalog()
    except discovery_svc.CatalogUnavailable as exc:
        logger.error(f"[Assistant] catalog unavailable for candidates: {exc}")
        return [], "unavailable"
    try:
        refs, facts = compare_svc.load_references(), compare_svc.load_facts()
    except discovery_svc.CatalogUnavailable as exc:
        logger.warning(f"[Assistant] label facts unavailable for candidates: {exc}")
        refs = facts = None
    result = discovery_svc.recommend(req, catalog, refs=refs, facts=facts)
    organic = [i for i in result.items if i.sponsorship != "sponsored"]
    if question:
        lang = ui_lang(profile.language)
        picks = []
        for category in ("beauty", "medical"):
            pool = [i for i in organic if i.category == category]
            for item, hits in question_match.prioritize(pool, question, MAX_PER_CATEGORY):
                if hits:
                    item = item.model_copy(update={"reasons": [*item.reasons, msg(lang, "reco.question_match", hits=", ".join(hits))]})
                picks.append(item)
    else:
        picks = organic[:MAX_CANDIDATES]
    return [
        {
            "id": i.id, "kind": i.kind, "category": i.category, "title": i.title, "subtitle": i.subtitle,
            "image_url": i.image_url, "price_krw": i.price_krw,
            "list_price": i.list_price.model_dump() if i.list_price else None,
            "reasons": i.reasons, "sources": [src.model_dump() for src in i.sources],
        }
        for i in picks
    ], "ok"


@router.post("/responses")
async def proxy_responses(body: AssistantRequest, request: Request, client: httpx.AsyncClient = Depends(get_ai_client)):
    profile = body.metadata.profile
    profile_meta = profile.model_dump(exclude_none=True)
    text = body.input.strip() if body.input else None
    candidates, candidates_status = _catalog_candidates(profile, text)
    # 질문 원문은 그대로(없으면 B 가 같은 프로필로 Home 요청 문장을 만든다). 카탈로그는 id 만 넘긴다
    payload = {
        "model": body.model,
        "input": text,
        "stream": False,
        "metadata": {"profile": profile_meta, CATALOG_IDS_KEY: [c["id"] for c in candidates]},
    }
    headers = {"Content-Type": "application/json"}
    thread_id = request.headers.get(THREAD_HEADER)
    if thread_id:
        headers[THREAD_HEADER] = thread_id[:128]
    try:
        resp = await client.post(f"{upstream_base()}/v1/responses", json=payload, headers=headers)
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="The AI assistant took too long to answer. Please try again.") from None
    except httpx.TransportError:
        raise HTTPException(status_code=503, detail="The AI assistant isn't available right now (AI server not reachable).") from None
    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=_upstream_message(resp) or f"The AI assistant returned an error ({resp.status_code}).")
    try:
        data = resp.json()
    except ValueError:
        raise HTTPException(status_code=502, detail="The AI assistant sent a response we could not read.") from None
    if not isinstance(data, dict) or data.get("object") != "response":
        raise HTTPException(status_code=502, detail="The AI assistant sent an unexpected response.")
    # candidates = 서버가 고른 관련 옵션, recommended_ids = 모델이 답에 실제로 인용한 후보 id(모르는 id 제외)
    echoed = {k: v for k, v in (data.get("metadata") or {}).items() if k != CATALOG_IDS_KEY}
    data["metadata"] = {
        **echoed,
        "candidates_basis": "server_recommendation",
        "candidates_status": candidates_status,
        "candidates": candidates,
        "recommended_ids": recommended_ids(_answer_text(data), candidates),
    }
    return data


def _answer_text(data: dict) -> str:
    out = data.get("output") if isinstance(data.get("output"), list) else []
    return "".join(
        c.get("text", "") for m in out if isinstance(m, dict) for c in (m.get("content") or [])
        if isinstance(c, dict) and isinstance(c.get("text"), str)
    )


def recommended_ids(text: str, candidates: list[dict]) -> list[str]:
    """답에 '[정확한 id]'로 인용된 후보 id 만, 처음 등장 순서로. 이름 문자열로 추정하지 않는다(allowlist 대조)."""
    found = [(text.find(f"[{c['id']}]"), c["id"]) for c in candidates]
    return list(dict.fromkeys(cid for pos, cid in sorted(found) if pos >= 0))

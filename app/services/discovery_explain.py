"""비교 결과를 짧게 설명한다.

서버가 compare 결과로 사실 문장 목록(fact_id·text·sources)을 만든다. 모델은 그중 최대 3개의 fact_id 를 고르고
순서만 정한다. 화면에 나가는 문장은 언제나 서버가 저장한 사실 문장이며, 모델이 쓴 자유 문장은 렌더하지 않는다.
이 모듈은 순위·인기·피부/임상 적합성을 만들지 않는다.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Protocol

from app.schemas.discovery import CompareResponse, ExplainResponse, Source
from app.services.discovery_compare import NOTICE
from app.utils.logger import AGENT_LOGGER_NAME

logger = logging.getLogger(AGENT_LOGGER_NAME)

# 기존 모델 선언을 재사용하되, 설명 1회는 짧고 재시도 없이 끝낸다(반복 과금 방지)
MODEL_SPEC_PATH = "envs/models/claude-haiku-5-5_anthropic.yaml"
LLM_TIMEOUT_S = 8.0
LLM_MAX_TOKENS = 300  # fact_id 목록만 받으므로 충분하다(2026-10-24 진단: str 응답, thinking 0 토큰)
MAX_PICK = 3

SYSTEM = (
    "You pick which verified facts best help a traveler compare two skincare products. "
    "You receive a JSON list of facts with fact_id and text. Choose at most 3 fact_ids and order them from most to least useful. "
    'Reply with JSON only, no other words: {"fact_ids": ["F1", "F2"]}'
)


class ChatModel(Protocol):
    async def ainvoke(self, input, **kwargs): ...


class SelectionError(Exception):
    pass


@dataclass
class Fact:
    fact_id: str
    text: str
    sources: list[Source] = field(default_factory=list)
    keep: bool = False  # 부분 성분 목록 같은 불확실성 고지: 모델이 고르지 않아도 항상 붙인다


_llm_cache: ChatModel | None = None


def default_llm() -> ChatModel | None:
    """키가 주입되지 않았으면 None(호출하지 않음). 값은 읽기만 하고 출력하지 않는다."""
    global _llm_cache
    if _llm_cache is not None:
        return _llm_cache
    from app.models.llm_loader import build_llm, load_model_spec

    spec = load_model_spec(MODEL_SPEC_PATH, {"max_tokens": LLM_MAX_TOKENS})
    if not os.environ.get(spec["api_key_env"]):
        return None
    spec["limits"] = {"timeout_seconds": LLM_TIMEOUT_S, "max_retries": 0}
    _llm_cache = build_llm(spec)
    return _llm_cache


def model_name() -> str:
    from app.models.llm_loader import load_model_spec

    return load_model_spec(MODEL_SPEC_PATH, {})["model_name"]


def _price_str(p) -> str:
    whole = p.amount == int(p.amount)
    return f"{p.currency} {p.amount:,.0f}" if whole else f"{p.currency} {p.amount:,.2f}"


def build_facts(result: CompareResponse, budget_krw: float | None) -> list[Fact]:
    """compare 결과의 사실만으로 문장을 만든다. 가격·예산 판단은 여기서 서버가 계산한다."""
    facts: list[Fact] = []

    def add(text: str, sources: list[Source], keep: bool = False) -> None:
        facts.append(Fact(f"F{len(facts) + 1}", text, list({s.url: s for s in sources}.values()), keep))

    cand = result.candidate
    if result.current is None:
        add(f"We could not match your current product, so only {cand.title}'s listed details are shown.", cand.sources)
    common = {p.attribute: p for p in result.common}
    diffs = {p.attribute: p for p in result.differences}
    if "key_ingredients" in common:
        add(f"Both labels list {', '.join(common['key_ingredients'].candidate)}.", common["key_ingredients"].sources)
    if "form" in common:
        add(f"Both are a {common['form'].candidate}.", common["form"].sources)
    if "volume_ml" in common:
        add(f"Both are {common['volume_ml'].candidate:g} ml.", common["volume_ml"].sources)
    if "key_ingredients" in diffs:
        p = diffs["key_ingredients"]
        if p.current:
            add(f"Listed for your current product but not in {cand.title}'s full list: {', '.join(p.current)}.", p.sources)
        if p.candidate:
            add(f"Listed for {cand.title} but not in your current product's full list: {', '.join(p.candidate)}.", p.sources)
    if "form" in diffs:
        add(f"Forms differ: {diffs['form'].current} vs {diffs['form'].candidate}.", diffs["form"].sources)
    if "volume_ml" in diffs:
        add(f"Sizes differ: {diffs['volume_ml'].current:g} ml vs {diffs['volume_ml'].candidate:g} ml.", diffs["volume_ml"].sources)
    partial = next((p for p in result.unverified if p.attribute == "key_ingredients"), None)
    if partial is not None:
        add("Some ingredients could not be checked because an ingredient list is partial or missing.", partial.sources, keep=True)

    price = result.price
    if price.current and price.candidate:
        tail = "and are not compared" if not price.comparable else "for the same size"
        add(f"Listed prices are {_price_str(price.current)} and {_price_str(price.candidate)}, shown as listed {tail}.",
            [price.current.source, price.candidate.source])
    elif price.candidate:
        add(f"{cand.title} is listed at {_price_str(price.candidate)}.", [price.candidate.source])
    if budget_krw is not None and price.candidate and price.candidate.currency == "KRW":
        rel = "within" if price.candidate.amount <= budget_krw else "above"
        add(f"Its listed price is {rel} your budget of KRW {budget_krw:,.0f}.", [price.candidate.source])

    if not facts:
        add(f"Label details for {cand.title} are not recorded yet.", cand.sources)
    return facts


def _content_text(msg) -> str:
    content = getattr(msg, "content", "")
    if isinstance(content, str):
        return content
    # 블록 목록이면 text 블록만 본다(thinking 블록은 무시)
    return "".join(b.get("text", "") for b in content if isinstance(b, dict) and b.get("type", "text") == "text")


def parse_selection(raw: str, facts: list[Fact]) -> list[str]:
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not match:
        raise SelectionError("no json")
    try:
        ids = json.loads(match.group(0)).get("fact_ids")
    except (json.JSONDecodeError, AttributeError) as exc:
        raise SelectionError("bad json") from exc
    known = {f.fact_id for f in facts}
    if not isinstance(ids, list) or not ids or len(ids) > MAX_PICK or len(set(map(str, ids))) != len(ids):
        raise SelectionError("empty, too many or duplicate ids")
    if any(not isinstance(i, str) or i not in known for i in ids):
        raise SelectionError("unknown id")
    return ids


def assemble(facts: list[Fact], ids: list[str] | None) -> tuple[str, list[Source]]:
    """선택된(없으면 전체) 사실 문장을 이어 붙이고, keep 고지는 항상 포함한다."""
    by_id = {f.fact_id: f for f in facts}
    chosen = [by_id[i] for i in ids] if ids else list(facts)
    chosen += [f for f in facts if f.keep and f not in chosen]
    sources = list({s.url: s for f in chosen for s in f.sources}.values())
    return " ".join(f.text for f in chosen), sources


async def explain(result: CompareResponse, budget_krw: float | None, llm: ChatModel | None, now: datetime | None = None) -> ExplainResponse:
    stamp = (now or datetime.now(timezone.utc)).isoformat(timespec="seconds")
    facts = build_facts(result, budget_krw)
    reason = None
    if llm is None:
        reason = "llm_unavailable"
    else:
        try:
            listing = json.dumps({"facts": [{"fact_id": f.fact_id, "text": f.text} for f in facts]}, ensure_ascii=False)
            msg = await asyncio.wait_for(llm.ainvoke([("system", SYSTEM), ("human", listing)]), timeout=LLM_TIMEOUT_S)
            ids = parse_selection(_content_text(msg), facts)
            text, sources = assemble(facts, ids)
            logger.info(f"[Explain] ✅ mode=llm picked={len(ids)}")
            return ExplainResponse(text=text, mode="llm", fallback_reason=None, sources=sources, notice=NOTICE, generated_at=stamp)
        except asyncio.TimeoutError:
            reason = "timeout"
        except SelectionError as exc:
            reason = "validation_failed"
            logger.warning(f"[Explain] ⚠️ selection rejected ({exc})")  # 모델 출력 원문은 남기지 않는다
        except Exception as exc:  # 429·권한·네트워크 등 — 재시도하지 않고 결정적 문장으로 대체
            reason = "llm_error"
            logger.warning(f"[Explain] ⚠️ llm error ({type(exc).__name__})")
    text, sources = assemble(facts, None)
    return ExplainResponse(text=text, mode="fallback", fallback_reason=reason, sources=sources, notice=NOTICE, generated_at=stamp)

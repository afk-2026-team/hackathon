"""Jev 판단 + 프로필 → OKF 번들에서 결정론으로 근거를 고른다(LLM 없음).

규칙(interview Q4·Q11·Q12(d)):
- 하드 필터: category 일치 + content_kind 일치(any 면 생략). 0건이면 content_kind 를 빼고 relaxed=True.
  그래도 0건이면 빈 결과(호출부가 '조건에 맞는 근거 데이터 없음'을 말한다 — 침묵 폴백 금지).
- 점수: 일치 신호 수. 정렬: 점수 내림차순 → generated.at 최신 → id 오름차순(완전 결정론).
- 성별·연령은 쓰지 않는다. 국가·언어 신호는 근거가 있을 때만 점수가 된다.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from app.knowledge.okf import Concept, parse_instant

ANY_KIND = "any"  # jev_questions.yaml content_kind 의 '전부' 라벨
MEDICAL_INTENT_THRESHOLD = 0.5  # Noul 확률 — 이 값 이상이면 clinic 에 신호 1점
SNIPPET_MAX = 160


@dataclass(frozen=True)
class Retrieval:
    items: list[dict] = field(default_factory=list)
    relaxed: bool = False  # content_kind 조건을 뺐는가


def _score(c: Concept, content_kind: str, medical_intent: float, profile: dict) -> int:
    m = c.meta
    return sum(
        (
            content_kind != ANY_KIND and m["content_kind"] == content_kind,
            medical_intent >= MEDICAL_INTENT_THRESHOLD and m["content_kind"] == "clinic",
            bool(profile.get("country")) and profile["country"] in m["country_signals"],
            bool(profile.get("language")) and profile["language"] in m["language_signals"],
            bool(m.get("foreigner_friendly")),
        )
    )


def _item(c: Concept, profile: dict, now: datetime) -> dict:
    m = c.meta
    flags = []
    if not m.get("verified"):
        flags.append("unverified")  # OKF §5.3 trust tier
    if now >= parse_instant(m["stale_after"]):
        flags.append("stale")
    if profile.get("country"):
        flags.append("country_evidence" if profile["country"] in m["country_signals"] else "country_evidence_insufficient")
    if m.get("foreigner_friendly"):
        flags.append("foreigner_friendly")
    return {
        "id": c.id,
        "type": m["type"],
        "title": m["title"],
        "content_kind": m["content_kind"],
        "source_kind": m["source_kind"],
        "resource": m["resource"],
        "snippet": m["description"][:SNIPPET_MAX],
        "sponsored": m["sponsored"],
        "flags": flags,
    }


def retrieve(
    concepts: list[Concept],
    *,
    category: str,
    content_kind: str,
    medical_intent: float,
    profile: dict,
    top_n: int,
    now: datetime,
) -> Retrieval:
    same_category = [c for c in concepts if c.meta["category"] == category]
    pool = same_category if content_kind == ANY_KIND else [c for c in same_category if c.meta["content_kind"] == content_kind]
    relaxed = not pool and bool(same_category)
    if relaxed:
        pool = same_category
    ranked = sorted(pool, key=lambda c: c.id)
    ranked.sort(key=lambda c: parse_instant(c.meta["generated"]["at"]), reverse=True)
    ranked.sort(key=lambda c: _score(c, content_kind, medical_intent, profile), reverse=True)
    return Retrieval(items=[_item(c, profile, now) for c in ranked[:top_n]], relaxed=relaxed)


def format_evidence(result: Retrieval) -> str:
    """respond 턴에 넣는 [Retrieved evidence] 본문. 빈 결과도 명시적으로 쓴다."""
    if not result.items:
        return "results: 0\n(no matching evidence in the database)"
    lines = [f"results: {len(result.items)}", f"relaxed: {str(result.relaxed).lower()}"]
    for it in result.items:
        lines.append(
            f"- [{it['id']}] {it['type']} · {it['content_kind']} · {it['source_kind']} — {it['title']}\n"
            f"  source: {it['resource']} | sponsored: {it['sponsored']} | flags: {', '.join(it['flags']) or 'none'}\n"
            f"  snippet: {it['snippet']}"
        )
    return "\n".join(lines)

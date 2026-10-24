from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

from pydantic import ValidationError

from app.schemas.discovery import (
    Catalog,
    CatalogItem,
    CountryContext,
    Profile,
    RecommendationRequest,
    RecommendationResponse,
)

# 카탈로그 정본은 데이터 worker 소유 파일이다. 테스트·로컬 실험은 환경변수로 경로만 바꾼다.
DEFAULT_CATALOG_PATH = Path(__file__).resolve().parents[1] / "data" / "discovery_catalog.json"
CATALOG_PATH_ENV = "DISCOVERY_CATALOG_PATH"

# current_product 를 태그·제목과 비교할 때 버리는 짧은 토큰 길이(이 파일 국소 상수)
MIN_TOKEN_LEN = 2


class CatalogUnavailable(Exception):
    """카탈로그를 읽거나 검증하지 못함 — 호출부는 대체 데이터 없이 오류를 그대로 드러낸다."""


def catalog_path() -> Path:
    return Path(os.environ.get(CATALOG_PATH_ENV) or DEFAULT_CATALOG_PATH)


def load_catalog() -> Catalog:
    path = catalog_path()
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise CatalogUnavailable(f"catalog file not found: {path.name}") from exc
    except json.JSONDecodeError as exc:
        raise CatalogUnavailable(f"catalog is not valid JSON: {path.name} line {exc.lineno}") from exc
    except UnicodeDecodeError as exc:
        raise CatalogUnavailable(f"catalog is not UTF-8 text: {path.name}") from exc
    except OSError as exc:
        raise CatalogUnavailable(f"catalog could not be read: {path.name} ({type(exc).__name__})") from exc
    try:
        catalog = Catalog.model_validate(raw)
    except ValidationError as exc:
        first = exc.errors()[0]
        loc = ".".join(str(p) for p in first["loc"])
        raise CatalogUnavailable(f"catalog entry violates contract at {loc}: {first['msg']}") from exc
    ids = [item.id for item in catalog.items]
    if len(ids) != len(set(ids)):
        raise CatalogUnavailable("catalog has duplicate item ids")
    return catalog


def _norm(text: str) -> str:
    return text.strip().casefold()


def _tokens(text: str) -> set[str]:
    return {t for t in re.split(r"[^\w]+", _norm(text)) if len(t) >= MIN_TOKEN_LEN}


def _match(item: CatalogItem, profile: Profile, country: str) -> tuple[int, list[str]] | None:
    """후보 하나를 판정한다. 제외면 None, 포함이면 (일치 점수, 사람이 읽는 근거 문장).

    근거 문장은 카탈로그에 실제로 있는 값(태그·가격·출처)만 인용한다. 성별·연령은 읽지 않는다.
    """
    prefs = profile.preferences
    score = 0
    reasons = list(item.reasons)

    if prefs and prefs.budget_krw is not None:
        if item.price_krw is None:
            reasons.append("Price not listed in our sources, so it was not checked against your budget.")
        elif item.price_krw > prefs.budget_krw:
            return None
        else:
            reasons.append(f"Listed price ₩{item.price_krw:,.0f} is within your budget of ₩{prefs.budget_krw:,.0f}.")

    tags = {_norm(t): t for t in item.tags}
    if prefs and prefs.interests:
        # 태그 또는 카테고리 이름과 정확히 같은 관심사만 일치로 센다(동의어·효능 추론 없음)
        hits = [tags.get(_norm(i), item.category) for i in prefs.interests if _norm(i) in tags or _norm(i) == item.category]
        if hits:
            score += len(hits)
            reasons.append(f"Matches your interests: {', '.join(hits)}.")

    if prefs and prefs.current_product:
        overlap = _tokens(prefs.current_product) & (_tokens(item.title) | {_norm(t) for t in item.tags})
        if overlap:
            score += 1
            # 단어가 겹친다는 사실만 말한다. 같은 효능·성분의 대체품이라고 표현하지 않는다.
            reasons.append(f"Shares words with your current product: {', '.join(sorted(overlap))}.")

    if country in item.country_codes:
        score += 1
        labels = ", ".join(s.label for s in item.sources)
        reasons.append(f"Our sources link this to {country}: {labels}.")

    return score, reasons


def recommend(request: RecommendationRequest, catalog: Catalog, now: datetime | None = None) -> RecommendationResponse:
    profile = request.profile
    country = profile.country.upper()
    pool = [i for i in catalog.items if request.category == "all" or i.category == request.category]

    ranked: list[tuple[int, int, CatalogItem]] = []
    for position, item in enumerate(pool):
        result = _match(item, profile, country)
        if result is None:
            continue
        score, reasons = result
        ranked.append((score, position, item.model_copy(update={"reasons": reasons})))

    # 설명 가능한 정렬: 일치 점수 내림차순, 같으면 카탈로그 순서. 광고는 자연 후보 뒤에 따로 둔다.
    ranked.sort(key=lambda r: (-r[0], r[1]))
    organic = [item for _, _, item in ranked if item.sponsorship != "sponsored"]
    sponsored = [item for _, _, item in ranked if item.sponsorship == "sponsored"]
    items = organic + sponsored

    supported = [i for i in items if country in i.country_codes]
    if supported:
        context = CountryContext(
            country=country,
            status="supported",
            explanation=f"{len(supported)} of {len(items)} results have sources connected to {country}. "
            "Other results come from general sources. Your country is not used to guess skin type or treatment suitability.",
        )
    else:
        context = CountryContext(
            country=country,
            status="insufficient",
            explanation=f"We have no sourced information specific to {country} yet, so these results come from general sources. "
            "Your country is not used to guess skin type or treatment suitability.",
        )

    stamp = (now or datetime.now(timezone.utc)).isoformat(timespec="seconds")
    return RecommendationResponse(items=items, country_context=context, generated_at=stamp)

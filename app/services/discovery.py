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
    ProductFacts,
    ProductFactsCatalog,
    Profile,
    RecommendationRequest,
    RecommendationResponse,
    ReferenceCatalog,
    ReferenceProduct,
)
from app.services.discovery_i18n import Lang, localize_catalog, msg, ui_lang

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


def _reference_for(name: str | None, refs: ReferenceCatalog | None) -> ReferenceProduct | None:
    """current_product 가 기준 제품 id 나 제목과 정확히 같을 때만 그 제품의 공식 표시사항을 쓴다(추정 매칭 없음)."""
    if not name or refs is None:
        return None
    key = " ".join(_norm(name).split())
    return next((r for r in refs.items if key in (" ".join(_norm(r.title).split()), _norm(r.id))), None)


def _label_reasons(ref: ReferenceProduct, facts: ProductFacts | None) -> tuple[int, list[str]]:
    """기록된 표시사항끼리만 비교한다 — 공통 성분명·같은 제형. 함량·배합·효능은 비교하지 않는다."""
    if facts is None:
        return 0, []
    score, reasons = 0, []
    if ref.key_ingredients and facts.key_ingredients:
        ref_names = {_norm(i) for i in ref.key_ingredients}
        shared = [i for i in facts.key_ingredients if _norm(i) in ref_names]
        if shared:
            score += 2
            reasons.append(f"Both labels list {', '.join(shared)} (your current product: {ref.title}). "
                           "Amounts and formulas are not compared.")
    if ref.form and facts.form and _norm(ref.form) == _norm(facts.form):
        score += 1
        reasons.append(f"Same product form as your current product: {facts.form}.")
    return score, reasons


def _match(item: CatalogItem, profile: Profile, country: str, ref: ReferenceProduct | None = None,
           facts: ProductFacts | None = None, lang: Lang = "en") -> tuple[int, list[str]] | None:
    """후보 하나를 판정한다. 제외면 None, 포함이면 (일치 점수, 사람이 읽는 근거 문장).

    근거 문장은 카탈로그에 실제로 있는 값(태그·가격·출처)과 기록된 표시사항만 인용한다. 성별·연령은 읽지 않는다.
    """
    prefs = profile.preferences
    score = 0
    reasons = list(item.reasons)

    if prefs and prefs.budget_krw is not None:
        if item.price_krw is None and item.list_price is not None:
            # 판매처 표시가(외화)는 환산하지 않는다 — 원화 예산 필터에서 빼지 않고 비교하지 않았음을 밝힌다
            lp = item.list_price
            reasons.append(msg(lang, "reco.list_price", currency=lp.currency, amount=f"{lp.amount:,.2f}"))
        elif item.price_krw is None:
            reasons.append(msg(lang, "reco.price_unlisted"))
        elif item.price_krw > prefs.budget_krw:
            return None
        else:
            reasons.append(msg(lang, "reco.within_budget", price=f"{item.price_krw:,.0f}", budget=f"{prefs.budget_krw:,.0f}"))

    tags = {_norm(t): t for t in item.tags}
    if prefs and prefs.interests:
        # 태그 또는 카테고리 이름과 정확히 같은 관심사만 일치로 센다(동의어·효능 추론 없음)
        hits = [tags.get(_norm(i), item.category) for i in prefs.interests if _norm(i) in tags or _norm(i) == item.category]
        if hits:
            score += len(hits)
            reasons.append(msg(lang, "reco.interests", hits=", ".join(hits)))

    label_score, label_reasons = _label_reasons(ref, facts) if ref is not None else (0, [])
    if label_reasons:
        score += label_score
        reasons.extend(label_reasons)
    elif prefs and prefs.current_product:
        # 표시사항 근거가 없을 때만 단어 겹침을 보조로 쓴다
        overlap = _tokens(prefs.current_product) & (_tokens(item.title) | {_norm(t) for t in item.tags})
        if overlap:
            score += 1
            # 단어가 겹친다는 사실만 말한다. 같은 효능·성분의 대체품이라고 표현하지 않는다.
            reasons.append(msg(lang, "reco.shares_words", words=", ".join(sorted(overlap))))

    if country in item.country_codes:
        score += 1
        labels = ", ".join(s.label for s in item.sources)
        reasons.append(msg(lang, "reco.country_sources", country=country, labels=labels))

    return score, reasons


def recommend(request: RecommendationRequest, catalog: Catalog, now: datetime | None = None,
              refs: ReferenceCatalog | None = None, facts: ProductFactsCatalog | None = None) -> RecommendationResponse:
    profile = request.profile
    country = profile.country.upper()
    lang = ui_lang(profile.language)
    # 항목 문장을 먼저 요청 언어로 바꾼 뒤, 서버 근거 문장을 같은 언어로 덧붙인다
    catalog = localize_catalog(catalog, lang)
    pool = [i for i in catalog.items if request.category == "all" or i.category == request.category]
    ref = _reference_for(profile.preferences.current_product if profile.preferences else None, refs)
    facts_by_id = {f.id: f for f in facts.items} if facts is not None else {}

    ranked: list[tuple[int, int, CatalogItem]] = []
    for position, item in enumerate(pool):
        result = _match(item, profile, country, ref, facts_by_id.get(item.id) if ref is not None else None, lang)
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
            explanation=msg(lang, "reco.supported", n=len(supported), total=len(items), country=country),
        )
    else:
        context = CountryContext(
            country=country,
            status="insufficient",
            explanation=msg(lang, "reco.insufficient", country=country),
        )

    if ref is not None and country in ref.market_codes:
        # 기준 제품 정보가 그 국가 공식 페이지에서 온 경우에만 알린다. 순위는 바꾸지 않는다.
        context = context.model_copy(update={"explanation": context.explanation
                                             + f" Your current product's label details come from its official {country} page."})

    stamp = (now or datetime.now(timezone.utc)).isoformat(timespec="seconds")
    return RecommendationResponse(items=items, country_context=context, generated_at=stamp)

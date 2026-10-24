from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import TypeVar

from pydantic import BaseModel, ValidationError

from app.schemas.discovery import (
    CandidateFacts,
    Catalog,
    CatalogItem,
    ComparePoint,
    CompareRequest,
    CompareResponse,
    CountryContext,
    PriceComparison,
    PriceFact,
    ProductFacts,
    ProductFactsCatalog,
    ReferenceCatalog,
    ReferenceProduct,
)
from app.services.discovery import CatalogUnavailable
from app.services.discovery_i18n import KoCatalog, Lang, form_label, ko_for, localize_item, localize_source, msg, ui_lang

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
REFERENCE_PATH_ENV = "DISCOVERY_REFERENCE_PATH"
FACTS_PATH_ENV = "DISCOVERY_FACTS_PATH"

NOTICE = msg("en", "cmp.notice")

M = TypeVar("M", bound=BaseModel)


class CompareNotFound(Exception):
    """요청한 후보·현재 제품 id 가 데이터에 없음 → 404."""


def _load(env: str, default: str, model: type[M]) -> M:
    path = Path(os.environ.get(env) or DATA_DIR / default)
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        data = model.model_validate(raw)
    except FileNotFoundError as exc:
        raise CatalogUnavailable(f"data file not found: {path.name}") from exc
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise CatalogUnavailable(f"data file is not valid JSON: {path.name}") from exc
    except OSError as exc:
        raise CatalogUnavailable(f"data file could not be read: {path.name} ({type(exc).__name__})") from exc
    except ValidationError as exc:
        first = exc.errors()[0]
        loc = ".".join(str(p) for p in first["loc"])
        raise CatalogUnavailable(f"{path.name} violates contract at {loc}: {first['msg']}") from exc
    ids = [i.id for i in data.items]  # type: ignore[attr-defined]
    if len(ids) != len(set(ids)):
        raise CatalogUnavailable(f"{path.name} has duplicate ids")
    return data


def load_references() -> ReferenceCatalog:
    return _load(REFERENCE_PATH_ENV, "discovery_reference_products.json", ReferenceCatalog)


def load_facts() -> ProductFactsCatalog:
    return _load(FACTS_PATH_ENV, "discovery_product_facts.json", ProductFactsCatalog)


def _norm(s: str) -> str:
    return " ".join(s.casefold().split())


def _price_fact(p: PriceFact | None, basis: str | None, ko: KoCatalog | None) -> PriceFact | None:
    if p is None or ko is None:
        return p
    return p.model_copy(update={"basis": basis or p.basis, "source": localize_source(p.source, ko)})


def _localize_ref(ref: ReferenceProduct, ko: KoCatalog | None) -> ReferenceProduct:
    """기준 제품의 설명·출처 라벨을 요청 언어로 바꾼다. 제품명·성분명은 공식 표기 그대로 둔다."""
    if ko is None:
        return ref
    tr = ko.references.get(ref.id)
    return ref.model_copy(update={
        "form": form_label(ref.form, ko),
        "ingredients_basis": (tr.ingredients_basis if tr and tr.ingredients_basis else ref.ingredients_basis),
        "price": _price_fact(ref.price, tr.price_basis if tr else None, ko),
        "sources": [localize_source(s, ko) for s in ref.sources],
    })


def _candidate(item: CatalogItem, facts: ProductFacts | None, lang: Lang = "en", ko: KoCatalog | None = None) -> CandidateFacts:
    tr = ko.facts.get(item.id) if (ko and facts) else None
    price = None
    if item.price_krw is not None and facts and facts.price_source and facts.price_basis:
        basis = tr.price_basis if tr and tr.price_basis else facts.price_basis
        price = PriceFact(amount=item.price_krw, currency="KRW", basis=basis, source=localize_source(facts.price_source, ko))
    if facts:
        ingredients_basis = tr.ingredients_basis if tr and tr.ingredients_basis else facts.ingredients_basis
    else:
        ingredients_basis = msg(lang, "cmp.no_label_info")
    return CandidateFacts(
        id=item.id,
        title=item.title,
        form=form_label(facts.form, ko) if facts else None,
        volume_ml=facts.volume_ml if facts else None,
        key_ingredients=facts.key_ingredients if facts else None,
        ingredients_complete=facts.ingredients_complete if facts else False,
        ingredients_basis=ingredients_basis,
        price=price,
        sources=([localize_source(s, ko) for s in facts.sources] if facts and facts.sources else item.sources),
    )


def _ingredients(cur: ReferenceProduct, cand: CandidateFacts, sources, lang: Lang = "en") -> tuple[list[ComparePoint], list[ComparePoint], list[ComparePoint]]:
    common, diff, unverified = [], [], []
    if cur.key_ingredients is None or cand.key_ingredients is None:
        unverified.append(ComparePoint(
            attribute="key_ingredients", current=cur.key_ingredients, candidate=cand.key_ingredients,
            basis=msg(lang, "cmp.ing_missing"), sources=sources,
        ))
        return common, diff, unverified
    cur_map = {_norm(i): i for i in cur.key_ingredients}
    cand_map = {_norm(i): i for i in cand.key_ingredients}
    shared = [cand_map[k] for k in cand_map if k in cur_map]
    if shared:
        common.append(ComparePoint(
            attribute="key_ingredients", current=[cur_map[_norm(i)] for i in shared], candidate=shared,
            basis=msg(lang, "cmp.ing_common"), sources=sources,
        ))
    # 목록이 전성분일 때만 상대 쪽에 '없다'고 말할 수 있다
    cur_only = [v for k, v in cur_map.items() if k not in cand_map] if cand.ingredients_complete else []
    cand_only = [v for k, v in cand_map.items() if k not in cur_map] if cur.ingredients_complete else []
    if cur_only or cand_only:
        diff.append(ComparePoint(
            attribute="key_ingredients", current=cur_only or None, candidate=cand_only or None,
            basis=msg(lang, "cmp.ing_diff"), sources=sources,
        ))
    if not (cur.ingredients_complete and cand.ingredients_complete):
        unverified.append(ComparePoint(
            attribute="key_ingredients",
            # 상대 목록이 일부일 때, 이쪽에만 보이는 성분은 상대 제품에 있는지 확인할 수 없다
            current=None if cand.ingredients_complete else [v for k, v in cur_map.items() if k not in cand_map] or None,
            candidate=None if cur.ingredients_complete else [v for k, v in cand_map.items() if k not in cur_map] or None,
            basis=msg(lang, "cmp.ing_partial"), sources=sources,
        ))
    return common, diff, unverified


def _scalar(attr, cur_val, cand_val, label: str, sources, lang: Lang = "en") -> tuple[str, ComparePoint]:
    # 영어는 문장 중간에서 소문자로 쓴다(기존 문장과 동일). 한국어는 대소문자가 없다
    label_lower = label.lower() if lang == "en" else label
    if cur_val is None or cand_val is None:
        return "unverified", ComparePoint(attribute=attr, current=cur_val, candidate=cand_val, basis=msg(lang, "cmp.scalar_missing", label=label), sources=sources)
    same = _norm(str(cur_val)) == _norm(str(cand_val))
    basis = msg(lang, "cmp.scalar_same" if same else "cmp.scalar_diff", label_lower=label_lower)
    return ("common" if same else "differences"), ComparePoint(attribute=attr, current=cur_val, candidate=cand_val, basis=basis, sources=sources)


def _price(cur: ReferenceProduct | None, cand: CandidateFacts, lang: Lang = "en") -> PriceComparison:
    cp, kp = (cur.price if cur else None), cand.price
    if cp is None or kp is None:
        return PriceComparison(current=cp, candidate=kp, comparable=False, note=msg(lang, "cmp.price_missing"))
    if cp.currency != kp.currency:
        return PriceComparison(current=cp, candidate=kp, comparable=False, note=msg(lang, "cmp.price_currency"))
    if cur is None or cur.volume_ml is None or cand.volume_ml is None:
        return PriceComparison(current=cp, candidate=kp, comparable=False, note=msg(lang, "cmp.price_no_size"))
    if cur.volume_ml != cand.volume_ml:
        # 단위 가격(ml당)은 계산하지 않는다. 용량이 다르면 표시 가격끼리 비교하지 않는다
        return PriceComparison(current=cp, candidate=kp, comparable=False, note=msg(lang, "cmp.price_diff_size"))
    return PriceComparison(current=cp, candidate=kp, comparable=True, note=msg(lang, "cmp.price_same"))


def _country(country: str, cur: ReferenceProduct | None, item: CatalogItem, lang: Lang = "en") -> CountryContext:
    reasons = []
    if cur and country in cur.market_codes:
        reasons.append(msg(lang, "cmp.country_ref", brand=cur.brand, country=country))
    if country in item.country_codes:
        reasons.append(msg(lang, "cmp.country_item", country=country, labels=", ".join(s.label for s in item.sources)))
    tail = msg(lang, "cmp.country_tail")
    if reasons:
        return CountryContext(country=country, status="supported", explanation=" ".join(reasons) + tail)
    return CountryContext(country=country, status="insufficient", explanation=msg(lang, "cmp.country_none", country=country) + tail)


def compare(req: CompareRequest, catalog: Catalog, refs: ReferenceCatalog, facts: ProductFactsCatalog, now: datetime | None = None) -> CompareResponse:
    lang = ui_lang(req.profile.language)
    ko = ko_for(lang)
    item = next((i for i in catalog.items if i.id == req.candidate_id), None)
    if item is None or item.kind != "product":
        raise CompareNotFound("candidate product not found")
    item = localize_item(item, ko)
    cur: ReferenceProduct | None = None
    if req.current_product_id is not None:
        cur = next((r for r in refs.items if r.id == req.current_product_id), None)
        if cur is None:
            raise CompareNotFound("current product not found")
    elif req.current_product_name is not None:
        # 자유 입력은 제품명 또는 '브랜드 제품명'과 정확히 같을 때만 기준 제품으로 본다(유사도 추측 없음)
        name = _norm(req.current_product_name)
        cur = next((r for r in refs.items if name in {_norm(r.title), _norm(f"{r.brand} {r.title}")}), None)
    if cur is not None:
        cur = _localize_ref(cur, ko)
    cand = _candidate(item, next((f for f in facts.items if f.id == item.id), None), lang, ko)

    common, diff, unverified = [], [], []
    if cur is not None:
        sources = cur.sources + cand.sources
        c, d, u = _ingredients(cur, cand, sources, lang)
        common += c
        diff += d
        unverified += u
        attrs = (("form", msg(lang, "cmp.attr_form"), cur.form, cand.form), ("volume_ml", msg(lang, "cmp.attr_volume"), cur.volume_ml, cand.volume_ml))
        for attr, label, a, b in attrs:
            bucket, point = _scalar(attr, a, b, label, sources, lang)
            {"common": common, "differences": diff, "unverified": unverified}[bucket].append(point)

    stamp = (now or datetime.now(timezone.utc)).isoformat(timespec="seconds")
    return CompareResponse(
        current=cur,
        current_status="matched" if cur else "unknown",
        candidate=cand,
        common=common,
        differences=diff,
        unverified=unverified,
        price=_price(cur, cand, lang),
        country_context=_country(req.profile.country.upper(), cur, item, lang),
        notice=msg(lang, "cmp.notice"),
        generated_at=stamp,
    )

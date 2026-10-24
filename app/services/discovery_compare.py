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

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
REFERENCE_PATH_ENV = "DISCOVERY_REFERENCE_PATH"
FACTS_PATH_ENV = "DISCOVERY_FACTS_PATH"

NOTICE = (
    "This compares label information only (listed ingredients, size, listed price) from the linked pages. "
    "It does not mean the products work the same way or are clinically equivalent. Check the package before buying."
)

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


def _candidate(item: CatalogItem, facts: ProductFacts | None) -> CandidateFacts:
    price = None
    if item.price_krw is not None and facts and facts.price_source and facts.price_basis:
        price = PriceFact(amount=item.price_krw, currency="KRW", basis=facts.price_basis, source=facts.price_source)
    elif item.list_price is not None:
        # 원화 확인가가 없으면 카탈로그의 공식 표시가(통화 그대로)를 쓴다. 통화가 다르면 _price 가 비교하지 않는다
        price = item.list_price
    return CandidateFacts(
        id=item.id,
        title=item.title,
        form=facts.form if facts else None,
        volume_ml=facts.volume_ml if facts else None,
        key_ingredients=facts.key_ingredients if facts else None,
        ingredients_complete=facts.ingredients_complete if facts else False,
        ingredients_basis=facts.ingredients_basis if facts else "No label information recorded for this candidate yet.",
        price=price,
        sources=(facts.sources if facts and facts.sources else item.sources),
    )


def _ingredients(cur: ReferenceProduct, cand: CandidateFacts, sources) -> tuple[list[ComparePoint], list[ComparePoint], list[ComparePoint]]:
    common, diff, unverified = [], [], []
    if cur.key_ingredients is None or cand.key_ingredients is None:
        unverified.append(ComparePoint(
            attribute="key_ingredients", current=cur.key_ingredients, candidate=cand.key_ingredients,
            basis="Listed ingredients are not recorded for one of the products.", sources=sources,
        ))
        return common, diff, unverified
    cur_map = {_norm(i): i for i in cur.key_ingredients}
    cand_map = {_norm(i): i for i in cand.key_ingredients}
    shared = [cand_map[k] for k in cand_map if k in cur_map]
    if shared:
        common.append(ComparePoint(
            attribute="key_ingredients", current=[cur_map[_norm(i)] for i in shared], candidate=shared,
            basis="Both labels list these ingredient names. Amounts and formulas are not compared.", sources=sources,
        ))
    # 목록이 전성분일 때만 상대 쪽에 '없다'고 말할 수 있다
    cur_only = [v for k, v in cur_map.items() if k not in cand_map] if cand.ingredients_complete else []
    cand_only = [v for k, v in cand_map.items() if k not in cur_map] if cur.ingredients_complete else []
    if cur_only or cand_only:
        diff.append(ComparePoint(
            attribute="key_ingredients", current=cur_only or None, candidate=cand_only or None,
            basis="Listed on one label but not on the other's full ingredient list.", sources=sources,
        ))
    if not (cur.ingredients_complete and cand.ingredients_complete):
        unverified.append(ComparePoint(
            attribute="key_ingredients",
            # 상대 목록이 일부일 때, 이쪽에만 보이는 성분은 상대 제품에 있는지 확인할 수 없다
            current=None if cand.ingredients_complete else [v for k, v in cur_map.items() if k not in cand_map] or None,
            candidate=None if cur.ingredients_complete else [v for k, v in cand_map.items() if k not in cur_map] or None,
            basis="At least one list is partial, so an ingredient missing here may still be in the product.", sources=sources,
        ))
    return common, diff, unverified


def _scalar(attr, cur_val, cand_val, label: str, sources) -> tuple[str, ComparePoint]:
    if cur_val is None or cand_val is None:
        return "unverified", ComparePoint(attribute=attr, current=cur_val, candidate=cand_val, basis=f"{label} is not recorded for one of the products.", sources=sources)
    same = _norm(str(cur_val)) == _norm(str(cand_val))
    basis = f"Same {label.lower()} on both pages." if same else f"Different {label.lower()} on the pages."
    return ("common" if same else "differences"), ComparePoint(attribute=attr, current=cur_val, candidate=cand_val, basis=basis, sources=sources)


def _price(cur: ReferenceProduct | None, cand: CandidateFacts) -> PriceComparison:
    cp, kp = (cur.price if cur else None), cand.price
    if cp is None or kp is None:
        return PriceComparison(current=cp, candidate=kp, comparable=False, note="A listed price is missing for one of the products.")
    if cp.currency != kp.currency:
        return PriceComparison(current=cp, candidate=kp, comparable=False,
                               note="Prices are in different currencies and are shown as listed, without conversion.")
    if cur is None or cur.volume_ml is None or cand.volume_ml is None:
        return PriceComparison(current=cp, candidate=kp, comparable=False, note="Same currency, but a size is missing, so price per ml is not compared.")
    if cur.volume_ml != cand.volume_ml:
        # 단위 가격(ml당)은 계산하지 않는다. 용량이 다르면 표시 가격끼리 비교하지 않는다
        return PriceComparison(current=cp, candidate=kp, comparable=False, note="Same currency but different sizes, so listed prices are not compared.")
    return PriceComparison(current=cp, candidate=kp, comparable=True, note="Same currency and same size. Prices are listed values and may change.")


def _country(country: str, cur: ReferenceProduct | None, item: CatalogItem) -> CountryContext:
    reasons = []
    if cur and country in cur.market_codes:
        reasons.append(f"The {cur.brand} details come from its official page for {country}.")
    if country in item.country_codes:
        reasons.append(f"Our sources link this candidate to {country}: {', '.join(s.label for s in item.sources)}.")
    tail = " Your country is not used to guess skin type, preferences or treatment suitability."
    if reasons:
        return CountryContext(country=country, status="supported", explanation=" ".join(reasons) + tail)
    return CountryContext(country=country, status="insufficient",
                          explanation=f"We have no sourced purchase or product information specific to {country} for this comparison." + tail)


def compare(req: CompareRequest, catalog: Catalog, refs: ReferenceCatalog, facts: ProductFactsCatalog, now: datetime | None = None) -> CompareResponse:
    item = next((i for i in catalog.items if i.id == req.candidate_id), None)
    if item is None or item.kind != "product":
        raise CompareNotFound("candidate product not found")
    cur: ReferenceProduct | None = None
    if req.current_product_id is not None:
        cur = next((r for r in refs.items if r.id == req.current_product_id), None)
        if cur is None:
            raise CompareNotFound("current product not found")
    elif req.current_product_name is not None:
        # 자유 입력은 제품명 또는 '브랜드 제품명'과 정확히 같을 때만 기준 제품으로 본다(유사도 추측 없음)
        name = _norm(req.current_product_name)
        cur = next((r for r in refs.items if name in {_norm(r.title), _norm(f"{r.brand} {r.title}")}), None)
    cand = _candidate(item, next((f for f in facts.items if f.id == item.id), None))

    common, diff, unverified = [], [], []
    if cur is not None:
        sources = cur.sources + cand.sources
        c, d, u = _ingredients(cur, cand, sources)
        common += c
        diff += d
        unverified += u
        for attr, label, a, b in (("form", "Product form", cur.form, cand.form), ("volume_ml", "Size (ml)", cur.volume_ml, cand.volume_ml)):
            bucket, point = _scalar(attr, a, b, label, sources)
            {"common": common, "differences": diff, "unverified": unverified}[bucket].append(point)

    stamp = (now or datetime.now(timezone.utc)).isoformat(timespec="seconds")
    return CompareResponse(
        current=cur,
        current_status="matched" if cur else "unknown",
        candidate=cand,
        common=common,
        differences=diff,
        unverified=unverified,
        price=_price(cur, cand),
        country_context=_country(req.profile.country.upper(), cur, item),
        notice=NOTICE,
        generated_at=stamp,
    )

"""데이터 커버리지 계약: 카탈로그 뷰티 상품마다 비교 표시사항이 있고, 참고 제품이 최소 3개이며, 값은 출처와 함께만 들어간다."""

from __future__ import annotations

import json
from pathlib import Path

from app.schemas.discovery import ProductFactsCatalog, ReferenceCatalog

DATA = Path(__file__).resolve().parents[2] / "app" / "data"


def _load(name: str) -> dict:
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def _beauty_products() -> dict[str, dict]:
    return {i["id"]: i for i in _load("discovery_catalog.json")["items"] if i["kind"] == "product" and i["category"] == "beauty"}


def test_every_beauty_product_has_facts_and_no_orphans():
    facts = ProductFactsCatalog.model_validate(_load("discovery_product_facts.json")).items
    ids = {f.id for f in facts}
    products = _beauty_products()
    assert set(products) <= ids, f"facts missing for: {sorted(set(products) - ids)[:5]}"
    assert ids <= set(products), f"facts for unknown catalog ids: {sorted(ids - set(products))[:5]}"
    assert len(ids) == len(facts), "duplicate facts ids"


def test_facts_values_are_sourced_and_consistent():
    facts = ProductFactsCatalog.model_validate(_load("discovery_product_facts.json")).items
    for f in facts:
        assert f.sources and all(s.url.startswith("https://") for s in f.sources), f.id
        if f.ingredients_complete:
            assert f.key_ingredients, f"{f.id}: complete flag without a list"
        if f.key_ingredients is not None:
            assert all(x.strip() for x in f.key_ingredients), f.id
        if f.volume_ml is not None:
            assert 0 < f.volume_ml <= 2000, f.id
        # 가격 근거가 있으면 출처가 함께 있어야 한다
        assert (f.price_basis is None) == (f.price_source is None), f.id


def test_compare_coverage_is_not_a_single_product():
    facts = ProductFactsCatalog.model_validate(_load("discovery_product_facts.json")).items
    with_ingredients = [f for f in facts if f.key_ingredients]
    assert len(with_ingredients) >= 50  # 2026-10-24 기준 86개 중 67개(색상별·세트 제품은 null)


def test_reference_products_at_least_three_official_and_no_fake_krw():
    refs = ReferenceCatalog.model_validate(_load("discovery_reference_products.json")).items
    assert len(refs) >= 3
    assert len({r.brand for r in refs}) >= 3
    for r in refs:
        assert r.sources and all(s.url.startswith("https://") for s in r.sources), r.id
        if r.price is not None:
            assert r.price.currency != "KRW" or "Korea" in r.price.basis, f"{r.id}: overseas price must keep its own currency"


def test_catalog_price_krw_never_holds_converted_foreign_prices():
    for item in _beauty_products().values():
        lp = item.get("list_price")
        if item.get("price_krw") is not None and lp:
            assert lp.get("currency") != "KRW" or lp.get("amount") == item["price_krw"], item["id"]

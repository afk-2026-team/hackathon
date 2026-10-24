"""추천의 표시사항 근거(기준 제품 × 후보 product_facts)와 비교 가격의 list_price 대체. 합성 fixture(provenance=test_fixture)."""

from __future__ import annotations

from app.schemas.discovery import (
    Catalog, CatalogItem, CompareRequest, ProductFacts, ProductFactsCatalog, RecommendationRequest, ReferenceCatalog, ReferenceProduct,
)
from app.services import discovery_compare as cmp
from app.services.discovery import recommend

SRC = {"label": "fixture", "url": "https://example.test/s", "checked_at": "2026-10-24"}


def product(id_, title, price_krw=None, list_price=None, tags=()):
    return CatalogItem.model_validate({
        "id": id_, "kind": "product", "category": "beauty", "title": title, "subtitle": "", "description": "",
        "image_url": None, "price_krw": price_krw, "list_price": list_price, "location": None, "sources": [SRC],
        "sponsorship": "unknown", "reasons": [], "country_codes": [], "tags": list(tags), "provenance": "test_fixture",
    })


REF = ReferenceProduct.model_validate({
    "id": "ref-x", "brand": "X", "title": "X Barrier Cream", "form": "cream", "volume_ml": 50,
    "key_ingredients": ["Ceramide NP", "Glycerin"], "ingredients_complete": False, "ingredients_basis": "fixture",
    "price": {"amount": 15.0, "currency": "USD", "basis": "fixture", "source": SRC},
    "market_codes": ["US"], "sources": [SRC], "provenance": "test_fixture",
})
REFS = ReferenceCatalog(items=[REF])
FACTS = ProductFactsCatalog(items=[ProductFacts.model_validate({
    "id": "p-shared", "form": "cream", "volume_ml": 50, "key_ingredients": ["ceramide np", "Squalane"],
    "ingredients_complete": False, "ingredients_basis": "fixture", "sources": [SRC], "provenance": "test_fixture",
})])
CATALOG = Catalog(items=[product("p-plain", "Plain Toner"), product("p-shared", "Shared Cream")])


def req(country="US", current="X Barrier Cream"):
    return RecommendationRequest.model_validate({"profile": {"country": country, "language": "en", "currency": "USD",
                                                             "preferences": {"current_product": current}}})


def test_label_facts_rank_and_explain_shared_ingredients_and_form():
    res = recommend(req(), CATALOG, refs=REFS, facts=FACTS)
    top = res.items[0]
    assert top.id == "p-shared"
    assert any("Both labels list ceramide np" in r and "not compared" in r for r in top.reasons)
    assert any("Same product form" in r for r in top.reasons)
    assert not any("Shares words" in r for r in top.reasons)


def test_reference_market_note_only_for_matching_country():
    assert "official US page" in recommend(req("US"), CATALOG, refs=REFS, facts=FACTS).country_context.explanation
    jp = recommend(req("JP"), CATALOG, refs=REFS, facts=FACTS)
    assert "official" not in jp.country_context.explanation and jp.country_context.status == "insufficient"


def test_no_reference_match_falls_back_to_word_overlap():
    res = recommend(req(current="some cream"), CATALOG, refs=REFS, facts=FACTS)
    shared = next(i for i in res.items if i.id == "p-shared")
    assert any("Shares words with your current product: cream" in r for r in shared.reasons)


def test_without_refs_behaves_as_before():
    res = recommend(req(), CATALOG)
    shared = next(i for i in res.items if i.id == "p-shared")
    assert any("Shares words with your current product: cream" in r for r in shared.reasons)
    assert not any("Both labels list" in r for i in res.items for r in i.reasons)


def test_compare_uses_list_price_and_never_subtracts_across_currencies():
    usd = {"amount": 12.0, "currency": "USD", "basis": "fixture listed", "source": SRC}
    jpy = {"amount": 1500.0, "currency": "JPY", "basis": "fixture listed", "source": SRC}
    cat = Catalog(items=[product("p-usd", "USD Cream", list_price=usd), product("p-jpy", "JPY Cream", list_price=jpy)])
    facts = ProductFactsCatalog(items=[])
    base = {"profile": {"country": "US", "language": "en", "currency": "USD"}, "current_product_id": "ref-x"}
    same = cmp.compare(CompareRequest.model_validate({**base, "candidate_id": "p-usd"}), cat, REFS, facts)
    assert same.price.candidate.currency == "USD"
    diff = cmp.compare(CompareRequest.model_validate({**base, "candidate_id": "p-jpy"}), cat, REFS, facts)
    assert diff.price.comparable is False and "different currencies" in diff.price.note


def test_budget_reason_mentions_seller_price_instead_of_not_listed():
    usd = {"amount": 12.0, "currency": "USD", "basis": "fixture listed", "source": SRC}
    cat = Catalog(items=[product("p-usd", "USD Cream", list_price=usd), product("p-none", "No Price"),
                         product("p-krw", "KRW Cream", price_krw=50000)])
    body = RecommendationRequest.model_validate({"profile": {"country": "US", "language": "en", "currency": "USD",
                                                             "preferences": {"budget_krw": 30000}}})
    res = {i.id: i.reasons for i in recommend(body, cat).items}
    assert "p-krw" not in res  # 원화 확인가만 예산 필터
    assert any("Seller lists USD 12.00" in r and "not compared with your KRW budget" in r for r in res["p-usd"])
    assert not any("Price not listed" in r for r in res["p-usd"])
    assert any("Price not listed" in r for r in res["p-none"])

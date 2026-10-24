from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app.discovery_server import create_discovery_app
from app.services import discovery_compare as cmp
from app.services.discovery import load_catalog
from tests.discovery.conftest import FIXTURE_ITEMS, SRC, profile

REF_SRC = {"label": "Brand page", "url": "https://brand.example.com/p", "checked_at": "2026-10-24"}

REFS = {
    "items": [
        {
            "id": "ref-a", "brand": "BrandA", "title": "Brand A Cream", "form": "cream", "volume_ml": 50,
            "key_ingredients": ["Ceramide NP", "Glycerin", "Niacinamide"], "ingredients_complete": True,
            "ingredients_basis": "full list", "market_codes": ["US"], "sources": [REF_SRC], "provenance": "test_fixture",
            "price": {"amount": 20, "currency": "USD", "basis": "listed", "source": REF_SRC},
        },
        {
            "id": "ref-partial", "brand": "BrandB", "title": "Brand B Gel", "form": "gel", "volume_ml": None,
            "key_ingredients": ["glycerin"], "ingredients_complete": False, "ingredients_basis": "partial",
            "price": None, "sources": [REF_SRC], "provenance": "test_fixture",
        },
    ]
}
FACTS = {
    "items": [
        {
            "id": "b-serum", "form": "cream", "volume_ml": 50, "key_ingredients": ["ceramide np", "Panthenol"],
            "ingredients_complete": True, "ingredients_basis": "seller full list", "price_basis": "seen 2026-10-24",
            "price_source": SRC, "sources": [SRC], "provenance": "test_fixture",
        }
    ]
}


@pytest.fixture
def cmp_client(client, tmp_path, monkeypatch):
    for name, data, env in (("refs.json", REFS, "DISCOVERY_REFERENCE_PATH"), ("facts.json", FACTS, "DISCOVERY_FACTS_PATH")):
        path = tmp_path / name
        path.write_text(json.dumps(data), encoding="utf-8")
        monkeypatch.setenv(env, str(path))
    return client


def _cmp(c, **body):
    payload = {"profile": profile("US"), "candidate_id": "b-serum", "current_product_id": "ref-a"}
    payload.update(body)
    return c.post("/v1/discovery/compare", json={k: v for k, v in payload.items() if v is not None})


def test_reference_products_listed_with_sources(cmp_client):
    items = cmp_client.get("/v1/discovery/reference-products").json()["items"]
    assert [i["id"] for i in items] == ["ref-a", "ref-partial"]
    assert items[0]["sources"][0]["url"] == REF_SRC["url"]


def test_full_lists_give_common_and_differences(cmp_client):
    body = _cmp(cmp_client).json()
    assert body["current_status"] == "matched"
    common = {p["attribute"]: p for p in body["common"]}
    assert common["key_ingredients"]["candidate"] == ["ceramide np"]
    assert common["form"]["current"] == "cream" and common["volume_ml"]["candidate"] == 50
    diff = {p["attribute"]: p for p in body["differences"]}
    assert diff["key_ingredients"]["current"] == ["Glycerin", "Niacinamide"]
    assert diff["key_ingredients"]["candidate"] == ["Panthenol"]
    assert all(p["sources"] for p in body["common"] + body["differences"])
    assert body["unverified"] == []


def test_price_shown_as_listed_without_conversion(cmp_client):
    price = _cmp(cmp_client).json()["price"]
    assert price["current"]["currency"] == "USD" and price["candidate"]["currency"] == "KRW"
    assert price["candidate"]["amount"] == 25000 and price["candidate"]["source"]["url"] == SRC["url"]
    assert price["comparable"] is False and "without conversion" in price["note"]


def test_partial_list_never_claims_absence(cmp_client):
    body = _cmp(cmp_client, current_product_id="ref-partial").json()
    diff_ing = next(d for d in body["differences"] if d["attribute"] == "key_ingredients")
    # 후보 목록은 전성분이라 '후보에 glycerin 없음'은 말할 수 있다
    assert diff_ing["current"] == ["glycerin"]
    # 현재 제품 목록은 일부라 후보 성분이 '현재 제품에 없다'고 말하지 않는다
    assert diff_ing["candidate"] is None
    unverified = {p["attribute"]: p for p in body["unverified"]}
    assert unverified["key_ingredients"]["candidate"] == ["ceramide np", "Panthenol"]
    assert unverified["volume_ml"]["current"] is None
    assert unverified["key_ingredients"]["basis"].startswith("At least one list is partial")
    form = next(p for p in body["differences"] if p["attribute"] == "form")
    assert (form["current"], form["candidate"]) == ("gel", "cream")


def test_unknown_current_product_returns_candidate_facts_only(cmp_client):
    body = _cmp(cmp_client, current_product_id=None, current_product_name="Some cream I use").json()
    assert body["current_status"] == "unknown" and body["current"] is None
    assert body["common"] == body["differences"] == body["unverified"] == []
    assert body["candidate"]["key_ingredients"] == ["ceramide np", "Panthenol"]
    assert "Some cream I use" not in json.dumps(body)


def test_candidate_without_facts_is_all_unknown(cmp_client):
    body = _cmp(cmp_client, candidate_id="b-sun").json()
    assert body["candidate"]["key_ingredients"] is None and body["candidate"]["price"] is None
    assert body["price"]["comparable"] is False
    assert {p["attribute"] for p in body["unverified"]} >= {"key_ingredients", "volume_ml", "form"}


def test_country_context_only_from_sources(cmp_client):
    us = _cmp(cmp_client).json()["country_context"]
    th = _cmp(cmp_client, profile=profile("TH")).json()["country_context"]
    assert us["status"] == "supported" and "official page for US" in us["explanation"]
    assert th["status"] == "insufficient"
    for ctx in (us, th):
        assert "not used to guess skin type" in ctx["explanation"]
    # 국가만 바뀌고 비교 내용은 같다
    assert _cmp(cmp_client).json()["common"] == _cmp(cmp_client, profile=profile("TH")).json()["common"]


def test_notice_rules_out_equivalence_claims(cmp_client):
    text = json.dumps(_cmp(cmp_client).json()).casefold()
    assert "not mean the products work the same way" in text
    for banned in ("equivalent to", "same effect", "dupe", "clinically proven"):
        assert banned not in text.replace("not mean the products work the same way or are clinically equivalent", "")


@pytest.mark.parametrize(
    "body,status",
    [
        ({"candidate_id": "missing"}, 404),
        ({"current_product_id": "ref-missing"}, 404),
        ({"candidate_id": "m-guide"}, 404),  # 제품이 아닌 안내는 비교 대상이 아니다
        ({"current_product_id": None}, 422),  # 현재 제품 id·이름 둘 다 없음
        ({"profile": {"country": "USA", "language": "en", "currency": "USD"}}, 422),
        ({"candidate_id": ""}, 422),
        ({"extra": "x"}, 422),
    ],
)
def test_invalid_or_unknown_requests(cmp_client, body, status):
    resp = _cmp(cmp_client, **body)
    assert resp.status_code == status, resp.text
    assert "error" in resp.json()


def test_broken_reference_data_is_503_without_path(cmp_client, tmp_path, monkeypatch):
    bad = tmp_path / "bad_refs.json"
    bad.write_text(json.dumps({"items": [{**REFS["items"][0], "sources": []}]}), encoding="utf-8")
    monkeypatch.setenv("DISCOVERY_REFERENCE_PATH", str(bad))
    resp = _cmp(cmp_client)
    assert resp.status_code == 503 and str(tmp_path) not in resp.text


def test_shipped_data_files_validate_and_cerave_illiyoon_compare(monkeypatch):
    for env in ("DISCOVERY_CATALOG_PATH", "DISCOVERY_REFERENCE_PATH", "DISCOVERY_FACTS_PATH"):
        monkeypatch.delenv(env, raising=False)
    catalog, refs, facts = load_catalog(), cmp.load_references(), cmp.load_facts()
    catalog_ids = {i.id for i in catalog.items}
    assert all(f.id in catalog_ids for f in facts.items)
    client = TestClient(create_discovery_app(web_dist=None))
    body = client.post("/v1/discovery/compare", json={
        "profile": {"country": "US", "language": "en", "currency": "USD"},
        "candidate_id": "beauty-illiyoon-ceramide-ato-concentrate-cream-75ml",
        "current_product_id": "ref-cerave-moisturizing-cream",
    }).json()
    shared = next(p for p in body["common"] if p["attribute"] == "key_ingredients")["candidate"]
    assert set(shared) == {"Ceramide NP", "Cholesterol", "Phytosphingosine"}
    assert body["differences"] == []  # 두 목록 모두 일부라 '없음'을 차이로 만들지 않는다
    assert body["price"]["comparable"] is False


def test_existing_catalog_contract_unchanged(cmp_client):
    item = cmp_client.get("/v1/discovery/catalog").json()["items"][0]
    # list_price 는 2026-10-24 추가된 선택 필드(원화가 없을 때 판매처 표시 통화 가격). 기존 필드는 그대로여야 한다.
    assert set(item) - {"list_price"} == set(FIXTURE_ITEMS[0])


@pytest.mark.parametrize("name,matched", [("brand a cream", True), ("  BrandA   Brand A Cream ", True), ("brand a", False), ("Brand A Creamy", False)])
def test_free_text_name_matches_reference_only_exactly(cmp_client, name, matched):
    body = _cmp(cmp_client, current_product_id=None, current_product_name=name).json()
    assert body["current_status"] == ("matched" if matched else "unknown")
    assert (body["current"] or {}).get("id") == ("ref-a" if matched else None)


def test_same_currency_different_size_is_not_comparable(cmp_client, tmp_path, monkeypatch):
    refs = json.loads(json.dumps(REFS))
    refs["items"][0]["price"]["currency"] = "KRW"
    refs["items"][0]["price"]["amount"] = 30000
    for vol, expected in ((80, False), (50, True)):
        refs["items"][0]["volume_ml"] = vol
        path = tmp_path / f"refs_{vol}.json"
        path.write_text(json.dumps(refs), encoding="utf-8")
        monkeypatch.setenv("DISCOVERY_REFERENCE_PATH", str(path))
        price = _cmp(cmp_client).json()["price"]
        assert price["comparable"] is expected, vol
        if not expected:
            assert "different sizes" in price["note"]

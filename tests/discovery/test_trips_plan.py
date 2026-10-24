"""POST /v1/trips/plan 계약 테스트. 지오코딩은 MockTransport 로 격리한다(provenance=test_fixture, 외부 호출 없음)."""

from __future__ import annotations

import asyncio

import httpx
import pytest
from fastapi.testclient import TestClient

from app.api.v1.maps import get_live_client
from app.discovery_server import create_discovery_app
from app.schemas.discovery import Catalog, CatalogItem
from app.schemas.trips import TripPlanRequest
from app.services import maps
from app.services import trips as svc
from app.services.discovery import load_catalog

SRC = [{"label": "test fixture", "url": "https://example.test/source", "checked_at": "2026-10-24"}]


def item(id_, kind="place", lat=None, lng=None, address="서울특별시 중구 테스트로 1"):
    loc = None if kind != "place" else {"name": id_, "lat": lat, "lng": lng, "address": address}
    return CatalogItem.model_validate({
        "id": id_, "kind": kind, "category": "beauty", "title": f"T {id_}", "subtitle": "", "description": "",
        "image_url": None, "price_krw": None, "location": loc, "sources": SRC, "sponsorship": "unknown",
        "reasons": [], "country_codes": [], "tags": [], "provenance": "test_fixture",
    })


# 명동 부근(북쪽) → 서울역 → 강남(남동쪽) 순으로 떨어진 좌표
A = item("place-a", lat=37.5636, lng=126.9850)   # 명동
B = item("place-b", lat=37.5547, lng=126.9707)   # 서울역
C = item("place-c", lat=37.5270, lng=127.0280)   # 강남
CATALOG = Catalog(items=[A, B, C, item("prod-x", kind="product"), item("guide-y", kind="guide"),
                         item("place-noaddr", address=None), item("place-geo")])


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    maps.reset_cache()
    monkeypatch.delenv(maps.CLIENT_ID_ENV, raising=False)
    monkeypatch.delenv(maps.CLIENT_SECRET_ENV, raising=False)
    yield
    maps.reset_cache()


def run(req: dict, handler=lambda r: httpx.Response(404)):
    async def go():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as c:
            return await svc.plan(TripPlanRequest.model_validate(req), CATALOG, c)
    return asyncio.run(go())


def test_orders_by_straight_line_from_origin_and_labels_method():
    res = run({"item_ids": ["place-c", "place-a", "place-b"], "origin": {"lat": 37.5650, "lng": 126.9880}})
    assert res.method == "proximity" and res.distance_source == "straight_line"
    assert [s.item_id for s in res.stops] == ["place-a", "place-b", "place-c"]
    assert [s.order for s in res.stops] == [1, 2, 3]
    assert all(s.distance_from_previous_m and s.distance_from_previous_m > 0 for s in res.stops)
    assert res.origin.source == "input" and res.origin_status == "ok"
    assert "origin=37.565000,126.988000" in res.stops[0].map_links.google_directions


def test_without_origin_starts_from_first_located_place():
    res = run({"item_ids": ["place-c", "place-a", "place-b"]})
    assert [s.item_id for s in res.stops][0] == "place-c"
    assert res.stops[0].distance_from_previous_m is None
    assert res.origin is None and res.origin_status == "none"


def test_products_and_guides_go_to_checklist_and_missing_address_is_unlocated():
    res = run({"item_ids": ["prod-x", "guide-y", "place-noaddr", "place-a", "prod-x"]})
    assert [(c.item_id, c.kind) for c in res.checklist] == [("prod-x", "product"), ("guide-y", "guide")]
    assert [(u.item_id, u.reason) for u in res.unlocated] == [("place-noaddr", "no_address")]
    assert [s.item_id for s in res.stops] == ["place-a"]


def test_geocode_used_only_for_places_without_coordinates(monkeypatch):
    monkeypatch.setenv(maps.CLIENT_ID_ENV, "test-id")
    monkeypatch.setenv(maps.CLIENT_SECRET_ENV, "test-secret-should-not-leak")

    def handler(request):
        return httpx.Response(200, json={"status": "OK", "addresses": [
            {"x": "126.9780", "y": "37.5665", "roadAddress": "서울특별시 중구 세종대로 110"}]})

    res = run({"item_ids": ["place-geo", "place-a"]}, handler)
    geo = next(s for s in res.stops if s.item_id == "place-geo")
    assert geo.location_source == "geocode" and geo.address == "서울특별시 중구 세종대로 110"
    assert next(s for s in res.stops if s.item_id == "place-a").location_source == "catalog"


def test_geocode_without_key_or_result_is_explicit(monkeypatch):
    res = run({"item_ids": ["place-geo"]})
    assert [(u.item_id, u.reason) for u in res.unlocated] == [("place-geo", "geocode_unavailable")]
    monkeypatch.setenv(maps.CLIENT_ID_ENV, "test-id")
    monkeypatch.setenv(maps.CLIENT_SECRET_ENV, "test-secret")
    res = run({"item_ids": ["place-geo"]}, lambda r: httpx.Response(200, json={"status": "OK", "addresses": []}))
    assert res.unlocated[0].reason == "geocode_no_result" and res.stops == []


def test_unknown_ids_raise():
    with pytest.raises(svc.UnknownItems) as exc:
        run({"item_ids": ["place-a", "nope-1"]})
    assert exc.value.ids == ["nope-1"]


# ── API 계약(실제 카탈로그 사용) ──

@pytest.fixture
def client():
    app = create_discovery_app(web_dist=None)

    async def _client():
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(404))) as c:
            yield c

    app.dependency_overrides[get_live_client] = _client
    return TestClient(app)


def test_api_unknown_id_is_422_with_list(client):
    r = client.post("/v1/trips/plan", json={"item_ids": ["definitely-not-a-catalog-id"]})
    assert r.status_code == 422
    body = r.json()["error"]
    assert body["param"] == "item_ids" and body["unknown_ids"] == ["definitely-not-a-catalog-id"]


@pytest.mark.parametrize("body", [
    {"item_ids": []},
    {"item_ids": [f"id-{n}" for n in range(21)]},
    {"item_ids": ["x"], "origin": {"lat": 51.5, "lng": -0.12}},
    {"item_ids": ["x"], "origin": {"lat": 37.5}},
    {"item_ids": ["x"], "origin": {"address": "서울역", "lat": 37.5, "lng": 127.0}},
    {"item_ids": ["x"], "extra": 1},
])
def test_api_rejects_invalid_requests(client, body):
    assert client.post("/v1/trips/plan", json=body).status_code == 422


def test_api_real_catalog_place_and_product(client):
    items = load_catalog().items
    place = next(i for i in items if i.kind == "place")
    product = next(i for i in items if i.kind == "product")
    r = client.post("/v1/trips/plan", json={"item_ids": [place.id, product.id], "origin": {"lat": 37.5547, "lng": 126.9707}})
    assert r.status_code == 200
    body = r.json()
    assert body["checklist"] == [{"item_id": product.id, "title": product.title, "kind": "product"}]
    placed = {s["item_id"] for s in body["stops"]} | {u["item_id"] for u in body["unlocated"]}
    assert placed == {place.id}

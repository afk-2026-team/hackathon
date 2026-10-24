from __future__ import annotations

import json

from fastapi.testclient import TestClient

from app.discovery_server import create_discovery_app
from tests.discovery.conftest import FIXTURE_ITEMS, profile


def _ids(resp):
    return [i["id"] for i in resp.json()["items"]]


def test_catalog_returns_contract_items(client):
    resp = client.get("/v1/discovery/catalog")
    assert resp.status_code == 200
    assert [i["id"] for i in resp.json()["items"]] == [i["id"] for i in FIXTURE_ITEMS]
    assert resp.json()["items"][0]["sources"][0]["url"] == "https://example.com/source"


def test_country_change_moves_only_sourced_reasons(client):
    jp = client.post("/v1/discovery/recommendations", json={"profile": profile("JP"), "category": "beauty"}).json()
    th = client.post("/v1/discovery/recommendations", json={"profile": profile("TH"), "category": "beauty"}).json()
    assert jp["country_context"]["status"] == "supported"
    assert th["country_context"]["status"] == "insufficient"
    assert "general sources" in th["country_context"]["explanation"]
    jp_serum = next(i for i in jp["items"] if i["id"] == "b-serum")
    th_serum = next(i for i in th["items"] if i["id"] == "b-serum")
    assert any("JP" in r for r in jp_serum["reasons"])
    assert not any("TH" in r for r in th_serum["reasons"])
    # 국가 근거가 없어도 공통 출처 후보는 그대로 보여준다
    assert set(i["id"] for i in th["items"]) == set(i["id"] for i in jp["items"])
    assert jp["items"][0]["id"] == "b-serum"


def test_country_never_infers_skin_or_treatment(client):
    for c in ("JP", "TH", "US"):
        body = client.post("/v1/discovery/recommendations", json={"profile": profile(c)}).json()
        text = json.dumps(body).casefold()
        assert "your skin type is" not in text and "suitable for you" not in text


def test_gender_age_do_not_change_results(client):
    base = {"profile": profile("JP", interests=["serum"])}
    plain = client.post("/v1/discovery/recommendations", json=base).json()
    with_demo = client.post(
        "/v1/discovery/recommendations",
        json={"profile": {**base["profile"], "gender": "female", "age_range": "20-29"}},
    ).json()
    assert plain["items"] == with_demo["items"]


def test_budget_excludes_over_budget_and_flags_unknown_price(client):
    resp = client.post("/v1/discovery/recommendations", json={"profile": profile("JP", budget_krw=20000), "category": "beauty"})
    ids = _ids(resp)
    assert "b-cushion" not in ids and "b-serum" not in ids
    assert "b-sun" in ids
    unknown = next(i for i in resp.json()["items"] if i["id"] == "b-unknown")
    assert any("not listed" in r for r in unknown["reasons"])


def test_interest_and_current_product_ranking_is_explained(client):
    resp = client.post(
        "/v1/discovery/recommendations",
        json={"profile": profile("TH", interests=["SunCare"], current_product="my old rice toner"), "category": "beauty"},
    )
    items = resp.json()["items"]
    # 각 1점(관심 suncare / 현재 제품 'rice' / 'toner')으로 동점 → 카탈로그 순서, 무일치 후보는 그 뒤
    assert [i["id"] for i in items[:3]] == ["b-serum", "b-sun", "b-unknown"]
    assert items[3]["id"] == "b-cushion"
    sun = next(i for i in items if i["id"] == "b-sun")
    assert any("suncare" in r.casefold() for r in sun["reasons"])
    serum = next(i for i in items if i["id"] == "b-serum")
    assert any("rice" in r for r in serum["reasons"])


def test_sponsored_never_mixed_into_organic_order(client):
    resp = client.post("/v1/discovery/recommendations", json={"profile": profile("JP", interests=["serum"]), "category": "beauty"})
    sponsorship = [i["sponsorship"] for i in resp.json()["items"]]
    first_ad = sponsorship.index("sponsored")
    assert all(s == "sponsored" for s in sponsorship[first_ad:])
    assert "unknown" in sponsorship[:first_ad]  # 미확인은 광고로도 비광고로도 바꾸지 않고 그대로 둔다


def test_category_filter(client):
    resp = client.post("/v1/discovery/recommendations", json={"profile": profile("US"), "category": "medical"})
    assert _ids(resp) == ["m-guide"]
    assert resp.json()["country_context"]["status"] == "supported"


def test_invalid_profiles_rejected(client):
    bad = [
        {"profile": {"country": "Japan", "language": "en", "currency": "USD"}},
        {"profile": {"country": "JP", "language": "en", "currency": "US"}},
        {"profile": {"country": "JP", "language": "en"}},
        {"profile": profile("JP", budget_krw=-1)},
        {"profile": {**profile("JP"), "skin_type": "oily"}},
        {"profile": profile("JP"), "category": "fashion"},
    ]
    for body in bad:
        resp = client.post("/v1/discovery/recommendations", json=body)
        assert resp.status_code == 422, body
        assert "error" in resp.json()


def test_missing_or_invalid_catalog_is_visible_error(tmp_path, monkeypatch):
    client = TestClient(create_discovery_app(web_dist=None))
    monkeypatch.setenv("DISCOVERY_CATALOG_PATH", str(tmp_path / "absent.json"))
    assert client.get("/v1/discovery/catalog").status_code == 503
    broken = tmp_path / "broken.json"
    broken.write_text(json.dumps({"items": [{**FIXTURE_ITEMS[0], "sources": []}]}), encoding="utf-8")
    monkeypatch.setenv("DISCOVERY_CATALOG_PATH", str(broken))
    resp = client.post("/v1/discovery/recommendations", json={"profile": profile("JP")})
    assert resp.status_code == 503
    assert "sources" in resp.json()["error"]["message"]


def test_no_secret_or_local_path_in_responses(client, catalog_file, monkeypatch):
    monkeypatch.setenv("ASH_FAKE_SECRET_FOR_TEST", "sk-should-never-appear")
    bodies = [
        client.get("/v1/discovery/catalog").text,
        client.post("/v1/discovery/recommendations", json={"profile": profile("JP")}).text,
        client.get("/health").text,
    ]
    monkeypatch.setenv("DISCOVERY_CATALOG_PATH", str(catalog_file.parent / "absent.json"))
    bodies.append(client.get("/v1/discovery/catalog").text)
    for text in bodies:
        assert "sk-should-never-appear" not in text
        assert str(catalog_file.parent) not in text


def test_spa_static_fallback(tmp_path, catalog_file):
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<html>spa</html>", encoding="utf-8")
    (dist / "assets" / "app.js").write_text("console.log(1)", encoding="utf-8")
    client = TestClient(create_discovery_app(web_dist=dist))
    assert client.get("/").text == "<html>spa</html>"
    assert client.get("/explore").text == "<html>spa</html>"
    assert client.get("/assets/app.js").text == "console.log(1)"
    assert client.get("/v1/unknown").status_code == 404
    assert client.get("/v1").status_code == 404
    assert client.get("/v1/discovery/catalog").status_code == 200
    # 경로 이탈은 dist 밖 파일이 아니라 SPA 진입점으로 떨어진다
    assert client.get("/assets/%2e%2e/%2e%2e/secret.txt").text == "<html>spa</html>"


def test_unspecified_country_xx_uses_general_sources(client):
    body = client.post("/v1/discovery/recommendations", json={"profile": profile("XX")}).json()
    assert body["country_context"] == {**body["country_context"], "country": "XX", "status": "insufficient"}
    assert len(body["items"]) == len(FIXTURE_ITEMS)


def test_interest_matches_category_name_exactly(client):
    body = client.post("/v1/discovery/recommendations", json={"profile": profile("TH", interests=["medical"])}).json()
    assert body["items"][0]["id"] == "m-guide"
    assert any("medical" in r for r in body["items"][0]["reasons"])


def test_unreadable_catalog_is_503_without_path(tmp_path, monkeypatch):
    bad = tmp_path / "latin1.json"
    bad.write_bytes(b"\xff\xfe{")
    monkeypatch.setenv("DISCOVERY_CATALOG_PATH", str(bad))
    resp = TestClient(create_discovery_app(web_dist=None)).get("/v1/discovery/catalog")
    assert resp.status_code == 503
    assert str(tmp_path) not in resp.text
    monkeypatch.setenv("DISCOVERY_CATALOG_PATH", str(tmp_path))  # 디렉터리 → OSError
    assert TestClient(create_discovery_app(web_dist=None)).get("/v1/discovery/catalog").status_code == 503

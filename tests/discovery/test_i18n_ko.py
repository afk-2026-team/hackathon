"""한국어 모드 계약 테스트. 합성 카탈로그(conftest)와 실제 데이터 커버리지를 함께 본다."""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from app.schemas.discovery import Catalog, ProductFactsCatalog, ReferenceCatalog
from app.services import discovery_i18n as i18n
from tests.discovery.conftest import SRC, profile
from tests.discovery.test_compare_api import REF_SRC, cmp_client  # noqa: F401  (fixture 재사용)

HANGUL = re.compile(r"[가-힣]")
DATA = Path(__file__).resolve().parents[2] / "app" / "data"

# 합성 카탈로그용 한국어(테스트 전용). b-serum·m-guide 만 번역하고 나머지는 누락 폴백을 확인한다
FIXTURE_KO = {
    "language": "ko",
    "provenance": "test_fixture",
    "items": {
        "b-serum": {"title": "쌀뜨물 세럼", "description": "테스트 설명", "reasons": []},
        "m-guide": {"description": "테스트 안내", "reasons": []},
    },
    "source_labels": {SRC["url"]: "테스트 출처", REF_SRC["url"]: "브랜드 페이지"},
    "facts": {"b-serum": {"ingredients_basis": "판매처 전성분", "price_basis": "2026-10-24 확인"}},
    "references": {"ref-a": {"ingredients_basis": "전성분", "price_basis": "표시 가격"}},
    "forms": {"cream": "크림"},
}


def ko_profile(country="JP", **prefs):
    return {**profile(country, **prefs), "language": "ko"}


@pytest.fixture
def ko_file(tmp_path, monkeypatch):
    path = tmp_path / "catalog_ko.json"
    path.write_text(json.dumps(FIXTURE_KO, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setenv(i18n.KO_PATH_ENV, str(path))
    return path


@pytest.mark.parametrize("tag,expected", [("ko", "ko"), ("ko-KR", "ko"), ("KO", "ko"), ("en", "en"), ("en-US", "en"), ("ja", "en"), (None, "en")])
def test_ui_lang(tag, expected):
    assert i18n.ui_lang(tag) == expected


def test_catalog_ko_localizes_text_and_sources(client, ko_file):
    items = {i["id"]: i for i in client.get("/v1/discovery/catalog", params={"lang": "ko"}).json()["items"]}
    assert items["b-serum"]["title"] == "쌀뜨물 세럼" and items["b-serum"]["description"] == "테스트 설명"
    assert items["b-serum"]["sources"][0]["label"] == "테스트 출처"
    assert items["m-guide"]["title"] == "Item m-guide"  # 공식 한국어 이름이 없으면 영어 제목 유지
    assert items["b-sun"]["title"] == "Daily Sun Cream"  # 한국어 항목이 없으면 영어 폴백


def test_catalog_default_is_unchanged_english(client, ko_file):
    default = client.get("/v1/discovery/catalog").json()
    assert default == client.get("/v1/discovery/catalog", params={"lang": "en"}).json()
    assert {i["id"]: i["title"] for i in default["items"]}["b-serum"] == "Rice Water Serum"


def test_recommendations_ko_reasons_and_country(client, ko_file):
    body = client.post("/v1/discovery/recommendations", json={"profile": ko_profile("JP", budget_krw=30000, interests=["serum"])}).json()
    serum = next(i for i in body["items"] if i["id"] == "b-serum")
    assert serum["title"] == "쌀뜨물 세럼"
    assert serum["reasons"] and all(HANGUL.search(r) for r in serum["reasons"])
    assert HANGUL.search(body["country_context"]["explanation"])


def test_compare_ko_server_sentences(cmp_client, ko_file):
    body = cmp_client.post("/v1/discovery/compare", json={"profile": ko_profile("US"), "candidate_id": "b-serum", "current_product_id": "ref-a"}).json()
    assert HANGUL.search(body["notice"]) and HANGUL.search(body["price"]["note"])
    assert HANGUL.search(body["country_context"]["explanation"])
    for point in body["common"] + body["differences"] + body["unverified"]:
        assert HANGUL.search(point["basis"]), point
    common = {p["attribute"]: p for p in body["common"]}
    assert common["form"]["current"] == "크림" and common["form"]["candidate"] == "크림"
    assert body["candidate"]["title"] == "쌀뜨물 세럼"
    assert body["current"]["title"] == "Brand A Cream"  # 공식 영어 제품명은 그대로
    assert body["candidate"]["key_ingredients"] == ["ceramide np", "Panthenol"]  # 성분명은 라벨 표기 그대로


def test_explain_ko_fallback_text(cmp_client, ko_file):
    from app.api.v1.discovery import get_explain_llm

    cmp_client.app.dependency_overrides[get_explain_llm] = lambda: None
    try:
        body = cmp_client.post("/v1/discovery/explain", json={"profile": ko_profile("US", budget_krw=30000), "candidate_id": "b-serum", "current_product_id": "ref-a"}).json()
    finally:
        cmp_client.app.dependency_overrides.pop(get_explain_llm, None)
    assert body["mode"] == "fallback"
    assert HANGUL.search(body["text"]) and HANGUL.search(body["notice"])
    assert "Both" not in body["text"] and "Listed" not in body["text"]


def test_compare_en_unchanged_with_ko_file_present(cmp_client, ko_file):
    body = cmp_client.post("/v1/discovery/compare", json={"profile": profile("US"), "candidate_id": "b-serum", "current_product_id": "ref-a"}).json()
    assert body["notice"].startswith("This compares label information only")
    assert {p["attribute"]: p for p in body["common"]}["form"]["current"] == "cream"


def test_broken_ko_file_is_503_not_silent(client, tmp_path, monkeypatch):
    bad = tmp_path / "bad_ko.json"
    bad.write_text("{not json", encoding="utf-8")
    monkeypatch.setenv(i18n.KO_PATH_ENV, str(bad))
    assert client.get("/v1/discovery/catalog", params={"lang": "ko"}).status_code == 503
    assert client.post("/v1/discovery/recommendations", json={"profile": ko_profile()}).status_code == 503
    assert client.get("/v1/discovery/catalog").status_code == 200  # 영어 경로는 한국어 파일을 읽지 않는다


# ── 실제 데이터 커버리지: 한국어가 빠진 항목이 생기면 여기서 실패한다 ──


def coverage_problems(catalog: Catalog, facts: ProductFactsCatalog, refs: ReferenceCatalog, ko: i18n.KoCatalog) -> list[str]:
    problems = []
    for item in catalog.items:
        entry = ko.items.get(item.id)
        if entry is None:
            problems.append(f"{item.id}: no Korean entry")
            continue
        if len(entry.reasons) != len(item.reasons):
            problems.append(f"{item.id}: reasons count {len(entry.reasons)} != {len(item.reasons)}")
        if item.description and not HANGUL.search(entry.description):
            problems.append(f"{item.id}: description is not Korean")
        if any(not HANGUL.search(r) for r in entry.reasons):
            problems.append(f"{item.id}: a reason is not Korean")
        korean_name = item.subtitle.split("·")[0].strip()
        if HANGUL.search(korean_name) and entry.title != korean_name:
            problems.append(f"{item.id}: title {entry.title!r} != official Korean name {korean_name!r}")
        if item.list_price and item.list_price.basis not in ko.list_price_basis:
            problems.append(f"{item.id}: list_price basis not translated")
    urls = {s.url for i in catalog.items for s in i.sources} | {i.list_price.source.url for i in catalog.items if i.list_price}
    for f in facts.items:
        urls |= {s.url for s in f.sources} | ({f.price_source.url} if f.price_source else set())
        if f.id not in ko.facts:
            problems.append(f"facts {f.id}: no Korean basis")
    for r in refs.items:
        urls |= {s.url for s in r.sources} | ({r.price.source.url} if r.price else set())
        if r.id not in ko.references:
            problems.append(f"reference {r.id}: no Korean basis")
    problems += [f"source label missing: {u}" for u in sorted(urls - set(ko.source_labels))]
    return problems


def _real():
    load = lambda name, model: model.model_validate(json.loads((DATA / name).read_text(encoding="utf-8")))  # noqa: E731
    return (
        load("discovery_catalog.json", Catalog),
        load("discovery_product_facts.json", ProductFactsCatalog),
        load("discovery_reference_products.json", ReferenceCatalog),
        i18n.KoCatalog.model_validate(json.loads((DATA / "discovery_catalog_ko.json").read_text(encoding="utf-8"))),
    )


def test_coverage_real_data_is_complete():
    assert coverage_problems(*_real()) == []


def test_coverage_detects_missing_entry():
    catalog, facts, refs, ko = _real()
    first = catalog.items[0].id
    broken = ko.model_copy(update={"items": {k: v for k, v in ko.items.items() if k != first}})
    assert coverage_problems(catalog, facts, refs, broken) == [f"{first}: no Korean entry"]


def test_every_catalog_tag_has_a_korean_label():
    """web/src/lib/tagLabels.ts 의 한국어 표시 라벨이 실제 카탈로그 태그를 모두 덮는지 본다."""
    labels_src = (DATA.parents[1] / "web" / "src" / "lib" / "tagLabels.ts").read_text(encoding="utf-8")
    known = set(re.findall(r"^\s+(\w+): '", labels_src, re.M))
    catalog, *_ = _real()
    assert sorted({t for i in catalog.items for t in i.tags} - known) == []

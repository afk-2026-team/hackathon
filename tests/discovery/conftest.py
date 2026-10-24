from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app.discovery_server import create_discovery_app

# 테스트 전용 합성 카탈로그(provenance=test_fixture). 실제 제품·기관 데이터가 아니다.
SRC = {"label": "Fixture source", "url": "https://example.com/source", "checked_at": "2026-10-24"}


def _item(id_, category="beauty", price=None, tags=(), countries=(), sponsorship="not_sponsored", title=None, kind="product"):
    return {
        "id": id_,
        "kind": kind,
        "category": category,
        "title": title or f"Item {id_}",
        "subtitle": "",
        "description": "",
        "image_url": None,
        "price_krw": price,
        "location": None,
        "sources": [SRC],
        "sponsorship": sponsorship,
        "reasons": [],
        "country_codes": list(countries),
        "tags": list(tags),
        "provenance": "test_fixture",
    }


FIXTURE_ITEMS = [
    _item("b-serum", price=25000, tags=["serum", "hydration"], countries=["JP"], title="Rice Water Serum"),
    _item("b-sun", price=18000, tags=["suncare"], title="Daily Sun Cream"),
    _item("b-cushion", price=45000, tags=["makeup"]),
    _item("b-ad", price=15000, tags=["serum"], sponsorship="sponsored"),
    _item("b-unknown", price=None, tags=["toner"], sponsorship="unknown"),
    _item("m-guide", category="medical", kind="guide", tags=["dermatology"], countries=["US"]),
]


@pytest.fixture
def catalog_file(tmp_path, monkeypatch):
    path = tmp_path / "catalog.json"
    path.write_text(json.dumps({"items": FIXTURE_ITEMS}), encoding="utf-8")
    monkeypatch.setenv("DISCOVERY_CATALOG_PATH", str(path))
    return path


@pytest.fixture
def client(catalog_file):
    return TestClient(create_discovery_app(web_dist=None))


def profile(country="JP", **prefs):
    body = {"country": country, "language": "en", "currency": "USD"}
    if prefs:
        body["preferences"] = prefs
    return body

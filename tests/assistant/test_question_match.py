"""질문 단어 ↔ 카탈로그 태그 대조로 AI 후보를 질문 주제 쪽으로 세운다(결정론, 순위 아님). 실제 카탈로그 + 합성 fixture."""

from __future__ import annotations

import httpx
import pytest
from fastapi.testclient import TestClient

from app.api.v1.assistant_proxy import MAX_PER_CATEGORY, get_ai_client
from app.discovery_server import create_discovery_app
from app.schemas.discovery import CatalogItem
from app.services.question_match import MAX_GUIDES_WHEN_PLACE, asks_for_place, prioritize, question_tags

SRC = [{"label": "fixture", "url": "https://example.test/s", "checked_at": "2026-10-24"}]
DRY_SKIN_Q = "I have dry sensitive skin. Recommend a moisturizing cream and a dermatology clinic in Seoul."


def item(id_, kind="place", category="medical", tags=()):
    loc = {"name": id_, "address": "서울"} if kind == "place" else None
    return CatalogItem.model_validate({
        "id": id_, "kind": kind, "category": category, "title": id_, "subtitle": "", "description": "",
        "image_url": None, "price_krw": None, "location": loc, "sources": SRC, "sponsorship": "unknown",
        "reasons": [], "country_codes": [], "tags": list(tags), "provenance": "test_fixture",
    })


@pytest.mark.parametrize("q,expected", [
    (DRY_SKIN_Q, {"moisturizer", "cream", "dermatology", "seoul"}),
    ("강남 피부과 추천해 주세요", {"gangnam", "dermatology"}),
    ("Any dentist near Hongdae?", {"dental", "mapo"}),
    ("성형외과 상담 받고 싶어요", {"plastic_surgery"}),
    ("good sunscreen and toner?", {"sunscreen", "toner"}),
    ("hello", set()),
])
def test_question_tags(q, expected):
    assert question_tags(q) == expected


def test_place_intent():
    assert asks_for_place("Where is a good hospital?", set())
    assert asks_for_place("피부과", {"dermatology"})
    assert not asks_for_place("Is it safe to buy sunscreen?", {"sunscreen"})


def test_place_first_and_guides_capped_when_clinic_is_asked():
    pool = [item("g1", kind="guide", tags=["dermatology", "seoul"]), item("g2", kind="guide", tags=["dermatology"]),
            item("dental-place", tags=["dental", "seoul"]), item("derm-place", tags=["dermatology", "seoul"]),
            item("derm-busan", tags=["dermatology", "busan"])]
    out = [i.id for i, _ in prioritize(pool, DRY_SKIN_Q, 3)]
    assert out[0] == "derm-place"  # 같은 일치 수(2)에서 장소가 안내보다 앞
    assert sum(1 for x in out if x.startswith("g")) <= MAX_GUIDES_WHEN_PLACE


def test_official_guide_place_counts_as_guide():
    pool = [item("desk", tags=["dermatology", "seoul", "official_guide"]), item("derm", tags=["dermatology", "seoul"])]
    assert [i.id for i, _ in prioritize(pool, DRY_SKIN_Q, 2)] == ["derm", "desk"]


def test_no_match_keeps_profile_order():
    pool = [item("a", tags=["dental"]), item("b", tags=["checkup"])]
    assert [i.id for i, hits in prioritize(pool, "hello", 2)] == ["a", "b"]


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("JINSEONMI_AI_UPSTREAM", "http://ai.upstream.test")
    app = create_discovery_app(web_dist=None)
    answer = {"id": "r", "object": "response", "created_at": 1, "status": "completed", "model": "kbeauty-sonnet",
              "output": [{"type": "message", "id": "m", "status": "completed", "role": "assistant",
                          "content": [{"type": "output_text", "text": "ok", "annotations": []}]}],
              "incomplete_details": None, "metadata": {}}

    async def _client():
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200, json=answer))) as c:
            yield c

    app.dependency_overrides[get_ai_client] = _client
    return TestClient(app)


def test_dry_skin_question_gets_dermatology_places_from_real_catalog(client):
    r = client.post("/v1/responses", json={"input": DRY_SKIN_Q, "metadata": {"profile": {"language": "en", "country": "US"}}})
    cands = r.json()["metadata"]["candidates"]
    medical = [c for c in cands if c["category"] == "medical"]
    beauty = [c for c in cands if c["category"] == "beauty"]
    assert len(medical) == MAX_PER_CATEGORY and len(beauty) == MAX_PER_CATEGORY
    assert sum(c["kind"] == "place" for c in medical) >= MAX_PER_CATEGORY - MAX_GUIDES_WHEN_PLACE
    assert "medical-place-medicalkorea-info-center-seoul" not in [c["id"] for c in medical]  # 안내 데스크보다 진료 기관 먼저
    assert all(any("Matches words in your question" in x and "dermatology" in x for x in c["reasons"])
               for c in medical if c["kind"] == "place")
    assert all(any("cream" in x or "moisturizer" in x for x in c["reasons"] if "your question" in x) for c in beauty)


def test_korean_question_reason_is_korean(client):
    r = client.post("/v1/responses", json={"input": "강남 피부과 알려줘", "metadata": {"profile": {"language": "ko", "country": "KR"}}})
    medical = [c for c in r.json()["metadata"]["candidates"] if c["category"] == "medical"]
    assert any("질문의 단어와 일치해요" in x for c in medical for x in c["reasons"])

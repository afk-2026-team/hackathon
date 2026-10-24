"""/v1/responses 카탈로그 후보 연결 계약. 업스트림 AI 는 MockTransport(provenance=test_fixture) — 실제 모델 호출 없음."""

from __future__ import annotations

import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app.api.v1 import assistant_proxy
from app.api.v1.assistant_proxy import get_ai_client, recommended_ids
from app.discovery_server import create_discovery_app
from app.services import discovery as discovery_svc
from app.services.discovery import load_catalog

PROFILE = {"language": "en", "country": "US"}


def _answer(text):
    return {"id": "resp_t", "object": "response", "created_at": 1, "status": "completed", "model": "kbeauty-sonnet",
            "output": [{"type": "message", "id": "m", "status": "completed", "role": "assistant",
                        "content": [{"type": "output_text", "text": text, "annotations": []}]}],
            "incomplete_details": None, "metadata": {"profile": PROFILE}}


@pytest.fixture
def make(monkeypatch):
    monkeypatch.setenv("JINSEONMI_AI_UPSTREAM", "http://ai.upstream.test")

    def build(text="ok"):
        calls = []
        app = create_discovery_app(web_dist=None)

        async def _client():
            def h(req):
                calls.append(req)
                return httpx.Response(200, json=_answer(text(req) if callable(text) else text))
            async with httpx.AsyncClient(transport=httpx.MockTransport(h)) as c:
                yield c

        app.dependency_overrides[get_ai_client] = _client
        return TestClient(app), calls
    return build


def test_question_gets_balanced_beauty_and_medical_candidates(make):
    client, calls = make()
    r = client.post("/v1/responses", json={"input": "Which dental clinic info is available?",
                                           "metadata": {"profile": {**PROFILE, "interests": ["skincare"]}}})
    meta = r.json()["metadata"]
    cats = [c["category"] for c in meta["candidates"]]
    assert "medical" in cats and "beauty" in cats  # skincare 관심사가 질문 범위를 beauty 로 고정하지 않는다
    assert cats.count("beauty") <= assistant_proxy.MAX_PER_CATEGORY and cats.count("medical") <= assistant_proxy.MAX_PER_CATEGORY
    assert meta["candidates_basis"] == "server_recommendation" and meta["candidates_status"] == "ok"
    known = {i.id for i in load_catalog().items}
    assert all(c["id"] in known and c["sources"] for c in meta["candidates"])
    assert all("list_price" in c for c in meta["candidates"])


def test_home_request_uses_top_overall_candidates(make):
    client, _ = make()
    meta = client.post("/v1/responses", json={"metadata": {"profile": PROFILE}}).json()["metadata"]
    assert 0 < len(meta["candidates"]) <= assistant_proxy.MAX_CANDIDATES


def test_preferences_reach_upstream_profile_and_context(make):
    client, calls = make()
    prof = {**PROFILE, "currency": "usd", "interests": ["skincare"], "budget_krw": 30000, "current_product": "CeraVe Moisturizing Cream"}
    assert client.post("/v1/responses", json={"input": "What should I try?", "metadata": {"profile": prof}}).status_code == 200
    sent = json.loads(calls[0].content)
    assert sent["metadata"]["profile"] == prof  # 선호가 직접 질문에도 함께 간다
    assert sent["input"] == "What should I try?"  # 분류기용 원문 보존


def test_recommended_ids_only_cited_known_candidates(make):
    def answer(req):
        first = json.loads(req.content)["metadata"]["catalog_candidate_ids"][0]
        return f"Try X [{first}] and Y [made-up-id-123]. Also [{first}] again."

    client, _ = make(answer)
    meta = client.post("/v1/responses", json={"input": "suggest", "metadata": {"profile": PROFILE}}).json()["metadata"]
    cand_ids = [c["id"] for c in meta["candidates"]]
    assert len(meta["recommended_ids"]) == 1 and meta["recommended_ids"][0] in cand_ids


def test_recommended_ids_helper_ignores_name_text():
    cands = [{"id": "beauty-a-50ml"}, {"id": "medical-b"}]
    assert recommended_ids("Beauty A 50ml is nice; see [medical-b] and [beauty-a-50ml]", cands) == ["medical-b", "beauty-a-50ml"]


def test_catalog_failure_is_explicit_and_ai_still_answers(make, monkeypatch):
    def broken():
        raise discovery_svc.CatalogUnavailable("data file not found: x.json")
    monkeypatch.setattr(discovery_svc, "load_catalog", broken)
    client, calls = make()
    r = client.post("/v1/responses", json={"input": "hi", "metadata": {"profile": PROFILE}})
    assert r.status_code == 200
    meta = r.json()["metadata"]
    assert meta["candidates"] == [] and meta["candidates_status"] == "unavailable" and meta["recommended_ids"] == []
    sent = json.loads(calls[0].content)
    assert sent["input"] == "hi" and sent["metadata"]["catalog_candidate_ids"] == []


def test_client_cannot_inject_catalog_ids_through_proxy(make):
    client, calls = make()
    r = client.post("/v1/responses", json={"input": "hi", "metadata": {"profile": PROFILE, "catalog_candidate_ids": ["x"]}})
    assert r.status_code == 422 and calls == []

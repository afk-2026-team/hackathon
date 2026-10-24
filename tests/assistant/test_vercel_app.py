"""Vercel 단일 ASGI 진입점 계약 테스트.

AI 그래프는 테스트 전용 가짜(provenance=test_fixture)로 바꾼다 — 실제 모델·외부 네트워크 호출이 없다.
"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

import deploy.vercel_app as vercel_app


class FakeGraph:
    def __init__(self) -> None:
        self.inputs: list[dict] = []

    async def ainvoke(self, graph_input, config):
        self.inputs.append(graph_input)
        return {"response": "in-process answer", "finish_reason": "stop"}


@pytest.fixture
def fake_graph(monkeypatch):
    graph = FakeGraph()
    calls = {"n": 0}

    def fake_build_registry(config):
        calls["n"] += 1
        return {"kbeauty-sonnet": SimpleNamespace(graph=graph, multi_turn=False, nodes=["respond"], knowledge_count=0)}

    monkeypatch.setattr(vercel_app, "build_registry", fake_build_registry)
    graph.calls = calls
    return graph


def test_public_routes_keep_discovery_contract(fake_graph):
    with TestClient(vercel_app.create_public_app()) as c:
        assert c.get("/health").json()["service"] == "discovery"
        assert len(c.get("/v1/discovery/catalog").json()["items"]) > 0
        assert c.get("/v1/fx", params={"base": "USD"}).status_code == 422  # 기존 검증 그대로
        assert c.post("/v1/chat/completions", json={}).status_code == 404  # AI 앱 표면은 공개하지 않는다
        assert c.get("/v1/models").status_code == 404


def test_responses_goes_through_proxy_to_in_process_ai(fake_graph):
    with TestClient(vercel_app.create_public_app()) as c:
        r = c.post("/v1/responses", json={"input": "  hi  ", "metadata": {"profile": {"language": "en", "country": "US"}}})
        assert r.status_code == 200
        body = r.json()
        assert body["object"] == "response" and body["status"] == "completed" and body["model"] == "kbeauty-sonnet"
        assert body["output"][0]["content"][0]["text"] == "in-process answer"
        assert fake_graph.inputs[0]["profile"] == {"language": "en", "country": "US"}
        # 두 번째 요청은 레지스트리를 다시 만들지 않는다
        c.post("/v1/responses", json={"input": "again", "metadata": {"profile": {"language": "en", "country": "US"}}})
        assert fake_graph.calls["n"] == 1


def test_proxy_validation_still_applies(fake_graph):
    with TestClient(vercel_app.create_public_app()) as c:
        r = c.post("/v1/responses", json={"input": "hi", "stream": True, "metadata": {"profile": {"language": "en", "country": "US"}}})
        assert r.status_code == 422
        assert fake_graph.inputs == []


def test_ai_build_failure_is_503_and_discovery_stays_up(monkeypatch):
    def broken(config):
        raise KeyError("ASH_JEV_KEY")

    monkeypatch.setattr(vercel_app, "build_registry", broken)
    with TestClient(vercel_app.create_public_app()) as c:
        r = c.post("/v1/responses", json={"input": "hi", "metadata": {"profile": {"language": "en", "country": "US"}}})
        assert r.status_code == 503
        assert "ASH_JEV_KEY" not in r.json()["error"]["message"]
        assert c.get("/v1/discovery/catalog").status_code == 200


def test_in_process_ai_timeout_maps_to_504(monkeypatch):
    class SlowGraph:
        async def ainvoke(self, graph_input, config):
            await asyncio.sleep(5)
            return {"response": "late", "finish_reason": "stop"}

    monkeypatch.setattr(vercel_app, "build_registry", lambda config: {"kbeauty-sonnet": SimpleNamespace(graph=SlowGraph(), multi_turn=False)})
    monkeypatch.setattr(vercel_app, "AI_TIMEOUT_S", 0.2)
    with TestClient(vercel_app.create_public_app()) as c:
        r = c.post("/v1/responses", json={"input": "hi", "metadata": {"profile": {"language": "en", "country": "US"}}})
        assert r.status_code == 504

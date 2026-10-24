"""discovery_server /v1/responses 프록시 계약 테스트.

업스트림(app.serve)은 httpx.MockTransport 로 격리한다(provenance=test_fixture). 실제 모델 응답이 아니다.
"""

from __future__ import annotations

import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app.api.v1.assistant_proxy import get_ai_client
from app.discovery_server import create_discovery_app

PROFILE = {"language": "en", "country": "US", "gender": "female", "age_band": "25-34"}


def _response_object(text="Hello", status="completed"):
    return {
        "id": "resp_test",
        "object": "response",
        "created_at": 1,
        "status": status,
        "model": "kbeauty-haiku",
        "output": [{"type": "message", "id": "msg_test", "status": status, "role": "assistant",
                    "content": [{"type": "output_text", "text": text, "annotations": []}]}],
        "incomplete_details": None,
        "metadata": None,
    }


@pytest.fixture
def make_client(monkeypatch):
    monkeypatch.setenv("JINSEONMI_AI_UPSTREAM", "http://ai.upstream.test")
    calls: list[httpx.Request] = []

    def build(handler):
        app = create_discovery_app(web_dist=None)

        def recording(request: httpx.Request) -> httpx.Response:
            calls.append(request)
            return handler(request)

        async def _client():
            async with httpx.AsyncClient(transport=httpx.MockTransport(recording), timeout=5.0) as c:
                yield c

        app.dependency_overrides[get_ai_client] = _client
        return TestClient(app), calls

    return build


def test_forwards_profile_and_question_to_upstream(make_client):
    client, calls = make_client(lambda r: httpx.Response(200, json=_response_object("Try a ceramide cream.")))
    res = client.post("/v1/responses", json={"input": "  What should I buy?  ", "metadata": {"profile": PROFILE}},
                      headers={"X-Thread-Id": "session-1"})
    assert res.status_code == 200
    assert res.json()["output"][0]["content"][0]["text"] == "Try a ceramide cream."
    sent = json.loads(calls[0].content)
    assert str(calls[0].url) == "http://ai.upstream.test/v1/responses"
    assert sent == {"model": "kbeauty-haiku", "input": "What should I buy?", "stream": False, "metadata": {"profile": PROFILE}}
    assert calls[0].headers["X-Thread-Id"] == "session-1"


def test_home_request_without_input_sends_profile_only(make_client):
    client, calls = make_client(lambda r: httpx.Response(200, json=_response_object()))
    res = client.post("/v1/responses", json={"metadata": {"profile": {"language": "ko", "country": "JP"}}})
    assert res.status_code == 200
    sent = json.loads(calls[0].content)
    assert sent["input"] is None and sent["metadata"] == {"profile": {"language": "ko", "country": "JP"}}


@pytest.mark.parametrize("body,param", [
    ({"input": "hi"}, "metadata"),
    ({"input": "hi", "metadata": {"profile": {"language": "en", "country": "USA"}}}, "metadata.profile.country"),
    ({"input": "x" * 2001, "metadata": {"profile": PROFILE}}, "input"),
    ({"input": "hi", "stream": True, "metadata": {"profile": PROFILE}}, "stream"),
    ({"input": "hi", "metadata": {"profile": {**PROFILE, "currency": "USD"}}}, "metadata.profile.currency"),
])
def test_invalid_input_is_rejected_before_upstream(make_client, body, param):
    client, calls = make_client(lambda r: httpx.Response(200, json=_response_object()))
    res = client.post("/v1/responses", json=body)
    assert res.status_code == 422
    assert res.json()["error"]["param"] == param
    assert calls == []


def test_upstream_not_running_is_503(make_client):
    def down(request):
        raise httpx.ConnectError("refused", request=request)
    client, _ = make_client(down)
    res = client.post("/v1/responses", json={"input": "hi", "metadata": {"profile": PROFILE}})
    assert res.status_code == 503
    assert "isn't available" in res.json()["error"]["message"]


def test_upstream_timeout_is_504(make_client):
    def slow(request):
        raise httpx.ReadTimeout("slow", request=request)
    client, _ = make_client(slow)
    res = client.post("/v1/responses", json={"input": "hi", "metadata": {"profile": PROFILE}})
    assert res.status_code == 504


def test_upstream_error_keeps_status_and_message(make_client):
    envelope = {"error": {"message": "Model not found: x", "type": "invalid_request_error", "param": "model", "code": "model_not_found"}}
    client, _ = make_client(lambda r: httpx.Response(404, json=envelope))
    res = client.post("/v1/responses", json={"input": "hi", "metadata": {"profile": PROFILE}})
    assert res.status_code == 404
    assert res.json()["error"]["message"] == "Model not found: x"


@pytest.mark.parametrize("resp", [
    httpx.Response(200, text="not json"),
    httpx.Response(200, json={"object": "chat.completion"}),
])
def test_unreadable_upstream_is_502(make_client, resp):
    client, _ = make_client(lambda r: resp)
    res = client.post("/v1/responses", json={"input": "hi", "metadata": {"profile": PROFILE}})
    assert res.status_code == 502

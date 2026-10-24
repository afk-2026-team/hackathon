"""explain 계약 테스트. 모델은 가짜로 주입한다(실제 호출 아님). 모델은 fact_id 만 고르고 문장은 서버가 조립한다."""

from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace

import pytest

from app.api.v1.discovery import get_explain_llm
from app.services import discovery_explain as exp
from tests.discovery.conftest import profile
from tests.discovery.test_compare_api import cmp_client  # noqa: F401  (fixture 재사용)


class FakeLLM:
    def __init__(self, reply=None, exc=None, hang=False):
        self.reply, self.exc, self.hang, self.calls = reply, exc, hang, []

    async def ainvoke(self, messages, **kwargs):
        self.calls.append(messages)
        if self.hang:
            await asyncio.sleep(60)
        if self.exc:
            raise self.exc
        return SimpleNamespace(content=self.reply)


@pytest.fixture
def use_llm(cmp_client):
    def _set(llm):
        cmp_client.app.dependency_overrides[get_explain_llm] = lambda: llm
        return llm
    yield _set
    cmp_client.app.dependency_overrides.pop(get_explain_llm, None)


def _explain(c, **body):
    payload = {"profile": profile("US", budget_krw=30000), "candidate_id": "b-serum", "current_product_id": "ref-a"}
    payload.update(body)
    return c.post("/v1/discovery/explain", json={k: v for k, v in payload.items() if v is not None})


def _facts(llm):
    return {f["fact_id"]: f["text"] for f in json.loads(llm.calls[0][1][1])["facts"]}


def _pick(*ids, extra=""):
    return json.dumps({"fact_ids": list(ids)}) + extra


def test_llm_picks_ids_and_server_assembles_stored_sentences(cmp_client, use_llm):
    llm = use_llm(FakeLLM(_pick("F2", "F1")))
    body = _explain(cmp_client).json()
    facts = _facts(llm)
    assert body["mode"] == "llm" and body["fallback_reason"] is None
    assert body["text"] == f"{facts['F2']} {facts['F1']}"  # 모델이 정한 순서
    assert body["sources"]


def test_model_free_text_is_never_rendered(cmp_client, use_llm):
    use_llm(FakeLLM('Sure! It is the best cream, see https://evil.example.com {"fact_ids": ["F1"]} cheaper than everything'))
    body = _explain(cmp_client).json()
    assert body["mode"] == "llm"
    for leaked in ("best", "evil", "cheaper", "Sure"):
        assert leaked not in body["text"]


def test_thinking_blocks_are_ignored(cmp_client, use_llm):
    blocks = [{"type": "thinking", "thinking": '{"fact_ids": ["F9"]}'}, {"type": "text", "text": _pick("F1")}]
    use_llm(FakeLLM(blocks))
    assert _explain(cmp_client).json()["mode"] == "llm"


@pytest.mark.parametrize(
    "reply",
    [_pick("F99"), _pick(), _pick("F1", "F1"), _pick("F1", "F2", "F3", "F4"), json.dumps({"fact_ids": [1]}), "no json here", "", json.dumps({"ids": ["F1"]})],
)
def test_invalid_selection_falls_back_deterministically(cmp_client, use_llm, reply):
    use_llm(FakeLLM(reply))
    body = _explain(cmp_client).json()
    assert body["mode"] == "fallback" and body["fallback_reason"] == "validation_failed"
    use_llm(None)
    assert _explain(cmp_client).json()["text"] == body["text"]  # 같은 사실, 같은 문장


def test_timeout_falls_back(cmp_client, use_llm, monkeypatch):
    monkeypatch.setattr(exp, "LLM_TIMEOUT_S", 0.05)
    use_llm(FakeLLM(hang=True))
    body = _explain(cmp_client).json()
    assert body["mode"] == "fallback" and body["fallback_reason"] == "timeout"


def test_llm_error_falls_back_once_without_retry(cmp_client, use_llm):
    llm = use_llm(FakeLLM(exc=RuntimeError("429 rate limited")))
    body = _explain(cmp_client).json()
    assert body["fallback_reason"] == "llm_error" and len(llm.calls) == 1
    assert "429" not in body["text"]


def test_no_key_means_no_call_and_fallback(cmp_client, use_llm):
    use_llm(None)
    body = _explain(cmp_client).json()
    assert body["mode"] == "fallback" and body["fallback_reason"] == "llm_unavailable"


def test_server_computes_price_and_budget(cmp_client, use_llm):
    use_llm(None)
    text = _explain(cmp_client).json()["text"]
    assert "USD 20 and KRW 25,000, shown as listed and are not compared" in text
    assert "within your budget of KRW 30,000" in text
    text = _explain(cmp_client, profile=profile("US", budget_krw=20000)).json()["text"]
    assert "above your budget of KRW 20,000" in text


def test_partial_list_notice_always_kept(cmp_client, use_llm):
    llm = use_llm(FakeLLM(_pick("F1")))
    body = _explain(cmp_client, current_product_id="ref-partial").json()
    assert body["mode"] == "llm"
    assert "could not be checked because an ingredient list is partial" in body["text"]
    partial_id = next(k for k, v in _facts(llm).items() if "partial" in v)
    assert partial_id != "F1"  # 모델이 고르지 않았는데도 붙었다


def test_unknown_current_product_explains_candidate_only(cmp_client, use_llm):
    use_llm(None)
    body = _explain(cmp_client, current_product_id=None, current_product_name="my secret serum").json()
    assert "could not match your current product" in body["text"]
    assert "my secret serum" not in json.dumps(body)


@pytest.mark.parametrize("override,status", [({"candidate_id": "missing"}, 404), ({"candidate_id": "m-guide"}, 404), ({"current_product_id": None}, 422)])
def test_unknown_or_missing_candidate(cmp_client, use_llm, override, status):
    llm = use_llm(FakeLLM(_pick("F1")))
    assert _explain(cmp_client, **override).status_code == status
    assert llm.calls == []  # 잘못된 요청에는 모델을 부르지 않는다


def test_model_sees_only_fact_texts_not_profile(cmp_client, use_llm):
    llm = use_llm(FakeLLM(_pick("F1")))
    _explain(cmp_client)
    _explain(cmp_client, profile=profile("TH", budget_krw=30000))
    assert llm.calls[0][1][1] == llm.calls[1][1][1]
    sent = llm.calls[0][1][1]
    assert "TH" not in sent and "US\"" not in sent and "gender" not in sent and "http" not in sent


def test_explain_client_has_no_retries_and_bounded_timeout(monkeypatch):
    captured = {}

    def fake_build(spec):
        captured.update(spec)
        return object()

    import app.models.llm_loader as loader
    monkeypatch.setattr(loader, "build_llm", fake_build)
    monkeypatch.setattr(exp, "_llm_cache", None)
    monkeypatch.setenv("ASH_ANTHROPIC_API_KEY", "test-not-a-real-key")
    assert exp.default_llm() is not None
    assert captured["limits"] == {"timeout_seconds": exp.LLM_TIMEOUT_S, "max_retries": 0}
    assert captured["sampling"]["max_tokens"] == exp.LLM_MAX_TOKENS
    monkeypatch.setattr(exp, "_llm_cache", None)

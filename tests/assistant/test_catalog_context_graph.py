"""공식 카탈로그 문맥의 그래프 연결 — 분류기는 원문만, respond 턴만 [Official catalog] 를 본다.

분류기·LLM 은 호출 입력을 기록하는 테스트 대역(provenance=test_fixture)이다. 프롬프트·카탈로그는 실제 파일을 쓴다.
"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest
from langchain_core.messages import AIMessage

from app.api.v1.inputs import catalog_from_metadata, graph_input_from
from app.graph import nodes as N
from app.graph.builder import build_graph
from app.prompts.loader import load_workflow_prompts
from app.services.catalog_context import CATALOG_IDS_KEY, MAX_CATALOG_IDS, NO_CATALOG
from app.services.discovery import load_catalog
from app.utils.errors import OpenAIError

PROFILE = {"language": "en", "country": "US"}


def config(multi_turn: bool) -> dict:
    return {
        "router": {"branching_enabled": True, "decline_labels": ["out_of_scope"]},
        "multi_turn": {"enabled": multi_turn, "thread_header": "X-Thread-Id"},
        "jev": {"mode": "pseudo_jev", "questions_prompt": "jev_questions.yaml"},
        "knowledge": {"top_n": 5},
        "prompt": {"respond_system": "respond_system.yaml", "respond_turn": "respond_turn.yaml",
                   "decline_system": "decline_system.yaml", "pseudo_jev_system": "pseudo_jev_system.yaml"},
    }


class Classifier:
    def __init__(self, category: str) -> None:
        self.category, self.seen = category, []

    async def ainvoke(self, payload):
        self.seen.append(payload["state"])
        return SimpleNamespace(
            choices={N.CATEGORY_QID: SimpleNamespace(choice=self.category, confidence=0.9),
                     N.CONTENT_KIND_QID: SimpleNamespace(choice="any")},
            nouls={N.PURCHASE_INTENT_QID: SimpleNamespace(noul=0.5), N.MEDICAL_INTENT_QID: SimpleNamespace(noul=0.1)},
        )


class LLM:
    def __init__(self, answer: str = "ok") -> None:
        self.answer, self.calls = answer, []

    async def ainvoke(self, messages):
        self.calls.append(messages)
        return AIMessage(content=self.answer, response_metadata={"stop_reason": "end_turn"})


def make(multi_turn=False, answer="ok"):
    prompts = load_workflow_prompts(config(multi_turn))
    category = next(c for c in prompts["jev_questions"][N.CATEGORY_QID].criteria if c != "out_of_scope")
    classifier, llm = Classifier(category), LLM(answer)
    return build_graph(llm, classifier, config(multi_turn), prompts, concepts=[]), classifier, llm


def ids(n=2):
    items = load_catalog().items
    return [items[0].id, next(i.id for i in items if i.category != items[0].category)][:n]


def test_classifier_sees_raw_question_and_respond_sees_official_catalog():
    graph, classifier, llm = make()
    cids = ids()
    gi, cfg = graph_input_from("Any dental clinic info?", PROFILE, {}, multi_turn=False, thread_header="X-Thread-Id",
                               catalog=catalog_from_metadata({"profile": PROFILE, CATALOG_IDS_KEY: cids}))
    asyncio.run(graph.ainvoke(gi, cfg))
    assert classifier.seen == ["Any dental clinic info?"]  # 카탈로그 목록이 분류를 오염시키지 않는다
    system, human = llm.calls[0][0].text, llm.calls[0][-1].text
    assert "[Official catalog]" in system and "only sources of items" in system
    block = human.split("[Official catalog]")[1].split("[Retrieved evidence]")[0]
    assert all(f"[{cid}]" in block for cid in cids) and "sources:" in block
    assert human.rstrip().endswith("Any dental clinic info?")


def test_without_catalog_ids_respond_turn_says_none():
    graph, _, llm = make()
    gi, cfg = graph_input_from("hi", PROFILE, {}, multi_turn=False, thread_header="X-Thread-Id")
    asyncio.run(graph.ainvoke(gi, cfg))
    assert NO_CATALOG in llm.calls[0][-1].text


def test_multi_turn_catalog_is_per_turn_only():
    graph, _, llm = make(multi_turn=True)
    cid = ids(1)[0]
    headers = {"x-thread-id": "t1"}
    gi, cfg = graph_input_from("first", PROFILE, headers, multi_turn=True, thread_header="X-Thread-Id",
                               catalog=catalog_from_metadata({CATALOG_IDS_KEY: [cid]}))
    asyncio.run(graph.ainvoke(gi, cfg))
    gi, cfg = graph_input_from("second", PROFILE, headers, multi_turn=True, thread_header="X-Thread-Id")
    asyncio.run(graph.ainvoke(gi, cfg))
    second = llm.calls[1]
    assert NO_CATALOG in second[-1].text and f"[{cid}]" not in second[-1].text
    # 이전 턴의 카탈로그 블록은 히스토리에 남지 않는다(원문 질문과 답만)
    assert all("[Official catalog]" not in m.text for m in second[1:-1])


@pytest.mark.parametrize("raw", [
    "beauty-x", ["definitely-not-a-catalog-id"], ["a"] * 2, [""], [1], ["x"] * (MAX_CATALOG_IDS + 1),
])
def test_catalog_ids_are_validated_against_server_catalog(raw):
    with pytest.raises(OpenAIError) as exc:
        catalog_from_metadata({CATALOG_IDS_KEY: raw})
    assert exc.value.status_code == 400 and exc.value.param == f"metadata.{CATALOG_IDS_KEY}"


def test_catalog_block_shows_listed_foreign_price_without_conversion():
    item = next((i for i in load_catalog().items if i.price_krw is None and i.list_price is not None), None)
    if item is None:
        pytest.skip("현재 카탈로그에 list_price 만 있는 항목이 없다")
    block = catalog_from_metadata({CATALOG_IDS_KEY: [item.id]})
    assert f"{item.list_price.currency} {item.list_price.amount:,.2f}" in block and "not converted" in block

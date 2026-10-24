from __future__ import annotations

import logging
from datetime import datetime

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.prompts import PromptTemplate

from app.graph.state import AgentState
from app.knowledge.okf import Concept
from app.knowledge.retrieve import format_evidence, retrieve as retrieve_concepts
from app.utils.logger import AGENT_LOGGER_NAME

logger = logging.getLogger(AGENT_LOGGER_NAME)

# 노드 이름 — 그래프 엣지·스트리밍 필터(chat_completions)·/health 가 같은 이름을 쓴다
JEV_JUDGE, RETRIEVE, RESPOND, DECLINE = "jev_judge", "retrieve", "respond", "decline"
LLM_NODES = (RESPOND, DECLINE)
# app/prompts/jev_questions.yaml 의 질문 id 와 짝(test_questions_contract 가 핀한다)
CATEGORY_QID, PURCHASE_INTENT_QID = "category", "purchase_intent"
CONTENT_KIND_QID, MEDICAL_INTENT_QID = "content_kind", "medical_intent"
PROFILE_KEYS = ("language", "country", "gender", "age_band", "currency", "interests", "budget_krw", "current_product")  # respond 턴에 보이는 순서
# Anthropic stop_reason → OpenAI finish_reason. 표에 없는 stop_reason 은 KeyError 로 드러낸다(조용한 기본값 금지)
FINISH_REASONS = {"end_turn": "stop", "stop_sequence": "stop", "max_tokens": "length", "refusal": "stop"}
# 로그에 찍는 확률·confidence 자릿수(라이브 판정 정규식은 값이 아니라 route 만 본다)
PROB_FORMAT = "{:.2f}"


async def jev_judge(state: AgentState, *, classifier, questions: dict, decline_labels: list[str], judge: str) -> dict:
    question = state["messages"][-1].text
    answers = await classifier.ainvoke({"state": question, "questions": questions})
    category = answers.choices[CATEGORY_QID]
    intent = answers.nouls[PURCHASE_INTENT_QID].noul
    kind = answers.choices[CONTENT_KIND_QID].choice
    medical = answers.nouls[MEDICAL_INTENT_QID].noul
    route = DECLINE if category.choice in decline_labels else RESPOND
    logger.info(
        f"[JevJudge] ✅ judge={judge} category={category.choice} confidence={PROB_FORMAT.format(category.confidence)} "
        f"purchase_intent={PROB_FORMAT.format(intent)} content_kind={kind} medical_intent={PROB_FORMAT.format(medical)} route={route}"
    )
    return {
        "category": category.choice,
        "category_confidence": category.confidence,
        "purchase_intent": intent,
        "content_kind": kind,
        "medical_intent": medical,
        "route": route,
    }


def route_after_judge(state: AgentState) -> str:
    # respond 로 가는 길은 언제나 retrieve 를 거친다
    return RETRIEVE if state["route"] == RESPOND else DECLINE


async def retrieve(state: AgentState, *, concepts: list[Concept], top_n: int) -> dict:
    result = retrieve_concepts(
        concepts,
        category=state["category"],
        content_kind=state["content_kind"],
        medical_intent=state["medical_intent"],
        profile=state.get("profile") or {},
        top_n=top_n,
        now=datetime.now().astimezone(),
    )
    ids = [it["id"] for it in result.items]
    logger.info(f"[Retrieve] ✅ {len(ids)}건 relaxed={result.relaxed} ids={ids}")
    return {"evidence": format_evidence(result), "retrieved_ids": ids}


def format_profile(profile: dict | None) -> str:
    profile = profile or {}
    def show(v) -> str:
        return ", ".join(map(str, v)) if isinstance(v, list) else str(v)

    return " ".join(f"{k}={show(profile[k]) if profile.get(k) else 'not_given'}" for k in PROFILE_KEYS)


async def _answer(llm: BaseChatModel, system_prompt: str, state: AgentState, human: HumanMessage, tag: str) -> dict:
    history = state["messages"][:-1]
    ai: AIMessage = await llm.ainvoke([SystemMessage(system_prompt), *history, human])
    finish_reason = FINISH_REASONS[ai.response_metadata["stop_reason"]]
    logger.info(f"[{tag}] ✅ {len(ai.text)}자 finish_reason={finish_reason}")
    # 스트리밍된 chunk 와 같은 id 의 ai 를 그대로 state 에 넣는다 — 새 메시지를 만들면 messages 스트림에 답이 한 번 더 나온다
    return {"response": ai.text, "finish_reason": finish_reason, "messages": [ai]}


async def respond(state: AgentState, *, llm: BaseChatModel, system_prompt: str, turn_template: PromptTemplate) -> dict:
    human = HumanMessage(
        turn_template.format(
            category=state["category"],
            category_confidence=PROB_FORMAT.format(state["category_confidence"]),
            purchase_intent=PROB_FORMAT.format(state["purchase_intent"]),
            content_kind=state["content_kind"],
            medical_intent=PROB_FORMAT.format(state["medical_intent"]),
            profile=format_profile(state.get("profile")),
            evidence=state["evidence"],
            question=state["messages"][-1].text,
        )
    )
    return await _answer(llm, system_prompt, state, human, "Respond")


async def decline(state: AgentState, *, llm: BaseChatModel, system_prompt: str) -> dict:
    return await _answer(llm, system_prompt, state, HumanMessage(state["messages"][-1].text), "Decline")

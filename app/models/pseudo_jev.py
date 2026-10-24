from __future__ import annotations

import json
import logging
import math

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_typesafe import ChoiceAnswer, ClassifierResponse, NoulAnswer
from pydantic import BaseModel, Field, create_model

from app.utils.logger import AGENT_LOGGER_NAME

logger = logging.getLogger(AGENT_LOGGER_NAME)

# 결과 model 이름 접두어 — 로그·응답에서 Jev 측정값과 Sonnet 추정값을 구분한다(workflow.md §6)
PSEUDO_PREFIX = "pseudo-jev/"
SUPPORTED_TYPES = ("choice", "noul")  # Score 질문은 아직 쓰지 않는다 — 들어오면 조립 시 거부


def judgment_schema(questions: dict) -> type[BaseModel]:
    """질문 묶음 → 구조화 출력 스키마. choice 는 라벨별 확률 객체, noul 은 true 확률 하나."""
    fields: dict = {}
    for qid, q in questions.items():
        if q.type not in SUPPORTED_TYPES:
            raise ValueError(f"Pseudo_JEV 는 {SUPPORTED_TYPES} 질문만 모사한다: {qid}={q.type}")
        if q.type == "choice":
            labels = {
                label: (float, Field(ge=0.0, le=1.0, description=f"Probability of '{label}': {criterion}"))
                for label, criterion in q.criteria.items()
            }
            model = create_model(f"{qid}_probabilities", **labels)
            fields[qid] = (model, Field(description=f"{q.instructions} One probability per label."))
        else:
            fields[qid] = (float, Field(ge=0.0, le=1.0, description=f"Probability that the answer is yes: {q.instructions}"))
    return create_model("PseudoJevJudgment", **fields)


def render_request(state: str, questions: dict) -> str:
    """Sonnet 에 보내는 human 턴 — 판단 대상 메시지와 질문 정의(jev_questions.yaml 그대로)."""
    spec = {qid: q.model_dump(mode="json", exclude_none=True) for qid, q in questions.items()}
    return f"[Message to judge]\n{state}\n\n[Questions]\n{json.dumps(spec, ensure_ascii=False, indent=2)}"


def concentration(probs: dict[str, float]) -> float:
    """1 - 정규화 엔트로피. Jev 의 confidence 정의(분포가 얼마나 몰렸나 — 선택 라벨 확률이 아님)를 따른다."""
    if len(probs) == 1:
        return 1.0
    entropy = -sum(p * math.log(p) for p in probs.values() if p > 0)
    return max(0.0, min(1.0, 1.0 - entropy / math.log(len(probs))))


def to_response(raw: dict, questions: dict, model_name: str) -> ClassifierResponse:
    """Sonnet 의 확률 추정 → Jev 와 같은 모양의 ClassifierResponse. 합이 0 이면 판정 불가로 raise(침묵 기본값 금지)."""
    answers: dict = {}
    for qid, q in questions.items():
        if q.type == "choice":
            total = sum(raw[qid].values())
            if total <= 0:
                raise ValueError(f"Pseudo_JEV 가 {qid} 의 모든 라벨에 확률 0 을 냈다: {raw[qid]}")
            probs = {label: p / total for label, p in raw[qid].items()}
            choice = max(probs, key=probs.get)
            answers[qid] = ChoiceAnswer(type="choice", choice=choice, probabilities=probs, confidence=concentration(probs))
        else:
            answers[qid] = NoulAnswer(type="noul", noul=raw[qid])
    return ClassifierResponse(model=f"{PSEUDO_PREFIX}{model_name}", answers=answers)


class PseudoJevClassifier:
    """TypeSafeClassifier 대역(Jev 를 못 쓸 때) — 같은 입력({state, questions})을 받아 같은 모양의 출력을 낸다.

    확률은 LLM 이 추정한 값이라 보정되지 않았다. 그래서 결과 model 이름에 pseudo-jev/ 접두어를 붙인다.
    """

    def __init__(self, llm: BaseChatModel, system_prompt: str, model_name: str):
        self.llm = llm
        self.system_prompt = system_prompt
        self.model_name = model_name

    async def ainvoke(self, request: dict, config=None, **kwargs) -> ClassifierResponse:
        questions = request["questions"]
        structured = self.llm.with_structured_output(judgment_schema(questions))
        judgment = await structured.ainvoke(
            [SystemMessage(self.system_prompt), HumanMessage(render_request(request["state"], questions))], config=config
        )
        return to_response(judgment.model_dump(), questions, self.model_name)


def build_pseudo_jev(llm: BaseChatModel, system_prompt: str, model_name: str) -> PseudoJevClassifier:
    logger.info(f"[Classifier] ✅ PseudoJevClassifier({model_name}) — Jev 출력 모사(확률은 LLM 추정)")
    return PseudoJevClassifier(llm, system_prompt, model_name)

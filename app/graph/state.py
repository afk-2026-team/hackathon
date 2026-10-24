from __future__ import annotations

from typing import Annotated

from langchain_core.messages import AnyMessage
from langgraph.graph import add_messages
from typing_extensions import TypedDict


class AgentState(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]  # 멀티턴 ON 이면 checkpointer 가 턴 사이에 보존
    category: str  # Jev Choice 라벨
    category_confidence: float  # Jev Choice confidence(분포 집중도 — 정답 확률이 아니다)
    purchase_intent: float  # Jev Noul 확률 — 분기에 쓰지 않고 respond 근거로만 쓴다
    content_kind: str  # Jev Choice 라벨(product|clinic|video|any) — retrieve 필터
    medical_intent: float  # Jev Noul 확률 — retrieve 점수
    profile: dict  # 온보딩 프로필(language·country·gender·age_band + 선택 currency·interests·budget_krw·current_product). Jev 에는 넣지 않고 retrieve·respond 만 읽는다
    catalog: str  # 이번 턴 [Official catalog] 본문(서버가 카탈로그 id 로 재구성). Jev 에는 넣지 않는다
    evidence: str  # retrieve 가 고른 근거 블록(respond 턴에 그대로 들어간다)
    retrieved_ids: list[str]  # 로그·검증용 — 응답이 인용해야 할 concept id
    route: str  # "respond" | "decline" — branching OFF 여도 판단 기록으로 남는다
    response: str  # 외부 응답으로 나가는 유일한 답변 필드(W6)
    finish_reason: str  # "stop" | "length"

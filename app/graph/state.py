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
    route: str  # "respond" | "decline" — branching OFF 여도 판단 기록으로 남는다
    response: str  # 외부 응답으로 나가는 유일한 답변 필드(W6)
    finish_reason: str  # "stop" | "length"

from __future__ import annotations

import json
import logging
import time
import uuid
from collections.abc import AsyncIterator, Mapping

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from langchain_core.messages import AIMessageChunk, HumanMessage

from app.graph.nodes import LLM_NODES
from app.schemas.openai import (
    AssistantMessage,
    ChatCompletion,
    ChatCompletionChunk,
    ChatCompletionRequest,
    ChatMessage,
    ChunkChoice,
    CompletionChoice,
    Delta,
)
from app.utils.errors import OpenAIError
from app.utils.logger import AGENT_LOGGER_NAME

logger = logging.getLogger(AGENT_LOGGER_NAME)
router = APIRouter()

SSE_DONE = "data: [DONE]\n\n"
PART_SEPARATOR = "\n"  # OpenAI content parts 의 text 를 이어 붙이는 구분자


def _text_of(message: ChatMessage) -> str:
    if isinstance(message.content, list):
        return PART_SEPARATOR.join(part.text for part in message.content if part.type == "text")
    return message.content or ""


def to_graph_input(
    body: ChatCompletionRequest, headers: Mapping[str, str], *, multi_turn: bool, thread_header: str
) -> tuple[dict, dict]:
    """§3.3 입력 매핑 — 비스트리밍·스트리밍 공용. 마지막 user 메시지만 넣고, 클라이언트 system 은 무시한다."""
    last = body.messages[-1]
    if last.role != "user":
        raise OpenAIError(400, f"마지막 메시지는 role=user 여야 한다: role={last.role}", "invalid_request_error", "messages")
    graph_input = {"messages": [HumanMessage(_text_of(last))]}
    if not multi_turn:
        return graph_input, {}
    thread_id = headers.get(thread_header.lower())
    if not thread_id:
        raise OpenAIError(
            400,
            f"멀티턴 모드에서는 요청 헤더 {thread_header} 가 필요하다. 예: -H '{thread_header}: my-session-1'",
            "invalid_request_error",
            thread_header,
            "missing_thread_header",
        )
    return graph_input, {"configurable": {"thread_id": thread_id}}


def _runtime_for(request: Request, model: str):
    registry = request.app.state.registry
    if model not in registry:
        # 입력 계약 검증 — stream=true 여도 SSE 를 열기 전에 404 로 막는다(spec §3.2)
        raise OpenAIError(404, f"Model not found: {model}. 사용 가능한 model: {list(registry)}", "invalid_request_error", "model", "model_not_found")
    return registry[model]


@router.post("/chat/completions")
async def chat_completions(body: ChatCompletionRequest, request: Request):
    runtime = _runtime_for(request, body.model)
    graph_input, config = to_graph_input(
        body,
        request.headers,
        multi_turn=runtime.multi_turn,
        thread_header=request.app.state.config["multi_turn"]["thread_header"],
    )
    completion_id, created = f"chatcmpl-{uuid.uuid4().hex}", int(time.time())

    if not body.stream:
        state = await runtime.graph.ainvoke(graph_input, config)
        return ChatCompletion(
            id=completion_id,
            created=created,
            model=body.model,
            choices=[CompletionChoice(index=0, message=AssistantMessage(content=state["response"]), finish_reason=state["finish_reason"])],
        )

    frames = _sse_frames(runtime.graph, graph_input, config, completion_id, created, body.model)
    # 첫 프레임을 응답을 열기 전에 당긴다 — jev_judge 실패(첫 토큰 이전)가 SSE 대신 500 envelope 로 나간다(설계 §3)
    first = await anext(frames)
    return StreamingResponse(_prepend(first, frames), media_type="text/event-stream")


async def _prepend(first: str, rest: AsyncIterator[str]) -> AsyncIterator[str]:
    yield first
    async for frame in rest:
        yield frame


def _frame(chunk: ChatCompletionChunk) -> str:
    # delta 안의 None 만 지운다(첫 chunk 이후 role 생략, 마지막 chunk 는 delta: {}). finish_reason: null 은 OpenAI 형식대로 남긴다
    payload = chunk.model_dump()
    for choice in payload["choices"]:
        choice["delta"] = {k: v for k, v in choice["delta"].items() if v is not None}
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


async def _sse_frames(graph, graph_input: dict, config: dict, completion_id: str, created: int, model: str) -> AsyncIterator[str]:
    def chunk(delta: Delta, finish_reason=None) -> ChatCompletionChunk:
        return ChatCompletionChunk(id=completion_id, created=created, model=model, choices=[ChunkChoice(index=0, delta=delta, finish_reason=finish_reason)])

    role_sent = False
    final_state: dict = {}
    async for mode, data in graph.astream(graph_input, config, stream_mode=["messages", "values"]):
        if mode == "values":
            final_state = data
            continue
        message, metadata = data
        if not isinstance(message, AIMessageChunk) or metadata["langgraph_node"] not in LLM_NODES or not message.text:
            continue
        delta = Delta(content=message.text) if role_sent else Delta(role="assistant", content=message.text)
        role_sent = True
        yield _frame(chunk(delta))
    if not role_sent:  # 빈 답변이어도 첫 chunk 의 role 계약은 지킨다
        yield _frame(chunk(Delta(role="assistant", content="")))
    yield _frame(chunk(Delta(), finish_reason=final_state["finish_reason"]))
    logger.info(f"[Stream] ✅ {completion_id} finish_reason={final_state['finish_reason']}")
    yield SSE_DONE

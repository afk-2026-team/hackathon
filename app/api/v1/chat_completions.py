from __future__ import annotations

import json
import logging
import time
import uuid
from collections.abc import AsyncIterator, Mapping

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from langchain_core.messages import AIMessageChunk

from app.api.v1.inputs import catalog_from_metadata, graph_input_from, join_parts, profile_from_metadata, runtime_for
from app.graph.nodes import LLM_NODES
from app.schemas.openai import (
    AssistantMessage,
    ChatCompletion,
    ChatCompletionChunk,
    ChatCompletionRequest,
    ChunkChoice,
    CompletionChoice,
    Delta,
)
from app.utils.errors import OpenAIError
from app.utils.logger import AGENT_LOGGER_NAME

logger = logging.getLogger(AGENT_LOGGER_NAME)
router = APIRouter()

SSE_DONE = "data: [DONE]\n\n"


def to_graph_input(
    body: ChatCompletionRequest, headers: Mapping[str, str], *, multi_turn: bool, thread_header: str
) -> tuple[dict, dict]:
    """§3.3 입력 매핑 — 마지막 user 메시지만 넣고 클라이언트 system 은 무시한다. messages 가 비면 프로필 Home 모드."""
    text = None
    if body.messages:
        last = body.messages[-1]
        if last.role != "user":
            raise OpenAIError(400, f"마지막 메시지는 role=user 여야 한다: role={last.role}", "invalid_request_error", "messages")
        text = join_parts(last.content)
    profile = profile_from_metadata(body.metadata)
    return graph_input_from(text, profile, headers, multi_turn=multi_turn, thread_header=thread_header,
                            catalog=catalog_from_metadata(body.metadata))


@router.post("/chat/completions")
async def chat_completions(body: ChatCompletionRequest, request: Request):
    runtime = runtime_for(request, body.model)
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
    return StreamingResponse(prepend(first, frames), media_type="text/event-stream")


async def prepend(first: str, rest: AsyncIterator[str]) -> AsyncIterator[str]:
    yield first
    async for frame in rest:
        yield frame


def _frame(chunk: ChatCompletionChunk) -> str:
    # delta 안의 None 만 지운다(첫 chunk 이후 role 생략, 마지막 chunk 는 delta: {}). finish_reason: null 은 OpenAI 형식대로 남긴다
    payload = chunk.model_dump()
    for choice in payload["choices"]:
        choice["delta"] = {k: v for k, v in choice["delta"].items() if v is not None}
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


async def text_deltas(graph, graph_input: dict, config: dict) -> AsyncIterator[str | dict]:
    """LLM 노드가 내는 텍스트 조각(str)을 차례로, 마지막에 최종 state(dict)를 하나 낸다 — chat·responses 스트리밍 공용."""
    final_state: dict = {}
    async for mode, data in graph.astream(graph_input, config, stream_mode=["messages", "values"]):
        if mode == "values":
            final_state = data
            continue
        message, metadata = data
        if isinstance(message, AIMessageChunk) and metadata["langgraph_node"] in LLM_NODES and message.text:
            yield message.text
    yield final_state


async def _sse_frames(graph, graph_input: dict, config: dict, completion_id: str, created: int, model: str) -> AsyncIterator[str]:
    def chunk(delta: Delta, finish_reason=None) -> ChatCompletionChunk:
        return ChatCompletionChunk(id=completion_id, created=created, model=model, choices=[ChunkChoice(index=0, delta=delta, finish_reason=finish_reason)])

    role_sent = False
    final_state: dict = {}
    async for item in text_deltas(graph, graph_input, config):
        if isinstance(item, dict):
            final_state = item
            continue
        delta = Delta(content=item) if role_sent else Delta(role="assistant", content=item)
        role_sent = True
        yield _frame(chunk(delta))
    if not role_sent:  # 빈 답변이어도 첫 chunk 의 role 계약은 지킨다
        yield _frame(chunk(Delta(role="assistant", content="")))
    yield _frame(chunk(Delta(), finish_reason=final_state["finish_reason"]))
    logger.info(f"[Stream] ✅ {completion_id} finish_reason={final_state['finish_reason']}")
    yield SSE_DONE

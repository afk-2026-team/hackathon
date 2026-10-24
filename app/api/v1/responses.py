"""POST /v1/responses — chat/completions 와 같은 그래프·같은 입력 매핑 위의 OpenAI Responses API 표면(interview Q1)."""

from __future__ import annotations

import json
import logging
import time
import uuid
from collections.abc import AsyncIterator

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.api.v1.chat_completions import prepend, text_deltas
from app.api.v1.inputs import catalog_from_metadata, graph_input_from, join_parts, profile_from_metadata, runtime_for
from app.schemas.responses import IncompleteDetails, OutputMessage, OutputText, ResponseObject, ResponsesRequest
from app.utils.errors import OpenAIError
from app.utils.logger import AGENT_LOGGER_NAME

logger = logging.getLogger(AGENT_LOGGER_NAME)
router = APIRouter()

# finish_reason(chat 어휘) → Responses status
STATUS_OF = {"stop": "completed", "length": "incomplete"}


def _input_text(body: ResponsesRequest) -> str | None:
    """input 이 문자열이면 그대로, 메시지 목록이면 마지막 user 메시지만(chat 매핑과 같은 규칙)."""
    if isinstance(body.input, str) or body.input is None:
        return body.input
    if not body.input:
        return None
    last = body.input[-1]
    if last.role != "user":
        raise OpenAIError(400, f"input 의 마지막 항목은 role=user 여야 한다: role={last.role}", "invalid_request_error", "input")
    return join_parts(last.content)


def _response(rid: str, mid: str, created: int, model: str, text: str, finish_reason: str | None, metadata) -> ResponseObject:
    status = STATUS_OF[finish_reason] if finish_reason else "in_progress"
    message = OutputMessage(id=mid, status=status, content=[OutputText(text=text)] if finish_reason else [])
    return ResponseObject(
        id=rid,
        created_at=created,
        status=status,
        model=model,
        output=[message] if finish_reason else [],
        incomplete_details=IncompleteDetails(reason="max_output_tokens") if status == "incomplete" else None,
        metadata=metadata,
    )


@router.post("/responses")
async def responses(body: ResponsesRequest, request: Request):
    runtime = runtime_for(request, body.model)
    graph_input, config = graph_input_from(
        _input_text(body),
        profile_from_metadata(body.metadata),
        request.headers,
        multi_turn=runtime.multi_turn,
        thread_header=request.app.state.config["multi_turn"]["thread_header"],
        catalog=catalog_from_metadata(body.metadata),
    )
    rid, mid, created = f"resp_{uuid.uuid4().hex}", f"msg_{uuid.uuid4().hex}", int(time.time())

    if not body.stream:
        state = await runtime.graph.ainvoke(graph_input, config)
        return _response(rid, mid, created, body.model, state["response"], state["finish_reason"], body.metadata)

    events = _sse_events(runtime.graph, graph_input, config, rid, mid, created, body)
    # 첫 이벤트는 그래프를 돌리기 전에 나간다 — 첫 텍스트까지 당겨야 jev_judge 실패가 500 envelope 로 나간다(chat 과 같은 계약)
    head = [await anext(events), await anext(events)]
    return StreamingResponse(prepend("".join(head), events), media_type="text/event-stream")


async def _sse_events(graph, graph_input, config, rid, mid, created, body: ResponsesRequest) -> AsyncIterator[str]:
    seq = 0

    def event(type_: str, **payload) -> str:
        nonlocal seq
        seq += 1
        return f"event: {type_}\ndata: {json.dumps({'type': type_, 'sequence_number': seq, **payload}, ensure_ascii=False)}\n\n"

    yield event("response.created", response=_response(rid, mid, created, body.model, "", None, body.metadata).model_dump())
    parts: list[str] = []
    final_state: dict = {}
    item = {"type": "message", "id": mid, "status": "in_progress", "role": "assistant", "content": []}
    opened = False
    async for chunk in text_deltas(graph, graph_input, config):
        if isinstance(chunk, dict):
            final_state = chunk
            continue
        if not opened:  # output item·content part 는 첫 텍스트와 함께 연다
            opened = True
            yield (
                event("response.output_item.added", output_index=0, item=item)
                + event("response.content_part.added", item_id=mid, output_index=0, content_index=0, part={"type": "output_text", "text": "", "annotations": []})
                + event("response.output_text.delta", item_id=mid, output_index=0, content_index=0, delta=chunk)
            )
        else:
            yield event("response.output_text.delta", item_id=mid, output_index=0, content_index=0, delta=chunk)
        parts.append(chunk)
    text = "".join(parts)
    done = _response(rid, mid, created, body.model, text, final_state["finish_reason"], body.metadata)
    if not opened:
        yield event("response.output_item.added", output_index=0, item=item)
    yield event("response.output_text.done", item_id=mid, output_index=0, content_index=0, text=text)
    yield event("response.content_part.done", item_id=mid, output_index=0, content_index=0, part=done.output[0].content[0].model_dump())
    yield event("response.output_item.done", output_index=0, item=done.output[0].model_dump())
    yield event("response.completed" if done.status == "completed" else "response.incomplete", response=done.model_dump())
    logger.info(f"[Responses] ✅ {rid} status={done.status}")

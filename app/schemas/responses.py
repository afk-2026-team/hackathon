"""OpenAI Responses API 호환 스키마 — 이 서버가 쓰는 부분만(텍스트 입력·텍스트 출력).

형식 근거: https://platform.openai.com/docs/api-reference/responses (object="response", output[].type="message",
content[].type="output_text"). 스트리밍 이벤트 이름도 같은 문서를 따른다.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.openai import ChatMessage


class ResponsesRequest(BaseModel):
    """쓰지 않는 필드(instructions·temperature·tools 등)는 받되 무시한다. input 이 없어도 metadata 프로필이면 Home 요청."""

    model_config = ConfigDict(extra="allow")
    model: str
    input: str | list[ChatMessage] | None = None
    stream: bool = False
    metadata: dict | None = None


class OutputText(BaseModel):
    type: Literal["output_text"] = "output_text"
    text: str
    annotations: list = Field(default_factory=list)


class OutputMessage(BaseModel):
    type: Literal["message"] = "message"
    id: str
    status: Literal["in_progress", "completed", "incomplete"]
    role: Literal["assistant"] = "assistant"
    content: list[OutputText]


class IncompleteDetails(BaseModel):
    reason: Literal["max_output_tokens"]


class ResponseObject(BaseModel):
    id: str
    object: Literal["response"] = "response"
    created_at: int
    status: Literal["in_progress", "completed", "incomplete"]
    model: str
    output: list[OutputMessage]
    incomplete_details: IncompleteDetails | None = None
    metadata: dict | None = None

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ContentPart(BaseModel):
    model_config = ConfigDict(extra="allow")
    type: str
    text: str | None = None


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="allow")
    role: Literal["system", "developer", "user", "assistant", "tool"]
    content: str | list[ContentPart] | None = None


class ChatCompletionRequest(BaseModel):
    """OpenAI 호환 요청. 쓰지 않는 필드(temperature·stream_options 등)는 받되 무시한다(설계 §3).
    messages 가 비어도 metadata 에 프로필이 있으면 Home 조언 요청이다(app/api/v1/inputs.py)."""

    model_config = ConfigDict(extra="allow")
    model: str
    messages: list[ChatMessage] = Field(default_factory=list)
    stream: bool = False
    metadata: dict | None = None


class AssistantMessage(BaseModel):
    role: Literal["assistant"] = "assistant"
    content: str


class CompletionChoice(BaseModel):
    index: int
    message: AssistantMessage
    finish_reason: Literal["stop", "length"]


class ChatCompletion(BaseModel):
    id: str
    object: Literal["chat.completion"] = "chat.completion"
    created: int
    model: str
    choices: list[CompletionChoice]


class Delta(BaseModel):
    role: Literal["assistant"] | None = None
    content: str | None = None


class ChunkChoice(BaseModel):
    index: int
    delta: Delta
    finish_reason: Literal["stop", "length"] | None = None


class ChatCompletionChunk(BaseModel):
    id: str
    object: Literal["chat.completion.chunk"] = "chat.completion.chunk"
    created: int
    model: str
    choices: list[ChunkChoice]


class ModelCard(BaseModel):
    id: str
    object: Literal["model"] = "model"
    created: int
    owned_by: str


class ModelList(BaseModel):
    object: Literal["list"] = "list"
    data: list[ModelCard]


class ErrorBody(BaseModel):
    message: str
    type: str
    param: str | None = None
    code: str | None = None


class ErrorEnvelope(BaseModel):
    error: ErrorBody

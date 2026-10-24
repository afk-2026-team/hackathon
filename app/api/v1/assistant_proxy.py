"""discovery_server(8001) → app.serve(8000) `/v1/responses` 명시적 프록시.

브라우저는 같은 origin 의 /v1 만 부른다(Vite 프록시 대상은 8001). AI 그래프와 모델 키는 app.serve 에만 있으므로
여기서는 입력을 검증하고 그대로 넘긴 뒤 원인 있는 오류로 돌려준다. 가짜 응답을 만들지 않는다.

- 업스트림: JINSEONMI_AI_UPSTREAM (기본 http://127.0.0.1:8000)
- 비스트리밍만 지원(stream=false). 프로필은 백엔드 계약 metadata.profile={language,country,gender?,age_band?}.
- 실패 매핑: 업스트림 미기동 503 · 시간 초과 504 · 읽을 수 없는 응답 502 · 업스트림 오류는 상태와 메시지 유지.
"""

from __future__ import annotations

import os
from collections.abc import AsyncIterator
from typing import Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

router = APIRouter()

DEFAULT_UPSTREAM = "http://127.0.0.1:8000"
DEFAULT_MODEL = "kbeauty-haiku"
AI_TIMEOUT_S = 60.0  # LLM 응답 대기 상한(이 파일에서만 쓰는 국소 상수)
MAX_INPUT_CHARS = 2000
THREAD_HEADER = "X-Thread-Id"  # 업스트림 multi_turn 이 켜졌을 때만 의미가 있다 — 있으면 그대로 넘긴다


class AssistantProfile(BaseModel):
    model_config = ConfigDict(extra="forbid")
    language: str = Field(min_length=2, max_length=8)
    country: str = Field(min_length=2, max_length=2)
    gender: str | None = Field(default=None, max_length=32)
    age_band: str | None = Field(default=None, max_length=16)


class AssistantMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")
    profile: AssistantProfile


class AssistantRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    model: str = Field(default_factory=lambda: os.environ.get("JINSEONMI_AI_MODEL", DEFAULT_MODEL), min_length=1, max_length=64)
    input: str | None = Field(default=None, max_length=MAX_INPUT_CHARS)
    stream: Literal[False] = False
    metadata: AssistantMetadata


def upstream_base() -> str:
    return os.environ.get("JINSEONMI_AI_UPSTREAM", DEFAULT_UPSTREAM).rstrip("/")


async def get_ai_client() -> AsyncIterator[httpx.AsyncClient]:
    """테스트는 app.dependency_overrides 로 MockTransport 클라이언트를 주입한다."""
    async with httpx.AsyncClient(timeout=AI_TIMEOUT_S, follow_redirects=False) as client:
        yield client


def _upstream_message(resp: httpx.Response) -> str | None:
    try:
        body = resp.json()
    except ValueError:
        return None
    err = body.get("error") if isinstance(body, dict) else None
    msg = err.get("message") if isinstance(err, dict) else None
    return msg if isinstance(msg, str) and msg else None


@router.post("/responses")
async def proxy_responses(body: AssistantRequest, request: Request, client: httpx.AsyncClient = Depends(get_ai_client)):
    text = body.input.strip() if body.input else None
    payload = {
        "model": body.model,
        "input": text or None,
        "stream": False,
        "metadata": {"profile": body.metadata.profile.model_dump(exclude_none=True)},
    }
    headers = {"Content-Type": "application/json"}
    thread_id = request.headers.get(THREAD_HEADER)
    if thread_id:
        headers[THREAD_HEADER] = thread_id[:128]
    try:
        resp = await client.post(f"{upstream_base()}/v1/responses", json=payload, headers=headers)
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="The AI assistant took too long to answer. Please try again.") from None
    except httpx.TransportError:
        raise HTTPException(status_code=503, detail="The AI assistant isn't available right now (AI server not reachable).") from None
    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=_upstream_message(resp) or f"The AI assistant returned an error ({resp.status_code}).")
    try:
        data = resp.json()
    except ValueError:
        raise HTTPException(status_code=502, detail="The AI assistant sent a response we could not read.") from None
    if not isinstance(data, dict) or data.get("object") != "response":
        raise HTTPException(status_code=502, detail="The AI assistant sent an unexpected response.")
    return data

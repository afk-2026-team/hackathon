"""Vercel 단일 ASGI 진입점 — 공개 API 는 discovery 앱 그대로, AI 는 같은 프로세스의 app.serve 앱.

로컬 두 서버 구성과 계약을 같게 유지한다:
- 공개 라우트: create_discovery_app(web_dist=None) — catalog·recommendations·compare·explain·auth·maps·evidence·fx·/health·/v1/responses(프록시).
- /v1/responses 프록시는 네트워크 대신 httpx.ASGITransport 로 AI 앱(create_app)을 부른다. 입력 검증·기본 model·오류 매핑(503/504/502)은
  app/api/v1/assistant_proxy.py 그대로다. AI 앱의 /v1/chat/completions·/v1/models 는 공개하지 않는다(로컬 Vite 경로와 같다).
- 키는 Vercel 서버 환경변수로만 받는다(Infisical prod → controller 가 동기화). 이 파일은 키를 읽거나 출력하지 않는다.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator

import httpx
from fastapi import HTTPException

from app.api.v1.assistant_proxy import AI_TIMEOUT_S, get_ai_client
from app.discovery_server import create_discovery_app
from app.server import create_app
from app.utils.boot_gate import build_registry
from app.utils.config import load_config
from app.utils.logger import init_logging

IN_PROCESS_AI = "http://ai.internal"  # ASGITransport 용 가상 주소 — 외부로 나가지 않는다
logger = logging.getLogger(__name__)


class TimeoutASGITransport(httpx.ASGITransport):
    """ASGITransport 는 클라이언트 timeout 을 강제하지 않는다 — 요청 전체에 상한을 걸고 httpx 시간 초과로 바꿔
    assistant_proxy 의 504 매핑(로컬 네트워크 프록시와 같은 계약)을 유지한다."""

    def __init__(self, *, app, timeout_s: float) -> None:
        super().__init__(app=app)
        self.timeout_s = timeout_s

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        try:
            async with asyncio.timeout(self.timeout_s):
                return await super().handle_async_request(request)
        except TimeoutError:
            raise httpx.ReadTimeout("in-process AI request timed out", request=request) from None


def create_public_app():
    config = load_config()
    init_logging(config["log_level"], config["AGENT_NAME"])
    ai_app = create_app(config)
    ready_lock = asyncio.Lock()

    async def ensure_ai_ready() -> None:
        # AI 레지스트리는 첫 AI 요청에서 한 번만 만든다. AI 키가 없거나 구축이 실패해도 discovery 라우트는 계속 동작한다
        # (로컬에서 8001 이 키 없이 뜨는 성질과 같다). 실패는 원인을 로그에 남기고 503 으로 드러낸다 — 조용한 대체 없음.
        if getattr(ai_app.state, "registry", None) is not None:
            return
        async with ready_lock:
            if getattr(ai_app.state, "registry", None) is not None:
                return
            try:
                ai_app.state.registry = await asyncio.to_thread(build_registry, config)
            except Exception as exc:  # noqa: BLE001 — 예외 유형만 남긴다(메시지에 값이 섞일 여지를 두지 않는다)
                logger.error("AI registry build failed: %s", type(exc).__name__)
                raise HTTPException(status_code=503, detail="The AI assistant isn't available right now (AI server not configured).") from None

    public = create_discovery_app(web_dist=None)

    async def in_process_ai_client() -> AsyncIterator[httpx.AsyncClient]:
        await ensure_ai_ready()
        transport = TimeoutASGITransport(app=ai_app, timeout_s=AI_TIMEOUT_S)
        async with httpx.AsyncClient(transport=transport, base_url=IN_PROCESS_AI, timeout=AI_TIMEOUT_S) as client:
            yield client

    public.dependency_overrides[get_ai_client] = in_process_ai_client
    public.state.ai_app = ai_app
    return public

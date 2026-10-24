from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.v1.router import router as v1_router
from app.schemas.openai import ErrorBody, ErrorEnvelope
from app.utils.boot_gate import build_registry
from app.utils.errors import OpenAIError
from app.utils.logger import AGENT_LOGGER_NAME

logger = logging.getLogger(AGENT_LOGGER_NAME)


def _envelope(status: int, message: str, type_: str, param: str | None = None, code: str | None = None) -> JSONResponse:
    body = ErrorEnvelope(error=ErrorBody(message=message, type=type_, param=param, code=code))
    return JSONResponse(status_code=status, content=body.model_dump())


def create_app(config: dict) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.registry = build_registry(config)  # 실패하면 lifespan 이 실패해 기동이 멈춘다
        yield

    app = FastAPI(title=config["AGENT_NAME"], lifespan=lifespan)
    app.state.config = config
    app.state.started_at = int(time.time())

    @app.exception_handler(OpenAIError)
    async def _openai_error(request: Request, exc: OpenAIError):
        return _envelope(exc.status_code, exc.message, exc.type, exc.param, exc.code)

    @app.exception_handler(RequestValidationError)
    async def _validation_error(request: Request, exc: RequestValidationError):
        first = exc.errors()[0]
        param = ".".join(str(p) for p in first["loc"] if p != "body")
        example = '{"model": "<id>", "messages": [{"role": "user", "content": "…"}], "stream": false}'
        return _envelope(400, f"요청 본문 계약 위반: {param} — {first['msg']}. 예: {example}", "invalid_request_error", param or None)

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(request: Request, exc: StarletteHTTPException):
        return _envelope(exc.status_code, str(exc.detail), "invalid_request_error")

    @app.exception_handler(Exception)
    async def _server_error(request: Request, exc: Exception):
        # 삼키지 않는다: Traceback 을 로그에 남기고 클라이언트에는 500 envelope 만 준다(spec §3.2)
        logger.exception(f"[Server] ❌ {type(exc).__name__}")
        return _envelope(500, f"서버 내부 오류: {type(exc).__name__}", "server_error")

    @app.get("/health")
    async def health(request: Request):
        registry = request.app.state.registry
        return {
            "status": "ok",
            "profile_count": len(registry),
            "models": list(registry),
            "nodes": {pid: rt.nodes for pid, rt in registry.items()},
            "multi_turn": {pid: rt.multi_turn for pid, rt in registry.items()},
            "branching_enabled": config["router"]["branching_enabled"],
            "knowledge_count": {pid: rt.knowledge_count for pid, rt in registry.items()},
        }

    app.include_router(v1_router, prefix="/v1")
    return app

"""모델·시크릿 없이 뜨는 discovery·auth 경량 서버.

실행: uv run python -m app.discovery_server   (기본 127.0.0.1:8001)
auth 까지 쓰려면: node scripts/secrets.mjs run --env dev --services supabase -- uv run python -m app.discovery_server
지도·블로그·숏폼까지: node scripts/secrets.mjs run --env dev --services supabase,naver,naver_maps,youtube -- uv run python -m app.discovery_server
  (키 없는 서비스의 엔드포인트는 503 안내를 돌려준다. /v1/maps/config 는 enabled:false, /v1/fx 는 키 없이 동작)
web/dist 가 있으면 같은 포트에서 SPA 정적 파일도 서빙한다. 기존 채팅 서버(app.serve)와 키 설정은 건드리지 않는다.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

import uvicorn
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.v1.assistant_proxy import router as assistant_router
from app.api.v1.auth import router as auth_router
from app.api.v1.discovery import router as discovery_router
from app.api.v1.evidence import router as evidence_router
from app.api.v1.fx import router as fx_router
from app.api.v1.maps import router as maps_router

HOST = os.environ.get("DISCOVERY_HOST", "127.0.0.1")
PORT = int(os.environ.get("DISCOVERY_PORT", "8001"))
WEB_DIST = Path(__file__).resolve().parents[1] / "web" / "dist"
# httpx 는 INFO 로 요청 URL 을 남긴다 — 외부 키가 쿼리에 섞일 여지를 막기 위해 WARNING 이상만
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
REDACTED_QUERY_PATHS = ("/v1/maps/geocode", "/v1/maps/directions")  # 질의가 사용자 숙소 주소·좌표일 수 있는 경로 — 접근 로그에서 쿼리 문자열을 지운다


class _RedactQueryFilter(logging.Filter):
    """uvicorn 접근 로그 args = (client, method, path?query, http_version, status)."""

    def filter(self, record: logging.LogRecord) -> bool:
        args = record.args
        if isinstance(args, tuple) and len(args) >= 3 and isinstance(args[2], str):
            path, sep, _ = args[2].partition("?")
            if sep and path in REDACTED_QUERY_PATHS:
                record.args = (*args[:2], f"{path}?<redacted>", *args[3:])
        return True


logging.getLogger("uvicorn.access").addFilter(_RedactQueryFilter())


def _error(status: int, message: str, param: str | None = None, headers: dict[str, str] | None = None) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"message": message, "param": param}}, headers=headers)


def create_discovery_app(web_dist: Path | None = WEB_DIST) -> FastAPI:
    app = FastAPI(title="Jinseonmi API")

    @app.exception_handler(RequestValidationError)
    async def _validation_error(request: Request, exc: RequestValidationError):
        first = exc.errors()[0]
        param = ".".join(str(p) for p in first["loc"] if p != "body")
        return _error(422, f"Invalid request: {param} — {first['msg']}", param or None)

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(request: Request, exc: StarletteHTTPException):
        return _error(exc.status_code, str(exc.detail), headers=getattr(exc, "headers", None))  # 401 의 WWW-Authenticate 유지

    @app.get("/health")
    async def health():
        return {"status": "ok", "service": "discovery", "static": bool(web_dist and (web_dist / "index.html").is_file())}

    app.include_router(discovery_router, prefix="/v1")
    app.include_router(auth_router, prefix="/v1")  # 공개 설정과 서버 측 세션 검증. 키는 실행기가 주입한 환경값만 읽는다
    app.include_router(maps_router, prefix="/v1")  # 지도 공개 설정·지오코딩(naver_maps)
    app.include_router(evidence_router, prefix="/v1")  # 블로그(naver)·숏폼(youtube) 근거
    app.include_router(fx_router, prefix="/v1")  # ECB 기준율, 키 불필요
    app.include_router(assistant_router, prefix="/v1")  # /v1/responses → app.serve(JINSEONMI_AI_UPSTREAM) 명시적 프록시, 키는 8000 쪽에만

    if web_dist is not None:
        root = web_dist.resolve()

        @app.get("/{path:path}", include_in_schema=False)
        async def spa(path: str):
            index = root / "index.html"
            if path == "v1" or path.startswith("v1/") or not index.is_file():  # API 경계는 HTML로 덮지 않는다
                return _error(404, "Not found")
            target = (root / path).resolve()
            if path and target.is_file() and target.is_relative_to(root):
                return FileResponse(target)
            return FileResponse(index)  # 클라이언트 라우팅 경로는 SPA 진입점으로

    return app


app = create_discovery_app()


def main() -> None:
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")


if __name__ == "__main__":
    main()

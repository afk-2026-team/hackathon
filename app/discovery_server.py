"""모델·시크릿 없이 뜨는 discovery·auth 경량 서버.

실행: uv run python -m app.discovery_server   (기본 127.0.0.1:8001)
auth 까지 쓰려면: node scripts/secrets.mjs run --env dev --services supabase -- uv run python -m app.discovery_server
web/dist 가 있으면 같은 포트에서 SPA 정적 파일도 서빙한다. 기존 채팅 서버(app.serve)와 키 설정은 건드리지 않는다.
"""

from __future__ import annotations

import os
from pathlib import Path

import uvicorn
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.v1.auth import router as auth_router
from app.api.v1.discovery import router as discovery_router

HOST = os.environ.get("DISCOVERY_HOST", "127.0.0.1")
PORT = int(os.environ.get("DISCOVERY_PORT", "8001"))
WEB_DIST = Path(__file__).resolve().parents[1] / "web" / "dist"


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

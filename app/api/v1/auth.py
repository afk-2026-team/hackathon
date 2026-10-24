from __future__ import annotations

from collections.abc import AsyncIterator

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException

from app.schemas.auth import AuthConfig, AuthUser
from app.services import auth as svc

router = APIRouter(prefix="/auth", tags=["auth"])


async def get_auth_client() -> AsyncIterator[httpx.AsyncClient]:
    """테스트는 app.dependency_overrides 로 MockTransport 클라이언트를 주입한다."""
    async with svc.new_client() as client:
        yield client


def _settings() -> svc.SupabasePublic:
    try:
        return svc.load_public_settings()
    except svc.AuthNotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/config")
async def get_config(client: httpx.AsyncClient = Depends(get_auth_client)) -> AuthConfig:
    settings = _settings()
    try:
        return await svc.fetch_config(client, settings)
    except svc.AuthUpstreamError as exc:
        # Google 꺼짐(200, google_enabled=false)과 확인 실패(503)를 구분한다
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/me")
async def get_me(
    authorization: str | None = Header(default=None),
    client: httpx.AsyncClient = Depends(get_auth_client),
) -> AuthUser:
    unauthorized = {"WWW-Authenticate": "Bearer"}
    try:
        token = svc.bearer_token(authorization)
    except svc.InvalidToken as exc:
        raise HTTPException(status_code=401, detail=str(exc), headers=unauthorized) from exc
    settings = _settings()
    try:
        return await svc.verify_user(client, settings, token)
    except svc.InvalidToken as exc:
        raise HTTPException(status_code=401, detail=str(exc), headers=unauthorized) from exc
    except svc.AuthUpstreamError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

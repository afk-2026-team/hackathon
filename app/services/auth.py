from __future__ import annotations

import base64
import json
import logging
import os
from dataclasses import dataclass
from urllib.parse import urlsplit

import httpx

from app.schemas.auth import AuthConfig, AuthUser
from app.utils.logger import AGENT_LOGGER_NAME

logger = logging.getLogger(AGENT_LOGGER_NAME)

# 값은 팀 실행기(scripts/secrets.mjs run --services supabase)가 프로세스 환경에 넣는다. 여기서는 읽기만 한다.
URL_ENV = "SUPABASE_URL"
KEY_ENV = "SUPABASE_PUBLISHABLE_KEY"

UPSTREAM_TIMEOUT_S = 5.0  # Supabase Auth 호출 상한(이 파일 국소 상수)
MAX_TOKEN_LEN = 8192  # 비정상적으로 긴 Authorization 값은 원격에 보내지 않는다
LOCAL_HOSTS = {"localhost", "127.0.0.1"}  # https 예외는 로컬 개발 주소뿐
# 토큰 자체가 거부된 경우(그 밖의 4xx·5xx·429 는 원격 장애로 본다)
REJECTED_TOKEN_STATUSES = {400, 401, 403, 404, 422}


PUBLISHABLE_PREFIX = "sb_publishable_"


def _is_public_key(key: str) -> bool:
    """브라우저로 내보내도 되는 키인지 종류만 본다(값은 어디에도 남기지 않음).

    sb_publishable_ 키, 또는 legacy JWT 중 payload.role 이 anon 인 키만 허용한다. 서명 검증이 아니며
    사용자 토큰 검증을 대신하지 않는다 — 잘못 넣은 secret·service_role 키가 공개되는 것을 막는 가드다.
    """
    if key.startswith(PUBLISHABLE_PREFIX):
        return True
    parts = key.split(".")
    if len(parts) != 3:
        return False
    try:
        payload = json.loads(base64.urlsafe_b64decode(parts[1] + "=" * (-len(parts[1]) % 4)))
    except (ValueError, UnicodeDecodeError):
        return False
    return isinstance(payload, dict) and payload.get("role") == "anon"


class AuthNotConfigured(Exception):
    """공개 설정 환경값이 없거나 형식이 틀림 → 503."""


class AuthUpstreamError(Exception):
    """Supabase Auth 에 닿지 못했거나 응답을 해석할 수 없음 → 503. 인증 성공으로 바꾸지 않는다."""


class InvalidToken(Exception):
    """토큰 누락·형식 오류·원격 거부 → 401."""


@dataclass(frozen=True)
class SupabasePublic:
    url: str
    publishable_key: str


def load_public_settings() -> SupabasePublic:
    url = (os.environ.get(URL_ENV) or "").strip().rstrip("/")
    key = (os.environ.get(KEY_ENV) or "").strip()
    if not url or not key:
        raise AuthNotConfigured("Supabase public settings are not configured on the server")
    parts = urlsplit(url)
    secure = parts.scheme == "https" or (parts.scheme == "http" and parts.hostname in LOCAL_HOSTS)
    if not secure or not parts.hostname or parts.path not in ("", "/") or parts.query or parts.fragment or parts.username:
        raise AuthNotConfigured("Supabase URL setting is not a valid project URL")
    if not _is_public_key(key):
        logger.error("[Auth] ❌ publishable key setting is not a public key type; refusing to expose it")
        raise AuthNotConfigured("Supabase publishable key setting is not a public key")
    return SupabasePublic(url=url, publishable_key=key)


def new_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=UPSTREAM_TIMEOUT_S, follow_redirects=False)


async def _get(client: httpx.AsyncClient, url: str, headers: dict[str, str]) -> httpx.Response:
    try:
        return await client.get(url, headers=headers)
    except httpx.HTTPError as exc:
        # 예외 메시지에는 URL·헤더가 섞일 수 있어 타입 이름만 남긴다
        logger.warning(f"[Auth] ❌ upstream unreachable ({type(exc).__name__})")
        raise AuthUpstreamError("Authentication service is unreachable") from exc


async def fetch_config(client: httpx.AsyncClient, settings: SupabasePublic) -> AuthConfig:
    resp = await _get(client, f"{settings.url}/auth/v1/settings", {"apikey": settings.publishable_key})
    if resp.status_code != 200:
        logger.warning(f"[Auth] ❌ settings status={resp.status_code}")
        raise AuthUpstreamError("Could not read authentication provider settings")
    try:
        external = resp.json().get("external")
        google = external.get("google") if isinstance(external, dict) else None
    except (ValueError, AttributeError) as exc:
        raise AuthUpstreamError("Authentication provider settings were not readable") from exc
    if not isinstance(google, bool):
        raise AuthUpstreamError("Authentication provider settings did not include Google status")
    return AuthConfig(supabase_url=settings.url, publishable_key=settings.publishable_key, google_enabled=google)


def bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise InvalidToken("Missing bearer token")
    scheme, _, token = authorization.partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token or len(token) > MAX_TOKEN_LEN or any(c.isspace() for c in token):
        raise InvalidToken("Malformed bearer token")
    return token


def _https_or_none(value: object) -> str | None:
    return value if isinstance(value, str) and value.startswith("https://") else None


def _str_or_none(value: object) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None


async def verify_user(client: httpx.AsyncClient, settings: SupabasePublic, token: str) -> AuthUser:
    """토큰을 직접 디코드하지 않고 Supabase 가 검증하게 한다. 원격 응답 본문은 로그에 남기지 않는다."""
    resp = await _get(
        client,
        f"{settings.url}/auth/v1/user",
        {"apikey": settings.publishable_key, "Authorization": f"Bearer {token}"},
    )
    if resp.status_code in REJECTED_TOKEN_STATUSES:
        logger.info(f"[Auth] token rejected status={resp.status_code}")
        raise InvalidToken("Invalid or expired session")
    if resp.status_code != 200:
        logger.warning(f"[Auth] ❌ user lookup status={resp.status_code}")
        raise AuthUpstreamError("Authentication service error")
    try:
        data = resp.json()
    except ValueError as exc:
        raise AuthUpstreamError("Authentication service returned an unreadable response") from exc
    user_id = data.get("id") if isinstance(data, dict) else None
    if not isinstance(user_id, str) or not user_id:
        raise AuthUpstreamError("Authentication service returned no user")
    meta = data.get("user_metadata") if isinstance(data.get("user_metadata"), dict) else {}
    return AuthUser(
        id=user_id,
        email=_str_or_none(data.get("email")),
        display_name=_str_or_none(meta.get("full_name")) or _str_or_none(meta.get("name")),
        avatar_url=_https_or_none(meta.get("avatar_url")) or _https_or_none(meta.get("picture")),
    )

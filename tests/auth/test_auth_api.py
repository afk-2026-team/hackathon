"""Supabase Auth 를 httpx.MockTransport 로 대신한 계약 테스트. 실제 Google 로그인 성공을 뜻하지 않는다."""

from __future__ import annotations

import base64
import json
import logging

import httpx
import pytest
from fastapi.testclient import TestClient

from app.api.v1.auth import get_auth_client
from app.discovery_server import create_discovery_app

URL = "https://fixture-project.supabase.co"
PUB_KEY = "sb_publishable_fixture"
SECRET_KEY = "sb_secret_must_never_leak"
GOOD_TOKEN = "header.payload.signature-good"
USER = {
    "id": "8f0c-user",
    "email": "traveler@example.com",
    "user_metadata": {"full_name": "Test Traveler", "avatar_url": "https://lh3.example.com/a.png"},
    "app_metadata": {"provider": "google"},
}


class Upstream:
    """요청을 기록하고 시나리오별 응답을 돌려주는 가짜 Supabase Auth."""

    def __init__(self):
        self.requests: list[httpx.Request] = []
        self.settings = (200, {"external": {"google": True, "email": True}})
        self.user = None  # None 이면 토큰으로 판정
        self.fail: type[Exception] | None = None

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if self.fail:
            raise self.fail("boom", request=request)
        if request.url.path == "/auth/v1/settings":
            status, body = self.settings
            return httpx.Response(status, json=body) if isinstance(body, dict) else httpx.Response(status, text=body)
        if request.url.path == "/auth/v1/user":
            if self.user is not None:
                status, body = self.user
                return httpx.Response(status, json=body) if isinstance(body, dict) else httpx.Response(status, text=body)
            if request.headers.get("authorization") == f"Bearer {GOOD_TOKEN}":
                return httpx.Response(200, json=USER)
            return httpx.Response(403, json={"code": 403, "error_code": "bad_jwt", "msg": "invalid JWT"})
        return httpx.Response(404)


@pytest.fixture
def upstream():
    return Upstream()


@pytest.fixture
def env(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", URL + "/")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", PUB_KEY)
    monkeypatch.setenv("SUPABASE_SECRET_KEY", SECRET_KEY)


@pytest.fixture
def client(upstream):
    app = create_discovery_app(web_dist=None)

    async def _client():
        async with httpx.AsyncClient(transport=httpx.MockTransport(upstream)) as c:
            yield c

    app.dependency_overrides[get_auth_client] = _client
    return TestClient(app)


def _me(client, token=GOOD_TOKEN, header=None):
    headers = {"Authorization": header if header is not None else f"Bearer {token}"}
    return client.get("/v1/auth/me", headers=headers)


# ── /v1/auth/config ──


def test_config_returns_public_values_only(client, env, upstream):
    resp = client.get("/v1/auth/config")
    assert resp.status_code == 200
    assert resp.json() == {"supabase_url": URL, "publishable_key": PUB_KEY, "google_enabled": True, "callback_path": "/auth/callback"}
    assert SECRET_KEY not in resp.text
    sent = upstream.requests[0]
    assert str(sent.url) == f"{URL}/auth/v1/settings"
    assert sent.headers["apikey"] == PUB_KEY


def test_config_google_disabled_is_200_false(client, env, upstream):
    upstream.settings = (200, {"external": {"google": False}})
    assert client.get("/v1/auth/config").json()["google_enabled"] is False


@pytest.mark.parametrize("settings", [(500, {"msg": "down"}), (200, "not json"), (200, {"external": {}}), (200, {"external": "x"})])
def test_config_unverifiable_provider_is_503_not_disabled(client, env, upstream, settings):
    upstream.settings = settings
    resp = client.get("/v1/auth/config")
    assert resp.status_code == 503
    assert "google_enabled" not in resp.text


@pytest.mark.parametrize("exc", [httpx.ConnectError, httpx.ReadTimeout])
def test_config_network_failure_is_503(client, env, upstream, exc):
    upstream.fail = exc
    assert client.get("/v1/auth/config").status_code == 503


@pytest.mark.parametrize(
    "url,key",
    [(None, PUB_KEY), (URL, None), ("http://evil.example.com", PUB_KEY), ("ftp://x.supabase.co", PUB_KEY), (URL + "/rest/v1", PUB_KEY), ("https://u:p@x.supabase.co", PUB_KEY)],
)
def test_config_missing_or_unsafe_settings_is_503_without_upstream_call(client, upstream, monkeypatch, url, key):
    for name, value in (("SUPABASE_URL", url), ("SUPABASE_PUBLISHABLE_KEY", key)):
        if value is None:
            monkeypatch.delenv(name, raising=False)
        else:
            monkeypatch.setenv(name, value)
    resp = client.get("/v1/auth/config")
    assert resp.status_code == 503
    assert upstream.requests == []
    assert "evil" not in resp.text and "u:p" not in resp.text


# ── /v1/auth/me ──


def test_me_verifies_with_supabase_and_returns_minimum_profile(client, env, upstream):
    resp = _me(client)
    assert resp.status_code == 200
    assert resp.json() == {"id": "8f0c-user", "email": "traveler@example.com", "display_name": "Test Traveler", "avatar_url": "https://lh3.example.com/a.png"}
    sent = upstream.requests[0]
    assert str(sent.url) == f"{URL}/auth/v1/user"
    assert sent.headers["apikey"] == PUB_KEY
    assert sent.headers["authorization"] == f"Bearer {GOOD_TOKEN}"
    assert "app_metadata" not in resp.text


@pytest.mark.parametrize("header", ["", "Bearer", "Bearer ", "Basic abc", "Bearer a b", "token abc", "Bearer " + "x" * 9000])
def test_me_missing_or_malformed_token_is_401_without_upstream_call(client, env, upstream, header):
    resp = client.get("/v1/auth/me", headers={"Authorization": header} if header else {})
    assert resp.status_code == 401
    assert resp.headers.get("www-authenticate") == "Bearer"
    assert upstream.requests == []


def test_me_forged_or_expired_token_is_401(client, env, upstream):
    resp = _me(client, token="forged.jwt.value")
    assert resp.status_code == 401
    assert "bad_jwt" not in resp.text  # 원격 응답 본문을 그대로 넘기지 않는다


def test_me_client_supplied_user_id_is_ignored(client, env, upstream):
    resp = client.get("/v1/auth/me", headers={"Authorization": "Bearer forged.jwt.value", "X-User-Id": "8f0c-user"})
    assert resp.status_code == 401


@pytest.mark.parametrize("user", [(500, {"msg": "x"}), (429, {"msg": "slow"}), (200, "not json"), (200, {"email": "no-id@example.com"})])
def test_me_upstream_failure_is_503_never_success(client, env, upstream, user):
    upstream.user = user
    assert _me(client).status_code == 503


def test_me_network_failure_is_503(client, env, upstream):
    upstream.fail = httpx.ConnectTimeout
    assert _me(client).status_code == 503


def test_me_drops_non_https_avatar_and_empty_fields(client, env, upstream):
    upstream.user = (200, {"id": "u2", "email": "", "user_metadata": {"name": "N", "avatar_url": "javascript:alert(1)"}})
    assert _me(client).json() == {"id": "u2", "email": None, "display_name": "N", "avatar_url": None}


def test_me_without_server_config_is_503(client, upstream, monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    assert _me(client).status_code == 503


def test_no_token_key_or_body_in_logs(client, env, upstream, caplog):
    caplog.set_level(logging.DEBUG)
    _me(client)
    _me(client, token="forged.jwt.value")
    upstream.fail = httpx.ConnectError
    client.get("/v1/auth/config")
    logs = "\n".join(r.getMessage() for r in caplog.records)
    # 공개 프로젝트 URL 은 httpx 기본 요청 로그에 남을 수 있다(비밀 아님). 토큰·키·개인정보·원격 본문은 없어야 한다.
    for secret in (GOOD_TOKEN, "forged.jwt.value", PUB_KEY, SECRET_KEY, "traveler@example.com", "Test Traveler", "bad_jwt"):
        assert secret not in logs


def test_existing_discovery_routes_still_mounted(client, env):
    paths = set(client.app.openapi()["paths"])
    assert {"/v1/discovery/catalog", "/v1/discovery/recommendations", "/v1/auth/config", "/v1/auth/me", "/health"} <= paths
    assert json.loads(client.get("/health").text)["status"] == "ok"



def _jwt(payload: dict) -> str:
    body = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    return f"eyJhbGciOiJIUzI1NiJ9.{body}.sig"


@pytest.mark.parametrize("bad_key", [SECRET_KEY, "sb_secret_abc", _jwt({"role": "service_role"}), _jwt({"iss": "x"}), "plainvalue", "a.b.c"])
def test_misconfigured_secret_key_is_never_exposed(client, upstream, monkeypatch, caplog, bad_key):
    caplog.set_level(logging.DEBUG)
    monkeypatch.setenv("SUPABASE_URL", URL)
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", bad_key)
    for resp in (client.get("/v1/auth/config"), _me(client)):
        assert resp.status_code == 503
        assert bad_key not in resp.text
    assert upstream.requests == []
    assert bad_key not in "\n".join(r.getMessage() for r in caplog.records)


def test_legacy_anon_jwt_key_is_accepted(client, upstream, monkeypatch):
    anon = _jwt({"role": "anon", "iss": "supabase"})
    monkeypatch.setenv("SUPABASE_URL", URL)
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", anon)
    resp = client.get("/v1/auth/config")
    assert resp.status_code == 200 and resp.json()["publishable_key"] == anon

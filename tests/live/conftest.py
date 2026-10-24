from __future__ import annotations

from collections.abc import Callable

import httpx
import pytest
from fastapi.testclient import TestClient

from app.api.v1.maps import get_live_client
from app.discovery_server import create_discovery_app
from app.services import evidence, fx, maps

# 테스트 전용 합성 값(provenance=test_fixture). 실제 키·실제 응답이 아니다.
FAKE_ENV = {
    "NAVER_MAPS_CLIENT_ID": "test-maps-id",
    "NAVER_MAPS_CLIENT_SECRET": "test-maps-secret-should-not-leak",
    "NAVER_CLIENT_ID": "test-hub-id",
    "NAVER_CLIENT_SECRET": "test-hub-secret-should-not-leak",
    "NAVER_API_BASE_URL": "https://hub.example.test",
    "YOUTUBE_API_KEY": "test-youtube-key-should-not-leak",
}
LIVE_ENV_NAMES = tuple(FAKE_ENV)

Handler = Callable[[httpx.Request], httpx.Response]


class Upstream:
    """경로별 응답을 등록하고 호출 기록을 남기는 MockTransport 래퍼. 외부 네트워크로 나가지 않는다."""

    def __init__(self) -> None:
        self.routes: dict[str, Handler] = {}
        self.calls: list[httpx.Request] = []

    def on(self, path: str, handler: Handler) -> None:
        self.routes[path] = handler

    def count(self, path: str) -> int:
        return sum(1 for r in self.calls if r.url.path == path)

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.calls.append(request)
        handler = self.routes.get(request.url.path)
        if handler is None:
            return httpx.Response(404, json={"error": "no fixture route"})
        return handler(request)


@pytest.fixture(autouse=True)
def _reset_live_state(monkeypatch):
    for name in LIVE_ENV_NAMES:
        monkeypatch.delenv(name, raising=False)
    maps.reset_cache()
    evidence.reset_cache()
    fx.reset_cache()
    yield
    maps.reset_cache()
    evidence.reset_cache()
    fx.reset_cache()


@pytest.fixture
def live_env(monkeypatch):
    for name, value in FAKE_ENV.items():
        monkeypatch.setenv(name, value)
    return FAKE_ENV


@pytest.fixture
def upstream() -> Upstream:
    return Upstream()


@pytest.fixture
def client(upstream):
    app = create_discovery_app(web_dist=None)

    async def _client():
        async with httpx.AsyncClient(transport=httpx.MockTransport(upstream), timeout=8.0) as c:
            yield c

    app.dependency_overrides[get_live_client] = _client
    return TestClient(app)

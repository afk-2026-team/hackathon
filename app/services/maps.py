"""NAVER Maps 공개 설정·지오코딩 + 실키 프록시(maps·evidence·fx)가 함께 쓰는 작은 공용 도구.

키는 실행기(scripts/secrets.mjs run --services naver_maps)가 주입한 환경값을 **요청 시점에** 읽는다.
지오코딩 질의는 사용자가 넣은 숙소 주소일 수 있으므로 로그에 남기지 않는다(건수·상태만).
"""

from __future__ import annotations

import logging
import os
import time
from collections import OrderedDict
from datetime import datetime, timezone
from typing import Any, Generic, TypeVar

import httpx

from app.schemas.live import DirectionsResponse, GeocodeResponse, GeocodeResult, MapsConfig
from app.utils.logger import AGENT_LOGGER_NAME

logger = logging.getLogger(AGENT_LOGGER_NAME)

# --- 공용 도구 (evidence·fx 도 import) ---

UPSTREAM_TIMEOUT_S = 8.0  # 외부 API 호출 상한


class LiveNotConfigured(Exception):
    """필요한 환경값이 없음 → 503. 메시지는 어떤 서비스로 실행해야 하는지만 안내한다."""


class LiveUpstreamError(Exception):
    """상류 비정상·타임아웃 → 502. 메시지에 응답 본문·키·URL 을 넣지 않는다."""

    def __init__(self, service: str, status: int | None = None):
        detail = f"status {status}" if status is not None else "no response"
        super().__init__(f"Upstream {service} request failed ({detail})")
        self.service = service
        self.status = status


def new_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=UPSTREAM_TIMEOUT_S, follow_redirects=False)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def run_command_hint(services: str) -> str:
    return f"node scripts/secrets.mjs run --env dev --services {services} -- uv run python -m app.discovery_server"


V = TypeVar("V")


class TTLCache(Generic[V]):
    """프로세스 메모리 LRU(+선택 TTL). 디스크에 쓰지 않는다."""

    def __init__(self, max_items: int, ttl_s: float | None = None):
        self.max_items = max_items
        self.ttl_s = ttl_s
        self._data: OrderedDict[Any, tuple[float, V]] = OrderedDict()

    def get(self, key: Any) -> V | None:
        hit = self._data.get(key)
        if hit is None:
            return None
        stored_at, value = hit
        if self.ttl_s is not None and time.monotonic() - stored_at > self.ttl_s:
            del self._data[key]
            return None
        self._data.move_to_end(key)
        return value

    def set(self, key: Any, value: V) -> None:
        self._data[key] = (time.monotonic(), value)
        self._data.move_to_end(key)
        while len(self._data) > self.max_items:
            self._data.popitem(last=False)

    def clear(self) -> None:
        self._data.clear()

    def __len__(self) -> int:
        return len(self._data)


async def get_json(client: httpx.AsyncClient, service: str, url: str, **kwargs: Any) -> Any:
    """GET → JSON. 실패 시 원인(예외 문자열·URL)은 버리고 상태 코드만 담아 올린다 — URL·헤더에 키가 있을 수 있다."""
    try:
        resp = await client.get(url, **kwargs)
    except httpx.HTTPError as exc:
        logger.warning("[Live] ⚠️ %s request error: %s", service, type(exc).__name__)
        raise LiveUpstreamError(service) from None
    if resp.status_code != 200:
        logger.warning("[Live] ⚠️ %s upstream status %s", service, resp.status_code)
        raise LiveUpstreamError(service, resp.status_code)
    try:
        return resp.json()
    except ValueError:
        logger.warning("[Live] ⚠️ %s upstream returned non-JSON", service)
        raise LiveUpstreamError(service, resp.status_code) from None


# --- NAVER Maps ---

CLIENT_ID_ENV = "NAVER_MAPS_CLIENT_ID"
CLIENT_SECRET_ENV = "NAVER_MAPS_CLIENT_SECRET"
GEOCODE_URL = "https://maps.apigw.ntruss.com/map-geocode/v2/geocode"
GEOCODE_CACHE_MAX = 256  # 지오코딩 결과 메모리 캐시 상한
SERVICE_NAME = "naver_maps"

DIRECTIONS_URL = "https://maps.apigw.ntruss.com/map-direction/v1/driving"  # Directions 5
DIRECTIONS_CACHE_MAX = 128
DIRECTIONS_TTL_S = 600.0  # 교통 반영 경로라 10분만 재사용
DIRECTIONS_NOT_ENABLED_STATUSES = (401, 403)  # 이 앱에 Directions 상품이 꺼져 있을 때 NCP 가 돌려주는 상태

_geocode_cache: TTLCache[GeocodeResponse] = TTLCache(GEOCODE_CACHE_MAX)
_directions_cache: TTLCache[DirectionsResponse] = TTLCache(DIRECTIONS_CACHE_MAX, DIRECTIONS_TTL_S)


class LiveNotEnabled(Exception):
    """키는 있으나 NCP 콘솔에서 해당 API(예: Directions 5)가 이 앱에 켜져 있지 않음 → 501. 키 누락(503)과 구분한다."""


DIRECTIONS_NOT_ENABLED_MESSAGE = (
    "Directions is not enabled for this NAVER Cloud Maps application. Enable 'Directions 5' in the NCP console."
)


def reset_cache() -> None:
    _geocode_cache.clear()
    _directions_cache.clear()


def _env(name: str) -> str:
    return (os.environ.get(name) or "").strip()


def public_config() -> MapsConfig:
    client_id = _env(CLIENT_ID_ENV)
    return MapsConfig(enabled=bool(client_id), client_id=client_id or None)


def _credentials() -> tuple[str, str]:
    client_id, secret = _env(CLIENT_ID_ENV), _env(CLIENT_SECRET_ENV)
    if not client_id or not secret:
        raise LiveNotConfigured(f"Map service is not configured. Start the API with: {run_command_hint(SERVICE_NAME)}")
    return client_id, secret


def _text(value: Any) -> str | None:
    return value.strip() or None if isinstance(value, str) else None


def _result(raw: Any) -> GeocodeResult | None:
    if not isinstance(raw, dict):
        return None
    try:
        lng, lat = float(raw["x"]), float(raw["y"])  # NAVER: x=경도, y=위도(문자열)
    except (KeyError, TypeError, ValueError):
        return None
    road, jibun = _text(raw.get("roadAddress")), _text(raw.get("jibunAddress"))
    return GeocodeResult(
        address=road or jibun,
        road_address=road,
        jibun_address=jibun,
        english_address=_text(raw.get("englishAddress")),
        lat=lat,
        lng=lng,
    )


async def geocode(client: httpx.AsyncClient, query: str) -> GeocodeResponse:
    client_id, secret = _credentials()
    key = query.strip()
    cached = _geocode_cache.get(key)
    if cached is not None:
        return cached.model_copy(update={"query": query})
    data = await get_json(
        client,
        SERVICE_NAME,
        GEOCODE_URL,
        params={"query": key},
        headers={"x-ncp-apigw-api-key-id": client_id, "x-ncp-apigw-api-key": secret, "Accept": "application/json"},
    )
    if not isinstance(data, dict) or data.get("status", "OK") != "OK":
        logger.warning("[Maps] ⚠️ geocode body status is not OK")
        raise LiveUpstreamError(SERVICE_NAME, 200)
    raw = data.get("addresses") if isinstance(data.get("addresses"), list) else []
    results = [r for r in (_result(a) for a in raw) if r is not None]
    if len(results) != len(raw):
        logger.warning("[Maps] ⚠️ geocode dropped %d address(es) without numeric x/y", len(raw) - len(results))
    logger.info("[Maps] geocode ok results=%d", len(results))  # 질의 텍스트는 남기지 않는다
    response = GeocodeResponse(query=query, results=results, fetched_at=utc_now_iso())
    _geocode_cache.set(key, response)
    return response


def _directions_route(data: Any, option: str) -> tuple[int, int, list[list[float]]] | None:
    """NAVER 응답 {code:0, route:{<option>:[{summary:{distance(m), duration(ms)}, path:[[lng,lat],...]}]}} 에서 첫 경로."""
    if not isinstance(data, dict) or data.get("code") != 0:
        return None
    routes = (data.get("route") or {}).get(option) if isinstance(data.get("route"), dict) else None
    if not isinstance(routes, list) or not routes or not isinstance(routes[0], dict):
        return None
    summary, raw_path = routes[0].get("summary"), routes[0].get("path")
    if not isinstance(summary, dict) or not isinstance(raw_path, list):
        return None
    try:
        distance_m = int(summary["distance"])
        duration_s = round(float(summary["duration"]) / 1000)  # NAVER duration 단위는 밀리초
        path = [[float(p[0]), float(p[1])] for p in raw_path]
    except (KeyError, TypeError, ValueError, IndexError):
        return None
    return distance_m, duration_s, path


async def directions(client: httpx.AsyncClient, start: str, goal: str, waypoints: str | None, option: str) -> DirectionsResponse:
    """start/goal = "lng,lat", waypoints = "lng,lat|lng,lat"(최대 5). 좌표는 로그에 남기지 않는다."""
    client_id, secret = _credentials()
    key = (start, goal, waypoints or "", option)
    cached = _directions_cache.get(key)
    if cached is not None:
        return cached
    params = {"start": start, "goal": goal, "option": option}
    if waypoints:
        params["waypoints"] = waypoints
    try:
        resp = await client.get(
            DIRECTIONS_URL,
            params=params,
            headers={"x-ncp-apigw-api-key-id": client_id, "x-ncp-apigw-api-key": secret, "Accept": "application/json"},
        )
    except httpx.HTTPError as exc:
        logger.warning("[Maps] ⚠️ directions request error: %s", type(exc).__name__)
        raise LiveUpstreamError(SERVICE_NAME) from None
    if resp.status_code in DIRECTIONS_NOT_ENABLED_STATUSES:
        logger.warning("[Maps] ⚠️ directions not enabled for this app (upstream status %s)", resp.status_code)
        raise LiveNotEnabled(DIRECTIONS_NOT_ENABLED_MESSAGE)
    if resp.status_code != 200:
        logger.warning("[Maps] ⚠️ directions upstream status %s", resp.status_code)
        raise LiveUpstreamError(SERVICE_NAME, resp.status_code)
    try:
        data = resp.json()
    except ValueError:
        raise LiveUpstreamError(SERVICE_NAME, 200) from None
    route = _directions_route(data, option)
    if route is None:
        code = data.get("code") if isinstance(data, dict) else None
        logger.warning("[Maps] ⚠️ directions returned no usable route (code %s)", code)
        raise LiveUpstreamError(SERVICE_NAME, 200)
    distance_m, duration_s, path = route
    logger.info("[Maps] directions ok points=%d", len(path))
    response = DirectionsResponse(
        option=option, distance_m=distance_m, duration_s=duration_s, path=path, fetched_at=utc_now_iso()
    )
    _directions_cache.set(key, response)
    return response

"""ECB 기준율(Frankfurter 경유, 키 불필요) → 1 KRW 당 환율.

Frankfurter 의 base=KRW 응답은 소수 5자리로 반올림돼 EUR·GBP 등이 유효숫자 2자리밖에 남지 않는다.
그래서 ECB 원본 기준(EUR)을 받아 rate[X] / rate[KRW] 로 교차환율을 직접 계산한다(같은 ECB 수치, 정밀도만 보존).
통화 목록은 하드코딩하지 않는다 — ECB 가 주는 것만 돌려준다.
"""

from __future__ import annotations

import logging
import math

import httpx

from app.schemas.live import FxResponse, FxSource
from app.services.maps import LiveUpstreamError, TTLCache, get_json, utc_now_iso
from app.utils.logger import AGENT_LOGGER_NAME

logger = logging.getLogger(AGENT_LOGGER_NAME)

FX_URL = "https://api.frankfurter.dev/v1/latest"  # 2026-10-24 실측 200 (frankfurter.app 은 301 로 이 주소로 넘김)
FX_SERVICE = "frankfurter"
FX_CACHE_TTL_S = 60 * 60
FX_SIGNIFICANT_DIGITS = 6  # 교차환율 반올림 유효숫자
SOURCE = FxSource(
    label="European Central Bank reference rates (via Frankfurter)",
    url="https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html",
)

_fx_cache: TTLCache[FxResponse] = TTLCache(1, FX_CACHE_TTL_S)


def reset_cache() -> None:
    _fx_cache.clear()


def _round_sig(value: float) -> float:
    if value == 0:
        return 0.0
    return round(value, FX_SIGNIFICANT_DIGITS - 1 - math.floor(math.log10(abs(value))))


def _positive(value: object) -> float | None:
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) and value > 0 else None


async def krw_rates(client: httpx.AsyncClient) -> FxResponse:
    cached = _fx_cache.get("KRW")
    if cached is not None:
        return cached
    data = await get_json(client, FX_SERVICE, FX_URL)
    if not isinstance(data, dict) or not isinstance(data.get("rates"), dict) or not isinstance(data.get("date"), str):
        raise LiveUpstreamError(FX_SERVICE, 200)
    base = data.get("base")
    eur_rates: dict[str, float] = {k: v for k, raw in data["rates"].items() if (v := _positive(raw)) is not None}
    if base != "EUR" or "KRW" not in eur_rates:
        logger.warning("[FX] ⚠️ unexpected ECB payload (base or KRW missing)")
        raise LiveUpstreamError(FX_SERVICE, 200)
    per_eur_krw = eur_rates.pop("KRW")
    rates = {code: _round_sig(v / per_eur_krw) for code, v in eur_rates.items()}
    rates["EUR"] = _round_sig(1 / per_eur_krw)
    response = FxResponse(date=data["date"], rates=dict(sorted(rates.items())), source=SOURCE, fetched_at=utc_now_iso())
    logger.info("[FX] ok date=%s currencies=%d", response.date, len(rates))
    _fx_cache.set("KRW", response)
    return response

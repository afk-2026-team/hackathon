"""근거 프록시: NAVER API HUB 블로그 검색 + YouTube 숏폼.

- 블로그: HUB 특약상 캐시하지 않는다. 협찬은 항상 unknown(판별 휴리스틱 금지).
- 숏폼: 크리에이터가 신고한 유료 광고(paidProductPlacementDetails)만 sponsored, 나머지는 unknown.
  쿼터 보호용 메모리 캐시 6시간. YouTube 키는 URL 이 아닌 x-goog-api-key 헤더로 보낸다(로그·예외에 URL 이 남아도 키가 없게).
"""

from __future__ import annotations

import html
import logging
import os
import re
from datetime import datetime
from typing import Any

import httpx

from app.schemas.live import BlogItem, BlogResponse, VideoItem, VideoResponse
from app.services.maps import (
    LiveNotConfigured,
    LiveUpstreamError,
    TTLCache,
    get_json,
    run_command_hint,
    utc_now_iso,
)
from app.utils.logger import AGENT_LOGGER_NAME

logger = logging.getLogger(AGENT_LOGGER_NAME)

# --- NAVER API HUB 블로그 ---

NAVER_ID_ENV = "NAVER_CLIENT_ID"
NAVER_SECRET_ENV = "NAVER_CLIENT_SECRET"
NAVER_BASE_ENV = "NAVER_API_BASE_URL"
BLOG_PATH = "/search/v1/blog"
BLOG_SERVICE = "naver_blog_search"
_TAG_RE = re.compile(r"<[^>]+>")


def _env(name: str) -> str:
    return (os.environ.get(name) or "").strip()


def clean_text(value: Any) -> str:
    """<b> 등 태그 제거 후 HTML 엔티티 해제."""
    if not isinstance(value, str):
        return ""
    return html.unescape(_TAG_RE.sub("", value)).strip()


def parse_postdate(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    try:
        return datetime.strptime(value.strip(), "%Y%m%d").date().isoformat()
    except ValueError:
        return None


def _naver_settings() -> tuple[str, str, str]:
    cid, secret, base = _env(NAVER_ID_ENV), _env(NAVER_SECRET_ENV), _env(NAVER_BASE_ENV).rstrip("/")
    if not cid or not secret or not base:
        raise LiveNotConfigured(f"Blog search is not configured. Start the API with: {run_command_hint('naver')}")
    return cid, secret, base


async def search_blog(client: httpx.AsyncClient, query: str, display: int) -> BlogResponse:
    cid, secret, base = _naver_settings()
    data = await get_json(
        client,
        BLOG_SERVICE,
        f"{base}{BLOG_PATH}",
        params={"query": query.strip(), "display": display, "sort": "sim"},
        headers={"X-NCP-APIGW-API-KEY-ID": cid, "X-NCP-APIGW-API-KEY": secret},
    )
    if not isinstance(data, dict):
        raise LiveUpstreamError(BLOG_SERVICE, 200)
    items: list[BlogItem] = []
    for raw in data.get("items") or []:
        if not isinstance(raw, dict) or not isinstance(raw.get("link"), str) or not raw["link"].strip():
            continue
        items.append(
            BlogItem(
                title=clean_text(raw.get("title")),
                url=raw["link"].strip(),
                excerpt=clean_text(raw.get("description")),
                author=clean_text(raw.get("bloggername")) or None,
                posted_on=parse_postdate(raw.get("postdate")),
            )
        )
    total = data.get("total")
    logger.info("[Evidence] blog ok items=%d", len(items))
    return BlogResponse(
        query=query,
        total=total if isinstance(total, int) and total >= 0 else len(items),
        items=items,
        fetched_at=utc_now_iso(),
    )


# --- YouTube Data API v3 ---

YOUTUBE_KEY_ENV = "YOUTUBE_API_KEY"
YOUTUBE_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"
YOUTUBE_VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos"
YOUTUBE_SERVICE = "youtube"
VIDEO_CACHE_TTL_S = 6 * 60 * 60  # search.list 100 units/회 쿼터 보호
VIDEO_CACHE_MAX = 128
THUMBNAIL_ORDER = ("high", "medium", "default")

_video_cache: TTLCache[VideoResponse] = TTLCache(VIDEO_CACHE_MAX, VIDEO_CACHE_TTL_S)


def reset_cache() -> None:
    _video_cache.clear()


def _youtube_key() -> str:
    key = _env(YOUTUBE_KEY_ENV)
    if not key:
        raise LiveNotConfigured(f"Video search is not configured. Start the API with: {run_command_hint('youtube')}")
    return key


def _thumbnail(snippet: dict[str, Any]) -> str | None:
    thumbs = snippet.get("thumbnails")
    if not isinstance(thumbs, dict):
        return None
    for size in THUMBNAIL_ORDER:
        url = thumbs.get(size, {}).get("url") if isinstance(thumbs.get(size), dict) else None
        if isinstance(url, str) and url:
            return url
    return None


async def _paid_placements(client: httpx.AsyncClient, key: str, ids: list[str]) -> set[str] | None:
    """크리에이터가 유료 광고를 신고한 영상 id. 조회 실패면 None(호출부가 전부 unknown 으로 둔다)."""
    try:
        data = await get_json(
            client,
            YOUTUBE_SERVICE,
            YOUTUBE_VIDEOS_URL,
            params={"part": "paidProductPlacementDetails", "id": ",".join(ids), "maxResults": len(ids)},
            headers={"x-goog-api-key": key},
        )
    except LiveUpstreamError as exc:
        logger.warning("[Evidence] ⚠️ videos.list failed (%s); all sponsorship left unknown", exc.status)
        return None
    if not isinstance(data, dict):
        logger.warning("[Evidence] ⚠️ videos.list body unreadable; all sponsorship left unknown")
        return None
    paid: set[str] = set()
    for raw in data.get("items") or []:
        if not isinstance(raw, dict):
            continue
        details = raw.get("paidProductPlacementDetails")
        if isinstance(details, dict) and details.get("hasPaidProductPlacement") is True and isinstance(raw.get("id"), str):
            paid.add(raw["id"])
    return paid


async def search_videos(client: httpx.AsyncClient, query: str, lang: str, max_results: int) -> VideoResponse:
    key = _youtube_key()
    cache_key = (query.casefold().strip(), lang, max_results)
    cached = _video_cache.get(cache_key)
    if cached is not None:
        return cached.model_copy(update={"query": query, "cached": True})

    data = await get_json(
        client,
        YOUTUBE_SERVICE,
        YOUTUBE_SEARCH_URL,
        params={
            "part": "snippet",
            "type": "video",
            "videoDuration": "short",
            "maxResults": max_results,
            "q": query.strip(),
            "relevanceLanguage": lang,
            "safeSearch": "moderate",
        },
        headers={"x-goog-api-key": key},
    )
    if not isinstance(data, dict):
        raise LiveUpstreamError(YOUTUBE_SERVICE, 200)

    found: list[tuple[str, dict[str, Any]]] = []
    for raw in data.get("items") or []:
        if not isinstance(raw, dict):
            continue
        vid = raw.get("id", {}).get("videoId") if isinstance(raw.get("id"), dict) else None
        snippet = raw.get("snippet") if isinstance(raw.get("snippet"), dict) else {}
        if isinstance(vid, str) and vid:
            found.append((vid, snippet))

    paid = await _paid_placements(client, key, [v for v, _ in found]) if found else set()
    items = [
        VideoItem(
            video_id=vid,
            title=clean_text(snippet.get("title")),
            channel=clean_text(snippet.get("channelTitle")) or None,
            published_at=snippet.get("publishedAt") if isinstance(snippet.get("publishedAt"), str) else None,
            thumbnail_url=_thumbnail(snippet),
            url=f"https://www.youtube.com/watch?v={vid}",
            embed_url=f"https://www.youtube.com/embed/{vid}",
            sponsorship="sponsored" if paid and vid in paid else "unknown",
            sponsorship_source="youtube_paid_product_placement" if paid and vid in paid else None,
        )
        for vid, snippet in found
    ]
    logger.info("[Evidence] videos ok items=%d sponsored=%d", len(items), sum(i.sponsorship == "sponsored" for i in items))
    response = VideoResponse(query=query, items=items, fetched_at=utc_now_iso(), cached=False)
    if paid is not None:  # 협찬 조회가 실패한 축소 결과는 캐시하지 않는다(다음 요청에서 다시 확인)
        _video_cache.set(cache_key, response)
    return response

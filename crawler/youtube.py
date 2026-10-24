"""YouTube Data API v3 어댑터. 할당량: search.list 100 unit, videos.list 1 unit(하루 기본 10,000)."""

from __future__ import annotations

import os

from crawler.http import get_json

API = "https://www.googleapis.com/youtube/v3"


def search_videos(query: str, max_results: int) -> list[dict]:
    params = {"part": "snippet", "q": query, "type": "video", "maxResults": max_results, "key": os.environ["YOUTUBE_API_KEY"]}
    return get_json(f"{API}/search", params)["items"]


def video_details(video_ids: list[str]) -> dict[str, dict]:
    """videoId → {snippet, statistics}. 조회수·오디오 언어는 측정값이다."""
    params = {"part": "snippet,statistics", "id": ",".join(video_ids), "key": os.environ["YOUTUBE_API_KEY"]}
    return {item["id"]: item for item in get_json(f"{API}/videos", params)["items"]}

"""Naver API Hub(NCP API Gateway) 검색 어댑터.

엔드포인트·헤더 근거: https://api.ncloud-docs.com/docs/naver-api-hub-search-blog
2026-10-24 실측: 이 애플리케이션은 blog 만 200, local 은 401(미활성), shop 은 404 다(plan v2·interview Q13).
shop·local 은 담당자가 활성화하면 쓰도록 남겨 두고, 지금 호출하면 CrawlError 로 멈춘다.
"""

from __future__ import annotations

import os
import re
from datetime import datetime, timezone, timedelta

from crawler.http import get_json

KST = timezone(timedelta(hours=9))
BLOG_LINK_RE = re.compile(r"blog\.naver\.com/([^/?#]+)/(\d+)")


def _search(kind: str, query: str, display: int) -> list[dict]:
    base = os.environ["NAVER_API_BASE_URL"].rstrip("/")
    headers = {"X-NCP-APIGW-API-KEY-ID": os.environ["NAVER_CLIENT_ID"], "X-NCP-APIGW-API-KEY": os.environ["NAVER_CLIENT_SECRET"]}
    return get_json(f"{base}/search/v1/{kind}", {"query": query, "display": display, "sort": "sim"}, headers)["items"]


def search_blog(query: str, display: int) -> list[dict]:
    return _search("blog", query, display)


def search_shop(query: str, display: int) -> list[dict]:
    return _search("shop", query, display)


def search_local(query: str, display: int) -> list[dict]:
    return _search("local", query, display)


def blog_key(item: dict) -> tuple[str, str] | None:
    """blog.naver.com/<bloggerId>/<logNo> 링크에서 원천 ID. 네이버 블로그가 아니면 None."""
    m = BLOG_LINK_RE.search(item["link"])
    return (m.group(1), m.group(2)) if m else None


def postdate_iso(postdate: str) -> str:
    """API postdate(YYYYMMDD) → KST 자정 ISO 8601. 글의 최종 수정 시각이 아니라 게시일이다."""
    return datetime.strptime(postdate, "%Y%m%d").replace(tzinfo=KST).isoformat()

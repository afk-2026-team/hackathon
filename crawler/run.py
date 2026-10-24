"""크롤링 실행기 — 실제 API 를 불러 Crawling_DB(OKF v0.2)에 적재한다.

    node scripts/secrets.mjs run --env dev --services naver,youtube -- uv run python -m crawler.run --out Crawling_DB

질의 계획은 interview Q13(블로그 25 + YouTube 5)을 따른다. 계획한 건수를 채우지 못하면 아무것도 쓰지 않고 멈춘다.
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime
from pathlib import Path

from crawler import naver, youtube
from crawler.http import CrawlError
from crawler.signals import FOREIGNER_TERMS, NOT_SPONSORED_TERMS, SPONSORED_TERMS, clean, country_signals, first_hit, language_signals
from crawler.writer import FOLDERS, append_log, write_concepts, write_indexes

DESCRIPTION_MAX = 200
BLOG_FETCH = 10  # 질의당 받아 둘 후보 수(중복·비블로그 링크를 건너뛸 여유)
STALE_DAYS = {"product": 30, "video": 30, "clinic": 90}  # interview Q12(c)
# (category, content_kind, 질의, 채택 수) — category 는 질의가 정한다(category_source: crawl_query)
BLOG_PLAN = [
    ("skincare", "product", "토너패드 추천 후기", 3),
    ("skincare", "product", "수분크림 추천 올리브영", 3),
    ("suncare", "product", "선크림 추천 후기", 3),
    ("makeup", "product", "쿠션 추천 후기", 3),
    ("makeup", "product", "립틴트 추천 후기", 3),
    ("k_medical", "clinic", "강남 피부과 외국인", 2),
    ("k_medical", "clinic", "명동 피부과 외국인", 2),
    ("k_medical", "clinic", "신사역 피부과 후기", 2),
    ("k_medical", "clinic", "압구정 피부과 통역", 2),
    ("k_medical", "clinic", "홍대 피부과 후기", 2),
]
VIDEO_PLAN = [
    ("skincare", "Korean skincare Olive Young haul", 3),
    ("k_medical", "Seoul dermatology clinic visit foreigner", 2),
]
NAVER_BLOG_SOURCE = {"id": "naver-api-hub-blog", "resource": "https://naverapihub.apigw.ntruss.com/search/v1/blog", "author": "process:naver-api-hub"}
YOUTUBE_SOURCE = {"id": "youtube-data-api", "resource": "https://www.googleapis.com/youtube/v3/search", "author": "process:youtube-data-api"}


def _signals(text: str) -> dict:
    countries, country_evidence = country_signals(text)
    denial = first_hit(text, NOT_SPONSORED_TERMS)
    sponsored_evidence = denial or first_hit(text, SPONSORED_TERMS)
    foreigner_evidence = first_hit(text, FOREIGNER_TERMS)
    return {
        # 표시 문구가 있을 때만 yes/no. 문구가 없다고 비협찬으로 단정하지 않는다(기획안 §7-5)
        "sponsored": "no" if denial else ("yes" if sponsored_evidence else "unknown"),
        "sponsored_evidence": sponsored_evidence,
        "sponsored_source": "self_declared_text" if sponsored_evidence else None,
        "foreigner_friendly": True if foreigner_evidence else None,
        "foreigner_evidence": foreigner_evidence,
        "country_signals": countries,
        "country_evidence": country_evidence or None,
    }


def _tags(category: str, kind: str, source_kind: str, signals: dict) -> list[str]:
    tags = [category, kind, source_kind]
    if signals["foreigner_friendly"]:
        tags.append("foreigner_friendly")
    return tags + [f"country:{c}" for c in signals["country_signals"]]


def blog_record(item: dict, category: str, kind: str, query: str) -> dict | None:
    key = naver.blog_key(item)
    if key is None:  # blog.naver.com 이 아닌 글(티스토리 등)은 원천 ID 를 못 정하므로 건너뛴다
        return None
    blogger_id, log_no = key
    title, snippet = clean(item["title"]), clean(item["description"])
    text = f"{title} {snippet}"
    signals = _signals(text)
    posted = naver.postdate_iso(item["postdate"])
    return {
        "id": f"{FOLDERS[kind][0]}/naver-blog-{blogger_id}-{log_no}",
        "type": "Blog Review",
        "title": title,
        "description": snippet[:DESCRIPTION_MAX],
        "resource": f"https://blog.naver.com/{blogger_id}/{log_no}",
        "tags": _tags(category, kind, "naver_blog", signals),
        "category": category,
        "category_source": "crawl_query",
        "content_kind": kind,
        "source_kind": "naver_blog",
        "crawl_query": query,
        **signals,
        "language_signals": language_signals(text),
        "language_source": "script",
        "provenance": "measured",
        "sources": [
            {**NAVER_BLOG_SOURCE, "title": f"Naver API Hub 블로그 검색 — query '{query}'"},
            {"id": "origin", "resource": f"https://blog.naver.com/{blogger_id}/{log_no}", "title": title,
             "author": f"human:naver-blog-{blogger_id}", "last_modified": posted},
        ],
        "meta": {"blogger": clean(item["bloggername"]), "postdate": posted, "api": "naver_api_hub/search/v1/blog"},
        "stale_days": STALE_DAYS[kind],
    }


def video_record(item: dict, detail: dict, category: str, query: str) -> dict:
    vid = item["id"]["videoId"]
    snippet = detail["snippet"]
    title, desc = clean(snippet["title"]), clean(snippet.get("description", ""))
    text = f"{title} {desc}"
    signals = _signals(text)
    audio = snippet.get("defaultAudioLanguage")
    url = f"https://www.youtube.com/watch?v={vid}"
    return {
        "id": f"videos/youtube-{vid}",
        "type": "Review Video",
        "title": title,
        "description": (desc or title)[:DESCRIPTION_MAX],
        "resource": url,
        "tags": _tags(category, "video", "youtube", signals),
        "category": category,
        "category_source": "crawl_query",
        "content_kind": "video",
        "source_kind": "youtube",
        "crawl_query": query,
        **signals,
        # 채널이 등록한 오디오 언어는 측정값, 없으면 제목·설명의 문자 체계 관측
        "language_signals": [audio.split("-")[0].lower()] if audio else language_signals(text),
        "language_source": "youtube_defaultAudioLanguage" if audio else "script",
        "provenance": "measured",
        "sources": [
            {**YOUTUBE_SOURCE, "title": f"YouTube Data API search — query '{query}'"},
            {"id": "origin", "resource": url, "title": title, "author": f"human:youtube-{snippet['channelId']}",
             "last_modified": snippet["publishedAt"].replace("Z", "+00:00")},
        ],
        "meta": {
            "channel": clean(snippet["channelTitle"]),
            "published_at": snippet["publishedAt"],
            "view_count": int(detail.get("statistics", {}).get("viewCount", 0)),
            "view_count_source": "youtube_data_api/videos.statistics",
        },
        "stale_days": STALE_DAYS["video"],
    }


def crawl_blogs() -> list[dict]:
    records, seen = [], set()
    for category, kind, query, take in BLOG_PLAN:
        picked = 0
        for item in naver.search_blog(query, BLOG_FETCH):
            record = blog_record(item, category, kind, query)
            if record is None or record["resource"] in seen:
                continue
            seen.add(record["resource"])
            records.append(record)
            picked += 1
            if picked == take:
                break
        if picked < take:
            raise CrawlError(f"질의 '{query}' 에서 {take}건 중 {picked}건만 확보 — 계획 건수 미달")
    return records


def crawl_videos() -> list[dict]:
    records, seen = [], set()
    for category, query, take in VIDEO_PLAN:
        items = [i for i in youtube.search_videos(query, take + 3) if i["id"]["videoId"] not in seen][:take]
        if len(items) < take:
            raise CrawlError(f"YouTube 질의 '{query}' 에서 {take}건 중 {len(items)}건만 확보")
        details = youtube.video_details([i["id"]["videoId"] for i in items])
        for item in items:
            seen.add(item["id"]["videoId"])
            records.append(video_record(item, details[item["id"]["videoId"]], category, query))
    return records


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default="Crawling_DB")
    args = parser.parse_args(argv)
    out = Path(args.out)
    now = datetime.now().astimezone()

    records = crawl_blogs() + crawl_videos()  # 하나라도 실패하면 예외 — 아무것도 쓰지 않는다
    created, updated = write_concepts(records, out, now)
    entries = [f"**Creation**: [{cid}](/{cid}.md)" for cid in created] + [f"**Update**: [{cid}](/{cid}.md)" for cid in updated]
    append_log(out, now.date().isoformat(), [f"**Crawl** {now.isoformat()}: {len(created)}건 생성, {len(updated)}건 갱신", *entries])
    write_indexes(out)
    print(f"✅ {len(records)}건 적재 (생성 {len(created)}, 갱신 {len(updated)}) → {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

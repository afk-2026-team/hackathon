from __future__ import annotations

import httpx

from tests.live.conftest import FAKE_ENV

GEOCODE_PATH = "/map-geocode/v2/geocode"
BLOG_PATH = "/search/v1/blog"
SEARCH_PATH = "/youtube/v3/search"
VIDEOS_PATH = "/youtube/v3/videos"
FX_PATH = "/v1/latest"


def _no_secret(text: str) -> None:
    for name in ("NAVER_MAPS_CLIENT_SECRET", "NAVER_CLIENT_SECRET", "YOUTUBE_API_KEY", "NAVER_CLIENT_ID"):
        assert FAKE_ENV[name] not in text


# --- maps/config ---


def test_maps_config_enabled_exposes_only_public_id(client, live_env):
    r = client.get("/v1/maps/config")
    assert r.status_code == 200
    assert r.json() == {"provider": "naver", "enabled": True, "client_id": "test-maps-id"}
    _no_secret(r.text)


def test_maps_config_disabled_without_key(client):
    r = client.get("/v1/maps/config")
    assert r.status_code == 200
    assert r.json() == {"provider": "naver", "enabled": False, "client_id": None}


# --- maps/geocode ---

GEOCODE_BODY = {
    "status": "OK",
    "addresses": [
        {
            "roadAddress": "서울특별시 중구 한강대로 405",
            "jibunAddress": "서울특별시 중구 봉래동2가 122",
            "englishAddress": "405 Hangang-daero, Jung-gu, Seoul",
            "x": "126.9706",
            "y": "37.5547",
        },
        {"roadAddress": "", "jibunAddress": "지번만 있는 주소", "englishAddress": "", "x": "127.0", "y": "37.0"},
        {"roadAddress": "좌표 없음", "x": "", "y": None},
    ],
}


def test_geocode_maps_x_to_lng_and_y_to_lat(client, live_env, upstream):
    upstream.on(GEOCODE_PATH, lambda req: httpx.Response(200, json=GEOCODE_BODY))
    r = client.get("/v1/maps/geocode", params={"query": "서울특별시 중구 한강대로 405"})
    assert r.status_code == 200
    body = r.json()
    assert body["provenance"] == "naver_maps_geocode" and body["fetched_at"]
    first, second = body["results"][0], body["results"][1]
    assert (first["lat"], first["lng"]) == (37.5547, 126.9706)
    assert first["address"] == "서울특별시 중구 한강대로 405"
    assert first["english_address"] == "405 Hangang-daero, Jung-gu, Seoul"
    assert second["address"] == "지번만 있는 주소" and second["road_address"] is None
    assert len(body["results"]) == 2  # 좌표 없는 항목은 버린다
    req = upstream.calls[0]
    assert req.headers["x-ncp-apigw-api-key-id"] == "test-maps-id"
    assert req.headers["x-ncp-apigw-api-key"] == FAKE_ENV["NAVER_MAPS_CLIENT_SECRET"]
    _no_secret(r.text)


def test_geocode_is_cached_in_memory(client, live_env, upstream):
    upstream.on(GEOCODE_PATH, lambda req: httpx.Response(200, json=GEOCODE_BODY))
    for _ in range(2):
        assert client.get("/v1/maps/geocode", params={"query": "Seoul Station"}).status_code == 200
    assert upstream.count(GEOCODE_PATH) == 1


def test_geocode_503_without_keys(client, upstream):
    r = client.get("/v1/maps/geocode", params={"query": "Seoul Station"})
    assert r.status_code == 503
    assert "--services naver_maps" in r.json()["error"]["message"]
    assert upstream.calls == []


def test_geocode_502_hides_upstream_body(client, live_env, upstream):
    upstream.on(GEOCODE_PATH, lambda req: httpx.Response(403, json={"error": "secret-ish detail"}))
    r = client.get("/v1/maps/geocode", params={"query": "Seoul Station"})
    assert r.status_code == 502
    msg = r.json()["error"]["message"]
    assert "403" in msg and "secret-ish" not in msg and "ntruss" not in msg


def test_geocode_502_on_timeout(client, live_env, upstream):
    def boom(req):
        raise httpx.ReadTimeout("timeout", request=req)

    upstream.on(GEOCODE_PATH, boom)
    assert client.get("/v1/maps/geocode", params={"query": "Seoul Station"}).status_code == 502


def test_geocode_422_on_short_query(client, live_env):
    r = client.get("/v1/maps/geocode", params={"query": "a"})
    assert r.status_code == 422
    assert r.json()["error"]["param"] == "query.query"


# --- evidence/blog ---

BLOG_BODY = {
    "total": 1234,
    "items": [
        {
            "title": "<b>올리브영</b> 명동 &amp; 쇼핑 &quot;후기&quot;",
            "link": "https://blog.example.test/post/1",
            "description": "세럼 <b>추천</b> &lt;3",
            "bloggername": "뷰티러버",
            "postdate": "20261020",
        },
        {"title": "날짜 이상", "link": "https://blog.example.test/post/2", "description": "", "bloggername": "", "postdate": "2026-10"},
    ],
}


def test_blog_strips_tags_unescapes_and_formats_date(client, live_env, upstream):
    upstream.on(BLOG_PATH, lambda req: httpx.Response(200, json=BLOG_BODY))
    r = client.get("/v1/evidence/blog", params={"query": "올리브영 명동"})
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 1234 and body["provenance"] == "naver_api_hub_blog_search"
    first, second = body["items"]
    assert first == {
        "title": '올리브영 명동 & 쇼핑 "후기"',
        "url": "https://blog.example.test/post/1",
        "excerpt": "세럼 추천 <3",
        "author": "뷰티러버",
        "posted_on": "2026-10-20",
        "sponsorship": "unknown",
    }
    assert second["posted_on"] is None and second["author"] is None
    req = upstream.calls[0]
    assert req.url.host == "hub.example.test"
    assert req.url.params["display"] == "6" and req.url.params["sort"] == "sim"
    assert req.headers["x-ncp-apigw-api-key-id"] == "test-hub-id"
    _no_secret(r.text)


def test_blog_has_no_cache(client, live_env, upstream):
    upstream.on(BLOG_PATH, lambda req: httpx.Response(200, json=BLOG_BODY))
    for _ in range(2):
        assert client.get("/v1/evidence/blog", params={"query": "olive young"}).status_code == 200
    assert upstream.count(BLOG_PATH) == 2


def test_blog_503_and_422(client, upstream):
    r = client.get("/v1/evidence/blog", params={"query": "olive young"})
    assert r.status_code == 503 and "--services naver" in r.json()["error"]["message"]
    assert client.get("/v1/evidence/blog", params={"query": "olive", "display": 21}).status_code == 422


def test_blog_502(client, live_env, upstream):
    upstream.on(BLOG_PATH, lambda req: httpx.Response(401, text="unauthorized"))
    r = client.get("/v1/evidence/blog", params={"query": "olive young"})
    assert r.status_code == 502 and "401" in r.json()["error"]["message"]


# --- evidence/videos ---


def _search_body(ids):
    return {
        "items": [
            {
                "id": {"kind": "youtube#video", "videoId": vid},
                "snippet": {
                    "title": f"K-beauty &amp; haul {vid}",
                    "channelTitle": "Channel",
                    "publishedAt": "2026-10-01T00:00:00Z",
                    "thumbnails": {"medium": {"url": f"https://i.example.test/{vid}/m.jpg"}, "default": {"url": "d"}},
                },
            }
            for vid in ids
        ]
    }


def _videos_body(paid_ids, all_ids):
    return {"items": [{"id": v, "paidProductPlacementDetails": {"hasPaidProductPlacement": v in paid_ids}} for v in all_ids]}


def test_videos_maps_paid_placement(client, live_env, upstream):
    upstream.on(SEARCH_PATH, lambda req: httpx.Response(200, json=_search_body(["aaa", "bbb"])))
    upstream.on(VIDEOS_PATH, lambda req: httpx.Response(200, json=_videos_body({"aaa"}, ["aaa", "bbb"])))
    r = client.get("/v1/evidence/videos", params={"query": "korean skincare"})
    assert r.status_code == 200
    body = r.json()
    assert body["cached"] is False and body["provenance"] == "youtube_data_api_search"
    a, b = body["items"]
    assert a["sponsorship"] == "sponsored" and a["sponsorship_source"] == "youtube_paid_product_placement"
    assert b["sponsorship"] == "unknown" and b["sponsorship_source"] is None
    assert a["title"] == "K-beauty & haul aaa"
    assert a["thumbnail_url"] == "https://i.example.test/aaa/m.jpg"
    assert a["url"] == "https://www.youtube.com/watch?v=aaa"
    assert a["embed_url"] == "https://www.youtube.com/embed/aaa"
    search_req = next(c for c in upstream.calls if c.url.path == SEARCH_PATH)
    params = search_req.url.params
    assert params["type"] == "video" and params["videoDuration"] == "short" and params["relevanceLanguage"] == "en"
    assert params["maxResults"] == "6" and params["safeSearch"] == "moderate"
    assert "key" not in params  # 키는 URL 이 아닌 헤더로
    assert search_req.headers["x-goog-api-key"] == FAKE_ENV["YOUTUBE_API_KEY"]
    videos_req = next(c for c in upstream.calls if c.url.path == VIDEOS_PATH)
    assert videos_req.url.params["id"] == "aaa,bbb"
    _no_secret(r.text)


def test_videos_list_failure_leaves_unknown_and_skips_cache(client, live_env, upstream):
    upstream.on(SEARCH_PATH, lambda req: httpx.Response(200, json=_search_body(["aaa"])))
    upstream.on(VIDEOS_PATH, lambda req: httpx.Response(500, text="err"))
    for _ in range(2):
        r = client.get("/v1/evidence/videos", params={"query": "korean skincare"})
        assert r.status_code == 200
        assert [i["sponsorship"] for i in r.json()["items"]] == ["unknown"]
        assert r.json()["cached"] is False
    assert upstream.count(SEARCH_PATH) == 2


def test_videos_cache_hit(client, live_env, upstream):
    upstream.on(SEARCH_PATH, lambda req: httpx.Response(200, json=_search_body(["aaa"])))
    upstream.on(VIDEOS_PATH, lambda req: httpx.Response(200, json=_videos_body(set(), ["aaa"])))
    first = client.get("/v1/evidence/videos", params={"query": "Korean Skincare", "lang": "ko", "max": 3})
    second = client.get("/v1/evidence/videos", params={"query": "  korean skincare ", "lang": "ko", "max": 3})
    assert first.json()["cached"] is False
    assert second.status_code == 200 and second.json()["cached"] is True
    assert second.json()["items"] == first.json()["items"]
    assert upstream.count(SEARCH_PATH) == 1
    other = client.get("/v1/evidence/videos", params={"query": "korean skincare", "lang": "en", "max": 3})
    assert other.json()["cached"] is False


def test_videos_503_422_502(client, live_env, upstream, monkeypatch):
    assert client.get("/v1/evidence/videos", params={"query": "kb", "lang": "ja"}).status_code == 422
    assert client.get("/v1/evidence/videos", params={"query": "kb", "max": 11}).status_code == 422
    upstream.on(SEARCH_PATH, lambda req: httpx.Response(403, json={"error": {"message": f"bad key {req.headers.get('x-goog-api-key')}"}}))
    r = client.get("/v1/evidence/videos", params={"query": "korean skincare"})
    assert r.status_code == 502
    _no_secret(r.text)
    monkeypatch.delenv("YOUTUBE_API_KEY")
    r = client.get("/v1/evidence/videos", params={"query": "korean skincare"})
    assert r.status_code == 503 and "--services youtube" in r.json()["error"]["message"]


# --- fx ---

ECB_BODY = {"amount": 1.0, "base": "EUR", "date": "2026-10-23", "rates": {"KRW": 1500.0, "USD": 1.2, "JPY": 180.0}}


def test_fx_returns_per_krw_rates_without_keys(client, upstream):
    upstream.on(FX_PATH, lambda req: httpx.Response(200, json=ECB_BODY))
    r = client.get("/v1/fx", params={"base": "KRW"})
    assert r.status_code == 200
    body = r.json()
    assert body["base"] == "KRW" and body["date"] == "2026-10-23"
    assert body["rates"] == {"EUR": 0.000666667, "JPY": 0.12, "USD": 0.0008}
    assert "KRW" not in body["rates"]
    assert body["source"]["label"].startswith("European Central Bank")
    assert body["source"]["url"].startswith("https://www.ecb.europa.eu/")


def test_fx_cached(client, upstream):
    upstream.on(FX_PATH, lambda req: httpx.Response(200, json=ECB_BODY))
    for _ in range(2):
        assert client.get("/v1/fx").status_code == 200
    assert upstream.count(FX_PATH) == 1


def test_fx_rejects_other_base(client, upstream):
    r = client.get("/v1/fx", params={"base": "USD"})
    assert r.status_code == 422 and r.json()["error"]["param"] == "query.base"
    assert upstream.calls == []


def test_fx_502_on_bad_payload(client, upstream):
    upstream.on(FX_PATH, lambda req: httpx.Response(200, json={"base": "EUR", "date": "2026-10-23", "rates": {"USD": 1.2}}))
    assert client.get("/v1/fx").status_code == 502


def test_access_log_redacts_geocode_query():
    import logging

    from app.discovery_server import _RedactQueryFilter

    rec = logging.LogRecord("uvicorn.access", logging.INFO, __file__, 1, '%s - "%s %s HTTP/%s" %d', ("127.0.0.1:1", "GET", "/v1/maps/geocode?query=home", "1.1", 200), None)
    assert _RedactQueryFilter().filter(rec) is True
    assert "home" not in rec.getMessage() and "/v1/maps/geocode?<redacted>" in rec.getMessage()
    other = logging.LogRecord("uvicorn.access", logging.INFO, __file__, 1, '%s - "%s %s HTTP/%s" %d', ("127.0.0.1:1", "GET", "/v1/fx?base=KRW", "1.1", 200), None)
    _RedactQueryFilter().filter(other)
    assert "base=KRW" in other.getMessage()

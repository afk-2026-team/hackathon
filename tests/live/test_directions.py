from __future__ import annotations

import httpx

from tests.live.conftest import FAKE_ENV

DIRECTIONS_PATH = "/map-direction/v1/driving"
START, GOAL = "126.9706,37.5547", "127.0276,37.4979"

# 테스트 전용 합성 응답(provenance=test_fixture). 실제 NAVER 응답이 아니다.
ROUTE_BODY = {
    "code": 0,
    "message": "ok",
    "route": {
        "trafast": [
            {
                "summary": {"distance": 12345, "duration": 1834567},
                "path": [[126.9706, 37.5547], [127.0, 37.52], [127.0276, 37.4979]],
            }
        ]
    },
}


def test_directions_maps_summary_and_path(client, live_env, upstream):
    upstream.on(DIRECTIONS_PATH, lambda req: httpx.Response(200, json=ROUTE_BODY))
    r = client.get("/v1/maps/directions", params={"start": START, "goal": GOAL, "waypoints": "126.978,37.5665|127.0016,37.5509"})
    assert r.status_code == 200
    body = r.json()
    assert body["provenance"] == "naver_maps_directions" and body["fetched_at"]
    assert body["option"] == "trafast"
    assert body["distance_m"] == 12345 and body["duration_s"] == 1835  # ms → s
    assert body["path"][0] == [126.9706, 37.5547] and len(body["path"]) == 3
    req = upstream.calls[0]
    assert req.url.host == "maps.apigw.ntruss.com"
    assert req.url.params["start"] == START and req.url.params["goal"] == GOAL
    assert req.url.params["waypoints"] == "126.978,37.5665|127.0016,37.5509"
    assert req.headers["x-ncp-apigw-api-key-id"] == "test-maps-id"
    assert FAKE_ENV["NAVER_MAPS_CLIENT_SECRET"] not in r.text


def test_directions_cached_for_same_query(client, live_env, upstream):
    upstream.on(DIRECTIONS_PATH, lambda req: httpx.Response(200, json=ROUTE_BODY))
    for _ in range(2):
        assert client.get("/v1/maps/directions", params={"start": START, "goal": GOAL}).status_code == 200
    assert upstream.count(DIRECTIONS_PATH) == 1


def test_directions_403_reports_not_enabled_501(client, live_env, upstream):
    upstream.on(DIRECTIONS_PATH, lambda req: httpx.Response(403, json={"error": "secret-ish"}))
    r = client.get("/v1/maps/directions", params={"start": START, "goal": GOAL})
    assert r.status_code == 501
    msg = r.json()["error"]["message"]
    assert "Directions 5" in msg and "secret-ish" not in msg and "ntruss" not in msg


def test_directions_401_also_not_enabled(client, live_env, upstream):
    upstream.on(DIRECTIONS_PATH, lambda req: httpx.Response(401, json={"error": {"errorCode": "210"}}))
    assert client.get("/v1/maps/directions", params={"start": START, "goal": GOAL}).status_code == 501


def test_directions_no_route_and_500_are_502(client, live_env, upstream):
    upstream.on(DIRECTIONS_PATH, lambda req: httpx.Response(200, json={"code": 1, "message": "same start/goal"}))
    assert client.get("/v1/maps/directions", params={"start": START, "goal": GOAL}).status_code == 502
    upstream.on(DIRECTIONS_PATH, lambda req: httpx.Response(500, text="err"))
    assert client.get("/v1/maps/directions", params={"start": GOAL, "goal": START}).status_code == 502


def test_directions_503_without_keys(client, upstream):
    r = client.get("/v1/maps/directions", params={"start": START, "goal": GOAL})
    assert r.status_code == 503
    assert "--services naver_maps" in r.json()["error"]["message"]
    assert upstream.calls == []


def test_directions_422_on_bad_input(client, live_env, upstream):
    assert client.get("/v1/maps/directions", params={"start": "37.55,abc", "goal": GOAL}).status_code == 422
    assert client.get("/v1/maps/directions", params={"goal": GOAL}).status_code == 422
    assert client.get("/v1/maps/directions", params={"start": START, "goal": GOAL, "option": "fastest"}).status_code == 422
    six = "|".join([START] * 6)
    assert client.get("/v1/maps/directions", params={"start": START, "goal": GOAL, "waypoints": six}).status_code == 422
    # 위도·경도 순서를 바꾸면(대한민국 밖) 거부한다
    assert client.get("/v1/maps/directions", params={"start": "37.5547,126.9706", "goal": GOAL}).status_code == 422
    assert upstream.calls == []

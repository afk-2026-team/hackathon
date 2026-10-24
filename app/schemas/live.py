from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# 계약 정본: docs/plan/plan_26102414_화해_강남언니_통합_프론트.md §4 "공통 API 계약"
# 필드 추가·rename 은 계약 변경이다 — 화면 담당(E·F)과 PM 에 먼저 알린다.


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


# --- 지도 (NAVER Maps) ---


class MapsConfig(_Strict):
    provider: Literal["naver"] = "naver"
    enabled: bool
    client_id: str | None  # 도메인 제한 공개 식별자(JS ncpKeyId). 비밀키는 이 모델에 필드가 없다


class GeocodeResult(_Strict):
    address: str | None  # road_address → jibun_address 순으로 있는 값
    road_address: str | None
    jibun_address: str | None
    english_address: str | None
    lat: float
    lng: float


class GeocodeResponse(_Strict):
    query: str
    results: list[GeocodeResult]
    provenance: Literal["naver_maps_geocode"] = "naver_maps_geocode"
    fetched_at: str


class DirectionsResponse(_Strict):
    """NAVER Directions 5(driving) 경로. 수치는 이 응답일 때만 화면에 보인다(추정 금지)."""

    option: Literal["trafast", "tracomfort", "traoptimal"]
    distance_m: int
    duration_s: int
    path: list[list[float]]  # [[lng, lat], ...] (NAVER 원 순서 그대로)
    provenance: Literal["naver_maps_directions"] = "naver_maps_directions"
    fetched_at: str


# --- 근거 (블로그·숏폼) ---


class BlogItem(_Strict):
    title: str
    url: str
    excerpt: str
    author: str | None
    posted_on: str | None  # YYYY-MM-DD, 파싱 불가면 null
    sponsorship: Literal["unknown"] = "unknown"  # 협찬 판별 휴리스틱 금지 — 항상 unknown


class BlogResponse(_Strict):
    query: str
    total: int
    items: list[BlogItem]
    provenance: Literal["naver_api_hub_blog_search"] = "naver_api_hub_blog_search"
    fetched_at: str


class VideoItem(_Strict):
    video_id: str
    title: str
    channel: str | None
    published_at: str | None
    thumbnail_url: str | None
    url: str
    embed_url: str
    sponsorship: Literal["sponsored", "unknown"]  # 미신고를 비협찬으로 단정하지 않는다
    sponsorship_source: Literal["youtube_paid_product_placement"] | None


class VideoResponse(_Strict):
    query: str
    items: list[VideoItem]
    provenance: Literal["youtube_data_api_search"] = "youtube_data_api_search"
    fetched_at: str
    cached: bool


# --- 환율 (ECB 기준율) ---


class FxSource(_Strict):
    label: str
    url: str


class FxResponse(_Strict):
    base: Literal["KRW"] = "KRW"
    date: str  # ECB 기준일
    rates: dict[str, float] = Field(default_factory=dict)  # 1 KRW 당 금액. ECB 가 주지 않는 통화는 없다
    source: FxSource
    fetched_at: str

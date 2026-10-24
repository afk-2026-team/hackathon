from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# 계약 정본: docs/plan/plan_26102413_42_12_온보딩부터_앱구현.md "공통 API 계약"
# 필드 추가·rename 은 계약 변경이다 — 화면·데이터 worker 와 컨트롤러에 먼저 알린다.

Category = Literal["beauty", "medical"]
Sponsorship = Literal["sponsored", "not_sponsored", "unknown"]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Source(_Strict):
    label: str = Field(min_length=1)
    url: str = Field(pattern=r"^https?://\S+$")  # 원문 링크를 정규화하지 않고 그대로 돌려준다
    checked_at: str = Field(min_length=1)


class Location(_Strict):
    name: str = Field(min_length=1)
    lat: float | None = None
    lng: float | None = None
    address: str | None = None


class CatalogItem(_Strict):
    id: str = Field(min_length=1)
    kind: Literal["product", "place", "guide"]
    category: Category
    title: str = Field(min_length=1)
    subtitle: str
    description: str
    image_url: str | None
    price_krw: float | None = Field(ge=0)
    location: Location | None
    sources: list[Source] = Field(min_length=1)  # 근거 없는 후보는 카탈로그에 들어오지 못한다
    sponsorship: Sponsorship
    reasons: list[str]
    country_codes: list[str]  # 이 국가 맥락을 뒷받침하는 출처가 sources 에 있을 때만 적는다
    tags: list[str]
    provenance: str = Field(min_length=1)


class Catalog(_Strict):
    items: list[CatalogItem]


class Preferences(_Strict):
    interests: list[str] | None = None
    budget_krw: float | None = Field(default=None, ge=0)
    current_product: str | None = Field(default=None, max_length=200)


class Profile(_Strict):
    country: str = Field(pattern=r"^[A-Za-z]{2}$")  # ISO 3166-1 alpha-2
    language: str = Field(min_length=2, max_length=35)  # BCP 47 태그
    currency: str = Field(pattern=r"^[A-Za-z]{3}$")  # ISO 4217
    # 성별·연령대는 화면 개인화용으로만 받는다. 추천·의료 적합성 계산에 쓰지 않는다(plan 계약).
    gender: str | None = None
    age_range: str | None = None
    preferences: Preferences | None = None


class RecommendationRequest(_Strict):
    profile: Profile
    category: Literal["all", "beauty", "medical"] = "all"


class CountryContext(_Strict):
    country: str
    status: Literal["supported", "insufficient"]
    explanation: str


class RecommendationResponse(_Strict):
    items: list[CatalogItem]
    country_context: CountryContext
    generated_at: str

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

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


class PriceFact(_Strict):
    amount: float = Field(ge=0)
    currency: str = Field(pattern=r"^[A-Z]{3}$")
    basis: str = Field(min_length=1)  # 어떤 페이지의 어떤 값인지(용량 미표기 등 한계 포함)
    source: Source


class CatalogItem(_Strict):
    id: str = Field(min_length=1)
    kind: Literal["product", "place", "guide"]
    category: Category
    title: str = Field(min_length=1)
    subtitle: str
    description: str
    image_url: str | None
    price_krw: float | None = Field(ge=0)
    # 원화 가격을 확인하지 못했을 때 판매처에 표시된 다른 통화 가격(예: 해외 판매처 USD). 환산해 price_krw 에 넣지 않는다.
    list_price: PriceFact | None = None
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


# ── 제품 비교 (current product vs 한국 후보) ──
# 표시사항(성분 표기·용량·표시 가격)만 비교한다. 효능·임상 동등성은 이 계약에 담을 자리가 없다.

CompareAttribute = Literal["key_ingredients", "volume_ml", "form"]


class ReferenceProduct(_Strict):
    """사용자가 '지금 쓰는 제품'으로 고르는 해외 제품. 공식 페이지에서 확인한 값만 둔다."""

    id: str = Field(min_length=1)
    brand: str = Field(min_length=1)
    title: str = Field(min_length=1)
    form: str | None
    volume_ml: float | None = Field(ge=0)
    key_ingredients: list[str] | None
    ingredients_complete: bool  # false 면 목록에 없는 성분을 '없음'으로 말하지 않는다
    ingredients_basis: str
    price: PriceFact | None
    market_codes: list[str] = Field(default_factory=list)  # 출처 페이지가 그 국가 공식 페이지일 때만
    sources: list[Source] = Field(min_length=1)
    provenance: str = Field(min_length=1)


class ReferenceCatalog(_Strict):
    items: list[ReferenceProduct]


class ProductFacts(_Strict):
    """카탈로그 후보의 비교용 표시사항. 카탈로그 id 와 1:1, 없으면 모두 미확인."""

    id: str = Field(min_length=1)
    form: str | None
    volume_ml: float | None = Field(ge=0)
    key_ingredients: list[str] | None
    ingredients_complete: bool
    ingredients_basis: str
    price_basis: str | None = None
    price_source: Source | None = None
    sources: list[Source]
    provenance: str = Field(min_length=1)


class ProductFactsCatalog(_Strict):
    items: list[ProductFacts]


class CompareRequest(_Strict):
    profile: Profile
    candidate_id: str = Field(min_length=1, max_length=200)
    current_product_id: str | None = Field(default=None, min_length=1, max_length=200)
    current_product_name: str | None = Field(default=None, min_length=1, max_length=200)

    @model_validator(mode="after")
    def _needs_current(self) -> "CompareRequest":
        if self.current_product_id is None and self.current_product_name is None:
            raise ValueError("current_product_id or current_product_name is required")
        return self


class CandidateFacts(_Strict):
    id: str
    title: str
    form: str | None
    volume_ml: float | None
    key_ingredients: list[str] | None
    ingredients_complete: bool
    ingredients_basis: str
    price: PriceFact | None
    sources: list[Source]


class ComparePoint(_Strict):
    attribute: CompareAttribute
    current: str | float | list[str] | None
    candidate: str | float | list[str] | None
    basis: str
    sources: list[Source]


class PriceComparison(_Strict):
    current: PriceFact | None
    candidate: PriceFact | None
    comparable: bool  # 같은 통화·같은 용량 근거가 있을 때만 true. 환율 환산은 하지 않는다
    note: str


class CompareResponse(_Strict):
    current: ReferenceProduct | None
    current_status: Literal["matched", "unknown"]
    candidate: CandidateFacts
    common: list[ComparePoint]
    differences: list[ComparePoint]
    unverified: list[ComparePoint]
    price: PriceComparison
    country_context: CountryContext
    notice: str
    generated_at: str


# ── 비교 설명 (LLM 요약, 실패 시 사실 문장) ──


class ExplainResponse(_Strict):
    text: str
    mode: Literal["llm", "fallback"]
    fallback_reason: Literal["llm_unavailable", "timeout", "validation_failed", "llm_error"] | None
    sources: list[Source]
    notice: str
    generated_at: str

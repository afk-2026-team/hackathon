// plan_26102413_42_12 공통 API 계약을 그대로 옮긴 타입.
export type Category = 'beauty' | 'medical'
export type CategoryFilter = 'all' | Category
export type Sponsorship = 'sponsored' | 'not_sponsored' | 'unknown'

export interface Source {
  label: string
  url: string
  checked_at: string
}

export interface ItemLocation {
  name: string
  lat?: number
  lng?: number
  address?: string
}

// 판매처에 표시된 가격(통화 그대로). 원화 가격이 없을 때 쓰며 환산값이 아니다.
export interface ListPrice {
  amount: number
  currency: string
  basis: string
  source: Source
}

export interface CatalogItem {
  id: string
  kind: 'product' | 'place' | 'guide'
  category: Category
  title: string
  subtitle: string
  description: string
  image_url: string | null
  price_krw: number | null
  list_price?: ListPrice | null
  location: ItemLocation | null
  sources: Source[]
  sponsorship: Sponsorship
  reasons: string[]
  country_codes: string[]
  tags: string[]
  provenance: string
}

export interface Preferences {
  interests?: string[]
  budget_krw?: number
  current_product?: string
}

export interface ProfilePayload {
  country: string
  language: string
  currency: string
  gender?: string
  age_range?: string
  preferences?: Preferences
}

export interface CountryContext {
  country: string
  status: 'supported' | 'insufficient'
  explanation: string
}

export interface RecommendationResponse {
  items: CatalogItem[]
  country_context: CountryContext
  generated_at: string
}

// ── 실키 연동 응답 (docs/plan/plan_26102414_화해_강남언니_통합_프론트.md §4 공통 API 계약) ──

export interface MapsConfig {
  provider: 'naver'
  enabled: boolean
  client_id: string | null // 도메인 제한 공개 식별자(JS ncpKeyId). 비밀키는 오지 않는다.
}

export interface GeocodeResult {
  address: string | null // 도로명 → 지번 순으로 있는 값(둘 다 없으면 null)
  road_address: string | null
  jibun_address: string | null
  english_address: string | null
  lat: number
  lng: number
}

export interface GeocodeResponse {
  query: string
  results: GeocodeResult[]
  provenance: 'naver_maps_geocode'
  fetched_at: string
}

export interface BlogReview {
  title: string
  url: string
  excerpt: string
  author: string
  posted_on: string | null
  sponsorship: 'unknown' // 블로그 협찬 여부는 판별하지 않는다
}

export interface BlogResponse {
  query: string
  total: number
  items: BlogReview[]
  provenance: 'naver_api_hub_blog_search'
  fetched_at: string
}

export interface VideoEvidence {
  video_id: string
  title: string
  channel: string
  published_at: string
  thumbnail_url: string
  url: string
  embed_url: string
  sponsorship: 'sponsored' | 'unknown' // 크리에이터가 유료 광고를 신고한 경우만 sponsored
  sponsorship_source: 'youtube_paid_product_placement' | null
}

export interface VideosResponse {
  query: string
  items: VideoEvidence[]
  provenance: 'youtube_data_api_search'
  fetched_at: string
  cached: boolean
}

export interface FxResponse {
  base: 'KRW'
  date: string
  rates: Record<string, number> // 1 KRW 당 해당 통화 금액
  source: { label: string; url: string }
  fetched_at: string // 응답에 없는 통화는 환율 출처가 없는 것 → 원화만 표시
}

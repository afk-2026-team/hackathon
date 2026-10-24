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

export interface CatalogItem {
  id: string
  kind: 'product' | 'place' | 'guide'
  category: Category
  title: string
  subtitle: string
  description: string
  image_url: string | null
  price_krw: number | null
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

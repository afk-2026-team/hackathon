import type {
  BlogResponse, CatalogItem, CategoryFilter, DirectionsOption, DirectionsResponse, FxResponse, GeocodeResponse, MapsConfig, ProfilePayload,
  RecommendationResponse, VideosResponse,
} from './types'
import type { CompareResponse, ExplainResponse, ReferenceProduct } from './compare'

// status 는 HTTP 상태(네트워크·파싱 실패는 0). 503 은 서버에 해당 키가 주입되지 않은 상태다.
// message 는 화면에 그대로 보여 줄 사용자 문구(상태 코드·내부 원인 없음, INTEGRATION_SPEC §3). 서버 원문은 detail 에만 둔다.
export class ApiError extends Error {
  constructor(message: string, readonly status = 0, readonly detail = '') {
    super(message)
  }
}

export function userMessageFor(status: number): string {
  if (status === 503) return "This feature isn't available right now."
  if (status === 404) return "We couldn't find that."
  if (status === 422 || status === 400) return 'Something in this request looks off. Please check and try again.'
  return "This couldn't be loaded right now. Please try again."
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...init })
  } catch {
    throw new ApiError("We couldn't reach the server. Check your connection and try again.")
  }
  if (!res.ok) {
    let detail = ''
    try {
      const body = (await res.json()) as { error?: { message?: string } }
      detail = body?.error?.message ?? ''
    } catch {
      /* 오류 본문이 JSON 이 아니면 상태 코드만 쓴다 */
    }
    throw new ApiError(userMessageFor(res.status), res.status, detail)
  }
  try {
    return (await res.json()) as T
  } catch {
    throw new ApiError('The server sent a response we could not read.')
  }
}

// 사용자 맥락은 URL 이 아니라 POST 본문으로만 보낸다.
export function fetchRecommendations(profile: ProfilePayload, category: CategoryFilter = 'all') {
  return request<RecommendationResponse>('/v1/discovery/recommendations', {
    method: 'POST',
    body: JSON.stringify({ profile, category }),
  })
}

// lang 은 화면 언어. 서버가 해당 언어의 설명·근거 문장을 돌려준다(ko 외에는 영어).
export function fetchCatalog(lang = 'en') {
  return request<{ items: CatalogItem[] }>(`/v1/discovery/catalog?lang=${encodeURIComponent(lang)}`)
}

// ── 제품 비교·설명(discovery). ──
type CompareBody = { profile: ProfilePayload; candidate_id: string; current_product_id?: string; current_product_name?: string }

export function fetchReferenceProducts() {
  return request<{ items: ReferenceProduct[] }>('/v1/discovery/reference-products')
}

export function fetchCompare(body: CompareBody) {
  return request<CompareResponse>('/v1/discovery/compare', { method: 'POST', body: JSON.stringify(body) })
}

export function fetchExplain(body: CompareBody) {
  return request<ExplainResponse>('/v1/discovery/explain', { method: 'POST', body: JSON.stringify(body) })
}

// ── 실키 연동(서버 프록시). 키는 서버에만 있고 브라우저는 결과만 받는다. ──
const q = (params: Record<string, string | number>) =>
  Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')

export const fetchMapsConfig = () => request<MapsConfig>('/v1/maps/config')
export const geocode = (query: string) => request<GeocodeResponse>(`/v1/maps/geocode?${q({ query })}`)
// 자동차 경로(서버 → NAVER Directions 5). 501 = 콘솔에서 Directions 미활성, 503 = 서버에 지도 키 없음.
type LngLat = { lat: number; lng: number }
const ll = (p: LngLat) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`
export const fetchDirections = (start: LngLat, goal: LngLat, waypoints: LngLat[] = [], option: DirectionsOption = 'trafast') =>
  request<DirectionsResponse>(
    `/v1/maps/directions?${q({ start: ll(start), goal: ll(goal), option, ...(waypoints.length ? { waypoints: waypoints.map(ll).join('|') } : {}) })}`,
  )
export const fetchBlogReviews = (query: string, display = 6) => request<BlogResponse>(`/v1/evidence/blog?${q({ query, display })}`)
export const fetchVideos = (query: string, lang: 'en' | 'ko' = 'en', max = 6) =>
  request<VideosResponse>(`/v1/evidence/videos?${q({ query, lang, max })}`)
export const fetchFx = () => request<FxResponse>('/v1/fx?base=KRW')

// ── My Trip 방문 순서 제안(POST /v1/trips/plan). 근접 순서 휴리스틱이며 최적 경로·소요 시간이 아니다. ──
export interface TripPlanStop {
  order: number
  item_id: string
  title: string
  address: string | null
  lat: number
  lng: number
  location_source: 'catalog' | 'geocode'
  distance_from_previous_m: number | null
  map_links: { naver_search: string; google_directions: string }
}
export interface TripPlanResponse {
  method: 'proximity'
  distance_source: 'straight_line'
  origin: { label: string; lat: number; lng: number; source: 'input' | 'geocode' } | null
  origin_status: 'none' | 'ok' | 'geocode_unavailable' | 'geocode_no_result' | 'geocode_failed'
  stops: TripPlanStop[]
  unlocated: { item_id: string; title: string; reason: 'no_address' | 'geocode_unavailable' | 'geocode_no_result' | 'geocode_failed' }[]
  checklist: { item_id: string; title: string; kind: 'product' | 'guide' }[]
  notes: string[]
  generated_at: string
}
export type TripOriginInput = { address: string } | { lat: number; lng: number }
export const TRIP_PLAN_MAX_ITEMS = 20

export function planTrip(itemIds: string[], origin?: TripOriginInput | null) {
  const ids = [...new Set(itemIds.filter((i) => i && i.trim()))].slice(0, TRIP_PLAN_MAX_ITEMS)
  return request<TripPlanResponse>('/v1/trips/plan', {
    method: 'POST',
    body: JSON.stringify(origin ? { item_ids: ids, origin } : { item_ids: ids }),
  })
}

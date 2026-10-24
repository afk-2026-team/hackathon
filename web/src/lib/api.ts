import type {
  BlogResponse, CatalogItem, CategoryFilter, FxResponse, GeocodeResponse, MapsConfig, ProfilePayload,
  RecommendationResponse, VideosResponse,
} from './types'
import type { CompareResponse, ExplainResponse, ReferenceProduct } from './compare'

// status 는 HTTP 상태(네트워크·파싱 실패는 0). 503 은 서버에 해당 키가 주입되지 않은 상태다.
export class ApiError extends Error {
  constructor(message: string, readonly status = 0) {
    super(message)
  }
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
    throw new ApiError(detail || 'This couldn’t be loaded right now. Please try again.', res.status)
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

export function fetchCatalog() {
  return request<{ items: CatalogItem[] }>('/v1/discovery/catalog')
}

// 제품 비교(지금 쓰는 제품 vs 한국 후보)와 짧은 비교 요약. 계약: app/data/discovery_api_contract.md
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
export const fetchBlogReviews = (query: string, display = 6) => request<BlogResponse>(`/v1/evidence/blog?${q({ query, display })}`)
export const fetchVideos = (query: string, lang: 'en' | 'ko' = 'en', max = 6) =>
  request<VideosResponse>(`/v1/evidence/videos?${q({ query, lang, max })}`)
export const fetchFx = () => request<FxResponse>('/v1/fx?base=KRW')

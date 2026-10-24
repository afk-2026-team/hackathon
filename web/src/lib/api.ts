import type { CatalogItem, CategoryFilter, ProfilePayload, RecommendationResponse } from './types'
import type { CompareResponse, ExplainResponse, ReferenceProduct } from './compare'

export class ApiError extends Error {
  constructor(message: string, readonly status?: number) {
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
  if (!res.ok) throw new ApiError("This couldn’t be loaded right now. Please try again.", res.status)
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

export function fetchReferenceProducts() {
  return request<{ items: ReferenceProduct[] }>('/v1/discovery/reference-products')
}

export function fetchCompare(body: { profile: ProfilePayload; candidate_id: string; current_product_id?: string; current_product_name?: string }) {
  return request<CompareResponse>('/v1/discovery/compare', { method: 'POST', body: JSON.stringify(body) })
}

export function fetchExplain(body: { profile: ProfilePayload; candidate_id: string; current_product_id?: string; current_product_name?: string }) {
  return request<ExplainResponse>('/v1/discovery/explain', { method: 'POST', body: JSON.stringify(body) })
}

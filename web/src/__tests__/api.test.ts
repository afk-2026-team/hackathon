// lib/api.ts 계약: main(compare·explain·reference)·바다(maps·evidence·fx) 함수 보존과 오류 문구 규칙(INTEGRATION_SPEC §3).
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as api from '../lib/api'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const profile = { country: 'US', language: 'en', currency: 'USD' }

afterEach(() => vi.unstubAllGlobals())

describe('lib/api', () => {
  it('exports every function the screens call', () => {
    for (const name of ['fetchRecommendations', 'fetchCatalog', 'fetchReferenceProducts', 'fetchCompare', 'fetchExplain',
      'fetchMapsConfig', 'geocode', 'fetchBlogReviews', 'fetchVideos', 'fetchFx']) {
      expect(typeof (api as Record<string, unknown>)[name]).toBe('function')
    }
  })

  it.each([
    ['fetchRecommendations', () => api.fetchRecommendations(profile, 'beauty'), '/v1/discovery/recommendations', 'POST', { profile, category: 'beauty' }],
    ['fetchCompare', () => api.fetchCompare({ profile, candidate_id: 'c1', current_product_id: 'r1' }), '/v1/discovery/compare', 'POST', { profile, candidate_id: 'c1', current_product_id: 'r1' }],
    ['fetchExplain', () => api.fetchExplain({ profile, candidate_id: 'c1', current_product_name: 'X' }), '/v1/discovery/explain', 'POST', { profile, candidate_id: 'c1', current_product_name: 'X' }],
    ['fetchReferenceProducts', () => api.fetchReferenceProducts(), '/v1/discovery/reference-products', undefined, undefined],
    ['fetchVideos', () => api.fetchVideos('ceramide cream', 'ko', 3), '/v1/evidence/videos?query=ceramide%20cream&lang=ko&max=3', undefined, undefined],
    ['fetchFx', () => api.fetchFx(), '/v1/fx?base=KRW', undefined, undefined],
  ])('%s calls the documented route', async (_n, call, url, method, body) => {
    const fetchMock = vi.fn(async () => json({ items: [] }))
    vi.stubGlobal('fetch', fetchMock)
    await call()
    const [u, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit | undefined]
    expect(u).toBe(url)
    expect(init?.method).toBe(method)
    if (body) expect(JSON.parse(init!.body as string)).toEqual(body)
  })

  it('keeps status for branching and hides server internals from the message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: { message: 'NAVER_CLIENT_ID is not configured' } }, 503)))
    const err = await api.fetchBlogReviews('x').catch((e) => e)
    expect(err).toBeInstanceOf(api.ApiError)
    expect(err.status).toBe(503)
    expect(err.detail).toBe('NAVER_CLIENT_ID is not configured')
    expect(err.message).not.toMatch(/NAVER|503/)
  })

  it('reports network failure with status 0', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    await expect(api.fetchCatalog()).rejects.toMatchObject({ status: 0 })
  })
})

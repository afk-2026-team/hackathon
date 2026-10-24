// 공개 데모 보완 연결 테스트. fetch 는 테스트 전용 합성 응답으로 격리한다(실데이터 아님).
import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { cartTotals, refreshCartFromCatalog } from '../lib/cartTotals'
import { reorderDay } from '../lib/tripOrder'
import { TripPlan } from '../components/trip/TripPlan'
import { loadDrivingRoute, resetTripDirections, type MapPoint } from '../components/trip/TripMap'
import { keyFor, loadCart, saveCart, type CartLine, type TripEntry } from '../lib/storage'
import type { CatalogItem } from '../lib/types'

afterEach(() => {
  vi.unstubAllGlobals()
  resetTripDirections()
})
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })
const usd = (amount: number) => ({ amount, currency: 'USD', basis: 'seller listing', source: { label: 'OLIVE YOUNG Global', url: 'https://global.oliveyoung.com/x', checked_at: '2026-10-24' } })

describe('cart prices by original currency', () => {
  const lines: CartLine[] = [
    { item_id: 'k', title: 'K', category: 'beauty', price_krw: 6900, qty: 2 },
    { item_id: 'u', title: 'U', category: 'beauty', price_krw: null, list_price: usd(19.6), qty: 3 },
    { item_id: 'n', title: 'N', category: 'beauty', price_krw: null, qty: 1 },
  ]
  it('keeps KRW and USD subtotals apart and never counts unpriced lines as 0', () => {
    const r = cartTotals(lines)
    expect(r.totals).toEqual([
      { currency: 'KRW', amount: 13800, lines: 1, listed: false },
      { currency: 'USD', amount: expect.closeTo(58.8, 5), lines: 1, listed: true },
    ])
    expect(r.unpriced).toBe(1)
  })
  it('migrates an old saved cart from the catalog without losing quantity, and persists across reload', () => {
    const old = [{ item_id: 'u', title: 'U', category: 'beauty' as const, price_krw: null, qty: 4 }, { item_id: 'gone', title: 'G', category: 'beauty' as const, price_krw: null, qty: 1 }]
    const catalog = new Map([['u', { id: 'u', title: 'U', category: 'beauty', price_krw: null, list_price: usd(10) } as CatalogItem]])
    const r = refreshCartFromCatalog(old, catalog)
    expect(r.changed).toBe(true)
    expect(r.cart[0]).toMatchObject({ qty: 4, list_price: { amount: 10, currency: 'USD' } })
    expect(r.cart[1]).toEqual(old[1]) // 카탈로그에 없어도 지우지 않는다
    saveCart('guest', r.cart)
    expect(loadCart('guest')[0].list_price?.currency).toBe('USD')
    expect(localStorage.getItem(keyFor('guest', 'cart'))).toContain('"qty":4')
  })
})

describe('reorderDay', () => {
  const e = (id: string, day: number): TripEntry => ({ entry_id: `e-${id}`, item_id: id, title: id, category: 'medical', location: null, day })
  it('reorders only the chosen day, keeps other days and leaves unplanned items at the end', () => {
    const trip = [e('a', 1), e('x', 2), e('b', 1), e('c', 1), e('y', 2)]
    const out = reorderDay(trip, 1, ['c', 'a'])
    expect(out.map((x) => x.item_id)).toEqual(['c', 'x', 'a', 'b', 'y'])
    expect(out).toHaveLength(trip.length)
  })
})

describe('TripPlan (POST /v1/trips/plan)', () => {
  const entries: TripEntry[] = ['m1', 'm2', 'm3', 'p1'].map((id) => ({ entry_id: id, item_id: id, title: id, category: 'medical', location: id === 'p1' ? null : { name: id }, day: 1 }))
  it('sends day item ids with the stay as origin, applies the returned order and explains what was kept aside', async () => {
    const plan = {
      method: 'proximity', distance_source: 'straight_line', origin: { label: 'Stay', lat: 37.55, lng: 126.97, source: 'input' }, origin_status: 'ok',
      stops: [{ order: 1, item_id: 'm2', title: 'm2', address: null, lat: 37.5, lng: 127, location_source: 'catalog', distance_from_previous_m: 900, map_links: { naver_search: 'https://map.naver.com', google_directions: 'https://maps.google.com' } },
        { order: 2, item_id: 'm1', title: 'm1', address: null, lat: 37.51, lng: 127.01, location_source: 'geocode', distance_from_previous_m: 500, map_links: { naver_search: 'https://map.naver.com', google_directions: 'https://maps.google.com' } }],
      unlocated: [{ item_id: 'm3', title: 'Clinic 3', reason: 'geocode_no_result' }], checklist: [{ item_id: 'p1', title: 'p1', kind: 'product' }], notes: [], generated_at: 'x',
    }
    const f = vi.fn(async () => json(plan))
    vi.stubGlobal('fetch', f)
    const onApply = vi.fn()
    render(<TripPlan day={1} entries={entries} start={{ lat: 37.55, lng: 126.97 }} onApply={onApply} />)
    expect(screen.getByText(/not an optimized route/)).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Order Day 1 by distance' }))
    expect(await screen.findByText(/Reordered 2 places/)).toBeInTheDocument()
    const body = JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(body).toEqual({ item_ids: ['m1', 'm2', 'm3', 'p1'], origin: { lat: 37.55, lng: 126.97 } })
    expect(onApply).toHaveBeenCalledWith(['m2', 'm1'])
    expect(screen.getByText(/Clinic 3 — address not found/)).toBeInTheDocument()
  })
  it('shows a retry on failure and does not reorder', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })))
    const onApply = vi.fn()
    render(<TripPlan day={1} entries={entries} start={null} onApply={onApply} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Order Day 1 by distance' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(onApply).not.toHaveBeenCalled()
  })
})

describe('driving route (Directions 5 via server)', () => {
  it('splits more than 7 points into legs in order and sums only returned numbers', async () => {
    const f = vi.fn(async (url: string) => {
      const u = new URL(url, 'http://x')
      const n = 2 + (u.searchParams.get('waypoints')?.split('|').length ?? 0)
      return json({ option: 'trafast', distance_m: 1000 * n, duration_s: 60 * n, path: [[127, 37.5], [127.01, 37.51]], provenance: 'naver_maps_directions', fetched_at: 'x' })
    })
    vi.stubGlobal('fetch', f)
    const pts: MapPoint[] = Array.from({ length: 9 }, (_, i) => ({ key: String(i), lat: 37.5 + i * 0.001, lng: 127 + i * 0.001, kind: 'beauty', label: String(i), title: `P${i}` }))
    const r = await loadDrivingRoute(pts)
    expect(f).toHaveBeenCalledTimes(2) // 7점 + (마지막 도착에서 이어) 3점
    const waypointsPerLeg = f.mock.calls.map(([u]) => new URL(String(u), 'http://x').searchParams.get('waypoints')?.split('|').length ?? 0)
    expect(waypointsPerLeg).toEqual([5, 1])
    expect(r).toMatchObject({ legs: 2, distance_m: 7000 + 3000, duration_s: 420 + 180 })
  })
})

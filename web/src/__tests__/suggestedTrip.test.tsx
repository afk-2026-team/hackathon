import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'
import type { Auth } from '../auth/core'
import { keyFor, saveEntry, type TripEntry } from '../lib/storage'
import { resetFxCache } from '../lib/currency'
import { suggestTrip } from '../lib/suggestedTrip'
import type { CatalogItem } from '../lib/types'

const item = (o: Partial<CatalogItem> & Pick<CatalogItem, 'id'>): CatalogItem => ({
  kind: 'place', category: 'beauty', title: o.id, subtitle: '', description: '', image_url: null, price_krw: null, location: null,
  sources: [], sponsorship: 'unknown', reasons: [], country_codes: [], tags: [], provenance: 'test', ...o,
})
const store = item({ id: 'store', title: 'Beauty Store', tags: ['skincare', 'makeup', 'shopping'], location: { name: 'Store', address: '서울특별시 중구 명동길 53' } })
const info = item({ id: 'info', title: 'Tourist Info', tags: ['neighborhoods', 'tourist_info'], location: { name: 'Info', address: '서울특별시 중구 을지로 66' } })
const busan = item({ id: 'busan', title: 'Busan Store', tags: ['skincare'], location: { name: 'B', address: '부산광역시 해운대구 1' } })
const derm = item({ id: 'derm', category: 'medical', title: 'Derm Clinic', tags: ['dermatology', 'seoul'], location: { name: 'Derm', address: '서울 강남구 1', lat: 37.5, lng: 127.03 } })
const dental = item({ id: 'dental', category: 'medical', title: 'Dental Clinic', tags: ['dental', 'seoul'], location: { name: 'Dent', address: '서울 강남구 2', lat: 37.51, lng: 127.02 } })
const cream = item({ id: 'cream', kind: 'product', title: 'Cream', tags: ['skincare'], price_krw: 20000 })
const catalog = [busan, derm, dental, store, info, cream]

describe('suggestTrip (deterministic, catalog-only)', () => {
  it('never adds medical for beauty-only interests, keeps Seoul places and puts products on the checklist', () => {
    const t = suggestTrip({ catalog, interests: ['skincare'] })
    expect(t.map((e) => e.item_id)).toEqual(['store', 'info', 'cream'])
    expect(t.every((e) => e.source === 'suggested' && e.day === 1)).toBe(true)
    expect(t.find((e) => e.item_id === 'cream')!.location).toBeNull() // 체크리스트
    expect(t.some((e) => e.category === 'medical')).toBe(false)
  })

  it('adds one medical place with real coordinates only when a medical interest was chosen', () => {
    const t = suggestTrip({ catalog, interests: ['dental', 'makeup'] })
    const places = t.filter((e) => e.location)
    expect(places.map((e) => e.item_id)).toEqual(['store', 'info', 'dental'])
    expect(places.length).toBeLessThanOrEqual(3)
  })

  it('follows the server ranking but only uses ids that exist in the catalog', () => {
    const t = suggestTrip({ catalog, ranked: [item({ id: 'ghost' }), info, store], interests: [] })
    expect(t.map((e) => e.item_id)).toEqual(['info', 'store', 'cream'])
  })
})

const fakeAuth = () => ({
  initializeAuth: vi.fn(async () => ({ state: 'disabled', reason: 'provider_disabled' })),
  getStatus: () => ({ state: 'disabled', reason: 'provider_disabled' }),
  getSession: vi.fn(async () => null),
  subscribeAuth: vi.fn(() => () => {}),
  signInWithGoogle: vi.fn(async () => ({ error: null })),
  handleAuthCallback: vi.fn(),
  signOut: vi.fn(async () => ({ signedOut: true, error: null })),
  fetchMe: vi.fn(async () => null),
}) as unknown as Auth

function stubApi(recoOk: boolean) {
  const f = vi.fn(async (url: string) => {
    const u = String(url)
    if (u.includes('/v1/discovery/catalog')) return new Response(JSON.stringify({ items: catalog }), { status: 200 })
    if (recoOk && u.includes('/v1/discovery/recommendations'))
      return new Response(JSON.stringify({ items: [info, store], country_context: { country: 'JP', status: 'insufficient', explanation: '' }, generated_at: 'x' }), { status: 200 })
    return new Response(JSON.stringify({ error: { message: 'off' } }), { status: 503 })
  })
  vi.stubGlobal('fetch', f)
  return f
}

function openTrip(trip: TripEntry[] = [], interests?: string[]) {
  localStorage.setItem(keyFor('guest', 'profile'), JSON.stringify({
    version: 1, country: 'JP', language: 'en', currency: 'JPY', tutorial_done: true, preferences: interests ? { interests } : null,
  }))
  if (trip.length) localStorage.setItem(keyFor('guest', 'trip'), JSON.stringify(trip))
  saveEntry('guest')
  window.history.replaceState(null, '', '/#trip')
  return render(<App auth={fakeAuth()} />)
}

const savedTrip = () => JSON.parse(localStorage.getItem(keyFor('guest', 'trip')) ?? '[]') as TripEntry[]

beforeEach(() => {
  resetFxCache()
  window.history.replaceState(null, '', '/')
})

describe('My Trip first visit suggested plan', () => {
  it('shows a labelled, editable suggested plan for a fresh guest instead of an empty screen', async () => {
    stubApi(true)
    openTrip([], ['skincare'])
    expect(await screen.findByTestId('trip-suggested')).toHaveTextContent('Suggested plan')
    expect(await screen.findByRole('button', { name: 'Tourist Info' })).toBeInTheDocument()
    expect(screen.queryByText('Your trip is empty')).toBeNull()
    expect(savedTrip().map((e) => e.item_id)).toEqual(['store', 'info', 'cream']) // 관심사(skincare) 일치가 서버 순서보다 앞선다
    expect(savedTrip().every((e) => e.source === 'suggested')).toBe(true)
    expect(localStorage.getItem(keyFor('guest', 'trip_seeded'))).not.toBeNull()
    expect(screen.getAllByRole('button', { name: /^Remove:/ }).length).toBeGreaterThan(0) // 일반 일정처럼 수정 가능
  })

  it('labels a medical stop as information only when the user chose a medical interest', async () => {
    stubApi(false)
    openTrip([], ['dermatology'])
    const card = (await screen.findByRole('button', { name: 'Derm Clinic' })).closest('.trip-stop__card') as HTMLElement
    expect(within(card).getByText(/not a booking or confirmed visit/)).toBeInTheDocument()
  })

  it('never overwrites an existing trip', async () => {
    stubApi(true)
    const mine: TripEntry = { entry_id: 'mine-1', item_id: 'derm', title: 'Derm Clinic', category: 'medical', location: derm.location, day: 1 }
    openTrip([mine], ['skincare'])
    expect(await screen.findByRole('button', { name: 'Derm Clinic' })).toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 30))
    expect(savedTrip()).toEqual([mine])
    expect(screen.queryByTestId('trip-suggested')).toBeNull()
  })

  it('does not refill after the user removes everything and comes back', async () => {
    stubApi(true)
    const user = userEvent.setup()
    const { unmount } = openTrip([], ['skincare'])
    await screen.findByTestId('trip-suggested')
    for (let n = savedTrip().length; n > 0; n--) await user.click(screen.getAllByRole('button', { name: /^Remove:/ })[0])
    expect(await screen.findByText('Your trip is empty')).toBeInTheDocument()
    unmount()
    window.history.replaceState(null, '', '/#trip')
    render(<App auth={fakeAuth()} />)
    expect(await screen.findByText('Your trip is empty')).toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 30))
    expect(savedTrip()).toEqual([])
  })

  it('falls back to a real catalog course when the recommendation API fails', async () => {
    const f = stubApi(false)
    openTrip()
    expect(await screen.findByTestId('trip-suggested')).toBeInTheDocument()
    expect(f.mock.calls.some(([u]) => String(u).includes('/v1/discovery/recommendations'))).toBe(true)
    expect(savedTrip().map((e) => e.item_id)).toEqual(['store', 'info', 'cream']) // 카탈로그 순서, 의료 없음
  })
})

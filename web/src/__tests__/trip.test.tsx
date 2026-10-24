import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MyTrip, resetTripGeoMemo } from '../screens/MyTrip'
import type { MyTripProps } from '../screens/contracts'
import { keyFor, loadStart, type TripEntry } from '../lib/storage'
import { resetNaverMapsLoader, naverDirectionsUrl } from '../lib/naverMaps'
import { resetFxCache } from '../lib/currency'
import { segmentLink } from '../components/trip/DayPlan'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const fx = { base: 'KRW', date: '2026-10-23', rates: {}, source: { label: 'ECB', url: 'https://x' }, fetched_at: 'x' }

type Routes = { config?: unknown; geocode?: (q: string) => Response }
function mockFetch(r: Routes = {}) {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.startsWith('/v1/maps/config')) return json(r.config ?? { provider: 'naver', enabled: false, client_id: null })
    if (url.startsWith('/v1/maps/geocode')) {
      const q = decodeURIComponent(url.split('query=')[1] ?? '')
      return r.geocode ? r.geocode(q) : json({ error: { message: 'no key' } }, 503)
    }
    if (url.startsWith('/v1/fx')) return json(fx)
    return json({}, 404)
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

// SDK 가짜 객체: 생성 인자만 기록한다.
function installFakeNaver() {
  const made = { markers: [] as Record<string, unknown>[], polylines: [] as Record<string, unknown>[] }
  class LatLng { constructor(public lat: number, public lng: number) {} }
  const maps = {
    Map: class { fitBounds = vi.fn(); setCenter = vi.fn(); setZoom = vi.fn(); destroy = vi.fn() },
    LatLng,
    LatLngBounds: class { extend = vi.fn() },
    Point: class { constructor(public x: number, public y: number) {} },
    Marker: class { constructor(o: Record<string, unknown>) { made.markers.push(o) } setMap = vi.fn() },
    Polyline: class { constructor(o: Record<string, unknown>) { made.polylines.push(o) } setMap = vi.fn() },
  }
  ;(window as unknown as { naver: unknown }).naver = { maps }
  return made
}

const place = (id: string, over: Partial<TripEntry> = {}): TripEntry => ({
  entry_id: `e-${id}`, item_id: id, title: `Place ${id}`, category: 'beauty',
  location: { name: `Place ${id}`, address: `Addr ${id}`, lat: 37.5 + Number(id) / 100, lng: 127 + Number(id) / 100 }, day: 1, ...over,
})

function props(over: Partial<MyTripProps> = {}): MyTripProps {
  return {
    ns: 'guest', profile: { country: 'US', language: 'en', currency: 'KRW' },
    trip: [], cart: [], days: 1,
    onMove: vi.fn(), onDay: vi.fn(), onRemove: vi.fn(), onAddDay: vi.fn(),
    onExplore: vi.fn(), onOpenItem: vi.fn(), onOpenCart: vi.fn(), ...over,
  }
}

beforeEach(() => {
  resetNaverMapsLoader()
  resetTripGeoMemo()
  resetFxCache()
})
afterEach(() => {
  delete (window as unknown as { naver?: unknown }).naver
  delete (window as unknown as { navermap_authFailure?: unknown }).navermap_authFailure
  document.querySelectorAll('script[data-naver-maps]').forEach((s) => s.remove())
  vi.unstubAllGlobals()
})

describe('My Trip', () => {
  it('shows the empty state with a way to Explore', async () => {
    mockFetch()
    const p = props()
    render(<MyTrip {...p} />)
    await userEvent.click(screen.getByRole('button', { name: 'Go to Explore' }))
    expect(p.onExplore).toHaveBeenCalled()
  })

  it('geocodes the stay on submit, saves only the picked candidate', async () => {
    const f = mockFetch({
      geocode: () => json({ query: 'q', provenance: 'naver_maps_geocode', fetched_at: 'x', results: [
        { address: 'A 1', road_address: 'Road 1', jibun_address: null, english_address: '1 Road, Seoul', lat: 37.55, lng: 126.97 },
        { address: 'B 2', road_address: null, jibun_address: null, english_address: null, lat: 37.6, lng: 127.1 },
      ] }),
    })
    const user = userEvent.setup()
    render(<MyTrip {...props({ trip: [place('1')] })} />)
    const input = screen.getByLabelText('Hotel or stay address')
    await user.type(input, 'Seoul Station')
    expect(f.mock.calls.some(([u]) => String(u).includes('/v1/maps/geocode'))).toBe(false) // 입력 중에는 호출하지 않는다
    await user.click(screen.getByRole('button', { name: 'Find' }))
    await user.click(await screen.findByRole('button', { name: /Road 1/ }))
    expect(loadStart('guest')).toEqual({ label: 'Seoul Station', address: 'Road 1', lat: 37.55, lng: 126.97, coords_source: 'naver_maps_geocode' })
    expect(screen.getByText('From your stay')).toBeInTheDocument()
  })

  it('explains a missing server map key (503) on address search', async () => {
    mockFetch()
    const user = userEvent.setup()
    render(<MyTrip {...props({ trip: [place('1')] })} />)
    await user.type(screen.getByLabelText('Hotel or stay address'), 'Myeongdong')
    await user.click(screen.getByRole('button', { name: 'Find' }))
    expect(await screen.findByText(/isn’t connected to a map key/)).toBeInTheDocument()
    expect(localStorage.getItem(keyFor('guest', 'start'))).toBeNull()
  })

  it('falls back to a notice card when the map is disabled, and the list still works', async () => {
    mockFetch()
    const p = props({ trip: [place('1'), place('2')], days: 2 })
    const user = userEvent.setup()
    render(<MyTrip {...p} />)
    expect(await screen.findByText(/isn’t switched on for this server/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Move down: Place 1' }))
    expect(p.onMove).toHaveBeenCalledWith('e-1', 1)
    await user.selectOptions(screen.getByLabelText('Move to day: Place 2'), '2')
    expect(p.onDay).toHaveBeenCalledWith('e-2', 2)
    await user.click(screen.getByRole('button', { name: 'Place 2' }))
    expect(p.onOpenItem).toHaveBeenCalledWith('2')
    await user.click(screen.getByRole('button', { name: 'Remove: Place 1' }))
    expect(p.onRemove).toHaveBeenCalledWith('e-1')
  })

  it('draws numbered markers and a dashed straight line, labelled as not a real route', async () => {
    mockFetch({ config: { provider: 'naver', enabled: true, client_id: 'public-id' } })
    const made = installFakeNaver()
    render(<MyTrip {...props({ trip: [place('1'), place('2', { category: 'medical' })] })} />)
    expect(await screen.findByText(/not an actual travel route/)).toBeInTheDocument()
    expect(made.markers).toHaveLength(2)
    expect(String((made.markers[1].icon as { content: string }).content)).toContain('trip-pin--medical')
    expect(made.polylines[0]).toMatchObject({ strokeStyle: 'shortdash' })
    expect(screen.getByRole('link', { name: /Directions in NAVER Map/ })).toHaveAttribute('href', expect.stringContaining('map.naver.com/p/directions/'))
    expect(screen.getByText(/Straight-line distance/)).toBeInTheDocument()
  })

  it('shows the web-service-URL guidance when NAVER reports an auth failure', async () => {
    mockFetch({ config: { provider: 'naver', enabled: true, client_id: 'public-id' } })
    installFakeNaver()
    render(<MyTrip {...props({ trip: [place('1')] })} />)
    await screen.findByText(/not an actual travel route/)
    act(() => (window as unknown as { navermap_authFailure: () => void }).navermap_authFailure())
    expect(await screen.findByText(/Web service URL/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Place 1' })).toBeInTheDocument()
  })

  it('keeps an auth-failure handler registered earlier (chains, does not overwrite)', async () => {
    const earlier = vi.fn()
    ;(window as unknown as { navermap_authFailure: () => void }).navermap_authFailure = earlier
    mockFetch({ config: { provider: 'naver', enabled: true, client_id: 'public-id' } })
    installFakeNaver()
    render(<MyTrip {...props({ trip: [place('1')] })} />)
    await screen.findByText(/not an actual travel route/)
    act(() => (window as unknown as { navermap_authFailure: () => void }).navermap_authFailure())
    expect(earlier).toHaveBeenCalledTimes(1)
    expect(await screen.findByText(/Web service URL/)).toBeInTheDocument()
  })

  it('asks for the Korean address when geocoding finds nothing', async () => {
    mockFetch({ geocode: () => json({ query: 'q', results: [], provenance: 'naver_maps_geocode', fetched_at: 'x' }) })
    const user = userEvent.setup()
    render(<MyTrip {...props({ trip: [place('1')] })} />)
    expect(screen.getByText(/Korean road-name address/)).toBeInTheDocument()
    await user.type(screen.getByLabelText('Hotel or stay address'), 'Myeongdong')
    await user.click(screen.getByRole('button', { name: 'Find' }))
    expect(await screen.findByText(/Korean address from your booking confirmation/)).toBeInTheDocument()
  })

  it('separates items without a place into a checklist, and flags unplaceable places with a search link', async () => {
    mockFetch({ geocode: () => json({ query: 'q', results: [], provenance: 'naver_maps_geocode', fetched_at: 'x' }) })
    const guide: TripEntry = { entry_id: 'e-g', item_id: 'g', title: 'Clinic guide', category: 'medical', location: null, day: 1 }
    const noCoords = place('3', { location: { name: 'Info Center', address: 'Somewhere 1' } })
    render(<MyTrip {...props({ trip: [noCoords, guide] })} />)
    const check = screen.getByRole('region', { name: 'Checklist' })
    expect(within(check).getByText('Clinic guide')).toBeInTheDocument()
    expect(await screen.findByText(/Couldn’t place this on the map/)).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /Search in NAVER Map/ })[0]).toHaveAttribute('href', expect.stringContaining('map.naver.com/p/search/'))
    expect(localStorage.length).toBe(0) // 장소 지오코딩 결과는 저장하지 않는다
  })

  it('summarises the cart in KRW and opens it', async () => {
    mockFetch()
    const p = props({ trip: [place('1')], cart: [
      { item_id: 'a', title: 'A', category: 'beauty', price_krw: 6900, qty: 2 },
      { item_id: 'b', title: 'B', category: 'beauty', price_krw: null, qty: 1 },
    ] })
    render(<MyTrip {...p} />)
    expect(screen.getByText('3 items in cart')).toBeInTheDocument()
    expect(screen.getByText('₩13,800')).toBeInTheDocument()
    expect(screen.getByText(/1 without a listed price/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Open cart' }))
    expect(p.onOpenCart).toHaveBeenCalled()
  })
})

describe('segment links', () => {
  it('uses NAVER directions with both coordinates, otherwise a destination search', () => {
    const to = { entry: place('1'), coords: { lat: 37.51, lng: 127.01 }, pending: false }
    const from = { name: 'Hotel', lat: 37.55, lng: 126.97 }
    expect(segmentLink(from, to)).toEqual({ kind: 'directions', href: naverDirectionsUrl(from, { name: 'Place 1', lat: 37.51, lng: 127.01 }) })
    expect(naverDirectionsUrl(from, { name: 'Place 1', lat: 37.51, lng: 127.01 })).toMatch(/^https:\/\/map\.naver\.com\/p\/directions\/14\d+\.\d+,45\d+\.\d+,Hotel,,\/14\d+\.\d+,45\d+\.\d+,Place%201,,\/-\/transit$/)
    expect(segmentLink(null, to).kind).toBe('search')
    expect(segmentLink(from, { ...to, coords: null }).href).toContain('map.naver.com/p/search/')
  })
})

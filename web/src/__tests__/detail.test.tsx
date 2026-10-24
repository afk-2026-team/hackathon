import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ItemDetail } from '../screens/ItemDetail'
import type { DetailProps } from '../screens/contracts'
import type { CatalogItem, ProfilePayload } from '../lib/types'
import { LangContext, type Lang } from '../lib/i18n'
import { resetFxCache } from '../lib/currency'
import { resetVideoCache } from '../components/detail/VideoShelf'
import { MiniMap } from '../components/detail/MiniMap'

const product: CatalogItem = {
  id: 'p1',
  kind: 'product',
  category: 'beauty',
  title: 'Dokdo Toner',
  subtitle: '라운드랩 독도 토너 · 올리브영',
  description: 'A gentle toner.',
  image_url: null,
  price_krw: 15000,
  location: null,
  sources: [{ label: 'Brand page', url: 'https://brand.example/toner', checked_at: '2026-10-20' }],
  sponsorship: 'unknown',
  reasons: ['Matches your interest in hydration.'],
  country_codes: ['JP'],
  tags: ['toner'],
  provenance: 'curated_seed',
}

const clinic: CatalogItem = {
  id: 'm1',
  kind: 'place',
  category: 'medical',
  title: 'Seoul Skin Clinic',
  subtitle: '서울피부과의원 · 강남',
  description: 'Dermatology clinic.',
  image_url: null,
  price_krw: null,
  location: { name: '서울피부과의원', address: '서울특별시 강남구 테헤란로 1' },
  sources: [{ label: 'Official site', url: 'https://clinic.example', checked_at: '2026-10-20' }],
  sponsorship: 'unknown',
  reasons: [],
  country_codes: [],
  tags: [],
  provenance: 'curated_seed',
}

const profile: ProfilePayload = { country: 'JP', language: 'en', currency: 'JPY' }

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const fx = { base: 'KRW', date: '2026-10-23', rates: { JPY: 0.11 }, source: { label: 'ECB', url: 'https://ecb.example' }, fetched_at: 'x' }
const videos = {
  query: 'q',
  items: [
    { video_id: 'v1', title: 'Paid review', channel: 'Chan A', published_at: '2026-10-01T00:00:00Z', thumbnail_url: '', url: 'https://youtu.be/v1', embed_url: 'https://www.youtube.com/embed/v1', sponsorship: 'sponsored', sponsorship_source: 'youtube_paid_product_placement' },
    { video_id: 'v2', title: 'Honest take', channel: 'Chan B', published_at: '2026-09-01T00:00:00Z', thumbnail_url: '', url: 'https://youtu.be/v2', embed_url: 'https://www.youtube.com/embed/v2', sponsorship: 'unknown', sponsorship_source: null },
  ],
  provenance: 'youtube_data_api_search',
  fetched_at: 'x',
  cached: false,
}
const blog = {
  query: 'q',
  total: 1234,
  items: [{ title: '후기 글', url: 'https://blog.example/1', excerpt: '좋아요', author: '작성자', posted_on: '2026-10-02', sponsorship: 'unknown' }],
  provenance: 'naver_api_hub_blog_search',
  fetched_at: 'x',
}

type Routes = Partial<Record<'videos' | 'blog' | 'config' | 'geocode', Response | (() => Response)>>
let calls: string[] = []
function stubFetch(routes: Routes) {
  calls = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    calls.push(url)
    const pick = (r: Response | (() => Response) | undefined, fallback: Response) => (typeof r === 'function' ? r() : r ?? fallback)
    if (url.startsWith('/v1/fx')) return json(fx)
    if (url.startsWith('/v1/evidence/videos')) return pick(routes.videos, json(videos))
    if (url.startsWith('/v1/evidence/blog')) return pick(routes.blog, json(blog))
    if (url.startsWith('/v1/maps/config')) return pick(routes.config, json({ provider: 'naver', enabled: false, client_id: null }))
    if (url.startsWith('/v1/maps/geocode')) return pick(routes.geocode, json({ query: 'q', results: [], provenance: 'naver_maps_geocode', fetched_at: 'x' }))
    return json({ error: { message: 'unexpected' } }, 404)
  }))
}

function renderDetail(item: CatalogItem, lang: Lang = 'en', over: Partial<DetailProps> = {}) {
  const props: DetailProps = {
    item,
    profile,
    onBack: vi.fn(),
    onAddCart: vi.fn(),
    onAddTrip: vi.fn(),
    onSetCurrent: vi.fn(),
    onOpenCart: vi.fn(),
    onGoTrip: vi.fn(),
    cartQty: 0,
    inTrip: false,
    ...over,
  }
  render(
    <LangContext.Provider value={lang}>
      <ItemDetail {...props} />
    </LangContext.Provider>,
  )
  return props
}

beforeEach(() => {
  resetFxCache()
  resetVideoCache()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('product detail (en)', () => {
  it('shows the Korean store name, server reasons and source links', async () => {
    stubFetch({})
    renderDetail(product)
    expect(screen.getByTestId('store-name')).toHaveTextContent('라운드랩 독도 토너 · 올리브영')
    expect(screen.getByText('Show this at the store')).toBeInTheDocument()
    expect(screen.getByText('Matches your interest in hydration.')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Brand page' })
    expect(link).toHaveAttribute('href', 'https://brand.example/toner')
    expect(link).toHaveAttribute('target', '_blank')
    expect(await screen.findByText('Blog reviews')).toBeInTheDocument()
  })

  it('maps video sponsorship to badges, queries in English once, and plays inline', async () => {
    stubFetch({})
    const user = userEvent.setup()
    renderDetail(product)
    const cards = await screen.findAllByTestId('video-card')
    expect(within(cards[0]).getByText('Sponsored')).toBeInTheDocument()
    expect(within(cards[1]).getByText('Sponsorship unknown')).toBeInTheDocument()
    expect(within(cards[1]).queryByText('No sponsorship found')).toBeNull()
    const videoCalls = calls.filter((u) => u.startsWith('/v1/evidence/videos'))
    expect(videoCalls).toHaveLength(1)
    expect(videoCalls[0]).toContain(`query=${encodeURIComponent('Dokdo Toner review')}`)
    expect(videoCalls[0]).toContain('lang=en')
    expect(screen.getByText(/Source: YouTube search results/)).toBeInTheDocument()

    await user.click(within(cards[0]).getByRole('button', { name: 'Paid review' }))
    const frame = screen.getByTitle('Video player: Paid review')
    expect(frame).toHaveAttribute('src', 'https://www.youtube.com/embed/v1')
    expect(frame).toHaveAttribute('allow', 'encrypted-media; picture-in-picture')
  })

  it('explains a 503 from blog search and marks posts as Korean originals otherwise', async () => {
    stubFetch({ blog: json({ error: { message: 'Run with --services naver' } }, 503) })
    renderDetail(product)
    expect(await screen.findByText(/NAVER search isn’t connected on the server/)).toBeInTheDocument()
  })

  it('adds to cart and shows the cart quantity', async () => {
    stubFetch({})
    const user = userEvent.setup()
    const props = renderDetail(product, 'en', { cartQty: 2 })
    await user.click(screen.getByRole('button', { name: /\+ Add to cart/ }))
    expect(props.onAddCart).toHaveBeenCalledWith(product)
    expect(screen.getByText('In cart · 2')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cart, 2 items' }))
    expect(props.onOpenCart).toHaveBeenCalled()
  })
})

describe('product detail (ko)', () => {
  it('uses Korean labels, searches videos by the Korean name and states the blog total without ranking', async () => {
    stubFetch({ videos: json({ error: { message: 'no key' } }, 503) })
    renderDetail(product, 'ko', { inTrip: true })
    expect(screen.getByText('매장에서 이렇게 찾으세요')).toBeInTheDocument()
    expect(screen.getByText('왜 추천했나요')).toBeInTheDocument()
    expect(await screen.findByText('서버에 YouTube 키가 연결되지 않았어요. 영상을 보여줄 수 없어요.')).toBeInTheDocument()
    expect(await screen.findByText('NAVER 블로그 검색 결과 약 1,234건')).toBeInTheDocument()
    expect(screen.getAllByText('협찬 여부 확인 못 함').length).toBeGreaterThan(0)
    expect(screen.queryByText('한국어 원문')).toBeNull()
    const videoCall = calls.find((u) => u.startsWith('/v1/evidence/videos'))!
    expect(videoCall).toContain(`query=${encodeURIComponent('라운드랩 독도 토너')}`)
    expect(screen.getByRole('button', { name: '내 여행에 있음' })).toBeInTheDocument()
  })
})

describe('medical detail', () => {
  it('shows the institution notice, review disclaimer and map-link fallback when maps are off', async () => {
    stubFetch({})
    const user = userEvent.setup()
    const props = renderDetail(clinic)
    expect(screen.getByText(/decided by the medical institution/)).toBeInTheDocument()
    expect(await screen.findByText('Reviews are personal experiences, not medical advice.')).toBeInTheDocument()
    expect(await screen.findByText(/Map preview isn’t available right now/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'NAVER Map' }).getAttribute('href')).toContain('map.naver.com')
    expect(screen.getByRole('link', { name: 'Google Maps' }).getAttribute('href')).toContain('google.com/maps')
    expect(screen.getByRole('link', { name: 'Open official site' })).toHaveAttribute('href', 'https://clinic.example')
    expect(calls.some((u) => u.startsWith('/v1/maps/geocode'))).toBe(false)
    expect(screen.queryByRole('button', { name: /Add to cart/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Add to My Trip' }))
    expect(props.onAddTrip).toHaveBeenCalledWith(clinic)
  })

  it('in Korean, shows the fixed notice and goes to My Trip when already added', async () => {
    stubFetch({ config: json({ provider: 'naver', enabled: true, client_id: 'abc' }) })
    const user = userEvent.setup()
    const props = renderDetail(clinic, 'ko', { inTrip: true })
    expect(screen.getByText('진단·시술 적합성과 예약 확정은 의료기관이 합니다. 진선미는 공식 안내로 연결만 합니다.')).toBeInTheDocument()
    expect(screen.getByText('후기는 개인 경험이며 의료 판단이 아닙니다.')).toBeInTheDocument()
    expect(await screen.findByText('이 주소의 좌표를 찾지 못했어요. 아래 지도 링크를 이용하세요.')).toBeInTheDocument()
    expect(calls.find((u) => u.startsWith('/v1/maps/geocode'))).toContain(encodeURIComponent('서울특별시 강남구 테헤란로 1'))
    await user.click(screen.getByRole('button', { name: '내 여행에 있음' }))
    expect(props.onGoTrip).toHaveBeenCalled()
    expect(props.onAddTrip).not.toHaveBeenCalled()
  })
})

describe('MiniMap directions', () => {
  const official = { name: 'Gangnam Clinic', address: '서울특별시 강남구 테헤란로 1', lat: 37.4979, lng: 127.0276 }
  const renderMini = (loc: Parameters<typeof MiniMap>[0]['location'], ns?: 'guest') =>
    render(
      <LangContext.Provider value="en">
        <MiniMap location={loc} lang="en" ns={ns} />
      </LangContext.Provider>,
    )
  afterEach(() => localStorage.clear())

  it('uses official lat/lng without geocoding and labels the source', async () => {
    stubFetch({ config: json({ provider: 'naver', enabled: true, client_id: 'abc' }) })
    renderMini(official)
    expect(await screen.findByText(/Coordinates: official data/)).toBeInTheDocument()
    expect(calls.some((u) => u.startsWith('/v1/maps/geocode'))).toBe(false)
    // 출발지 미선택 → 도착지만 넘기는 웹 길찾기
    expect(screen.getByRole('link', { name: 'Transit directions in NAVER Map to Gangnam Clinic' })).toHaveAttribute(
      'href',
      'https://map.naver.com/p/directions/-/127.0276,37.4979,Gangnam%20Clinic,,/-/transit',
    )
  })

  it('starts from the saved stay when a namespace is given', async () => {
    localStorage.setItem('korea-locally/guest/start', JSON.stringify({ label: 'Hotel', address: 'Road 1', lat: 37.55, lng: 126.97, coords_source: 'naver_maps_geocode' }))
    stubFetch({})
    renderMini(official, 'guest')
    expect(await screen.findByRole('radio', { name: 'My stay' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('link', { name: 'Walk directions in NAVER Map to Gangnam Clinic' })).toHaveAttribute(
      'href',
      'https://map.naver.com/p/directions/126.97,37.55,Hotel,,/127.0276,37.4979,Gangnam%20Clinic,,/-/walk',
    )
  })

  it('uses the current location only after the user asks, and falls back to destination-only when denied', async () => {
    stubFetch({})
    let mode: 'ok' | 'deny' = 'ok'
    const getCurrentPosition = vi.fn((ok: PositionCallback, fail?: PositionErrorCallback | null) => {
      if (mode === 'ok') ok({ coords: { latitude: 37.5665, longitude: 126.978 } } as GeolocationPosition)
      else fail?.({ code: 1 } as GeolocationPositionError)
    })
    vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition } })
    const user = userEvent.setup()
    renderMini(official)
    await screen.findByText(/Coordinates: official data/)
    expect(getCurrentPosition).not.toHaveBeenCalled()
    await user.click(screen.getByRole('radio', { name: 'My current location' }))
    expect(getCurrentPosition).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('link', { name: 'Car directions in NAVER Map to Gangnam Clinic' })).toHaveAttribute(
      'href',
      'https://map.naver.com/p/directions/126.978,37.5665,My%20current%20location,,/127.0276,37.4979,Gangnam%20Clinic,,/-/car',
    )
    expect(screen.getByText(/isn’t saved or sent to our server/)).toBeInTheDocument()
    expect(calls.some((u) => u.includes('37.5665'))).toBe(false) // 위치는 서버로 가지 않는다
    mode = 'deny'
    await user.click(screen.getByRole('radio', { name: 'Choose in NAVER Map' }))
    await user.click(screen.getByRole('radio', { name: 'My current location' }))
    expect(await screen.findByText(/NAVER Map will ask where you start/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Car directions in NAVER Map to Gangnam Clinic' }).getAttribute('href')).toMatch(/^https:\/\/map\.naver\.com\/p\/directions\/-\//)
  })
})

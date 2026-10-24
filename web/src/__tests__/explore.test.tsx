import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { Explore } from '../screens/Explore'
import { Search } from '../screens/Search'
import { CartSheet } from '../components/CartSheet'
import { LangContext, type Lang } from '../lib/i18n'
import { resetFxCache } from '../lib/currency'
import type { CatalogItem, ProfilePayload } from '../lib/types'
import type { CartLine } from '../lib/storage'

const base: Omit<CatalogItem, 'id' | 'title' | 'sponsorship' | 'tags'> = {
  kind: 'product',
  category: 'beauty',
  subtitle: '',
  description: '',
  image_url: null,
  price_krw: 10000,
  location: null,
  sources: [],
  reasons: [],
  country_codes: [],
  provenance: 'curated',
}
const item = (over: Partial<CatalogItem> & Pick<CatalogItem, 'id' | 'title'>): CatalogItem =>
  ({ ...base, sponsorship: 'unknown', tags: [], ...over }) as CatalogItem

const items: CatalogItem[] = [
  item({ id: 'p1', title: 'Ceramide Cream', subtitle: '세라마이드 크림', tags: ['skincare', 'cream'] }),
  item({ id: 'p2', title: 'Lip Tint', tags: ['makeup'], sponsorship: 'not_sponsored' }),
  item({ id: 'p3', title: 'Paid Serum', tags: ['skincare'], sponsorship: 'sponsored' }),
  item({ id: 'm1', title: 'Medical Info Center', kind: 'place', category: 'medical', price_krw: null, tags: ['official_guide'], location: { name: 'Seoul Station', address: 'Seoul Station B2' } }),
]
const fx = { base: 'KRW', date: '2026-10-23', rates: { USD: 0.0007, JPY: 0.11 }, source: { label: 'ECB reference rate', url: 'https://ecb.example' }, fetched_at: 'x' }
const profile = (over: Partial<ProfilePayload> = {}): ProfilePayload => ({ country: 'JP', language: 'en', currency: 'USD', ...over })

type Route = (url: string) => Response | undefined
function stubFetch(routes: Route) {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    const r = routes(url)
    if (r) return r
    if (url.startsWith('/v1/fx')) return json(fx)
    if (url.startsWith('/v1/discovery/recommendations')) return json({ items, country_context: { country: 'JP', status: 'insufficient', explanation: '' }, generated_at: 'x' })
    if (url.startsWith('/v1/discovery/catalog')) return json({ items })
    return new Response('{}', { status: 404 })
  })
  vi.stubGlobal('fetch', fn)
  return fn
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const withLang = (lang: Lang, node: ReactNode) => <LangContext.Provider value={lang}>{node}</LangContext.Provider>

beforeEach(() => {
  resetFxCache()
  sessionStorage.clear()
  stubFetch(() => undefined)
})

function renderExplore(p = profile(), over: Partial<Parameters<typeof Explore>[0]> = {}, lang: Lang = 'en') {
  const props = {
    profile: p,
    category: 'all' as const,
    onCategory: vi.fn(),
    onOpen: vi.fn(),
    onAddCart: vi.fn(),
    onSearch: vi.fn(),
    cartQty: {},
    tripIds: new Set<string>(),
    ...over,
  }
  render(withLang(lang, <Explore {...props} />))
  return props
}

describe('Explore', () => {
  it('keeps sponsored items out of the Real picks list and shows them only in Sponsored', async () => {
    const user = userEvent.setup()
    renderExplore()
    const real = await screen.findByRole('list', { name: 'Real picks' })
    expect(within(real).getByText('Ceramide Cream')).toBeInTheDocument()
    expect(within(real).getByText('Medical Info Center')).toBeInTheDocument()
    expect(within(real).queryByText('Paid Serum')).toBeNull()
    expect(screen.getByText('Curation order · not a measured ranking')).toBeInTheDocument()
    expect(screen.getByText(/Not enough country-specific evidence/)).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Sponsored 1' }))
    const sp = screen.getByRole('list', { name: 'Sponsored items' })
    expect(within(sp).getByText('Paid Serum')).toBeInTheDocument()
    expect(within(sp).queryByText('Ceramide Cream')).toBeNull()
  })

  it('shows an honest empty state in Korean when nothing is sponsored', async () => {
    const user = userEvent.setup()
    stubFetch((url) =>
      url.startsWith('/v1/discovery/recommendations')
        ? json({ items: items.filter((i) => i.sponsorship !== 'sponsored'), country_context: { country: 'JP', status: 'supported', explanation: '' }, generated_at: 'x' })
        : undefined,
    )
    renderExplore(profile({ language: 'ko' }), {}, 'ko')
    expect(await screen.findByText('Japan 관련 근거가 포함된 추천이에요')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: '협찬 0' }))
    expect(screen.getByText('지금 홍보 중인 협찬 상품이 없어요.')).toBeInTheDocument()
  })

  it('offers only interests present in results, preselects profile interests and filters client-side', async () => {
    const user = userEvent.setup()
    renderExplore(profile({ preferences: { interests: ['makeup', 'dental'] } }))
    const group = await screen.findByRole('group', { name: 'Interest filters' })
    const chips = within(group).getAllByRole('button').map((b) => b.textContent)
    expect(chips).toEqual(['Skincare', 'Makeup']) // dental 은 결과 태그에 없어서 칩이 없다
    expect(within(group).getByRole('button', { name: 'Makeup' })).toHaveAttribute('aria-pressed', 'true')

    let list = screen.getByRole('list', { name: 'Real picks' })
    expect(within(list).getByText('Lip Tint')).toBeInTheDocument()
    expect(within(list).queryByText('Ceramide Cream')).toBeNull()

    await user.click(within(group).getByRole('button', { name: 'Makeup' }))
    await user.click(within(group).getByRole('button', { name: 'Skincare' }))
    list = screen.getByRole('list', { name: 'Real picks' })
    expect(within(list).getByText('Ceramide Cream')).toBeInTheDocument()
    expect(within(list).queryByText('Lip Tint')).toBeNull()
  })

  it('calls onAddCart from the + button, shows cart qty and trip state, and opens items', async () => {
    const user = userEvent.setup()
    const props = renderExplore(profile(), { cartQty: { p1: 2 }, tripIds: new Set(['m1']) })
    await user.click(await screen.findByRole('button', { name: 'Add Ceramide Cream to cart' }))
    expect(props.onAddCart).toHaveBeenCalledWith(items[0])
    expect(screen.getByText('In cart 2')).toBeInTheDocument()
    expect(screen.getByText('In My Trip')).toBeInTheDocument()
    await user.click(screen.getByText('Medical Info Center'))
    expect(props.onOpen).toHaveBeenCalledWith(items[3])
    await user.click(screen.getByRole('tab', { name: 'Medical' }))
    expect(props.onCategory).toHaveBeenCalledWith('medical')
  })
})

// ── 대량 카탈로그(병원 45·제품 30) ──
const GU = ['강남구', '서초구', '마포구']
const FIELDS = ['dermatology', 'dental', 'checkup']
const hospitals: CatalogItem[] = Array.from({ length: 45 }, (_, n) =>
  item({
    id: `h${n}`,
    title: `Clinic ${n}`,
    kind: 'place',
    category: 'medical',
    price_krw: null,
    tags: ['clinic', FIELDS[n % 3], ...(n === 0 ? ['international_clinic'] : [])],
    location: { name: `Clinic ${n}`, address: `서울특별시 ${n % 5 < 3 ? GU[0] : GU[1 + (n % 2)]} 테헤란로 ${n}` },
    sponsorship: n === 44 ? 'sponsored' : 'unknown',
  }),
)
const medGuides: CatalogItem[] = [
  item({ id: 'g1', title: 'Medical Korea Guide', kind: 'guide', category: 'medical', price_krw: null, tags: ['official_guide'] }),
  item({ id: 'g2', title: 'Interpretation Guide', kind: 'guide', category: 'medical', price_krw: null, tags: ['official_guide'] }),
]
const TYPES = ['toner', 'serum', 'sunscreen']
const products: CatalogItem[] = Array.from({ length: 30 }, (_, n) =>
  item({ id: `b${n}`, title: `Product ${n}`, tags: ['skincare', TYPES[n % 3]] }),
)
function stubBulk(list: CatalogItem[]) {
  stubFetch((url) =>
    url.startsWith('/v1/discovery/recommendations') || url.startsWith('/v1/discovery/catalog')
      ? json({ items: list, country_context: { country: 'JP', status: 'insufficient', explanation: '' }, generated_at: 'x' })
      : undefined,
  )
}
const rows = (name = 'Real picks') => within(screen.getByRole('list', { name })).getAllByRole('listitem')
const real = (list: CatalogItem[]) => list.filter((i) => i.sponsorship !== 'sponsored')
const inGu = (gu: string) => real(hospitals).filter((h) => h.location!.address!.includes(gu))

describe('Explore with a large catalog', () => {
  it('shows 20 at a time with a remaining count and goes back to the first page when a filter changes', async () => {
    const user = userEvent.setup()
    stubBulk([...hospitals, ...medGuides, ...products])
    renderExplore()
    await screen.findByRole('list', { name: 'Real picks' })
    const total = 44 + 2 + 30 // 협찬 1곳 제외
    expect(screen.getByText(`${total} results`)).toBeInTheDocument()
    expect(rows()).toHaveLength(20)
    await user.click(screen.getByRole('button', { name: `Show more (${total - 20} left)` }))
    expect(rows()).toHaveLength(40)
    await user.click(screen.getByRole('button', { name: `Show more (${total - 40} left)` }))
    expect(rows()).toHaveLength(60)
    // 필터를 바꾸면 처음 20개로
    await user.click(within(screen.getByRole('group', { name: 'Interest filters' })).getByRole('button', { name: 'Skincare' }))
    expect(screen.getByText('30 results')).toBeInTheDocument()
    expect(rows()).toHaveLength(20)
    expect(screen.getByRole('button', { name: 'Show more (10 left)' })).toBeInTheDocument()
    // 큐레이션 순서는 필터 뒤에도 원래 목록 순번 그대로(병원 44 + 안내 2 다음)
    expect(within(rows()[0]).getByLabelText('Pick 47')).toBeInTheDocument()
  }, 15000)

  it('medical tab: specialty and area chips come from the results, with counts, and can be cleared', async () => {
    const user = userEvent.setup()
    stubBulk([...hospitals, ...medGuides])
    renderExplore(profile(), { category: 'medical' })
    await screen.findByRole('list', { name: 'Real picks' })
    expect(screen.queryByRole('group', { name: 'Interest filters' })).toBeNull()

    const fields = screen.getByRole('group', { name: 'Specialty filters' })
    const nField = (f: string) => real(hospitals).filter((h) => h.tags.includes(f)).length
    expect(within(fields).getAllByRole('button').map((b) => b.textContent)).toEqual([
      `Dermatology ${nField('dermatology')}`, `Dental ${nField('dental')}`, `Health checkup ${nField('checkup')}`, 'International clinic 1',
    ])
    const areas = screen.getByRole('group', { name: 'Area filters' })
    expect(within(areas).getAllByRole('button')).toHaveLength(3)
    expect(within(areas).getByRole('button', { name: `Gangnam-gu ${inGu('강남구').length}` })).toBeInTheDocument()

    await user.click(within(areas).getByRole('button', { name: /^Seocho-gu/ }))
    const seocho = inGu('서초구')
    expect(screen.getByText(`${seocho.length} results`)).toBeInTheDocument()
    expect(rows().every((r) => within(r).queryByText('Seocho-gu') !== null)).toBe(true)

    await user.click(within(fields).getByRole('button', { name: /^Dental/ }))
    const both = seocho.filter((h) => h.tags.includes('dental'))
    expect(both.length).toBeGreaterThan(0)
    expect(screen.getByText(`${both.length} results`)).toBeInTheDocument()
    expect(within(rows()[0]).getByText('Dental')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(screen.getByText('46 results')).toBeInTheDocument()
    expect(within(areas).getByRole('button', { name: /^Seocho-gu/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('medical tab separates clinics from official guides and keeps sponsored clinics in their own lane', async () => {
    const user = userEvent.setup()
    stubBulk([...hospitals, ...medGuides])
    renderExplore(profile(), { category: 'medical' })
    const kinds = await screen.findByRole('group', { name: 'Clinics or guides' })
    await user.click(within(kinds).getByRole('button', { name: 'Official guides 2' }))
    expect(rows()).toHaveLength(2)
    expect(screen.getByText('Medical Korea Guide')).toBeInTheDocument()
    expect(screen.queryByText('Clinic 1')).toBeNull()
    await user.click(within(kinds).getByRole('button', { name: 'Clinics 44' }))
    expect(screen.getByText('44 results')).toBeInTheDocument()
    expect(screen.getByText('Curation order · not a measured ranking')).toBeInTheDocument()
    expect(screen.queryByText('Clinic 44')).toBeNull()

    await user.click(screen.getByRole('tab', { name: 'Sponsored 1' }))
    expect(rows('Sponsored items')).toHaveLength(1)
    expect(screen.getByText('Clinic 44')).toBeInTheDocument()
  })

  it('shows Korean district and specialty labels in Korean', async () => {
    stubBulk(hospitals.slice(0, 3))
    renderExplore(profile({ language: 'ko' }), { category: 'medical' }, 'ko')
    const areas = await screen.findByRole('group', { name: '지역 필터' })
    expect(within(areas).getByRole('button', { name: '강남구 3' })).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: '진료 분야 필터' })).getByRole('button', { name: '피부과 1' })).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: '진짜 추천' })).getAllByText('강남구')).toHaveLength(3)
  })

  it('beauty tab offers product-type chips only for types present in the results', async () => {
    const user = userEvent.setup()
    stubBulk(products)
    renderExplore(profile(), { category: 'beauty' })
    const types = await screen.findByRole('group', { name: 'Product type filters' })
    expect(within(types).getAllByRole('button').map((b) => b.textContent)).toEqual(['Toner 10', 'Serum 10', 'Sunscreen 10'])
    await user.click(within(types).getByRole('button', { name: 'Serum 10' }))
    expect(screen.getByText('10 results')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Show more/ })).toBeNull()
  })

  it('resets filters when the tab changes', async () => {
    const user = userEvent.setup()
    stubBulk(products)
    const props = { profile: profile(), onCategory: vi.fn(), onOpen: vi.fn(), onAddCart: vi.fn(), onSearch: vi.fn(), cartQty: {}, tripIds: new Set<string>() }
    const { rerender } = render(withLang('en', <Explore {...props} category="beauty" />))
    const types = await screen.findByRole('group', { name: 'Product type filters' })
    await user.click(within(types).getByRole('button', { name: 'Serum 10' }))
    expect(screen.getByText('10 results')).toBeInTheDocument()
    rerender(withLang('en', <Explore {...props} category="all" />))
    await screen.findByRole('list', { name: 'Real picks' })
    rerender(withLang('en', <Explore {...props} category="beauty" />))
    expect(await screen.findByText('30 results')).toBeInTheDocument()
  })
})

describe('Search with a large catalog', () => {
  it('shows the top 50 with a show-more button and district/specialty badges for clinics', async () => {
    const user = userEvent.setup()
    const many = Array.from({ length: 60 }, (_, n) => item({ id: `c${n}`, title: `Cream ${n}`, tags: ['cream'] }))
    stubBulk([...many, ...hospitals.slice(0, 2)])
    render(withLang('en', <Search profile={profile()} onBack={vi.fn()} onOpen={vi.fn()} />))
    await user.type(screen.getByRole('searchbox'), 'cream')
    expect(await screen.findByText('60 results')).toBeInTheDocument()
    const list = () => within(document.querySelector('ul.ex-list') as HTMLElement).getAllByRole('listitem')
    expect(list()).toHaveLength(50)
    await user.click(screen.getByRole('button', { name: 'Show more (10 left)' }))
    expect(list()).toHaveLength(60)
    await user.clear(screen.getByRole('searchbox'))
    await user.type(screen.getByRole('searchbox'), '강남구')
    expect(await screen.findByText('2 results')).toBeInTheDocument()
    expect(screen.getAllByText('Gangnam-gu')).toHaveLength(2)
    expect(screen.getByText('Dermatology')).toBeInTheDocument()
  }, 15000)
})

describe('Search', () => {
  it('searches the catalog client-side, case-insensitively and in Korean', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    render(withLang('en', <Search profile={profile()} onBack={vi.fn()} onOpen={onOpen} />))
    const input = screen.getByRole('searchbox')
    expect(input).toHaveFocus()
    await user.type(input, 'CERAMIDE')
    expect(await screen.findByText('Ceramide Cream')).toBeInTheDocument()
    await user.clear(input)
    await user.type(input, '세라마이드')
    await user.click(await screen.findByText('Ceramide Cream'))
    expect(onOpen).toHaveBeenCalledWith(items[0])
    await user.clear(input)
    await user.type(input, 'zzz')
    expect(await screen.findByText('No results')).toBeInTheDocument()
  })

  it('calls blog search only on submit and explains a missing server key (503)', async () => {
    const user = userEvent.setup()
    const fn = stubFetch((url) => (url.startsWith('/v1/evidence/blog') ? json({ error: { message: 'not configured' } }, 503) : undefined))
    render(withLang('ko', <Search profile={profile()} onBack={vi.fn()} onOpen={vi.fn()} />))
    await user.click(screen.getByRole('tab', { name: '웹 후기' }))
    await user.type(screen.getByRole('searchbox'), '선크림')
    const blogCalls = () => fn.mock.calls.filter(([u]) => String(u).startsWith('/v1/evidence/blog'))
    expect(blogCalls()).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: '검색' }))
    expect(await screen.findByText('서버에 블로그 검색 키가 연결되지 않았어요.')).toBeInTheDocument()
    expect(blogCalls()).toHaveLength(1)
    expect(String(blogCalls()[0][0])).toContain(encodeURIComponent('선크림'))
  })

  it('lists blog posts with an unknown-sponsorship badge, new-tab links and the source line', async () => {
    const user = userEvent.setup()
    stubFetch((url) =>
      url.startsWith('/v1/evidence/blog')
        ? json({ query: 'cream', total: 1, items: [{ title: '<b>Cream</b> review &amp; notes', url: 'https://blog.example/1', excerpt: 'Nice', author: 'kim', posted_on: '2026-10-01', sponsorship: 'unknown' }], provenance: 'naver_api_hub_blog_search', fetched_at: 'x' })
        : undefined,
    )
    render(withLang('en', <Search profile={profile()} onBack={vi.fn()} onOpen={vi.fn()} />))
    await user.type(screen.getByRole('searchbox'), 'cream{Enter}')
    await user.click(screen.getByRole('tab', { name: 'Web reviews' }))
    const link = await screen.findByRole('link', { name: 'Cream review & notes' })
    expect(link).toHaveAttribute('target', '_blank')
    expect(screen.getByText('Sponsorship unknown')).toBeInTheDocument()
    expect(screen.getByText('Search results: NAVER Blog Search (API HUB)')).toBeInTheDocument()
  })
})

describe('CartSheet', () => {
  const cart: CartLine[] = [
    { item_id: 'p1', title: 'Ceramide Cream', category: 'beauty', price_krw: 10000, qty: 2 },
    { item_id: 'p2', title: 'Unpriced Toner', category: 'beauty', price_krw: null, qty: 1 },
  ]
  const renderCart = (currency: string, lang: Lang = 'en', lines = cart) => {
    const props = { cart: lines, currency, onChangeQty: vi.fn(), onOpenItem: vi.fn(), onGoTrip: vi.fn(), onClose: vi.fn() }
    render(withLang(lang, <CartSheet {...props} />))
    return props
  }

  it('totals priced lines in KRW, converts with the ECB source line and flags unpriced items', async () => {
    const user = userEvent.setup()
    const props = renderCart('USD')
    expect(screen.getByTestId('cart-total')).toHaveTextContent('₩20,000')
    expect(await screen.findByText('ECB reference rate · 2026-10-23')).toBeInTheDocument()
    expect(screen.getByText('≈ $14.00 in USD')).toBeInTheDocument()
    expect(screen.getByText(/1 item\(s\) without a listed price are not included/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Increase quantity of Ceramide Cream' }))
    expect(props.onChangeQty).toHaveBeenCalledWith('p1', 3)
    await user.click(screen.getByRole('button', { name: 'Decrease quantity of Unpriced Toner' }))
    expect(props.onChangeQty).toHaveBeenCalledWith('p2', 0)
    await user.click(screen.getByRole('button', { name: 'Unpriced Toner' }))
    expect(props.onOpenItem).toHaveBeenCalledWith('p2')
    await user.click(screen.getByRole('button', { name: 'See the route in My Trip' }))
    expect(props.onGoTrip).toHaveBeenCalled()
  })

  it('says a currency without an official rate is shown in KRW only (Korean)', async () => {
    renderCart('VND', 'ko')
    expect(await screen.findByText('VND는 공식 기준율이 없어 원화로만 표시해요.')).toBeInTheDocument()
    expect(screen.queryByText(/ECB reference rate/)).toBeNull()
  })

  it('shows an empty state', () => {
    renderCart('USD', 'en', [])
    expect(screen.getByText('Your cart is empty')).toBeInTheDocument()
  })
})

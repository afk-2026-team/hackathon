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
    expect(screen.getByText('Ceramide Cream')).toBeInTheDocument()
    await user.click(screen.getByText('Ceramide Cream'))
    expect(onOpen).toHaveBeenCalledWith(items[0])
    await user.clear(input)
    await user.type(input, 'zzz')
    expect(screen.getByText('No results')).toBeInTheDocument()
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

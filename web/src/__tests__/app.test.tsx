import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'
import type { Auth, AuthStatus } from '../auth/core'
import { keyFor, saveEntry } from '../lib/storage'
import { resetFxCache } from '../lib/currency'
import type { CatalogItem } from '../lib/types'

const reco = { items: [], country_context: { country: 'JP', status: 'insufficient', explanation: 'General picks.' }, generated_at: 'x' }

function fakeAuth(status: AuthStatus, session: unknown = null, over: Partial<Auth> = {}): Auth {
  return {
    initializeAuth: vi.fn(async () => status),
    getStatus: () => status,
    getSession: vi.fn(async () => session as never),
    subscribeAuth: vi.fn(() => () => {}),
    signInWithGoogle: vi.fn(async () => ({ error: null })),
    handleAuthCallback: vi.fn(),
    signOut: vi.fn(async () => ({ signedOut: true, error: null })),
    fetchMe: vi.fn(async () => ({ id: 'u1', email: 'me@example.com' })),
    ...over,
  } as Auth
}

beforeEach(() => {
  resetFxCache()
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(reco), { status: 200 })))
  window.history.replaceState(null, '', '/')
})

async function finishOnboarding(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByLabelText('Language'), 'en')
  await user.selectOptions(screen.getByLabelText('Where are you visiting from?'), 'JP')
  await user.click(screen.getByRole('button', { name: 'Continue' }))
  await user.click(screen.getByRole('button', { name: 'Continue' }))
  await user.click(screen.getByRole('button', { name: 'Skip for now' }))
}

describe('entry, onboarding and revisit', () => {
  it('lets a guest in while Google is disabled, then skips entry and onboarding on revisit', async () => {
    const user = userEvent.setup()
    const auth = fakeAuth({ state: 'disabled', reason: 'provider_disabled' })
    const { unmount } = render(<App auth={auth} />)
    expect(await screen.findByText(/Google sign-in isn’t switched on yet/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Continue with Google/ })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Continue as guest' }))
    await finishOnboarding(user)
    expect(JSON.parse(localStorage.getItem(keyFor('guest', 'profile'))!)).toMatchObject({ country: 'JP', currency: 'JPY', gender: null, preferences: null })
    await user.click(screen.getByRole('button', { name: 'Skip' })) // tutorial
    unmount()

    render(<App auth={auth} />)
    expect(screen.queryByRole('button', { name: 'Continue as guest' })).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
  })

  it('still offers guest entry when auth initialization and session lookup both reject', async () => {
    const user = userEvent.setup()
    const auth = fakeAuth({ state: 'loading' }, null, {
      initializeAuth: vi.fn(async () => { throw new Error('boom') }),
      getSession: vi.fn(async () => { throw new Error('boom') }),
    })
    render(<App auth={auth} />)
    expect(await screen.findByText(/couldn’t reach the sign-in service/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Continue as guest' }))
    expect(await screen.findByLabelText('Language')).toBeInTheDocument()
  })

  it('does not pretend to sign out when the session remains', async () => {
    const user = userEvent.setup()
    localStorage.setItem(keyFor('user:u1', 'profile'), JSON.stringify({ version: 1, country: 'US', language: 'en', currency: 'USD', tutorial_done: true }))
    saveEntry('google')
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const auth = fakeAuth({ state: 'ready' }, { access_token: 't', user: { id: 'u1' } }, { signOut: vi.fn(async () => ({ signedOut: false, error: 'net' })) })
    render(<App auth={auth} />)
    await user.click(await screen.findByRole('button', { name: 'Settings' }))
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(alert).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Continue as guest' })).toBeNull()
  })

  it('switches UI language to Korean when chosen', async () => {
    const user = userEvent.setup()
    render(<App auth={fakeAuth({ state: 'unavailable', reason: 'network' })} />)
    await user.click(await screen.findByRole('button', { name: 'KO' }))
    expect(screen.getByRole('button', { name: '게스트로 시작하기' })).toBeInTheDocument()
    expect(screen.getByText(/로그인 서비스에 연결하지 못했어요/)).toBeInTheDocument()
  })

  it('uses a separate space for a signed-in account and signs out back to the entry screen', async () => {
    const user = userEvent.setup()
    localStorage.setItem(keyFor('guest', 'profile'), JSON.stringify({ version: 1, country: 'US', language: 'en', currency: 'USD', tutorial_done: true }))
    saveEntry('google')
    const auth = fakeAuth({ state: 'ready' }, { access_token: 't', user: { id: 'u1' } })
    render(<App auth={auth} />)
    // guest 프로필이 있어도 계정 공간은 비어 있으므로 온보딩부터
    expect(await screen.findByLabelText('Where are you visiting from?')).toBeInTheDocument()
    await finishOnboarding(user)
    expect(localStorage.getItem(keyFor('user:u1', 'profile'))).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Skip' }))
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    expect(await screen.findByText('me@example.com')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(auth.signOut).toHaveBeenCalled()
    expect(await screen.findByRole('button', { name: 'Continue as guest' })).toBeInTheDocument()
    expect(localStorage.getItem(keyFor('guest', 'profile'))).not.toBeNull()
  })

  it('on a failed callback offers guest access instead of a broken screen', async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, '', '/auth/callback?error=access_denied')
    const auth = fakeAuth({ state: 'ready' }, null, { handleAuthCallback: vi.fn(async () => ({ ok: false as const, error: 'cancelled' })) })
    render(<App auth={auth} />)
    expect(await screen.findByText('Sign-in was cancelled.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Continue as guest' }))
    expect(await screen.findByLabelText('Language')).toBeInTheDocument()
  })

  it('R1: while auth never answers on a Google return visit, the user can still continue as guest', async () => {
    const user = userEvent.setup()
    saveEntry('google')
    const auth = fakeAuth({ state: 'loading' }, null, { initializeAuth: vi.fn(() => new Promise<AuthStatus>(() => {})) })
    render(<App auth={auth} />)
    await user.click(await screen.findByRole('button', { name: 'Continue as guest' }))
    expect(await screen.findByLabelText('Language')).toBeInTheDocument()
  })

  it('R1: choosing guest during a pending callback is not overwritten when the exchange finishes later', async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, '', '/auth/callback?code=abc')
    let finish: (v: unknown) => void = () => {}
    const pending = new Promise((r) => { finish = r })
    const auth = fakeAuth({ state: 'ready' }, null, { handleAuthCallback: vi.fn(() => pending as never) })
    render(<App auth={auth} />)
    await user.click(await screen.findByRole('button', { name: 'Continue as guest' }))
    expect(await screen.findByLabelText('Language')).toBeInTheDocument()
    finish({ ok: true, session: { access_token: 't', user: { id: 'late' } } })
    await new Promise((r) => setTimeout(r, 10))
    expect(screen.getByLabelText('Language')).toBeInTheDocument()
    expect(localStorage.getItem('korea-locally/entry')).toBe('guest')
  })
})

// ── 통합 Home ──
const fx = { base: 'KRW', date: '2026-10-23', rates: { JPY: 0.11 }, source: { label: 'ECB reference rate', url: 'https://example.org/fx' }, fetched_at: 'x' }

function item(over: Partial<CatalogItem> & Pick<CatalogItem, 'id' | 'title'>): CatalogItem {
  return {
    kind: 'product', category: 'beauty', subtitle: '', description: '', image_url: null, price_krw: null, location: null,
    sources: [{ label: 'Official', url: `https://example.org/${over.id}`, checked_at: '2026-10-24' }],
    sponsorship: 'unknown', reasons: [], country_codes: [], tags: [], provenance: 'test', ...over,
  }
}

const natural = item({ id: 'p1', title: 'Natural Cream', subtitle: '올리브영 명동', price_krw: 20000 })
const paid = item({ id: 'p2', title: 'Paid Serum', sponsorship: 'sponsored', price_krw: 30000 })
const guide = item({ id: 'g1', kind: 'guide', category: 'medical', title: 'Clinic Portal', location: { name: 'Center', address: 'Seoul Jung-gu 1' } })
const tax = item({ id: 't1', kind: 'guide', title: 'Tax Refund Guide', tags: ['tax_refund'] })
const place = item({ id: 'pl1', kind: 'place', category: 'medical', title: 'Info Center' })

function stubApi(items: CatalogItem[], status: 'supported' | 'insufficient' = 'insufficient', catalog: CatalogItem[] = items) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url)
    const body = u.includes('/v1/fx')
      ? fx
      : u.includes('/v1/discovery/catalog')
        ? { items: catalog }
        : u.includes('/v1/discovery/recommendations')
          ? { items, country_context: { country: 'JP', status, explanation: 'Server explanation in English.' }, generated_at: 'x' }
          : null
    return body ? new Response(JSON.stringify(body), { status: 200 }) : new Response(JSON.stringify({ error: { message: 'off' } }), { status: 503 })
  }))
}

function guestHome(language = 'en', trip: unknown[] = []) {
  localStorage.setItem(keyFor('guest', 'profile'), JSON.stringify({ version: 1, country: 'JP', language, currency: 'JPY', tutorial_done: true }))
  if (trip.length) localStorage.setItem(keyFor('guest', 'trip'), JSON.stringify(trip))
  saveEntry('guest')
  return render(<App auth={fakeAuth({ state: 'disabled', reason: 'provider_disabled' })} />)
}

describe('integrated home', () => {
  it('keeps sponsored items out of the natural picks and shows them only in the Sponsored section', async () => {
    stubApi([natural, paid, guide, place])
    guestHome()
    const picks = await screen.findByRole('region', { name: 'Today’s beauty picks' })
    expect(within(picks).getByText('Natural Cream')).toBeInTheDocument()
    expect(within(picks).queryByText('Paid Serum')).toBeNull()
    expect(within(picks).getByText('Curated')).toBeInTheDocument()
    const sponsored = screen.getByRole('region', { name: 'Sponsored' })
    expect(within(sponsored).getByText('Paid Serum')).toBeInTheDocument()
    expect(within(sponsored).queryByText('Natural Cream')).toBeNull()
    // 협찬 표시가 없는 항목을 비협찬으로 단정하지 않는다
    expect(within(picks).getByText('Sponsorship unknown')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Medical & official guides' })).toBeNull() // 홈 의료·공식 안내 섹션은 제거됨(사용자 요청)
    expect(within(screen.getByRole('region', { name: 'Places' })).getByText('Info Center')).toBeInTheDocument()
  })

  it('caps each home section and links See all to the matching Explore tab, keeping server order', async () => {
    const user = userEvent.setup()
    const beauty = Array.from({ length: 10 }, (_, n) => item({ id: 'b' + n, title: 'Beauty ' + n, price_krw: 1000 }))
    const clinics = Array.from({ length: 9 }, (_, n) =>
      item({ id: 'c' + n, kind: 'place', category: 'medical', title: 'Clinic ' + n, tags: ['clinic', 'dermatology'], location: { name: 'C', address: '서울특별시 강남구 ' + n } }),
    )
    const spots = Array.from({ length: 12 }, (_, n) => item({ id: 's' + n, kind: 'place', title: 'Spot ' + n }))
    stubApi([...beauty, ...clinics, ...spots])
    guestHome()
    const picks = await screen.findByRole('region', { name: 'Today’s beauty picks' })
    expect(within(picks).getAllByRole('listitem').map((li) => li.textContent)).toEqual(beauty.slice(0, 6).map((b) => expect.stringContaining(b.title)))
    const places = screen.getByRole('region', { name: 'Places' })
    expect(within(places).getAllByRole('listitem')).toHaveLength(8)
    expect(within(places).queryByText('Clinic 0')).toBeNull() // 병원은 장소 섹션에 넣지 않는다(의료 바로가기로 탐색)
    expect(screen.queryByText('Clinic 0')).toBeNull()

    await user.click(within(picks).getByRole('button', { name: 'See all · Today’s beauty picks' }))
    expect(screen.getByRole('tab', { name: 'Beauty' })).toHaveAttribute('aria-selected', 'true')
  })

  it('shows an honest empty state when nothing sponsored is on display', async () => {
    stubApi([natural])
    guestHome()
    expect(await screen.findByText('There are no sponsored items on display right now.')).toBeInTheDocument()
  })

  it('shows neither a country-evidence notice nor the AI assistant on Home', async () => {
    stubApi([natural], 'insufficient')
    guestHome('ko')
    await screen.findByText('Natural Cream')
    expect(screen.queryByText('국가별 근거가 부족해요')).toBeNull()
    expect(screen.queryByText('여행에 대해 물어보세요')).toBeNull()
  })

  it('category shortcuts move to Explore and My Trip; search opens the search view', async () => {
    const user = userEvent.setup()
    stubApi([natural])
    guestHome()
    await screen.findByText('Natural Cream')
    await user.click(screen.getByRole('button', { name: 'Beauty' }))
    expect(screen.getByRole('button', { name: 'Explore' })).toHaveAttribute('aria-current', 'page')
    await user.click(screen.getByRole('button', { name: 'Home' }))
    await user.click(await screen.findByRole('button', { name: 'Trip plan' }))
    expect(screen.getByRole('button', { name: 'My Trip' })).toHaveAttribute('aria-current', 'page')
    await user.click(screen.getByRole('button', { name: 'Home' }))
    await user.click(await screen.findByRole('button', { name: 'Search products, clinics and places' }))
    expect(screen.queryByRole('button', { name: 'Search products, clinics and places' })).toBeNull()
  })

  it('offers the tax refund shortcut only when the catalog has that guide, and opens it', async () => {
    const user = userEvent.setup()
    stubApi([natural])
    const { unmount } = guestHome()
    await screen.findByText('Natural Cream')
    expect(screen.queryByRole('button', { name: 'Tax refund' })).toBeNull()
    unmount()
    localStorage.clear()
    stubApi([natural], 'insufficient', [natural, tax])
    guestHome()
    await user.click(await screen.findByRole('button', { name: 'Tax refund' }))
    // 상세가 열리면 홈(검색창)은 사라진다
    expect(screen.queryByRole('button', { name: 'Search products, clinics and places' })).toBeNull()
  })

  it('shows a trip summary banner that leads to My Trip', async () => {
    const user = userEvent.setup()
    stubApi([natural])
    guestHome('en', [{ entry_id: 'e1', item_id: 'pl1', title: 'Info Center', category: 'medical', location: null, day: 1 }])
    await user.click(await screen.findByRole('button', { name: /My Trip has 1 places/ }))
    expect(screen.getByRole('button', { name: 'My Trip' })).toHaveAttribute('aria-current', 'page')
  })

  it('tutorial points at the real bottom tabs and can be skipped in Korean', async () => {
    const user = userEvent.setup()
    stubApi([natural])
    localStorage.setItem(keyFor('guest', 'profile'), JSON.stringify({ version: 1, country: 'JP', language: 'ko', currency: 'JPY', tutorial_done: false }))
    saveEntry('guest')
    render(<App auth={fakeAuth({ state: 'disabled', reason: 'provider_disabled' })} />)
    const tour = await screen.findByRole('dialog')
    expect(document.querySelector('[data-tour="tab-1"]')).toHaveClass('is-tour-target')
    await user.click(within(tour).getByRole('button', { name: '다음' }))
    expect(document.querySelector('[data-tour="tab-2"]')).toHaveClass('is-tour-target')
    await user.click(within(tour).getByRole('button', { name: '건너뛰기' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(JSON.parse(localStorage.getItem(keyFor('guest', 'profile'))!).tutorial_done).toBe(true)
  })
})

describe('product name follows the screen language', () => {
  it('uses 진선미 for Korean screens and Jinseonmi for English screens in the browser title', async () => {
    saveEntry('guest')
    const save = (language: string) =>
      localStorage.setItem(keyFor('guest', 'profile'), JSON.stringify({ version: 1, country: 'JP', language, currency: 'JPY', tutorial_done: true }))
    const auth = fakeAuth({ state: 'disabled', reason: 'provider_disabled' })

    save('ko')
    const { unmount } = render(<App auth={auth} />)
    expect(await screen.findByRole('button', { name: '진선미' })).toBeInTheDocument()
    expect(document.title).toBe('진선미')
    unmount()

    save('en')
    render(<App auth={auth} />)
    expect(await screen.findByRole('button', { name: 'Jinseonmi' })).toBeInTheDocument()
    expect(document.title).toBe('Jinseonmi')
  })
})

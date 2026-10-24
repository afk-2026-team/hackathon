import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'
import type { Auth, AuthStatus } from '../auth/core'
import { fromApi, matchReference, type CompareResponse, type ReferenceProduct } from '../lib/compare'
import { resetReferenceCache } from '../lib/useCompare'
import { keyFor, saveEntry } from '../lib/storage'

// 테스트 평면 격리용 응답(실제 화면 데이터 아님)
const src = { label: 'Seller page', url: 'https://example.com/p', checked_at: '2026-10-24' }
const item = {
  id: 'cand-1', kind: 'product', category: 'beauty', title: 'Candidate Cream 75ml', subtitle: '후보 크림 · 75ml', description: 'A cream.',
  image_url: null, price_krw: 6900, location: null, sources: [src], sponsorship: 'unknown', reasons: ['Matches skincare interest'], country_codes: [], tags: [], provenance: 'curated',
}
const ref: ReferenceProduct = { id: 'ref-1', brand: 'Brand', title: 'Daily Cream', form: 'cream', volume_ml: 50, key_ingredients: ['ceramide'], ingredients_complete: true, ingredients_basis: 'label', price: { amount: 19.99, currency: 'USD', basis: 'US listing', source: src }, sources: [src], provenance: 'curated' }
const compareRes: CompareResponse = {
  current: ref, current_status: 'matched',
  candidate: { id: 'cand-1', title: 'Candidate Cream 75ml', form: 'cream', volume_ml: 75, key_ingredients: ['ceramide', 'panthenol'], ingredients_complete: false, ingredients_basis: 'label', price: { amount: 6900, currency: 'KRW', basis: 'Korea listing', source: src }, sources: [src] },
  common: [{ attribute: 'key_ingredients', current: ['ceramide'], candidate: ['ceramide'], basis: 'Both labels list ceramide', sources: [src] }],
  differences: [{ attribute: 'volume_ml', current: 50, candidate: 75, basis: 'Label size', sources: [src] }],
  unverified: [{ attribute: 'form', current: null, candidate: 'cream', basis: 'Not on the current label', sources: [src] }],
  price: { current: { amount: 19.99, currency: 'USD', basis: 'US listing', source: src }, candidate: { amount: 6900, currency: 'KRW', basis: 'Korea listing', source: src }, comparable: false, note: 'Different currencies; not converted.' },
  country_context: { country: 'US', status: 'insufficient', explanation: 'General.' }, notice: 'Not a claim of equal effect.', generated_at: 'x',
}

describe('compare adapter', () => {
  it('maps API points into rows and keeps missing values unknown', () => {
    const c = fromApi(compareRes, 'daily cream')
    expect(c.matched).toBe(true)
    expect(c.currentName).toBe('Daily Cream')
    expect(c.rows.map((r) => [r.kind, r.attribute, r.current, r.candidate])).toEqual([
      ['common', 'key_ingredients', 'ceramide', 'ceramide'],
      ['difference', 'volume_ml', '50 ml', '75 ml'],
      ['unverified', 'form', null, 'cream'],
    ])
    expect(c.rows[0].partial).toEqual({ current: false, candidate: true })
    expect(c.price.comparable).toBe(false)
    const unmatched = fromApi({ ...compareRes, current: null, current_status: 'unknown' }, 'Mystery serum')
    expect(unmatched).toMatchObject({ matched: false, currentName: 'Mystery serum' })
  })

  it('matches reference products by title ignoring case/spacing', () => {
    expect(matchReference('  daily   CREAM ', [ref])?.id).toBe('ref-1')
    expect(matchReference('Brand Daily Cream', [ref])?.id).toBe('ref-1')
    expect(matchReference('Other', [ref])).toBeUndefined()
  })

})

function fakeAuth(): Auth {
  const st: AuthStatus = { state: 'disabled', reason: 'x' }
  return { initializeAuth: vi.fn(async () => st), getStatus: () => st, getSession: vi.fn(async () => null), subscribeAuth: () => () => {}, signInWithGoogle: vi.fn(), handleAuthCallback: vi.fn(), signOut: vi.fn(), fetchMe: vi.fn() } as unknown as Auth
}

async function openCandidate(user: ReturnType<typeof userEvent.setup>) {
  const cards = await screen.findAllByText('Candidate Cream 75ml')
  await user.click(cards[0])
  return (await screen.findAllByRole('heading', { level: 1, name: 'Candidate Cream 75ml' }))[0]
}

describe('compare → evidence → save flow', () => {
  let compareCalls: unknown[]
  let failCompare: boolean
  let explainMode: 'ok' | 'fail' | 'slow'
  let releaseExplain: () => void
  beforeEach(() => {
    explainMode = 'ok'
    releaseExplain = () => {}
    resetReferenceCache()
    compareCalls = []
    failCompare = false
    saveEntry('guest')
    localStorage.setItem(keyFor('guest', 'profile'), JSON.stringify({ version: 1, country: 'US', language: 'en', currency: 'USD', tutorial_done: true }))
    window.history.replaceState(null, '', '/')
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/v1/discovery/catalog') return new Response(JSON.stringify({ items: [item] }))
      if (url === '/v1/discovery/recommendations') return new Response(JSON.stringify({ items: [item], country_context: compareRes.country_context, generated_at: 'x' }))
      if (url === '/v1/discovery/reference-products') return new Response(JSON.stringify({ items: [ref] }))
      if (url === '/v1/discovery/compare') {
        compareCalls.push(JSON.parse(init!.body as string))
        return failCompare ? new Response('', { status: 503 }) : new Response(JSON.stringify(compareRes))
      }
      if (url === '/v1/discovery/explain') {
        if (explainMode === 'fail') return new Response('', { status: 503 })
        const body = { text: 'Both list Ceramide NP. Sizes differ.', mode: 'fallback', fallback_reason: 'timeout', sources: [src], notice: 'n', generated_at: 'x' }
        if (explainMode === 'slow') await new Promise<void>((r) => { releaseExplain = r })
        return new Response(JSON.stringify(body))
      }
      return new Response('{}', { status: 404 })
    }))
  })

  it('opens the item from Home, compares with the typed product, then adds it to the cart', async () => {
    const user = userEvent.setup()
    render(<App auth={fakeAuth()} />)
    expect(await openCandidate(user)).toBeInTheDocument()
    await user.type(screen.getByLabelText('A product you use now'), 'daily cream')
    await user.click(screen.getByRole('button', { name: 'Compare' }))
    expect(await screen.findByText('In common')).toBeInTheDocument()
    expect(compareCalls[0]).toMatchObject({ candidate_id: 'cand-1', current_product_id: 'ref-1', profile: { country: 'US' } })
    expect(screen.getByText('50 ml')).toBeInTheDocument()
    expect(screen.getAllByText('Not known').length).toBeGreaterThan(0)
    expect(screen.getByText('Not a claim of equal effect.')).toBeInTheDocument()
    expect(screen.getByText('partial list')).toBeInTheDocument()
    expect(screen.getByText('Different currencies; not converted.')).toBeInTheDocument()
    expect(screen.getByText('USD 19.99')).toBeInTheDocument()
    // 입력한 현재 제품은 프로필에 남는다
    expect(JSON.parse(localStorage.getItem(keyFor('guest', 'profile'))!).preferences.current_product).toBe('daily cream')

    await user.click(screen.getByRole('button', { name: /Add to cart/ }))
    await user.click(screen.getByRole('button', { name: /Add to cart/ }))
    expect(JSON.parse(localStorage.getItem(keyFor('guest', 'cart'))!)[0].qty).toBe(2)
  })

  it('shows a retry when the compare API fails and recovers', async () => {
    failCompare = true
    localStorage.setItem(keyFor('guest', 'profile'), JSON.stringify({ version: 1, country: 'US', language: 'en', currency: 'USD', tutorial_done: true, preferences: { current_product: 'Unlisted serum' } }))
    const user = userEvent.setup()
    render(<App auth={fakeAuth()} />)
    await openCandidate(user)
    const region = await screen.findByRole('region', { name: 'Side by side' })
    const alert = await within(region).findByRole('alert')
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(alert).not.toHaveTextContent(/503/)
    expect(compareCalls[0]).toMatchObject({ current_product_name: 'Unlisted serum' })
    failCompare = false
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Different')).toBeInTheDocument()
  })

  it('shows the compare summary after the comparison, without hiding facts while it loads', async () => {
    explainMode = 'slow'
    localStorage.setItem(keyFor('guest', 'profile'), JSON.stringify({ version: 1, country: 'US', language: 'en', currency: 'USD', tutorial_done: true, preferences: { current_product: 'Daily Cream' } }))
    render(<App auth={fakeAuth()} />)
    await openCandidate(userEvent.setup())
    expect(await screen.findByText('Writing a short summary…')).toBeInTheDocument()
    expect(screen.getByText('In common')).toBeInTheDocument()
    releaseExplain()
    expect(await screen.findByText('Both list Ceramide NP. Sizes differ.')).toBeInTheDocument()
    expect(screen.getByText('Compare summary')).toBeInTheDocument()
    expect(screen.queryByText(/timeout|fallback/i)).toBeNull()
  })

  it('keeps the comparison when the summary request fails', async () => {
    explainMode = 'fail'
    localStorage.setItem(keyFor('guest', 'profile'), JSON.stringify({ version: 1, country: 'US', language: 'en', currency: 'USD', tutorial_done: true, preferences: { current_product: 'Daily Cream' } }))
    render(<App auth={fakeAuth()} />)
    await openCandidate(userEvent.setup())
    expect(await screen.findByText('In common')).toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByText('Compare summary')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'
import type { Auth, AuthStatus } from '../auth/core'
import { keyFor, saveEntry } from '../lib/storage'

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

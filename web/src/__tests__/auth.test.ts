import { describe, expect, it, vi } from 'vitest'
import { createAuth, CALLBACK_PATH } from '../auth/core'

// 테스트 평면 전용 가짜 SDK. 실제 로그인 성공을 뜻하지 않는다.
function fakeSdk(over: Record<string, unknown> = {}) {
  const session = { access_token: 'tok', user: { id: 'u1' } }
  const sdk = {
    auth: {
      signInWithOAuth: vi.fn(async () => ({ data: { url: 'https://proj.supabase.co/auth/v1/authorize?x=1' }, error: null })),
      exchangeCodeForSession: vi.fn(async () => ({ data: { session }, error: null })),
      getSession: vi.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signOut: vi.fn(async () => ({ error: null })),
      ...over,
    },
  }
  return sdk
}

function setup(config: unknown, { status = 200, sdk = fakeSdk(), href = 'http://localhost:5173/', timeoutMs = 8000 } = {}) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url === '/v1/auth/config') return new Response(JSON.stringify(config), { status })
    return new Response(JSON.stringify({ id: 'u1', email: 'a@b.c' }), { status: 200 })
  })
  const createClient = vi.fn(() => sdk)
  const location = { origin: 'http://localhost:5173', href, assign: vi.fn() }
  const history = { replaceState: vi.fn() }
  const auth = createAuth({ fetch: fetchMock as unknown as typeof fetch, createClient: createClient as never, location, history, timeoutMs })
  return { auth, sdk, createClient, location, history, fetchMock }
}

const cfg = { supabase_url: 'https://proj.supabase.co', publishable_key: 'pub', google_enabled: true, callback_path: '/auth/callback' }

describe('auth module contract', () => {
  it('creates a PKCE client from public config and signs in with fixed callback and minimal scopes', async () => {
    const { auth, createClient, sdk, location } = setup(cfg)
    expect(await auth.initializeAuth()).toEqual({ state: 'ready' })
    expect(createClient).toHaveBeenCalledWith('https://proj.supabase.co', 'pub', { auth: expect.objectContaining({ flowType: 'pkce', persistSession: true, autoRefreshToken: true }) })
    await auth.signInWithGoogle()
    expect(sdk.auth.signInWithOAuth).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: 'http://localhost:5173' + CALLBACK_PATH, scopes: 'openid email profile', skipBrowserRedirect: true } })
    expect(location.assign).toHaveBeenCalledWith('https://proj.supabase.co/auth/v1/authorize?x=1')
  })

  it('ignores a server-provided callback path and refuses foreign redirect URLs', async () => {
    const sdk = fakeSdk({ signInWithOAuth: vi.fn(async () => ({ data: { url: 'https://evil.example/' }, error: null })) })
    const { auth, location } = setup({ ...cfg, callback_path: 'https://evil.example/cb' }, { sdk })
    await auth.initializeAuth()
    expect(await auth.signInWithGoogle()).toEqual({ error: 'unexpected_redirect' })
    expect(sdk.auth.signInWithOAuth.mock.calls[0]).toBeDefined()
    expect(location.assign).not.toHaveBeenCalled()
  })

  it('reports disabled provider, 503 and malformed config without pretending Google works', async () => {
    expect(await setup({ ...cfg, google_enabled: false }).auth.initializeAuth()).toEqual({ state: 'disabled', reason: 'provider_disabled' })
    expect(await setup({}, { status: 503 }).auth.initializeAuth()).toEqual({ state: 'unavailable', reason: 'not_configured' })
    expect(await setup({ supabase_url: 'http://insecure' }).auth.initializeAuth()).toMatchObject({ state: 'unavailable' })
    const disabled = setup({ ...cfg, google_enabled: false })
    await disabled.auth.initializeAuth()
    expect(await disabled.auth.signInWithGoogle()).toEqual({ error: 'google_unavailable' })
  })

  it('exchanges the callback code only once and strips it from the URL', async () => {
    const { auth, sdk, history } = setup(cfg, { href: 'http://localhost:5173/auth/callback?code=abc' })
    const [a, b] = await Promise.all([auth.handleAuthCallback(), auth.handleAuthCallback()])
    expect(a.ok && b.ok).toBe(true)
    expect(sdk.auth.exchangeCodeForSession).toHaveBeenCalledTimes(1)
    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/')
  })

  it('StrictMode-style second call without href gets the same success, not missing_code', async () => {
    const { auth, sdk, location, history } = setup(cfg, { href: 'http://localhost:5173/auth/callback?code=abc' })
    history.replaceState.mockImplementation(() => { location.href = 'http://localhost:5173/' })
    const first = auth.handleAuthCallback()
    const second = auth.handleAuthCallback()
    expect(await second).toEqual(await first)
    expect((await first).ok).toBe(true)
    expect(sdk.auth.exchangeCodeForSession).toHaveBeenCalledTimes(1)
  })

  it('wraps config network failure and getSession rejection without throwing', async () => {
    const netFail = createAuth({ fetch: (async () => { throw new Error('offline') }) as unknown as typeof fetch, createClient: vi.fn() as never, location: { origin: 'o', href: 'http://o/auth/callback?code=c', assign: vi.fn() }, history: { replaceState: vi.fn() } })
    expect(await netFail.initializeAuth()).toEqual({ state: 'unavailable', reason: 'network' })
    expect(await netFail.handleAuthCallback()).toEqual({ ok: false, error: 'google_unavailable' })
    const sdk = fakeSdk({ getSession: vi.fn(async () => { throw new Error('storage') }) })
    const { auth } = setup(cfg, { sdk })
    await auth.initializeAuth()
    expect(await auth.getSession()).toBeNull()
  })

  it('handles cancel, missing code and exchange failure', async () => {
    expect(await setup(cfg).auth.handleAuthCallback('http://localhost:5173/auth/callback?error=access_denied')).toEqual({ ok: false, error: 'cancelled' })
    expect(await setup(cfg).auth.handleAuthCallback('http://localhost:5173/auth/callback')).toEqual({ ok: false, error: 'missing_code' })
    const sdk = fakeSdk({ exchangeCodeForSession: vi.fn(async () => { throw new Error('boom') }) })
    expect(await setup(cfg, { sdk }).auth.handleAuthCallback('http://localhost:5173/auth/callback?code=z')).toEqual({ ok: false, error: 'exchange_failed' })
  })

  it('signs out locally and reports failure when a session remains', async () => {
    const ok = setup(cfg)
    await ok.auth.initializeAuth()
    expect(await ok.auth.signOut()).toEqual({ signedOut: true, error: null })
    expect(ok.sdk.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    const stuck = fakeSdk({ signOut: vi.fn(async () => ({ error: { message: 'net' } })), getSession: vi.fn(async () => ({ data: { session: { user: { id: 'u1' } } } })) })
    const bad = setup(cfg, { sdk: stuck })
    await bad.auth.initializeAuth()
    expect(await bad.auth.signOut()).toEqual({ signedOut: false, error: 'net' })
  })

  it('treats SDK init failure as unavailable and sends the bearer token to /me', async () => {
    const boom = createAuth({ fetch: (async () => new Response(JSON.stringify(cfg))) as unknown as typeof fetch, createClient: (() => { throw new Error('x') }) as never, location: { origin: 'o', href: 'o', assign: vi.fn() }, history: { replaceState: vi.fn() } })
    expect(await boom.initializeAuth()).toEqual({ state: 'unavailable', reason: 'sdk_init_failed' })
    const { auth, fetchMock } = setup(cfg)
    const me = await auth.fetchMe({ access_token: 'tok' } as never)
    expect(me?.id).toBe('u1')
    expect(fetchMock).toHaveBeenCalledWith('/v1/auth/me', { headers: { Authorization: 'Bearer tok' } })
  })

  it('R1: a config request that never answers times out instead of hanging', async () => {
    const hanging = createAuth({ fetch: (() => new Promise(() => {})) as unknown as typeof fetch, createClient: vi.fn() as never, location: { origin: 'o', href: 'o', assign: vi.fn() }, history: { replaceState: vi.fn() }, timeoutMs: 20 })
    expect(await hanging.initializeAuth()).toEqual({ state: 'unavailable', reason: 'timeout' })
  })

  it('R1: callback removes the code from the URL synchronously and a hanging exchange ends with timeout', async () => {
    const sdk = fakeSdk({ exchangeCodeForSession: vi.fn(() => new Promise(() => {})) })
    const { auth, history } = setup(cfg, { sdk, href: 'http://localhost:5173/auth/callback?code=abc', timeoutMs: 20 })
    const p = auth.handleAuthCallback()
    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/')
    expect(await p).toEqual({ ok: false, error: 'timeout' })
  })

  it('R2: sign-out is not reported as success when the follow-up session check fails', async () => {
    const sdk = fakeSdk({ signOut: vi.fn(async () => ({ error: { message: 'net' } })), getSession: vi.fn(async () => { throw new Error('storage') }) })
    const { auth } = setup(cfg, { sdk })
    await auth.initializeAuth()
    expect(await auth.signOut()).toEqual({ signedOut: false, error: 'net' })
    const sdk2 = fakeSdk({ signOut: vi.fn(async () => { throw new Error('x') }), getSession: vi.fn(() => new Promise(() => {})) })
    const s2 = setup(cfg, { sdk: sdk2, timeoutMs: 20 })
    await s2.auth.initializeAuth()
    expect(await s2.auth.signOut()).toEqual({ signedOut: false, error: 'sign_out_failed' })
  })

  it('returns signInWithOAuth exceptions as an error value instead of rejecting', async () => {
    const sdk = fakeSdk({ signInWithOAuth: vi.fn(async () => { throw new Error('popup') }) })
    const { auth, location } = setup(cfg, { sdk })
    await auth.initializeAuth()
    await expect(auth.signInWithGoogle()).resolves.toEqual({ error: 'sign_in_failed' })
    expect(location.assign).not.toHaveBeenCalled()
  })
})

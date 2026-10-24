import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'

// 뷰와 분리된 인증 모듈. 공개 설정(/v1/auth/config)만으로 SDK 를 만들고, 비밀값은 프론트에 두지 않는다.
export const CALLBACK_PATH = '/auth/callback'
const SCOPES = 'openid email profile'

export interface AuthConfig {
  supabase_url: string
  publishable_key: string
  google_enabled: boolean
  callback_path: string
}

export type AuthStatus =
  | { state: 'loading' }
  | { state: 'ready' } // Google 로그인 사용 가능
  | { state: 'disabled'; reason: string } // 서버가 Google 비활성으로 응답
  | { state: 'unavailable'; reason: string } // 설정 API 실패·503·형식 오류

export interface MeUser {
  id: string
  email?: string
  display_name?: string
  avatar_url?: string
}

export type CallbackResult = { ok: true; session: Session } | { ok: false; error: string }

interface Deps {
  fetch: typeof fetch
  createClient: typeof createClient
  location: Pick<Location, 'origin' | 'href' | 'assign'>
  history: Pick<History, 'replaceState'>
  /** 설정 요청·세션 확인·code 교환의 최대 대기 시간(ms). 응답이 없어도 화면이 멈추지 않게 한다. */
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 8000

class TimeoutError extends Error {}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError('timeout')), ms)
    p.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      },
    )
  })
}

function isConfig(v: unknown): v is AuthConfig {
  const o = v as AuthConfig
  return !!o && typeof o.supabase_url === 'string' && /^https:\/\//.test(o.supabase_url) && typeof o.publishable_key === 'string' && typeof o.google_enabled === 'boolean'
}

export function createAuth(deps: Deps) {
  let client: SupabaseClient | null = null
  let status: AuthStatus = { state: 'loading' }
  let initPromise: Promise<AuthStatus> | null = null
  let supabaseUrl = ''
  let callbackRun: Promise<CallbackResult> | null = null
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS

  async function initializeAuth(): Promise<AuthStatus> {
    if (initPromise) return initPromise
    initPromise = (async (): Promise<AuthStatus> => {
      let res: Response
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null
      try {
        res = await withTimeout(deps.fetch('/v1/auth/config', ctrl ? { signal: ctrl.signal } : undefined), timeoutMs)
      } catch (e) {
        ctrl?.abort()
        return (status = { state: 'unavailable', reason: e instanceof TimeoutError ? 'timeout' : 'network' })
      }
      if (!res.ok) return (status = { state: 'unavailable', reason: res.status === 503 ? 'not_configured' : `http_${res.status}` })
      let cfg: unknown
      try {
        cfg = await withTimeout(res.json(), timeoutMs)
      } catch {
        return (status = { state: 'unavailable', reason: 'malformed' })
      }
      if (!isConfig(cfg)) return (status = { state: 'unavailable', reason: 'malformed' })
      supabaseUrl = cfg.supabase_url.replace(/\/+$/, '')
      try {
        client = deps.createClient(cfg.supabase_url, cfg.publishable_key, {
          auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
        })
      } catch {
        client = null
        return (status = { state: 'unavailable', reason: 'sdk_init_failed' })
      }
      return (status = cfg.google_enabled ? { state: 'ready' } : { state: 'disabled', reason: 'provider_disabled' })
    })()
    initPromise = initPromise.catch(() => (status = { state: 'unavailable', reason: 'init_failed' }))
    return initPromise
  }

  // 복귀 주소는 항상 같은 origin 의 고정 경로다. 서버 값이나 쿼리의 returnTo 를 따르지 않는다.
  const callbackUrl = () => deps.location.origin + CALLBACK_PATH

  async function signInWithGoogle(): Promise<{ error: string | null }> {
    if (status.state !== 'ready' || !client) return { error: 'google_unavailable' }
    let data: { url?: string | null } | null
    let error: { message: string } | null
    try {
      ;({ data, error } = await withTimeout(
        client.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: callbackUrl(), scopes: SCOPES, skipBrowserRedirect: true },
        }),
        timeoutMs,
      ))
    } catch (e) {
      return { error: e instanceof TimeoutError ? 'timeout' : 'sign_in_failed' }
    }
    if (error || !data?.url) return { error: error?.message ?? 'no_redirect_url' }
    // SDK 가 만든 주소가 설정한 Supabase 로 가는지 확인한 뒤 이동한다.
    if (!data.url.startsWith(supabaseUrl + '/')) return { error: 'unexpected_redirect' }
    deps.location.assign(data.url)
    return { error: null }
  }

  /**
   * /auth/callback 에서 code 를 한 번만 교환한다. 첫 호출이 URL 을 읽고 지우며,
   * 이후 호출(StrictMode 두 번째 effect 등)은 같은 Promise 를 그대로 돌려받는다.
   */
  function handleAuthCallback(href: string = deps.location.href): Promise<CallbackResult> {
    if (callbackRun) return callbackRun
    let url: URL
    try {
      url = new URL(href)
    } catch {
      return (callbackRun = Promise.resolve({ ok: false, error: 'missing_code' }))
    }
    const code = url.searchParams.get('code')
    const err = url.searchParams.get('error_description') ?? url.searchParams.get('error')
    // 진입 즉시 code 를 주소창·기록에서 지운다(교환이 오래 걸리거나 사용자가 게스트로 떠나도 남지 않게).
    try {
      deps.history.replaceState(null, '', '/')
    } catch {
      /* noop */
    }
    const run = (async (): Promise<CallbackResult> => {
      if (err) return { ok: false, error: err === 'access_denied' ? 'cancelled' : err }
      if (!code) return { ok: false, error: 'missing_code' }
      let st: AuthStatus
      try {
        st = await initializeAuth()
      } catch {
        return { ok: false, error: 'google_unavailable' }
      }
      if (st.state === 'unavailable' || !client) return { ok: false, error: 'google_unavailable' }
      try {
        const { data, error } = await withTimeout(client.auth.exchangeCodeForSession(code), timeoutMs)
        if (error || !data.session) return { ok: false, error: error?.message ?? 'exchange_failed' }
        return { ok: true, session: data.session }
      } catch (e) {
        return { ok: false, error: e instanceof TimeoutError ? 'timeout' : 'exchange_failed' }
      }
    })()
    callbackRun = run
    return run
  }

  /** 세션 확인 결과. 확인 자체가 실패(예외·시간 초과)한 경우를 '세션 없음'과 구분한다. */
  async function readSession(): Promise<{ ok: true; session: Session | null } | { ok: false }> {
    if (!client) return { ok: true, session: null }
    try {
      const { data } = await withTimeout(client.auth.getSession(), timeoutMs)
      return { ok: true, session: data.session }
    } catch {
      return { ok: false }
    }
  }

  /** 화면 표시용. 확인에 실패하면 null(로그인 안 된 것으로 보고 게스트 진입을 막지 않음). */
  async function getSession(): Promise<Session | null> {
    const r = await readSession()
    return r.ok ? r.session : null
  }

  function subscribeAuth(cb: (session: Session | null) => void): () => void {
    if (!client) return () => {}
    const { data } = client.auth.onAuthStateChange((_e, s) => cb(s))
    return () => data.subscription.unsubscribe()
  }

  /** 이 기기 세션만 끝낸다. 실패하면 세션이 남았는지 다시 확인해 결과를 돌려준다. */
  async function signOut(): Promise<{ signedOut: boolean; error: string | null }> {
    if (!client) return { signedOut: true, error: null }
    let error: string | null = null
    try {
      const r = await client.auth.signOut({ scope: 'local' })
      error = r.error?.message ?? null
    } catch {
      error = 'sign_out_failed'
    }
    const check = await readSession()
    // 세션이 없다는 것을 확인했을 때만 로그아웃 성공으로 본다
    if (!check.ok) return { signedOut: false, error: error ?? 'session_check_failed' }
    return { signedOut: !check.session, error }
  }

  /** 서버가 토큰을 검증한 사용자. 로컬 세션만으로 권한을 판단하지 않을 때 쓴다. */
  async function fetchMe(session: Session): Promise<MeUser | null> {
    try {
      const res = await deps.fetch('/v1/auth/me', { headers: { Authorization: `Bearer ${session.access_token}` } })
      if (!res.ok) return null
      const u = (await res.json()) as MeUser
      return u && typeof u.id === 'string' ? u : null
    } catch {
      return null
    }
  }

  return { initializeAuth, signInWithGoogle, handleAuthCallback, getSession, subscribeAuth, signOut, fetchMe, getStatus: () => status }
}

export type Auth = ReturnType<typeof createAuth>

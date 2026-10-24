import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { auth as defaultAuth, CALLBACK_PATH, useAuth, type Auth, type MeUser } from './auth'
import { loadEntry, migrateLegacy, saveEntry, type EntryChoice } from './lib/storage'
import { browserLang, LangContext, translate, type Lang } from './lib/i18n'
import { Workspace } from './Workspace'
import { Entry } from './screens/Entry'
import { AuthCallback } from './screens/AuthCallback'

export default function App({ auth = defaultAuth }: { auth?: Auth }) {
  const [entry, setEntryState] = useState<EntryChoice | null>(() => {
    migrateLegacy()
    return loadEntry()
  })
  const [lang, setLang] = useState<Lang>(browserLang)
  const [inCallback, setInCallback] = useState(() => window.location.pathname === CALLBACK_PATH)
  const [signInError, setSignInError] = useState<string | null>(null)
  const [me, setMe] = useState<MeUser | null>(null)
  const { status, session, checked, setSession } = useAuth(auth)

  const setEntry = (v: EntryChoice | null) => {
    saveEntry(v)
    setEntryState(v)
  }

  // 표시용 사용자 정보는 서버가 검증한 /v1/auth/me 결과만 쓴다.
  useEffect(() => {
    let alive = true
    setMe(null)
    if (session && entry === 'google') auth.fetchMe(session).then((u) => alive && setMe(u))
    return () => {
      alive = false
    }
  }, [auth, session, entry])

  const google = async () => {
    setSignInError(null)
    const { error } = await auth.signInWithGoogle()
    if (error) setSignInError(error)
  }
  const signOut = async () => {
    const r = await auth.signOut()
    if (!r.signedOut) {
      // 세션이 남아 있으면 로그아웃된 척하지 않는다
      window.alert(lang === 'ko' ? '로그아웃하지 못했어요. 다시 시도해 주세요.' : 'Sign-out failed. Please try again.')
      return
    }
    setSession(null as Session | null)
    setEntry(null)
  }

  let screen: React.ReactNode
  if (inCallback) {
    screen = (
      <AuthCallback
        auth={auth}
        onSuccess={(s) => {
          setSession(s)
          setEntry('google')
          setInCallback(false)
        }}
        onGuest={() => {
          setEntry('guest')
          setInCallback(false)
        }}
        onRetry={() => {
          setInCallback(false)
          void google()
        }}
      />
    )
  } else if (entry === 'guest') {
    screen = (
      <Workspace
        key="guest"
        ns="guest"
        uiLang={lang}
        account={{ kind: 'guest', googleAvailable: status.state === 'ready' }}
        onSignIn={google}
        onSignOut={signOut}
        onResetDone={() => setEntry(null)}
      />
    )
  } else if (entry === 'google' && !checked) {
    screen = (
      <main className="onboarding">
        <div className="state" aria-busy="true">
          <span className="spinner" aria-hidden="true" />
          <button type="button" className="btn btn--ghost" onClick={() => setEntry('guest')}>{translate(lang, 'entry.guest')}</button>
        </div>
      </main>
    )
  } else if (entry === 'google' && session) {
    const ns = `user:${session.user.id}` as const
    screen = (
      <Workspace
        key={ns}
        ns={ns}
        uiLang={lang}
        account={{ kind: 'google', label: me?.email ?? me?.display_name ?? 'Google account', googleAvailable: true }}
        onSignIn={google}
        onSignOut={signOut}
        onResetDone={() => void signOut()}
      />
    )
  } else {
    // 첫 방문, 로그아웃 후, 또는 Google 세션이 만료된 경우
    screen = <Entry status={status} lang={lang} onLang={setLang} onGoogle={google} onGuest={() => setEntry('guest')} error={signInError} />
  }

  return <LangContext.Provider value={lang}>{screen}</LangContext.Provider>
}

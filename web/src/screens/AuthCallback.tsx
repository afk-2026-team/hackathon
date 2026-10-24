import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Auth } from '../auth'
import { DocTitle, useT } from '../lib/i18n'
import { GoogleMark } from './Entry'
import '../styles/shell.css'

interface Props {
  auth: Auth
  onSuccess: (s: Session) => void
  onGuest: () => void
  onRetry: () => void
}

export function AuthCallback({ auth, onSuccess, onGuest, onRetry }: Props) {
  const t = useT()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    // StrictMode 로 두 번 실행돼도 handleAuthCallback 이 같은 결과를 돌려주므로 교환은 한 번이다.
    auth.handleAuthCallback().then((r) => {
      if (!alive) return
      if (r.ok) onSuccess(r.session)
      else setError(r.error)
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth])

  return (
    <main className="shell-page callback">
      <DocTitle />
      <header className="shell-page__head">
        <span className="brand-mark brand-mark--static">
          <span className="brand-mark__word">{t('brand')}</span>
          <span className="brand-mark__dot" aria-hidden="true" />
        </span>
      </header>
      {!error ? (
        <section className="callback__body" aria-busy="true">
          <span className="spinner" aria-hidden="true" />
          <p className="callback__title">{t('callback.working')}</p>
          <button type="button" className="btn btn--ghost" onClick={onGuest}>{t('entry.guest')}</button>
        </section>
      ) : (
        <section className="callback__body">
          <span className={`callback__icon${error === 'cancelled' ? '' : ' callback__icon--error'}`} aria-hidden="true">!</span>
          <h1 className="callback__title">{error === 'cancelled' ? t('callback.cancelled') : t('callback.failed')}</h1>
          <p className="lead">{t('shell.callback.lead')}</p>
          {error !== 'cancelled' && <p className="shell-hint shell-hint--error" role="alert">{error}</p>}
          <div className="callback__actions">
            <button type="button" className="btn btn--google btn--block btn--lg" onClick={onRetry}><GoogleMark />{t('callback.retry')}</button>
            <button type="button" className="btn btn--primary btn--block btn--lg" onClick={onGuest}>{t('entry.guest')}</button>
          </div>
        </section>
      )}
    </main>
  )
}

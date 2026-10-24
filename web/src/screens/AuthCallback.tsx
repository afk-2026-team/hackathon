import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Auth } from '../auth'
import { useT } from '../lib/i18n'

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

  if (!error) {
    return (
      <main className="onboarding">
        <div className="state" aria-busy="true">
          <span className="spinner" aria-hidden="true" />
          <p>{t('callback.working')}</p>
          <button type="button" className="btn btn--ghost" onClick={onGuest}>{t('entry.guest')}</button>
        </div>
      </main>
    )
  }
  return (
    <main className="onboarding">
      <section className="onboarding__step">
        <h1>{error === 'cancelled' ? t('callback.cancelled') : t('callback.failed')}</h1>
        {error !== 'cancelled' && <p className="note note--error" role="alert">{error}</p>}
        <div className="entry__actions">
          <button type="button" className="btn btn--ghost btn--block" onClick={onRetry}>{t('callback.retry')}</button>
          <button type="button" className="btn btn--primary btn--block" onClick={onGuest}>{t('entry.guest')}</button>
        </div>
      </section>
    </main>
  )
}

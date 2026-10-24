import type { AuthStatus } from '../auth'
import { DocTitle, UI_LANGS, useT, type Lang } from '../lib/i18n'

interface Props {
  status: AuthStatus
  lang: Lang
  onLang: (l: Lang) => void
  onGoogle: () => void
  onGuest: () => void
  error?: string | null
}

// 첫 화면: Google 로그인 또는 게스트. 게스트는 인증 상태와 상관없이 항상 가능하다.
export function Entry({ status, lang, onLang, onGoogle, onGuest, error }: Props) {
  const t = useT()
  const googleReady = status.state === 'ready'
  return (
    <main className="onboarding entry">
      <header className="onboarding__head">
        <DocTitle />
        <p className="brand">{t('brand')}</p>
        <div className="segmented segmented--quiet" role="group" aria-label="Language">
          {UI_LANGS.map((l) => (
            <button key={l.code} type="button" className={lang === l.code ? 'is-on' : ''} aria-pressed={lang === l.code} onClick={() => onLang(l.code)}>
              {l.code.toUpperCase()}
            </button>
          ))}
        </div>
      </header>
      <section className="onboarding__step">
        <h1>{t('entry.title')}</h1>
        <p className="lead">{t('entry.lead')}</p>
        <div className="entry__actions">
          <button type="button" className="btn btn--google btn--block" disabled={!googleReady} onClick={onGoogle}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path fill="#4285F4" d="M22.6 12.3c0-.8-.1-1.5-.2-2.3H12v4.3h5.9a5 5 0 01-2.2 3.3v2.8h3.6c2.1-1.9 3.3-4.8 3.3-8.1z" />
              <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.6H2.1v2.9A11 11 0 0012 23z" />
              <path fill="#FBBC05" d="M5.8 14c-.2-.7-.4-1.3-.4-2s.1-1.4.4-2V7.1H2.1A11 11 0 001 12c0 1.8.4 3.5 1.1 4.9z" />
              <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0012 1 11 11 0 002.1 7.1L5.8 10c.9-2.7 3.3-4.6 6.2-4.6z" />
            </svg>
            {t('entry.google')}
          </button>
          {status.state === 'loading' && <p className="note">{t('entry.checking')}</p>}
          {status.state === 'disabled' && <p className="note">{t('entry.disabled')}</p>}
          {status.state === 'unavailable' && <p className="note">{t('entry.unavailable')}</p>}
          {error && <p className="note note--error" role="alert">{error}</p>}
          <button type="button" className="btn btn--ghost btn--block" onClick={onGuest}>{t('entry.guest')}</button>
          <p className="note">{t('entry.guestNote')}</p>
        </div>
      </section>
    </main>
  )
}

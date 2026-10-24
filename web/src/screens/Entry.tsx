import type { AuthStatus } from '../auth'
import { DocTitle, UI_LANGS, useT, type Lang } from '../lib/i18n'
import '../styles/shell.css'

interface Props {
  status: AuthStatus
  lang: Lang
  onLang: (l: Lang) => void
  onGoogle: () => void
  onGuest: () => void
  error?: string | null
}

export function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path fill="#4285F4" d="M22.6 12.3c0-.8-.1-1.5-.2-2.3H12v4.3h5.9a5 5 0 01-2.2 3.3v2.8h3.6c2.1-1.9 3.3-4.8 3.3-8.1z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.6H2.1v2.9A11 11 0 0012 23z" />
      <path fill="#FBBC05" d="M5.8 14c-.2-.7-.4-1.3-.4-2s.1-1.4.4-2V7.1H2.1A11 11 0 001 12c0 1.8.4 3.5 1.1 4.9z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0012 1 11 11 0 002.1 7.1L5.8 10c.9-2.7 3.3-4.6 6.2-4.6z" />
    </svg>
  )
}

const PILLARS = [
  { key: 'beauty', title: 'shell.entry.p1', body: 'shell.entry.p1b' },
  { key: 'medical', title: 'shell.entry.p2', body: 'shell.entry.p2b' },
  { key: 'trip', title: 'shell.entry.p3', body: 'shell.entry.p3b' },
] as const

// 첫 화면: 서비스 한 줄 가치 + Google 로그인 또는 게스트. 게스트는 인증 상태와 상관없이 항상 가능하다.
export function Entry({ status, lang, onLang, onGoogle, onGuest, error }: Props) {
  const t = useT()
  const googleReady = status.state === 'ready'
  return (
    <main className="shell-page entry">
      <DocTitle />
      <header className="shell-page__head">
        <span className="brand-mark brand-mark--static">
          <span className="brand-mark__word">{t('brand')}</span>
          <span className="brand-mark__dot" aria-hidden="true" />
        </span>
        <div className="shell-lang" role="group" aria-label={t('shell.langGroup')}>
          {UI_LANGS.map((l) => (
            <button key={l.code} type="button" className={lang === l.code ? 'is-on' : ''} aria-pressed={lang === l.code} onClick={() => onLang(l.code)}>
              {l.code.toUpperCase()}
            </button>
          ))}
        </div>
      </header>

      <section className="entry__hero">
        <p className="entry__eyebrow">{t('shell.entry.eyebrow')}</p>
        <h1 className="entry__title">{t('entry.title')}</h1>
        <ul className="entry__pillars">
          {PILLARS.map((p) => (
            <li key={p.key} className={`entry__pillar entry__pillar--${p.key}`}>
              <span className="entry__pillar-dot" aria-hidden="true" />
              <div>
                <strong>{t(p.title)}</strong>
                <span>{t(p.body)}</span>
              </div>
            </li>
          ))}
        </ul>
        <p className="entry__evidence">
          <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
            <path d="M10 2l6 2.5v4.7c0 3.9-2.6 7.2-6 8.8-3.4-1.6-6-4.9-6-8.8V4.5zm2.9 5.2l-3.6 3.7-1.6-1.6-1.1 1.1 2.7 2.7 4.7-4.8z" fill="currentColor" />
          </svg>
          {t('shell.entry.evidence')}
        </p>
      </section>

      <section className="entry__actions">
        <p className="lead">{t('entry.lead')}</p>
        <button type="button" className="btn btn--google btn--block btn--lg" disabled={!googleReady} onClick={onGoogle}>
          <GoogleMark />
          {t('entry.google')}
        </button>
        {status.state === 'loading' && <p className="shell-hint">{t('entry.checking')}</p>}
        {status.state === 'disabled' && <p className="shell-hint">{t('entry.disabled')}</p>}
        {status.state === 'unavailable' && <p className="shell-hint">{t('entry.unavailable')}</p>}
        {error && <p className="shell-hint shell-hint--error" role="alert">{error}</p>}
        <div className="entry__or" aria-hidden="true"><span>{t('shell.entry.or')}</span></div>
        <button type="button" className="btn btn--primary btn--block btn--lg" onClick={onGuest}>{t('entry.guest')}</button>
        <p className="shell-hint shell-hint--center">{t('entry.guestNote')}</p>
      </section>
    </main>
  )
}

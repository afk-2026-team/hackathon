import type { Profile } from '../lib/storage'
import { LANGUAGES } from '../lib/options'
import { useLang, useT, type Key } from '../lib/i18n'
import { SubBar } from '../components/Common'
import { localCountry } from '../components/CountryNote'
import { GoogleMark } from './Entry'
import '../styles/shell.css'

export interface AccountView {
  kind: 'guest' | 'google'
  label?: string
  googleAvailable: boolean
}

interface Props {
  profile: Profile
  onEdit: () => void
  onReplayTour: () => void
  onReset: () => void
  onClose: () => void
  account: AccountView
  onSignIn: () => void
  onSignOut: () => void
}

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
  )
}

export function Settings({ profile, onEdit, onReplayTour, onReset, onClose, account, onSignIn, onSignOut }: Props) {
  const t = useT()
  const lang = useLang()
  const langName = LANGUAGES.find((l) => l.code === profile.language)?.name ?? profile.language
  const label = (prefix: 'shell.g.' | 'shell.i.', code: string) => t(`${prefix}${code}` as Key) ?? code
  const interests = profile.preferences?.interests?.map((c) => label('shell.i.', c)).join(', ')
  const google = account.kind === 'google'

  const rows: { k: Key; v: string }[] = [
    { k: 'shell.set.language', v: langName },
    { k: 'shell.set.from', v: localCountry(profile.country, lang) },
    { k: 'shell.set.currency', v: profile.currency },
    { k: 'shell.set.gender', v: profile.gender ? label('shell.g.', profile.gender) : t('shell.set.notShared') },
    { k: 'shell.set.age', v: profile.age_range ?? t('shell.set.notShared') },
    { k: 'shell.set.interests', v: interests || t('shell.set.notSet') },
  ]

  return (
    <div className="settings">
      <SubBar title={t('settings.title')} onBack={onClose} />

      <section className="set__account" aria-label={t('settings.account')}>
        <span className={`set__avatar${google ? ' set__avatar--google' : ''}`} aria-hidden="true">
          {google ? <GoogleMark /> : (
            <svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 12a4 4 0 100-8 4 4 0 000 8zm0 2c-4 0-7 2-7 4.5V20h14v-1.5C19 16 16 14 12 14z" fill="currentColor" /></svg>
          )}
        </span>
        <div className="set__who">
          <span className="set__who-kind">{t('settings.account')}</span>
          <strong>{google ? account.label ?? 'Google' : t('settings.guest')}</strong>
        </div>
        {google ? (
          <button type="button" className="btn btn--ghost btn--small" onClick={onSignOut}>{t('settings.signOut')}</button>
        ) : (
          <button type="button" className="btn btn--ghost btn--small" disabled={!account.googleAvailable} onClick={onSignIn}>{t('settings.signIn')}</button>
        )}
      </section>
      {!google && !account.googleAvailable && <p className="set__hint">{t('shell.set.googleOff')}</p>}

      <div className="divider" />

      <section className="set__group">
        <div className="set__group-head">
          <h2>{t('shell.set.profile')}</h2>
          <button type="button" className="btn btn--text" onClick={onEdit}>{t('settings.edit')}</button>
        </div>
        <dl className="set__facts">
          {rows.map((r) => (
            <div key={r.k}>
              <dt>{t(r.k)}</dt>
              <dd>{r.v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="divider" />

      <section className="set__group">
        <div className="set__group-head"><h2>{t('shell.set.app')}</h2></div>
        <ul className="set__menu">
          <li>
            <button type="button" onClick={onReplayTour}><span>{t('shell.set.tour')}</span><Chevron /></button>
          </li>
          <li>
            <button type="button" className="set__danger" onClick={onReset}><span>{t('shell.set.reset')}</span><Chevron /></button>
          </li>
        </ul>
        <p className="set__hint">{t('shell.set.storage')}</p>
      </section>
    </div>
  )
}

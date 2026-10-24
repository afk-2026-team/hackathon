import type { Profile } from '../lib/storage'
import { countryName, LANGUAGES } from '../lib/options'
import { useT } from '../lib/i18n'

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

export function Settings({ profile, onEdit, onReplayTour, onReset, onClose, account, onSignIn, onSignOut }: Props) {
  const t = useT()
  const lang = LANGUAGES.find((l) => l.code === profile.language)?.name ?? profile.language
  const interests = profile.preferences?.interests?.join(', ')
  return (
    <div className="screen settings">
      <header className="screen__head screen__head--row">
        <h1>{t('settings.title')}</h1>
        <button type="button" className="btn btn--ghost btn--small" onClick={onClose}>Done</button>
      </header>
      <section className="account" aria-label={t('settings.account')}>
        <span>{account.kind === 'google' ? account.label ?? 'Google' : t('settings.guest')}</span>
        {account.kind === 'google' ? (
          <button type="button" className="btn btn--ghost btn--small" onClick={onSignOut}>{t('settings.signOut')}</button>
        ) : (
          <button type="button" className="btn btn--ghost btn--small" disabled={!account.googleAvailable} onClick={onSignIn}>{t('settings.signIn')}</button>
        )}
      </section>
      <dl className="facts facts--stack">
        <div><dt>Language</dt><dd>{lang}</dd></div>
        <div><dt>Visiting from</dt><dd>{countryName(profile.country)}</dd></div>
        <div><dt>Currency</dt><dd>{profile.currency}</dd></div>
        <div><dt>Gender</dt><dd>{profile.gender ?? 'Not shared'}</dd></div>
        <div><dt>Age range</dt><dd>{profile.age_range ?? 'Not shared'}</dd></div>
        <div><dt>Interests</dt><dd>{interests || 'Not set'}</dd></div>
      </dl>
      <div className="settings__actions">
        <button type="button" className="btn btn--primary" onClick={onEdit}>{t('settings.edit')}</button>
        <button type="button" className="btn btn--ghost" onClick={onReplayTour}>Show the tour again</button>
        <button type="button" className="btn btn--ghost danger" onClick={onReset}>Clear saved data on this device</button>
      </div>
      <p className="note">Your profile, cart and trip are stored in this browser, separately for each account.</p>
    </div>
  )
}

import { useT } from '../lib/i18n'

export type Tab = 'home' | 'explore' | 'trip'

const TABS: { id: Tab; label: 'nav.home' | 'nav.explore' | 'nav.trip'; icon: string }[] = [
  { id: 'home', label: 'nav.home', icon: 'M4 11.5 12 5l8 6.5V20h-5.5v-5h-5v5H4z' },
  { id: 'explore', label: 'nav.explore', icon: 'M11 4a7 7 0 015.6 11.2l3.6 3.6-1.4 1.4-3.6-3.6A7 7 0 1111 4zm0 2a5 5 0 100 10 5 5 0 000-10z' },
  { id: 'trip', label: 'nav.trip', icon: 'M7 3h2v2h6V3h2v2h2a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1h2zm-1 7v8h12v-8z' },
]

export function BottomNav({ current, onChange, badge }: { current: Tab; onChange: (t: Tab) => void; badge?: number }) {
  const t = useT()
  return (
    <nav className="bottom-nav" aria-label="Main">
      {TABS.map((tab, i) => (
        <button
          key={tab.id}
          type="button"
          data-tour={`tab-${i + 1}`}
          className={`bottom-nav__item${current === tab.id ? ' is-active' : ''}`}
          aria-current={current === tab.id ? 'page' : undefined}
          onClick={() => onChange(tab.id)}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d={tab.icon} fill="currentColor" />
          </svg>
          <span>{t(tab.label)}</span>
          {tab.id === 'trip' && badge ? <span className="bottom-nav__badge">{badge}</span> : null}
        </button>
      ))}
    </nav>
  )
}

import { useT } from '../lib/i18n'
import '../styles/shell.css'

export type Tab = 'home' | 'explore' | 'trip'

// 강남언니 하단 탭 톤: 아이콘 + 짧은 라벨, 현재 탭은 채운 아이콘 + 잉크색.
function Icon({ id, on }: { id: Tab; on: boolean }) {
  const common = { width: 24, height: 24, viewBox: '0 0 24 24', 'aria-hidden': true as const, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (id === 'home') {
    return (
      <svg {...common} fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.9">
        <path d="M4 10.5L12 4l8 6.5V19a1 1 0 01-1 1h-4.5v-5.5h-5V20H5a1 1 0 01-1-1z" />
      </svg>
    )
  }
  if (id === 'explore') {
    return (
      <svg {...common} fill="none" stroke="currentColor" strokeWidth={on ? 2.4 : 1.9}>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M15.5 8.5l-2 5-5 2 2-5z" fill={on ? 'currentColor' : 'none'} />
      </svg>
    )
  }
  return (
    <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0113 0c0 5-6.5 11-6.5 11z" fill={on ? 'currentColor' : 'none'} />
      <circle cx="12" cy="10" r="2.3" fill={on ? '#fff' : 'none'} stroke={on ? '#fff' : 'currentColor'} />
    </svg>
  )
}

const TABS: { id: Tab; label: 'nav.home' | 'nav.explore' | 'nav.trip' }[] = [
  { id: 'home', label: 'nav.home' },
  { id: 'explore', label: 'nav.explore' },
  { id: 'trip', label: 'nav.trip' },
]

export function BottomNav({ current, onChange, badge }: { current: Tab; onChange: (t: Tab) => void; badge?: number }) {
  const t = useT()
  return (
    <nav className="bottom-nav" aria-label={t('shell.mainNav')}>
      {TABS.map((tab, i) => {
        const on = current === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            data-tour={`tab-${i + 1}`}
            className={`bottom-nav__item${on ? ' is-active' : ''}`}
            aria-current={on ? 'page' : undefined}
            onClick={() => onChange(tab.id)}
          >
            <Icon id={tab.id} on={on} />
            <span>{t(tab.label)}</span>
            {tab.id === 'trip' && badge ? <span className="bottom-nav__badge" aria-hidden="true">{badge > 99 ? '99+' : badge}</span> : null}
          </button>
        )
      })}
    </nav>
  )
}

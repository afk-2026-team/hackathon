import type { TopbarProps } from '../screens/contracts'
import { useT } from '../lib/i18n'
import '../styles/shell.css'

// 상단바: 워드마크(그라데이션 글자 + 코랄 점) · 검색 · 카트(수량 배지) · 설정.
export function Topbar({ onHome, onSearch, onCart, onSettings, cartCount }: TopbarProps) {
  const t = useT()
  return (
    <header className="topbar">
      <button type="button" className="brand-mark" onClick={onHome}>
        <span className="brand-mark__word">{t('brand')}</span>
        <span className="brand-mark__dot" aria-hidden="true" />
      </button>
      <span className="topbar__spacer" />
      <button type="button" className="icon-btn" aria-label={t('shell.search')} onClick={onSearch}>
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16 16l4 4" />
        </svg>
      </button>
      <button type="button" className="icon-btn" aria-label={t('shell.cart')} onClick={onCart}>
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 8h14l-1.2 11.1a1 1 0 01-1 .9H7.2a1 1 0 01-1-.9z" />
          <path d="M9 10V7a3 3 0 016 0v3" />
        </svg>
        {cartCount > 0 && <span className="icon-btn__count" aria-hidden="true">{cartCount > 99 ? '99+' : cartCount}</span>}
      </button>
      <button type="button" className="icon-btn" aria-label={t('shell.settings')} onClick={onSettings}>
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />
        </svg>
      </button>
    </header>
  )
}

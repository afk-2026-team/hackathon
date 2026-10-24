import type { TopbarProps } from '../screens/contracts'
import { useT } from '../lib/i18n'

// 담당: 셸·홈(C). 임시 골격 — 디자인은 C 가 채운다.
export function Topbar({ onHome, onSearch, onCart, onSettings, cartCount }: TopbarProps) {
  const t = useT()
  return (
    <header className="topbar">
      <button type="button" className="brand-mark" onClick={onHome}><span className="brand-mark__word">{t('brand')}</span></button>
      <span className="topbar__spacer" />
      <button type="button" className="icon-btn" aria-label="Search" onClick={onSearch}>⌕</button>
      <button type="button" className="icon-btn" aria-label="Cart" onClick={onCart}>🛒{cartCount > 0 && <span className="icon-btn__count">{cartCount}</span>}</button>
      <button type="button" className="icon-btn" aria-label="Settings" onClick={onSettings}>⚙</button>
    </header>
  )
}

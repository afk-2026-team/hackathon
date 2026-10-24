import { useEffect, useState, type ReactNode } from 'react'
import type { CatalogItem, ListPrice, Source, Sponsorship } from '../lib/types'
import { fill, useLang, useT } from '../lib/i18n'
import { convertKrw, formatKrw, formatMoney, fxSourceLine, useFx } from '../lib/currency'
import { Glyph } from './Glyph'

// 모든 화면이 함께 쓰는 작은 조각들. 화면 담당은 이 파일을 고치지 않고 가져다 쓴다(바꿀 일이 있으면 PM 에게).

export function CategoryBadge({ category }: { category: CatalogItem['category'] }) {
  const t = useT()
  return <span className={`badge badge--${category}`}>{t(category === 'medical' ? 'common.medical' : 'common.beauty')}</span>
}

/** 협찬 상태. 표시가 없다는 사실을 비협찬으로 바꿔 말하지 않는다. */
export function SponsorBadge({ value, hideUnknown = false }: { value: Sponsorship; hideUnknown?: boolean }) {
  const t = useT()
  if (value === 'sponsored') return <span className="badge badge--sponsored">{t('common.sponsored')}</span>
  if (value === 'not_sponsored') return <span className="badge badge--clear">{t('common.noSponsor')}</span>
  return hideUnknown ? null : <span className="badge badge--unknown">{t('common.sponsorUnknown')}</span>
}

/** 제품 이미지. 없거나 깨지면 실제 사진처럼 보이지 않는 카테고리 도형으로 대신한다. */
export function Thumb({ item, size = 80 }: { item: Pick<CatalogItem, 'image_url' | 'category' | 'kind'>; size?: number }) {
  const [broken, setBroken] = useState(false)
  if (!item.image_url || broken) return <Glyph category={item.category} kind={item.kind} size={size} />
  return (
    <span className="thumb" style={{ width: size, height: size }}>
      <img src={item.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
    </span>
  )
}

/** 원화 가격 + 선택 통화 환산(ECB 기준율, 출처는 title 로). 환율이 없으면 원화만.
 *  원화 가격이 없고 판매처 표시 가격(list)이 있으면 그 통화 그대로 보여 주고, 출처를 함께 적는다. */
export function Price({ krw, currency, size = 'md', list }: { krw: number | null; currency: string; size?: 'sm' | 'md' | 'lg'; list?: ListPrice | null }) {
  const t = useT()
  const lang = useLang()
  const fx = useFx()
  const ready = fx.status === 'ready' ? fx.fx : null
  if (krw == null && list) {
    // 표시 통화 → 원화 → 내 통화(같은 ECB 기준율). 같은 통화면 환산하지 않는다.
    const rate = ready?.rates?.[list.currency]
    const asKrw = list.currency === 'KRW' ? list.amount : typeof rate === 'number' && rate > 0 ? list.amount / rate : null
    const converted = asKrw != null && currency !== list.currency ? (currency === 'KRW' ? asKrw : convertKrw(asKrw, currency, ready)) : null
    return (
      <span className={`price price--${size}`}>
        <strong>{formatMoney(list.amount, list.currency, lang)}</strong>
        {converted != null && ready && (
          <span className="price__fx" title={fxSourceLine(ready)}>{fill(t('common.approx'), { amount: formatMoney(converted, currency, lang) })}</span>
        )}
        <span className="price__src" title={list.basis}>{fill(t('common.listedAt'), { seller: list.source.label })}</span>
      </span>
    )
  }
  if (krw == null) return <span className={`price price--${size} price--none`}>{t('common.priceUnlisted')}</span>
  const converted = convertKrw(krw, currency, ready)
  return (
    <span className={`price price--${size}`}>
      <strong>{formatKrw(krw)}</strong>
      {converted != null && ready && (
        <span className="price__fx" title={fxSourceLine(ready)}>
          {fill(t('common.approx'), { amount: formatMoney(converted, currency, lang) })}
        </span>
      )}
    </span>
  )
}

export function SourceList({ sources }: { sources: Source[] }) {
  const t = useT()
  return (
    <ul className="source-list" aria-label={t('common.sources')}>
      {sources.map((s) => (
        <li key={s.url} className="source-list__item">
          <a href={s.url} target="_blank" rel="noreferrer noopener">{s.label}</a>
          <span className="source-list__date">{fill(t('common.checkedOn'), { date: s.checked_at })}</span>
        </li>
      ))}
    </ul>
  )
}

export function SubBar({ title, onBack, actions }: { title: string; onBack: () => void; actions?: ReactNode }) {
  const lang = useLang()
  return (
    <header className="subbar">
      <button type="button" className="icon-btn" aria-label={lang === 'ko' ? '뒤로' : 'Back'} onClick={onBack}>
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <h1 className="subbar__title">{title}</h1>
      {actions}
    </header>
  )
}

/** 아래에서 올라오는 시트. Esc·배경 클릭으로 닫힌다. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const t = useT()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet__grip" aria-hidden="true" />
        <div className="sheet__head">
          <h2>{title}</h2>
          <button type="button" className="btn btn--text" onClick={onClose}>{t('common.close')}</button>
        </div>
        {children}
      </section>
    </div>
  )
}

/** 짧게 떴다 사라지는 알림. message 가 바뀔 때마다 다시 뜬다. */
export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return
    const id = window.setTimeout(onDone, 1800)
    return () => window.clearTimeout(id)
  }, [message, onDone])
  return message ? <div className="toast" role="status">{message}</div> : null
}

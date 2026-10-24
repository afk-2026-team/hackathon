import { useState } from 'react'
import type { CatalogItem } from '../../lib/types'
import { fill, useLang, useT } from '../../lib/i18n'
import { tagLabel } from '../../lib/tagLabels'
import { Glyph } from '../Glyph'
import { SourceList } from '../Common'

// 두 상세 레이아웃이 함께 쓰는 조각(상세 영역 내부 전용).

/** subtitle 의 '·' 앞부분 = 한국어 이름(매장·기관 검색어). 비면 영어 제목으로. */
export function koreanName(item: Pick<CatalogItem, 'subtitle' | 'title'>): string {
  return item.subtitle.split('·')[0].trim() || item.title
}

/** 제목 옆에 둘 부제. 제목이 이미 한국어 이름(한국어 모드)이면 이름을 반복하지 않고 '·' 뒤 정보(용량 등)만 남긴다. */
export function subtitleBesideTitle(item: Pick<CatalogItem, 'subtitle' | 'title'>): string {
  if (!item.subtitle) return ''
  const [name, ...rest] = item.subtitle.split('·')
  return name.trim() === item.title.trim() ? rest.join('·').trim() : item.subtitle
}

/** 큰 대표 이미지. Thumb 과 같은 규칙: 없거나 깨지면 실제 사진처럼 보이지 않는 카테고리 도형. */
export function HeroImage({ item }: { item: CatalogItem }) {
  const [broken, setBroken] = useState(false)
  return (
    <div className={`dt-hero dt-hero--${item.category}`}>
      {item.image_url && !broken ? (
        <img src={item.image_url} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
      ) : (
        <Glyph category={item.category} kind={item.kind} size={120} />
      )}
    </div>
  )
}

export function CartButton({ count, onOpen }: { count: number; onOpen: () => void }) {
  const t = useT()
  return (
    <button type="button" className="icon-btn" aria-label={fill(t('detail.cartCount'), { n: count })} onClick={onOpen}>
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
        <path d="M3 4h2l2.2 10.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 8H6.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="9" cy="19" r="1.4" fill="currentColor" />
        <circle cx="17" cy="19" r="1.4" fill="currentColor" />
      </svg>
      {count > 0 && <span className="icon-btn__count">{count}</span>}
    </button>
  )
}

export function Reasons({ reasons }: { reasons: string[] }) {
  const t = useT()
  if (reasons.length === 0) return null
  return (
    <section className="dt-sec" aria-labelledby="dt-why-h">
      <h2 id="dt-why-h" className="dt-h2">{t('detail.why')}</h2>
      <ul className="dt-reasons">
        {reasons.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
      <p className="provenance">{t('detail.whyNote')}</p>
    </section>
  )
}

export function Tags({ tags }: { tags: string[] }) {
  const t = useT()
  const lang = useLang()
  if (tags.length === 0) return null
  return (
    <div className="dt-tags" aria-label={t('detail.tags')}>
      {tags.map((tag) => (
        <span key={tag} className="dt-tag">#{tagLabel(tag, lang)}</span>
      ))}
    </div>
  )
}

export function Sources({ item }: { item: CatalogItem }) {
  const t = useT()
  return (
    <section className="dt-sec" aria-labelledby="dt-src-h">
      <h2 id="dt-src-h" className="dt-h2">{t('detail.sources')}</h2>
      <SourceList sources={item.sources} />
      {item.provenance && <p className="provenance dt-src">{fill(t('detail.provenance'), { p: item.provenance })}</p>}
    </section>
  )
}

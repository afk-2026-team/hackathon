import type { CatalogItem } from '../../lib/types'
import { fill, useT } from '../../lib/i18n'
import { CategoryBadge, Price, SponsorBadge, Thumb } from '../Common'
import '../../styles/explore.css'

// Explore·Search 가 함께 쓰는 목록 행.
// 뷰티 제품 → 랭킹 리스트형 행(썸네일·제목·매장명·가격·담기), 그 밖(의료·장소·안내) → 병원 목록형 카드.
// 순번은 큐레이션 순서일 뿐 측정 순위가 아니다(목록 위 안내 문구와 함께 쓴다).

export interface ItemRowProps {
  item: CatalogItem
  currency: string
  /** 1부터 시작하는 큐레이션 순서. 없으면 순번을 그리지 않는다(검색 결과 등). */
  curation?: number
  qty?: number
  inTrip?: boolean
  onOpen: (item: CatalogItem) => void
  onAdd?: (item: CatalogItem) => void
}

export function ItemRow(props: ItemRowProps) {
  return props.item.category === 'beauty' && props.item.kind === 'product' ? <ProductRow {...props} /> : <PlaceCard {...props} />
}

function ProductRow({ item, currency, curation, qty = 0, onOpen, onAdd }: ItemRowProps) {
  const t = useT()
  return (
    <li className="ex-row">
      {curation != null && (
        <span className="ex-row__cur" aria-label={fill(t('explore.curationN'), { n: curation })}>{curation}</span>
      )}
      <button type="button" className="ex-row__main" onClick={() => onOpen(item)}>
        <Thumb item={item} size={76} />
        <span className="ex-row__info">
          <span className="ex-row__title">{item.title}</span>
          {item.subtitle && <span className="ex-row__sub" lang="ko">{item.subtitle}</span>}
          <Price krw={item.price_krw} list={item.list_price} currency={currency} size="sm" />
          <span className="ex-row__badges">
            <SponsorBadge value={item.sponsorship} />
            {qty > 0 && <span className="badge badge--beauty">{fill(t('explore.inCart'), { n: qty })}</span>}
          </span>
        </span>
      </button>
      {onAdd && (
        <button type="button" className="ex-add" aria-label={fill(t('explore.add'), { title: item.title })} onClick={() => onAdd(item)}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
        </button>
      )}
    </li>
  )
}

function PlaceCard({ item, currency, curation, inTrip, onOpen }: ItemRowProps) {
  const t = useT()
  const kindKey = item.kind === 'place' ? 'explore.kindPlace' : item.kind === 'guide' ? 'explore.kindGuide' : 'explore.kindProduct'
  const address = item.location?.address ?? item.location?.name
  return (
    <li className={`ex-card ex-card--${item.category}`}>
      <button type="button" className="ex-card__main" onClick={() => onOpen(item)}>
        <Thumb item={item} size={48} />
        <span className="ex-card__info">
          <span className="ex-card__meta">
            {curation != null && <span className="ex-card__cur">{fill(t('explore.curationN'), { n: curation })}</span>}
            <CategoryBadge category={item.category} />
            <span className="badge badge--outline">{t(kindKey)}</span>
          </span>
          <span className="ex-card__title">{item.title}</span>
          {item.subtitle && <span className="ex-card__sub" lang="ko">{item.subtitle}</span>}
          {address && <span className="ex-card__addr">{address}</span>}
          {item.price_krw != null && <Price krw={item.price_krw} list={item.list_price} currency={currency} size="sm" />}
          <span className="ex-row__badges">
            <SponsorBadge value={item.sponsorship} />
            {inTrip && <span className="badge badge--medical">{t('explore.inTrip')}</span>}
          </span>
        </span>
      </button>
    </li>
  )
}

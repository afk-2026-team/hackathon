import type { CatalogItem } from '../lib/types'
import { formatKrw, SPONSOR_LABEL } from '../lib/format'
import { Glyph } from './Glyph'

export function ItemCard({ item, onOpen, selected }: { item: CatalogItem; onOpen: (i: CatalogItem) => void; selected?: boolean }) {
  return (
    <button type="button" className={`item-card${selected ? ' is-selected' : ''}`} onClick={() => onOpen(item)}>
      {item.image_url ? <img className="item-card__img" src={item.image_url} alt="" loading="lazy" /> : <Glyph category={item.category} kind={item.kind} />}
      <span className="item-card__body">
        <span className="item-card__meta">
          <span className={`chip chip--${item.category}`}>{item.category === 'medical' ? 'Medical' : 'Beauty'}</span>
          {item.sponsorship === 'sponsored' && <span className="chip chip--sponsored">{SPONSOR_LABEL.sponsored}</span>}
        </span>
        <span className="item-card__title">{item.title}</span>
        <span className="item-card__sub">{item.subtitle}</span>
      </span>
      {item.price_krw != null && <span className="item-card__price">{formatKrw(item.price_krw)}</span>}
    </button>
  )
}

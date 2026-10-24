import type { CatalogItem } from '../lib/types'
import { formatKrw } from '../lib/format'
import { useT } from '../lib/i18n'
import { Glyph } from './Glyph'

export function ItemCard({ item, onOpen, selected }: { item: CatalogItem; onOpen: (i: CatalogItem) => void; selected?: boolean }) {
  const t = useT()
  return (
    <button type="button" className={`item-card${selected ? ' is-selected' : ''}`} aria-pressed={selected ?? false} onClick={() => onOpen(item)}>
      {item.image_url ? <img className="item-card__img" src={item.image_url} alt="" loading="lazy" /> : <Glyph category={item.category} kind={item.kind} />}
      <span className="item-card__body">
        <span className="item-card__meta">
          <span className={`chip chip--${item.category}`}>{item.category === 'medical' ? t('explore.medical') : t('explore.beauty')}</span>
          {item.sponsorship === 'sponsored' && <span className="chip chip--sponsored">{t('sponsor.sponsored')}</span>}
        </span>
        <span className="item-card__title">{item.title}</span>
        <span className="item-card__sub">{item.subtitle}</span>
      </span>
      {item.price_krw != null && <span className="item-card__price">{formatKrw(item.price_krw)}</span>}
    </button>
  )
}

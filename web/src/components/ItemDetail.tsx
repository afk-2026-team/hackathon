import type { CatalogItem, ProfilePayload } from '../lib/types'
import { formatKrw, mapLinks } from '../lib/format'
import { useT } from '../lib/i18n'
import { Glyph } from './Glyph'
import { ComparePanel } from './ComparePanel'

interface Props {
  item: CatalogItem
  profile: ProfilePayload
  currentProduct?: string
  onSetCurrent: (name: string) => void
  inCart: number
  inTrip: boolean
  onAddCart: (i: CatalogItem) => void
  onAddTrip: (i: CatalogItem) => void
  onClose?: () => void
}

export function ItemDetail({ item, profile, currentProduct, onSetCurrent, inCart, inTrip, onAddCart, onAddTrip, onClose }: Props) {
  const t = useT()
  const links = item.location ? mapLinks(item.location) : null
  return (
    <article className="detail" aria-labelledby={`detail-${item.id}`}>
      <header className="detail__head">
        {item.image_url ? <img className="detail__img" src={item.image_url} alt="" /> : <Glyph category={item.category} kind={item.kind} size={72} />}
        <div>
          <p className="eyebrow">{item.category === 'medical' ? t('explore.medical') : t('explore.beauty')}</p>
          <h2 id={`detail-${item.id}`}>{item.title}</h2>
          <p className="detail__sub">{item.subtitle}</p>
        </div>
        {onClose && (
          <button type="button" className="icon-btn detail__close" aria-label={t('common.close')} onClick={onClose}>×</button>
        )}
      </header>

      <p className="detail__desc">{item.description}</p>

      <dl className="facts">
        <div>
          <dt>{t('detail.price')}</dt>
          <dd>{item.price_krw != null ? formatKrw(item.price_krw) : t('detail.notListed')}</dd>
        </div>
        <div>
          <dt>{t('compare.sponsorship2')}</dt>
          <dd className={`sponsor sponsor--${item.sponsorship}`}>{t(`sponsor.${item.sponsorship}`)}</dd>
        </div>
      </dl>

      {item.kind === 'product' && item.category === 'beauty' && (
        <ComparePanel profile={profile} item={item} currentName={currentProduct} onSetCurrent={onSetCurrent} />
      )}

      {item.reasons.length > 0 && (
        <section>
          <h3 className="section-title">{t('compare.why2')}</h3>
          <ul className="reasons">
            {item.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="section-title">{t('detail.sources')}</h3>
        <ul className="sources">
          {item.sources.map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noreferrer">{s.label}</a>
              <span className="note">{s.checked_at}</span>
            </li>
          ))}
        </ul>
      </section>

      {links && (
        <p className="map-links">
          <span>{item.location!.name}</span>
          <a href={links.naver} target="_blank" rel="noreferrer">Naver Map</a>
          <a href={links.google} target="_blank" rel="noreferrer">Google Maps</a>
        </p>
      )}

      {item.category === 'medical' && <p className="note">{t('detail.clinicNote')}</p>}

      <div className="detail__actions">
        {item.kind === 'product' ? (
          <button type="button" className="btn btn--primary" onClick={() => onAddCart(item)}>
            {inCart ? `${t('list.addAnother')} · ${inCart} ${t('list.inList')}` : t('list.add')}
          </button>
        ) : (
          <button type="button" className="btn btn--primary" disabled={inTrip} onClick={() => onAddTrip(item)}>
            {inTrip ? t('trip.saved') : t('trip.save')}
          </button>
        )}
      </div>
    </article>
  )
}

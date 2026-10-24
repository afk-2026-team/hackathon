import type { CatalogItem } from '../lib/types'
import { formatKrw, mapLinks, SPONSOR_LABEL } from '../lib/format'
import { Glyph } from './Glyph'

interface Props {
  item: CatalogItem
  inCart: number
  inTrip: boolean
  onAddCart: (i: CatalogItem) => void
  onAddTrip: (i: CatalogItem) => void
  onClose?: () => void
}

export function ItemDetail({ item, inCart, inTrip, onAddCart, onAddTrip, onClose }: Props) {
  const links = item.location ? mapLinks(item.location) : null
  return (
    <article className="detail" aria-labelledby={`detail-${item.id}`}>
      <header className="detail__head">
        {item.image_url ? <img className="detail__img" src={item.image_url} alt="" /> : <Glyph category={item.category} kind={item.kind} size={72} />}
        <div>
          <p className="eyebrow">{item.category === 'medical' ? 'Medical' : 'Beauty'} · {item.kind}</p>
          <h2 id={`detail-${item.id}`}>{item.title}</h2>
          <p className="detail__sub">{item.subtitle}</p>
        </div>
        {onClose && (
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>×</button>
        )}
      </header>

      <p className="detail__desc">{item.description}</p>

      <dl className="facts">
        <div>
          <dt>Price</dt>
          <dd>{item.price_krw != null ? formatKrw(item.price_krw) : 'Not listed'}</dd>
        </div>
        <div>
          <dt>Sponsorship</dt>
          <dd className={`sponsor sponsor--${item.sponsorship}`}>{SPONSOR_LABEL[item.sponsorship]}</dd>
        </div>
      </dl>

      {item.reasons.length > 0 && (
        <section>
          <h3 className="section-title">Why it’s here</h3>
          <ul className="reasons">
            {item.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="section-title">Sources</h3>
        {item.sources.length ? (
          <ul className="sources">
            {item.sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noreferrer">{s.label}</a>
                <span className="note">checked {s.checked_at}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="note">No source attached yet.</p>
        )}
      </section>

      {links && (
        <p className="map-links">
          <span>{item.location!.name}</span>
          <a href={links.naver} target="_blank" rel="noreferrer">Naver Map</a>
          <a href={links.google} target="_blank" rel="noreferrer">Google Maps</a>
        </p>
      )}

      {item.category === 'medical' && <p className="note">Treatment options and scheduling are confirmed by the clinic.</p>}

      <div className="detail__actions">
        {item.kind === 'product' ? (
          <button type="button" className="btn btn--primary" onClick={() => onAddCart(item)}>
            {inCart ? `Add another (${inCart} in cart)` : 'Add to cart'}
          </button>
        ) : (
          <button type="button" className="btn btn--primary" disabled={inTrip} onClick={() => onAddTrip(item)}>
            {inTrip ? 'Saved to My Trip' : 'Save to My Trip'}
          </button>
        )}
      </div>
    </article>
  )
}

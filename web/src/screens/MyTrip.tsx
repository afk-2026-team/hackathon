import type { CartLine, TripEntry } from '../lib/storage'
import { formatKrw, mapLinks } from '../lib/format'
import { EmptyState } from '../components/States'
import { Glyph } from '../components/Glyph'

interface Props {
  trip: TripEntry[]
  cart: CartLine[]
  onMove: (entryId: string, dir: -1 | 1) => void
  onDay: (entryId: string, day: number) => void
  onRemove: (entryId: string) => void
  onAddDay: () => void
  days: number
  onExplore: () => void
}

export function MyTrip({ trip, cart, onMove, onDay, onRemove, onAddDay, days, onExplore }: Props) {
  const dayList = Array.from({ length: days }, (_, i) => i + 1)
  return (
    <div className="screen trip">
      <header className="screen__head">
        <h1>My Trip</h1>
        <p className="lead">Your saved places, arranged by day. Times and visits are confirmed with each place.</p>
      </header>

      {trip.length === 0 ? (
        <EmptyState
          title="Nothing saved yet"
          body="Save clinics, shops or guides from Explore and they’ll show up here."
          action={<button type="button" className="btn btn--primary" onClick={onExplore}>Go to Explore</button>}
        />
      ) : (
        dayList.map((d) => {
          const entries = trip.filter((e) => e.day === d)
          return (
            <section key={d} className="day" aria-labelledby={`day-${d}`}>
              <h2 id={`day-${d}`} className="section-title">Day {d}</h2>
              {entries.length === 0 ? (
                <p className="note">No plans for this day.</p>
              ) : (
                <ol className="day__list">
                  {entries.map((e, idx) => {
                    const links = e.location ? mapLinks(e.location) : null
                    return (
                      <li key={e.entry_id} className="trip-entry">
                        <span className="trip-entry__num">{idx + 1}</span>
                        <Glyph category={e.category} kind="place" size={40} />
                        <div className="trip-entry__body">
                          <strong>{e.title}</strong>
                          {e.location && <span className="note">{e.location.address ?? e.location.name}</span>}
                          {links && (
                            <span className="map-links">
                              <a href={links.naver} target="_blank" rel="noreferrer">Naver Map</a>
                              <a href={links.google} target="_blank" rel="noreferrer">Google Maps</a>
                            </span>
                          )}
                        </div>
                        <div className="trip-entry__ctl">
                          <button type="button" aria-label={`Move ${e.title} up`} disabled={idx === 0} onClick={() => onMove(e.entry_id, -1)}>↑</button>
                          <button type="button" aria-label={`Move ${e.title} down`} disabled={idx === entries.length - 1} onClick={() => onMove(e.entry_id, 1)}>↓</button>
                          <select aria-label={`Day for ${e.title}`} value={e.day} onChange={(ev) => onDay(e.entry_id, Number(ev.target.value))}>
                            {dayList.map((x) => (
                              <option key={x} value={x}>Day {x}</option>
                            ))}
                          </select>
                          <button type="button" className="danger" aria-label={`Remove ${e.title}`} onClick={() => onRemove(e.entry_id)}>Remove</button>
                        </div>
                      </li>
                    )
                  })}
                </ol>
              )}
            </section>
          )
        })
      )}
      {trip.length > 0 && (
        <button type="button" className="btn btn--ghost" onClick={onAddDay}>Add a day</button>
      )}

      {cart.length > 0 && (
        <section className="shopping" aria-labelledby="shopping-title">
          <h2 id="shopping-title" className="section-title">Shopping list</h2>
          <ul>
            {cart.map((l) => (
              <li key={l.item_id}>
                <span>{l.title} × {l.qty}</span>
                <span>{l.price_krw != null ? formatKrw(l.price_krw * l.qty) : 'Not listed'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

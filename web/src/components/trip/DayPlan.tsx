import { CategoryBadge } from '../Common'
import { fill, useT } from '../../lib/i18n'
import { mapLinks } from '../../lib/format'
import { naverDirectionsUrl, straightLineKm, type GeoPoint } from '../../lib/naverMaps'
import type { StartPoint, TripEntry } from '../../lib/storage'

export interface Stop {
  entry: TripEntry
  coords: { lat: number; lng: number } | null
  pending: boolean // 지오코딩 진행 중
}

interface Props {
  days: number
  day: number
  onSelectDay: (d: number) => void
  onAddDay: () => void
  stops: Stop[]
  checklist: TripEntry[]
  start: StartPoint | null
  onMove: (entryId: string, dir: -1 | 1) => void
  onDay: (entryId: string, day: number) => void
  onRemove: (entryId: string) => void
  onOpenItem: (itemId: string) => void
}

/** 구간 링크: 두 지점 좌표가 있으면 네이버 지도 길찾기, 아니면 도착지 이름 검색. 시간·경로를 추정하지 않는다. */
export function segmentLink(from: GeoPoint | null, to: Stop): { href: string; kind: 'directions' | 'search' } {
  const loc = to.entry.location!
  if (from && to.coords) return { href: naverDirectionsUrl(from, { name: loc.name, ...to.coords }), kind: 'directions' }
  return { href: mapLinks(loc).naver, kind: 'search' }
}

function EntryControls({ entry, days, first, last, onMove, onDay, onRemove }: {
  entry: TripEntry; days: number; first: boolean; last: boolean
  onMove: Props['onMove']; onDay: Props['onDay']; onRemove: Props['onRemove']
}) {
  const t = useT()
  return (
    <div className="trip-ctrl">
      <button type="button" className="trip-ctrl__btn" aria-label={`${t('trip.moveUp')}: ${entry.title}`} disabled={first} onClick={() => onMove(entry.entry_id, -1)}>↑</button>
      <button type="button" className="trip-ctrl__btn" aria-label={`${t('trip.moveDown')}: ${entry.title}`} disabled={last} onClick={() => onMove(entry.entry_id, 1)}>↓</button>
      <select
        className="trip-ctrl__day"
        aria-label={`${t('trip.moveDay')}: ${entry.title}`}
        value={entry.day}
        onChange={(e) => onDay(entry.entry_id, Number(e.target.value))}
      >
        {Array.from({ length: days }, (_, i) => i + 1).map((d) => (
          <option key={d} value={d}>{fill(t('trip.day'), { n: d })}</option>
        ))}
      </select>
      <button type="button" className="btn btn--text trip-ctrl__rm" aria-label={`${t('trip.remove')}: ${entry.title}`} onClick={() => onRemove(entry.entry_id)}>{t('trip.remove')}</button>
    </div>
  )
}

export function DayPlan(p: Props) {
  const t = useT()
  const startGeo: GeoPoint | null = p.start ? { name: p.start.label, lat: p.start.lat, lng: p.start.lng } : null

  return (
    <div className="trip-plan">
      <div className="trip-days" role="tablist" aria-label={t('trip.dayTabs')}>
        {Array.from({ length: p.days }, (_, i) => i + 1).map((d) => (
          <button
            key={d}
            type="button"
            role="tab"
            aria-selected={d === p.day}
            className={`chip${d === p.day ? ' is-on' : ''}`}
            onClick={() => p.onSelectDay(d)}
          >
            {fill(t('trip.day'), { n: d })}
          </button>
        ))}
        <button type="button" className="chip trip-days__add" onClick={p.onAddDay}>{t('trip.addDay')}</button>
      </div>

      {p.stops.length === 0 && p.checklist.length === 0 && <p className="trip-muted trip-pad">{t('trip.dayEmpty')}</p>}

      {p.stops.length > 0 && (
        <ol className="trip-stops">
          {p.stops.map((s, i) => {
            const prev = i === 0 ? null : p.stops[i - 1]
            const from: GeoPoint | null = i === 0 ? startGeo : prev?.coords ? { name: prev.entry.location!.name, ...prev.coords } : null
            const fromName = i === 0 ? (p.start ? t('trip.fromStart') : null) : fill(t('trip.fromPrev'), { name: prev!.entry.title })
            const link = segmentLink(from, s)
            const km = from && s.coords ? straightLineKm(from, s.coords) : null
            const loc = s.entry.location!
            return (
              <li key={s.entry.entry_id} className="trip-stop">
                {fromName && (
                  <div className="trip-seg">
                    <span className="trip-seg__from">{fromName}</span>
                    <a href={link.href} target="_blank" rel="noreferrer noopener" className="trip-seg__link">
                      {t(link.kind === 'directions' ? 'trip.directions' : 'trip.searchMap')} ↗
                    </a>
                    {km != null && <span className="trip-seg__km">{fill(t('trip.straight'), { km: km.toFixed(1) })}</span>}
                  </div>
                )}
                <div className="trip-stop__card card">
                  <span className={`trip-pin trip-pin--static trip-pin--${s.entry.category}`} aria-hidden="true">{i + 1}</span>
                  <div className="trip-stop__body">
                    <div className="trip-row">
                      <CategoryBadge category={s.entry.category} />
                      <span className="badge badge--outline">{t('trip.planned')}</span>
                    </div>
                    <button type="button" className="trip-stop__title" onClick={() => p.onOpenItem(s.entry.item_id)}>{s.entry.title}</button>
                    {loc.address && <p className="trip-muted">{loc.address}</p>}
                    {!s.coords && !s.pending && (
                      <p className="trip-note">
                        {t('trip.noCoords')} ·{' '}
                        <a href={mapLinks(loc).naver} target="_blank" rel="noreferrer noopener">{t('trip.searchMap')} ↗</a>
                      </p>
                    )}
                    {!fromName && s.coords && (
                      <a href={link.href} target="_blank" rel="noreferrer noopener" className="trip-seg__link">{t('trip.searchMap')} ↗</a>
                    )}
                    <EntryControls entry={s.entry} days={p.days} first={i === 0} last={i === p.stops.length - 1} onMove={p.onMove} onDay={p.onDay} onRemove={p.onRemove} />
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      )}

      {p.checklist.length > 0 && (
        <section className="trip-check" aria-labelledby="trip-check-h">
          <h3 id="trip-check-h" className="trip-h3">{t('trip.checklist')}</h3>
          <p className="trip-muted">{t('trip.checklistLead')}</p>
          <ul>
            {p.checklist.map((e, i) => (
              <li key={e.entry_id} className="trip-check__item card">
                <div className="trip-row">
                  <CategoryBadge category={e.category} />
                  <span className="badge badge--outline">{t('trip.planned')}</span>
                </div>
                <button type="button" className="trip-stop__title" onClick={() => p.onOpenItem(e.item_id)}>{e.title}</button>
                <EntryControls entry={e} days={p.days} first={i === 0} last={i === p.checklist.length - 1} onMove={p.onMove} onDay={p.onDay} onRemove={p.onRemove} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

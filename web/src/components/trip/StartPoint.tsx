import { useState, type FormEvent } from 'react'
import { ApiError, geocode } from '../../lib/api'
import { useT } from '../../lib/i18n'
import type { StartPoint as Start } from '../../lib/storage'
import type { GeocodeResult } from '../../lib/types'

type Phase =
  | { k: 'idle' }
  | { k: 'searching' }
  | { k: 'results'; items: GeocodeResult[] }
  | { k: 'message'; key: 'trip.startNone' | 'trip.startTooShort' | 'trip.startNoKey' | 'trip.startError' }

/** 숙소 주소 → 서버 지오코딩(제출 때만) → 사용자가 후보를 골라야 저장한다. */
export function StartPoint({ value, onChange }: { value: Start | null; onChange: (v: Start | null) => void }) {
  const t = useT()
  const [editing, setEditing] = useState(!value)
  const [query, setQuery] = useState('')
  const [phase, setPhase] = useState<Phase>({ k: 'idle' })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const q = query.trim()
    if (q.length < 2 || q.length > 200) return setPhase({ k: 'message', key: 'trip.startTooShort' })
    setPhase({ k: 'searching' })
    try {
      const res = await geocode(q)
      const items = res.results.filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng))
      setPhase(items.length ? { k: 'results', items } : { k: 'message', key: 'trip.startNone' })
    } catch (err) {
      setPhase({ k: 'message', key: err instanceof ApiError && err.status === 503 ? 'trip.startNoKey' : 'trip.startError' })
    }
  }

  const pick = (r: GeocodeResult) => {
    onChange({ label: query.trim(), address: r.road_address || r.address || query.trim(), lat: r.lat, lng: r.lng, coords_source: 'naver_maps_geocode' })
    setEditing(false)
    setPhase({ k: 'idle' })
    setQuery('')
  }

  return (
    <section className="trip-start card" aria-labelledby="trip-start-h">
      <div className="trip-start__head">
        <span className="trip-pin trip-pin--start trip-pin--static" aria-hidden="true">{t('trip.startPin')}</span>
        <div>
          <h2 id="trip-start-h" className="trip-h3">{t('trip.startTitle')}</h2>
          <p className="trip-muted">{t('trip.startLead')}</p>
        </div>
      </div>

      {value && !editing ? (
        <div className="trip-start__saved">
          <p className="trip-start__label">{value.label}</p>
          <p className="trip-muted">{value.address}</p>
          <p className="trip-fine">{t('trip.startSource')}</p>
          <div className="trip-row">
            <button type="button" className="btn btn--ghost btn--small" onClick={() => setEditing(true)}>{t('trip.startChange')}</button>
            <button type="button" className="btn btn--text" onClick={() => onChange(null)}>{t('trip.startRemove')}</button>
          </div>
        </div>
      ) : (
        <>
          <form className="trip-start__form" onSubmit={submit}>
            <label className="trip-start__field">
              <span className="sr-only">{t('trip.startLabel')}</span>
              <input
                type="text"
                value={query}
                maxLength={200}
                placeholder={t('trip.startPlaceholder')}
                aria-label={t('trip.startLabel')}
                aria-describedby="trip-start-hint"
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <button type="submit" className="btn btn--primary btn--small" disabled={phase.k === 'searching'}>{t('trip.startFind')}</button>
          </form>
          <p className="trip-fine" id="trip-start-hint">{t('trip.startHint')}</p>
          {phase.k === 'searching' && <p className="trip-muted" aria-busy="true">{t('trip.startSearching')}</p>}
          {phase.k === 'message' && <p className="trip-note" role="status">{t(phase.key)}</p>}
          {phase.k === 'results' && (
            <div className="trip-start__results">
              <p className="trip-muted">{t('trip.startPick')}</p>
              <ul>
                {phase.items.map((r, i) => (
                  <li key={`${r.lat},${r.lng},${i}`}>
                    <button type="button" className="trip-start__cand" onClick={() => pick(r)}>
                      <strong>{r.road_address || r.address}</strong>
                      {r.english_address && <span>{r.english_address}</span>}
                      {r.jibun_address && r.jibun_address !== (r.road_address || r.address) && <span>{r.jibun_address}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  )
}

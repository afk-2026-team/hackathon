import { useEffect, useMemo, useState } from 'react'
import type { MyTripProps } from './contracts'
import { geocode } from '../lib/api'
import { fill, useLang, useT } from '../lib/i18n'
import { cartTotals } from '../lib/cartTotals'
import { formatMoney } from '../lib/currency'
import { currentPosition, useNaverMaps } from '../lib/naverMaps'
import { clearStart, loadStart, saveStart, type StartPoint as Start } from '../lib/storage'
import type { ItemLocation } from '../lib/types'
import { EmptyState, LoadingState } from '../components/States'
import { Price } from '../components/Common'
import { StartPoint } from '../components/trip/StartPoint'
import { TripMap, type MapPoint } from '../components/trip/TripMap'
import { DayPlan, type Stop } from '../components/trip/DayPlan'
import { TripPlan } from '../components/trip/TripPlan'
import '../styles/trip.css'

// 담당: My Trip·지도(F). 이동 시간·경로는 추정하지 않는다 — 지도 선은 방문 순서 직선이고 길찾기는 네이버 지도로 넘긴다.

type Coords = { lat: number; lng: number }
// 장소 좌표 지오코딩 결과는 세션 메모리에만 둔다(localStorage 저장 금지). 실패도 null 로 기억해 반복 호출을 막는다.
const geoMemo = new Map<string, Promise<Coords | null>>()
export function resetTripGeoMemo() {
  geoMemo.clear()
}
const geoQuery = (loc: ItemLocation) => (loc.address ?? loc.name).trim()
function resolveCoords(q: string): Promise<Coords | null> {
  let p = geoMemo.get(q)
  if (!p) {
    p = geocode(q)
      .then((r) => {
        const hit = r.results.find((x) => Number.isFinite(x.lat) && Number.isFinite(x.lng))
        return hit ? { lat: hit.lat, lng: hit.lng } : null
      })
      .catch(() => null)
    geoMemo.set(q, p)
  }
  return p
}
const hasCoords = (loc: ItemLocation): loc is ItemLocation & Coords =>
  typeof loc.lat === 'number' && typeof loc.lng === 'number' && Number.isFinite(loc.lat) && Number.isFinite(loc.lng)

function ShoppingSummary({ cart, currency, onOpenCart }: Pick<MyTripProps, 'cart' | 'onOpenCart'> & { currency: string }) {
  const t = useT()
  const lang = useLang()
  const count = cart.reduce((n, l) => n + l.qty, 0)
  const { totals, unpriced } = cartTotals(cart)
  const krw = totals.find((x) => x.currency === 'KRW' && !x.listed)
  const others = totals.filter((x) => x !== krw)
  return (
    <section className="trip-shop card" aria-labelledby="trip-shop-h">
      <div className="trip-shop__head">
        <div>
          <h2 id="trip-shop-h" className="trip-h3">{t('trip.shopTitle')}</h2>
          <p className="trip-muted">{fill(t('trip.shopCount'), { n: count })}</p>
        </div>
        {krw ? <Price krw={krw.amount} currency={currency} size="lg" /> : others.length === 0 ? <Price krw={null} currency={currency} size="lg" /> : null}
      </div>
      {others.map((x) => (
        <p key={`${x.currency}-${x.listed}`} className="trip-fine" data-testid={`trip-total-${x.currency}`}>
          {fill(t(x.listed ? 'explore.totalListed' : 'explore.totalIn'), { currency: x.currency })}: <strong>{formatMoney(x.amount, x.currency, lang)}</strong>
        </p>
      ))}
      {unpriced > 0 && <p className="trip-fine">{fill(t('trip.shopUnpriced'), { n: unpriced })}</p>}
      <p className="trip-note">{t('trip.shopStock')}</p>
      <button type="button" className="btn btn--ghost btn--block" onClick={onOpenCart}>{t('trip.openCart')}</button>
    </section>
  )
}

export function MyTrip({ ns, profile, trip, cart, days, onMove, onDay, onRemove, onAddDay, onExplore, onOpenItem, onOpenCart, onReorderDay, suggesting }: MyTripProps) {
  const t = useT()
  const maps = useNaverMaps()
  const [start, setStart] = useState<Start | null>(() => loadStart(ns))
  const [day, setDay] = useState(1)
  const [geo, setGeo] = useState<Record<string, Coords | null>>({})
  // 숙소가 없을 때 쓰는 현재 위치(사용자가 누를 때만 묻고, 이 화면 메모리에만 둔다 — 저장하지 않음)
  const [here, setHere] = useState<Coords | null>(null)
  const [hereState, setHereState] = useState<'idle' | 'locating' | 'denied'>('idle')
  const startFromHere = async () => {
    setHereState('locating')
    const pos = await currentPosition()
    if (pos) {
      setHere(pos)
      setHereState('idle')
    } else setHereState('denied')
  }

  useEffect(() => setStart(loadStart(ns)), [ns])
  const sel = Math.min(Math.max(day, 1), Math.max(days, 1))

  const changeStart = (v: Start | null) => {
    if (v) saveStart(ns, v)
    else clearStart(ns)
    setStart(v ? loadStart(ns) ?? v : null)
  }

  const dayEntries = useMemo(() => trip.filter((e) => e.day === sel), [trip, sel])
  const placed = useMemo(() => dayEntries.filter((e) => e.location), [dayEntries])
  const checklist = useMemo(() => dayEntries.filter((e) => !e.location), [dayEntries])

  // 선택한 일자에서 좌표가 없는 장소만 지오코딩한다.
  useEffect(() => {
    let alive = true
    for (const e of placed) {
      const loc = e.location!
      if (hasCoords(loc)) continue
      const q = geoQuery(loc)
      if (q.length < 2 || q in geo) continue
      resolveCoords(q).then((c) => alive && setGeo((g) => (q in g ? g : { ...g, [q]: c })))
    }
    return () => {
      alive = false
    }
  }, [placed, geo])

  const stops: Stop[] = useMemo(
    () =>
      placed.map((e) => {
        const loc = e.location!
        if (hasCoords(loc)) return { entry: e, coords: { lat: loc.lat, lng: loc.lng }, pending: false }
        const q = geoQuery(loc)
        const known = q in geo
        return { entry: e, coords: known ? geo[q] : null, pending: !known && q.length >= 2 }
      }),
    [placed, geo],
  )

  const stayPin = t('trip.startPin')
  const herePin = t('trip.herePin')
  // 숙소가 있으면 숙소, 없으면 현재 위치(선택 시)를 출발지로 쓴다. 둘 다 없으면 장소끼리만 잇는다.
  const origin = useMemo(
    () => (start ? { label: start.label, lat: start.lat, lng: start.lng } : here ? { label: herePin, lat: here.lat, lng: here.lng } : null),
    [start, here, herePin],
  )
  const points: MapPoint[] = useMemo(() => {
    const pts: MapPoint[] = []
    if (origin) pts.push({ key: 'start', lat: origin.lat, lng: origin.lng, kind: 'start', label: start ? stayPin : herePin, title: origin.label })
    stops.forEach((s, i) => {
      if (s.coords) pts.push({ key: s.entry.entry_id, ...s.coords, kind: s.entry.category, label: String(i + 1), title: s.entry.title })
    })
    return pts
  }, [origin, start, stops, stayPin, herePin])

  if (trip.length === 0) {
    return (
      <div className="trip">
        <header className="sec trip-head">
          <h1 className="trip-h1">{t('trip.title')}</h1>
        </header>
        {suggesting ? <LoadingState label={t('trip.suggest.loading')} /> : <EmptyState
          title={t('trip.emptyTitle')}
          body={t('trip.emptyBody')}
          action={<button type="button" className="btn btn--primary" onClick={onExplore}>{t('trip.explore')}</button>}
        />}
        {cart.length > 0 && <div className="trip-pad"><ShoppingSummary cart={cart} currency={profile.currency} onOpenCart={onOpenCart} /></div>}
      </div>
    )
  }

  return (
    <div className="trip">
      <header className="sec trip-head">
        <h1 className="trip-h1">{t('trip.title')}</h1>
        <p className="trip-muted">{t('trip.lead')}</p>
      </header>
      <div className="trip-pad trip-stack">
        {trip.some((e) => e.source === 'suggested') && (
          <section className="trip-suggested card" aria-labelledby="trip-suggested-h" data-testid="trip-suggested">
            <span className="badge trip-suggested__badge" id="trip-suggested-h">{t('trip.suggest.badge')}</span>
            <p className="trip-muted">{t('trip.suggest.body')}</p>
          </section>
        )}
        <StartPoint key={start ? `${start.lat},${start.lng}` : 'none'} value={start} onChange={changeStart} />
        {!start && (
          <div className="trip-here card">
            {here ? (
              <>
                <p className="trip-here__on">{t('trip.hereOn')}</p>
                <button type="button" className="btn btn--text" onClick={() => setHere(null)}>{t('trip.hereOff')}</button>
              </>
            ) : (
              <>
                <p className="trip-muted">{t(hereState === 'denied' ? 'trip.hereDenied' : 'trip.hereLead')}</p>
                <button type="button" className="btn btn--ghost btn--small" disabled={hereState === 'locating'} onClick={() => void startFromHere()}>
                  {t(hereState === 'locating' ? 'trip.hereLocating' : 'trip.hereStart')}
                </button>
              </>
            )}
            <p className="trip-fine">{t('trip.hereNote')}</p>
          </div>
        )}
        <TripMap status={maps.status} points={points} day={sel} />
        {onReorderDay && <TripPlan key={sel} day={sel} entries={dayEntries} start={origin} onApply={(ids) => onReorderDay(sel, ids)} />}
        <DayPlan
          days={days}
          day={sel}
          onSelectDay={setDay}
          onAddDay={() => {
            onAddDay()
            setDay(days + 1)
          }}
          stops={stops}
          checklist={checklist}
          start={origin}
          startKind={start ? 'stay' : 'here'}
          onMove={onMove}
          onDay={onDay}
          onRemove={onRemove}
          onOpenItem={onOpenItem}
        />
        {cart.length > 0 && <ShoppingSummary cart={cart} currency={profile.currency} onOpenCart={onOpenCart} />}
      </div>
    </div>
  )
}

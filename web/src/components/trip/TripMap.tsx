import { useEffect, useRef, useState } from 'react'
import { fill, useT } from '../../lib/i18n'
import { chunkRoute, getNaverMaps, type MapStatus, type NaverMap, type NaverOverlay } from '../../lib/naverMaps'
import { ApiError, fetchDirections } from '../../lib/api'

export interface MapPoint {
  key: string
  lat: number
  lng: number
  kind: 'start' | 'beauty' | 'medical'
  label: string // 순번 또는 '숙소'
  title: string
}

const COLORS = { start: '#131517', beauty: '#14c3b0', medical: '#ff6a3b' } as const
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/* ── NAVER Directions(자동차 실경로, 서버 /v1/maps/directions 경유) ──
 * 성공한 경로만 기억한다. 실패는 기억하지 않아 다음 렌더·재시도 버튼에서 다시 묻는다(영구 차단 없음).
 * 한 요청은 출발+경유 5+도착 = 7지점까지라서 chunkRoute 로 나눠 순서대로 이어 붙인다. 직선을 경로로 그리지 않는다. */
export interface DrivingRoute {
  distance_m: number
  duration_s: number
  path: [number, number][] // [lng, lat]
  legs: number
}
export type RouteState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; data: DrivingRoute }
  | { status: 'error'; reason: 'off' | 'failed' }
const routeMemo = new Map<string, DrivingRoute>()
export function resetTripDirections() {
  routeMemo.clear()
}
export const routeKey = (pts: Pick<MapPoint, 'lat' | 'lng'>[]) => pts.map((p) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`).join(';')

export async function loadDrivingRoute(pts: MapPoint[]): Promise<DrivingRoute> {
  const key = routeKey(pts)
  const hit = routeMemo.get(key)
  if (hit) return hit
  const geo = pts.map((x) => ({ name: x.title, lat: x.lat, lng: x.lng }))
  const legs = chunkRoute(geo)
  const parts = await Promise.all(legs.map((leg) => fetchDirections(leg.from, leg.to, leg.waypoints)))
  const data: DrivingRoute = {
    distance_m: parts.reduce((n, r) => n + r.distance_m, 0),
    duration_s: parts.reduce((n, r) => n + r.duration_s, 0),
    path: parts.flatMap((r) => r.path),
    legs: legs.length,
  }
  routeMemo.set(key, data)
  return data
}

/** 선택한 일자의 장소 마커 + 방문 순서 직선(점선). 경로가 아니라는 점을 범례로 밝힌다. */
export function TripMap({ status, points, day }: { status: MapStatus; points: MapPoint[]; day: number }) {
  const t = useT()
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<NaverMap | null>(null)
  const mapEl = useRef<HTMLDivElement | null>(null)
  const [failed, setFailed] = useState(false)
  const [route, setRoute] = useState<{ key: string; state: RouteState }>({ key: '', state: { status: 'idle' } })
  const [attempt, setAttempt] = useState(0)
  const key = routeKey(points)
  // 다른 일자·출발지·순서의 경로는 쓰지 않는다(이전 geometry 제거)
  const current: RouteState = route.key === key ? route.state : points.length >= 2 && status === 'ready' ? { status: 'loading' } : { status: 'idle' }
  const real = current.status === 'ok' ? current.data : null

  useEffect(() => {
    if (status !== 'ready' || points.length < 2) return
    let alive = true
    const k = routeKey(points)
    setRoute({ key: k, state: { status: 'loading' } })
    loadDrivingRoute(points)
      .then((data) => alive && setRoute({ key: k, state: { status: 'ok', data } }))
      .catch((err) => {
        if (!alive) return
        const off = err instanceof ApiError && (err.status === 501 || err.status === 503)
        setRoute({ key: k, state: { status: 'error', reason: off ? 'off' : 'failed' } })
      })
    return () => {
      alive = false
    }
  }, [status, points, attempt])

  useEffect(() => {
    if (status !== 'ready' || !el.current || points.length === 0) return
    const nm = getNaverMaps()
    if (!nm) return
    const overlays: NaverOverlay[] = []
    try {
      if (!map.current || mapEl.current !== el.current) {
        // 지도 칸이 다시 그려졌으면(장소 0개 → 다시 생김) 새 지도를 만든다.
        map.current?.destroy?.()
        map.current = new nm.Map(el.current, { zoom: 14, scaleControl: false, mapDataControl: true })
        mapEl.current = el.current
      }
      const m = map.current
      const coords = points.map((p) => new nm.LatLng(p.lat, p.lng))
      points.forEach((p, i) => {
        overlays.push(
          new nm.Marker({
            map: m,
            position: coords[i],
            title: p.title,
            icon: {
              content: `<div class="trip-pin trip-pin--${p.kind}" style="background:${COLORS[p.kind]}">${esc(p.label)}</div>`,
              anchor: new nm.Point(14, 14),
            },
          }),
        )
      })
      if (coords.length > 1) {
        if (real) {
          const path = real.path.map(([lng, lat]) => new nm.LatLng(lat, lng))
          overlays.push(new nm.Polyline({ map: m, path, strokeColor: '#1e6ef0', strokeOpacity: 0.85, strokeWeight: 5, strokeStyle: 'solid' }))
        } else {
          overlays.push(new nm.Polyline({ map: m, path: coords, strokeColor: '#131517', strokeOpacity: 0.55, strokeWeight: 3, strokeStyle: 'shortdash' }))
        }
        // 마커뿐 아니라 실제 도로 경로 점까지 넣어 화면 밖으로 잘리지 않게 맞춘다
        const b = new nm.LatLngBounds(coords[0], coords[0])
        coords.forEach((c) => b.extend(c))
        real?.path.forEach(([lng, lat]) => b.extend(new nm.LatLng(lat, lng)))
        m.fitBounds(b, { top: 48, right: 40, bottom: 40, left: 40 })
      } else {
        m.setCenter(coords[0])
        m.setZoom(15)
      }
      setFailed(false)
    } catch {
      setFailed(true)
    }
    return () => overlays.forEach((o) => o.setMap(null))
  }, [status, points, real])

  useEffect(() => () => {
    map.current?.destroy?.()
    map.current = null
  }, [])

  if (status !== 'ready' && status !== 'loading') {
    const key = status === 'auth_failed' ? 'trip.mapAuth' : status === 'disabled' ? 'trip.mapDisabled' : 'trip.mapError'
    return <div className="trip-mapnote card" role="status">{t(key)}</div>
  }
  if (failed) return <div className="trip-mapnote card" role="status">{t('trip.mapError')}</div>
  if (status === 'loading') return <div className="trip-map trip-map--loading" aria-busy="true"><span>{t('trip.mapLoading')}…</span></div>
  if (points.length === 0) return <div className="trip-mapnote card">{t('trip.mapNoPoints')}</div>

  return (
    <figure className="trip-mapwrap">
      <div className="trip-legend" aria-label="legend">
        <span className={`trip-legend__line${real ? ' trip-legend__line--real' : ''}`} aria-hidden="true" />
        <span>{t(real ? 'trip.legendReal' : 'trip.legendLine')}</span>
      </div>
      <div ref={el} className="trip-map" role="region" aria-label={fill(t('trip.mapLabel'), { n: day })} />
      <figcaption className="trip-legend__keys">
        <span><i className="trip-dot trip-dot--start" />{t('trip.legendStay')}</span>
        <span><i className="trip-dot trip-dot--beauty" />{t('common.beauty')}</span>
        <span><i className="trip-dot trip-dot--medical" />{t('common.medical')}</span>
        {real ? (
          <span className="trip-legend__route trip-legend__real" role="status">
            {fill(t('trip.routeReal'), { min: Math.max(1, Math.round(real.duration_s / 60)), km: (real.distance_m / 1000).toFixed(1) })}
            {real.legs > 1 && <> · {fill(t('trip.routeLegs'), { n: real.legs })}</>}
          </span>
        ) : (
          <span className="trip-legend__route">{t('trip.legendRoute')}</span>
        )}
      </figcaption>
      {current.status === 'loading' && <p className="trip-route-status" role="status" data-testid="route-status">{t('trip.routeLoading')}</p>}
      {current.status === 'error' && (
        <p className="trip-route-status" role="alert" data-testid="route-status">
          {t(current.reason === 'off' ? 'trip.routeOff' : 'trip.routeFailed')}
          <button type="button" className="btn btn--text" onClick={() => setAttempt((n) => n + 1)}>{t('trip.routeRetry')}</button>
        </p>
      )}
    </figure>
  )
}

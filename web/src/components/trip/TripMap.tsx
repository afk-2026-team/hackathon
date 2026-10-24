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

/* ── NAVER Directions(자동차 실경로). 콘솔에서 Directions 5 가 켜져 있을 때만 쓴다 ──
 * 501(미활성)·503(키 없음)을 한 번 보면 이번 세션 동안 다시 묻지 않는다. 일시 실패(502 등)는 그 경로만 직선으로 둔다. */
export interface DrivingRoute {
  distance_m: number
  duration_s: number
  path: [number, number][] // [lng, lat]
}
let directionsOff = false
const routeMemo = new Map<string, Promise<DrivingRoute | null>>()
export function resetTripDirections() {
  directionsOff = false
  routeMemo.clear()
}
const routeKey = (pts: MapPoint[]) => pts.map((p) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`).join(';')

function loadDrivingRoute(pts: MapPoint[]): Promise<DrivingRoute | null> {
  if (directionsOff || pts.length < 2) return Promise.resolve(null)
  const key = routeKey(pts)
  let p = routeMemo.get(key)
  if (!p) {
    const geo = pts.map((x) => ({ name: x.title, lat: x.lat, lng: x.lng }))
    p = Promise.all(chunkRoute(geo).map((leg) => fetchDirections(leg.from, leg.to, leg.waypoints)))
      .then((parts) => ({
        distance_m: parts.reduce((n, r) => n + r.distance_m, 0),
        duration_s: parts.reduce((n, r) => n + r.duration_s, 0),
        path: parts.flatMap((r) => r.path),
      }))
      .catch((err) => {
        if (err instanceof ApiError && (err.status === 501 || err.status === 503)) directionsOff = true
        routeMemo.delete(key) // 일시 실패는 다음에 다시 시도
        return null
      })
    routeMemo.set(key, p)
  }
  return p
}

/** 선택한 일자의 장소 마커 + 방문 순서 직선(점선). 경로가 아니라는 점을 범례로 밝힌다. */
export function TripMap({ status, points, day }: { status: MapStatus; points: MapPoint[]; day: number }) {
  const t = useT()
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<NaverMap | null>(null)
  const mapEl = useRef<HTMLDivElement | null>(null)
  const [failed, setFailed] = useState(false)
  const [route, setRoute] = useState<{ key: string; data: DrivingRoute } | null>(null)
  const key = routeKey(points)
  const real = route && route.key === key ? route.data : null

  useEffect(() => {
    if (status !== 'ready' || points.length < 2) return
    let alive = true
    loadDrivingRoute(points).then((data) => {
      if (alive && data) setRoute({ key: routeKey(points), data })
    })
    return () => {
      alive = false
    }
  }, [status, points])

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
        const b = new nm.LatLngBounds(coords[0], coords[0])
        coords.forEach((c) => b.extend(c))
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
          </span>
        ) : (
          <span className="trip-legend__route">{t('trip.legendRoute')}</span>
        )}
      </figcaption>
    </figure>
  )
}

import { useEffect, useRef, useState } from 'react'
import { fetchMapsConfig, geocode } from '../../lib/api'
import { currentPosition, getNaverMaps, loadNaverMaps, onNaverMapsAuthFailure, type GeoPoint } from '../../lib/naverMaps'
import type { ItemLocation } from '../../lib/types'
import { mapLinks } from '../../lib/format'
import { fill, useT, type Lang } from '../../lib/i18n'
import { loadStart, type Namespace } from '../../lib/storage'
import { NaverRoute } from '../trip/NaverRoute'

// 마커 하나짜리 작은 NAVER 지도 + "여기까지 길찾기". 스크립트 로드·인증 실패 감지는 My Trip 과 같은 공용 로더(lib/naverMaps.ts)를 쓴다.
// 좌표 우선순위: location.lat/lng(공식 데이터) → 없을 때만 서버 지오코딩.
type Phase = 'loading' | 'ready' | 'off' | 'noresult' | 'auth'
interface Pin {
  lat: number
  lng: number
  source: 'official' | 'geocode'
  address: string | null // 지오코딩 결과 주소(화면 언어 기준)
}
type Origin = 'ask' | 'stay' | 'here'
type HereState = { k: 'idle' } | { k: 'locating' } | { k: 'ok'; lat: number; lng: number } | { k: 'denied' }

const officialCoords = (loc: ItemLocation) =>
  typeof loc.lat === 'number' && typeof loc.lng === 'number' && Number.isFinite(loc.lat) && Number.isFinite(loc.lng)
    ? { lat: loc.lat, lng: loc.lng }
    : null

export function MiniMap({ location, lang, ns }: { location: ItemLocation; lang: Lang; ns?: Namespace }) {
  const t = useT()
  const box = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [pin, setPin] = useState<Pin | null>(null)
  const official = officialCoords(location)
  const query = location.address ?? location.name
  const offKey = official ? `${official.lat},${official.lng}` : ''

  useEffect(() => {
    let alive = true
    const offAuth = onNaverMapsAuthFailure(() => alive && setPhase('auth'))
    ;(async () => {
      try {
        let found: Pin | null = official ? { ...official, source: 'official', address: null } : null
        if (official && alive) setPin(found) // 공식 좌표는 키 없이도 길찾기에 쓸 수 있다
        const cfg = await fetchMapsConfig()
        if (!cfg.enabled || !cfg.client_id) return alive && setPhase('off')
        if (!found) {
          const res = await geocode(query)
          const first = res.results[0]
          if (!first) return alive && setPhase('noresult')
          const address = lang === 'en' ? first.english_address ?? first.road_address ?? first.address : first.road_address ?? first.address
          found = { lat: first.lat, lng: first.lng, source: 'geocode', address }
        }
        if (!alive) return
        setPin(found)
        const load = await loadNaverMaps()
        if (!alive) return
        if (load.status === 'auth_failed') return setPhase('auth')
        const maps = getNaverMaps()
        if (load.status !== 'ready' || !maps || !box.current) return setPhase('off')
        const pos = new maps.LatLng(found.lat, found.lng)
        new maps.Marker({ position: pos, map: new maps.Map(box.current, { center: pos, zoom: 16, scaleControl: false, mapDataControl: false }) })
        setPhase((p) => (p === 'auth' ? p : 'ready'))
      } catch {
        if (alive) setPhase((p) => (p === 'auth' ? p : 'off'))
      }
    })()
    return () => {
      alive = false
      offAuth()
    }
    // offKey 는 official 좌표의 값 키(객체 identity 대신)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, offKey, lang])

  const links = mapLinks(pin ? { ...location, lat: pin.lat, lng: pin.lng } : location)
  const showMap = phase === 'loading' || phase === 'ready'
  return (
    <div className="dt-map">
      {showMap && (
        <div className="dt-map__wrap">
          <div ref={box} className="dt-map__box" role="img" aria-label={fill(t('detail.mapAria'), { name: location.name })} />
          {phase === 'loading' && <p className="dt-map__loading muted small">{t('detail.mapLoading')}</p>}
        </div>
      )}
      {phase === 'off' && <p className="note">{t('detail.mapOff')}</p>}
      {phase === 'noresult' && <p className="note">{t('detail.mapNoResult')}</p>}
      {phase === 'auth' && <p className="note note--warn" role="status">{t('detail.mapAuth')}</p>}
      {pin && (
        <p className="dt-map__coords">
          {pin.address && pin.address !== location.address && <span className="dt-map__addr">{pin.address}</span>}
          <span className="provenance">
            {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)} · {t(pin.source === 'official' ? 'detail.mapCoordsOfficial' : 'detail.mapCoords')}
          </span>
        </p>
      )}
      {pin && <RouteToHere to={{ name: location.name, lat: pin.lat, lng: pin.lng }} ns={ns} />}
      <div className="dt-map__links">
        <a className="btn btn--ghost btn--small" href={links.naver} target="_blank" rel="noreferrer noopener">{t('detail.openNaver')}</a>
        <a className="btn btn--ghost btn--small" href={links.google} target="_blank" rel="noreferrer noopener">{t('detail.openGoogle')}</a>
      </div>
    </div>
  )
}

/** 출발지 선택(네이버 지도에서 / 내 숙소 / 현재 위치) + 이동수단 버튼. 현재 위치는 사용자가 고를 때만 묻고 링크에만 쓴다. */
export function RouteToHere({ to, ns }: { to: GeoPoint; ns?: Namespace }) {
  const t = useT()
  const stay = ns ? loadStart(ns) : null
  const [origin, setOrigin] = useState<Origin>(stay ? 'stay' : 'ask')
  const [here, setHere] = useState<HereState>({ k: 'idle' })

  const pickHere = async () => {
    setOrigin('here')
    setHere({ k: 'locating' })
    const pos = await currentPosition()
    setHere(pos ? { k: 'ok', ...pos } : { k: 'denied' })
  }

  const from: GeoPoint | null =
    origin === 'stay' && stay
      ? { name: stay.label, lat: stay.lat, lng: stay.lng }
      : origin === 'here' && here.k === 'ok'
        ? { name: t('detail.routeFromHere'), lat: here.lat, lng: here.lng }
        : null

  return (
    <section className="dt-route" aria-labelledby="dt-route-h">
      <h4 id="dt-route-h" className="dt-route__h">{t('detail.routeTitle')}</h4>
      <div className="dt-route__from" role="radiogroup" aria-label={t('detail.routeFrom')}>
        <span className="muted small">{t('detail.routeFrom')}</span>
        <button type="button" role="radio" aria-checked={origin === 'ask'} className={`chip${origin === 'ask' ? ' is-on' : ''}`} onClick={() => setOrigin('ask')}>
          {t('detail.routeFromAsk')}
        </button>
        {stay && (
          <button type="button" role="radio" aria-checked={origin === 'stay'} className={`chip${origin === 'stay' ? ' is-on' : ''}`} onClick={() => setOrigin('stay')}>
            {t('detail.routeFromStay')}
          </button>
        )}
        <button type="button" role="radio" aria-checked={origin === 'here'} className={`chip${origin === 'here' ? ' is-on' : ''}`} onClick={pickHere}>
          {t('detail.routeFromHere')}
        </button>
      </div>
      {origin === 'here' && here.k === 'locating' && <p className="muted small" aria-busy="true">{t('detail.routeLocating')}</p>}
      {origin === 'here' && here.k === 'denied' && <p className="note" role="status">{t('detail.routeDenied')}</p>}
      <NaverRoute from={from} to={to} />
      <p className="muted small">{t('trip.navHint')}</p>
      {origin === 'here' && <p className="muted small">{t('detail.routePrivacy')}</p>}
    </section>
  )
}

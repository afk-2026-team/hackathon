import { useEffect, useRef, useState } from 'react'
import { fetchMapsConfig, geocode } from '../../lib/api'
import { getNaverMaps, loadNaverMaps, onNaverMapsAuthFailure } from '../../lib/naverMaps'
import type { GeocodeResult, ItemLocation } from '../../lib/types'
import { mapLinks } from '../../lib/format'
import { fill, useT, type Lang } from '../../lib/i18n'

// 마커 하나짜리 작은 NAVER 지도. 스크립트 로드·인증 실패 감지는 My Trip 과 같은 공용 로더(lib/naverMaps.ts)를 쓴다.
type Phase = 'loading' | 'ready' | 'off' | 'noresult' | 'auth'

export function MiniMap({ location, lang }: { location: ItemLocation; lang: Lang }) {
  const t = useT()
  const box = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [geo, setGeo] = useState<GeocodeResult | null>(null)
  const query = location.address ?? location.name

  useEffect(() => {
    let alive = true
    const offAuth = onNaverMapsAuthFailure(() => alive && setPhase('auth'))
    ;(async () => {
      try {
        const cfg = await fetchMapsConfig()
        if (!cfg.enabled || !cfg.client_id) return alive && setPhase('off')
        const res = await geocode(query)
        const first = res.results[0]
        if (!first) return alive && setPhase('noresult')
        if (!alive) return
        setGeo(first)
        const load = await loadNaverMaps()
        if (!alive) return
        if (load.status === 'auth_failed') return setPhase('auth')
        const maps = getNaverMaps()
        if (load.status !== 'ready' || !maps || !box.current) return setPhase('off')
        const pos = new maps.LatLng(first.lat, first.lng)
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
  }, [query])

  const links = mapLinks(geo ? { ...location, lat: geo.lat, lng: geo.lng } : location)
  const shownAddress = geo ? (lang === 'en' ? geo.english_address ?? geo.road_address ?? geo.address : geo.road_address ?? geo.address) : null
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
      {geo && (
        <p className="dt-map__coords">
          {shownAddress && shownAddress !== location.address && <span className="dt-map__addr">{shownAddress}</span>}
          <span className="provenance">{geo.lat.toFixed(5)}, {geo.lng.toFixed(5)} · {t('detail.mapCoords')}</span>
        </p>
      )}
      <div className="dt-map__links">
        <a className="btn btn--ghost btn--small" href={links.naver} target="_blank" rel="noreferrer noopener">{t('detail.openNaver')}</a>
        <a className="btn btn--ghost btn--small" href={links.google} target="_blank" rel="noreferrer noopener">{t('detail.openGoogle')}</a>
      </div>
    </div>
  )
}

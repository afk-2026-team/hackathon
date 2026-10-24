import { useEffect, useRef, useState } from 'react'
import { fetchMapsConfig, geocode } from '../../lib/api'
import type { GeocodeResult, ItemLocation } from '../../lib/types'
import { mapLinks } from '../../lib/format'
import { fill, useT, type Lang } from '../../lib/i18n'

// 마커 하나짜리 작은 NAVER 지도. My Trip 쪽 로더(lib/naverMaps.ts)와 같은 스크립트를 두 번 넣지 않도록
// script[data-naver-maps] 를 공유 표식으로 쓴다. 전역 타입 선언은 다른 담당과 충돌하지 않게 하지 않고 캐스팅한다.
type NaverNs = {
  maps: {
    Map: new (el: HTMLElement, opts: Record<string, unknown>) => { destroy?: () => void }
    LatLng: new (lat: number, lng: number) => unknown
    Marker: new (opts: Record<string, unknown>) => unknown
  }
}
type NaverWindow = Window & { naver?: NaverNs; navermap_authFailure?: () => void }
const AUTH_EVENT = 'jsm:naver-maps-auth-failure'
const LOAD_TIMEOUT_MS = 10000

function installAuthHook() {
  const w = window as NaverWindow
  const flagged = w.navermap_authFailure as (undefined | (() => void)) & { __dtHook?: boolean }
  if (flagged?.__dtHook) return
  const prev = w.navermap_authFailure
  const hook = Object.assign(
    () => {
      prev?.()
      window.dispatchEvent(new Event(AUTH_EVENT))
    },
    { __dtHook: true },
  )
  w.navermap_authFailure = hook
}

function loadNaverMaps(clientId: string): Promise<NaverNs> {
  const w = window as NaverWindow
  if (w.naver?.maps) return Promise.resolve(w.naver)
  installAuthHook()
  let script = document.querySelector<HTMLScriptElement>('script[data-naver-maps]')
  if (!script) {
    script = document.createElement('script')
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(clientId)}`
    script.async = true
    script.setAttribute('data-naver-maps', '')
    document.head.appendChild(script)
  }
  const el = script
  return new Promise((resolve, reject) => {
    const done = () => {
      clearTimeout(timer)
      el.removeEventListener('load', onLoad)
      el.removeEventListener('error', onError)
    }
    const onLoad = () => {
      done()
      if (w.naver?.maps) resolve(w.naver)
      else reject(new Error('naver maps missing'))
    }
    const onError = () => {
      done()
      reject(new Error('naver maps script failed'))
    }
    const timer = window.setTimeout(() => {
      done()
      if (w.naver?.maps) resolve(w.naver)
      else reject(new Error('naver maps timeout'))
    }, LOAD_TIMEOUT_MS)
    el.addEventListener('load', onLoad)
    el.addEventListener('error', onError)
  })
}

type Phase = 'loading' | 'ready' | 'off' | 'noresult' | 'auth'

export function MiniMap({ location, lang }: { location: ItemLocation; lang: Lang }) {
  const t = useT()
  const box = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [geo, setGeo] = useState<GeocodeResult | null>(null)
  const query = location.address ?? location.name

  useEffect(() => {
    let alive = true
    const onAuth = () => alive && setPhase('auth')
    window.addEventListener(AUTH_EVENT, onAuth)
    ;(async () => {
      try {
        const cfg = await fetchMapsConfig()
        if (!cfg.enabled || !cfg.client_id) return alive && setPhase('off')
        const res = await geocode(query)
        const first = res.results[0]
        if (!first) return alive && setPhase('noresult')
        if (!alive) return
        setGeo(first)
        const naver = await loadNaverMaps(cfg.client_id)
        if (!alive || !box.current) return
        const pos = new naver.maps.LatLng(first.lat, first.lng)
        new naver.maps.Marker({ position: pos, map: new naver.maps.Map(box.current, { center: pos, zoom: 16, scaleControl: false, mapDataControl: false }) })
        setPhase((p) => (p === 'auth' ? p : 'ready'))
      } catch {
        if (alive) setPhase((p) => (p === 'auth' ? p : 'off'))
      }
    })()
    return () => {
      alive = false
      window.removeEventListener(AUTH_EVENT, onAuth)
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

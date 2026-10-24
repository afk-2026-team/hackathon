import { useEffect, useState } from 'react'
import { fetchMapsConfig } from './api'

// NAVER Maps JavaScript API v3 로더(담당 F). 상세(E)의 MiniMap 도 같은 <script data-naver-maps> 를 쓰므로
// 이미 삽입된 스크립트가 있으면 새로 넣지 않고 그 로드를 기다린다. 키는 서버 /v1/maps/config 의 공개 식별자만 쓴다.
// 전역 타입 충돌을 피하려고 declare global 대신 window 를 좁은 타입으로 읽는다(다른 담당이 같은 전역을 선언해도 안전).

export type MapStatus = 'disabled' | 'loading' | 'ready' | 'auth_failed' | 'error'
export interface MapLoad {
  status: MapStatus
}

/* ── 최소 SDK 타입(우리가 쓰는 것만) ── */
export interface NaverOverlay {
  setMap(map: NaverMap | null): void
}
export interface NaverBounds {
  extend(p: unknown): void
}
export interface NaverMap {
  fitBounds(bounds: NaverBounds, margin?: { top: number; right: number; bottom: number; left: number }): void
  setCenter(p: unknown): void
  setZoom(z: number): void
  destroy?(): void
}
export interface NaverMapsNs {
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => NaverMap
  LatLng: new (lat: number, lng: number) => unknown
  LatLngBounds: new (sw?: unknown, ne?: unknown) => NaverBounds
  Marker: new (opts: Record<string, unknown>) => NaverOverlay
  Polyline: new (opts: Record<string, unknown>) => NaverOverlay
  Point: new (x: number, y: number) => unknown
}
type NaverWindow = Window & { naver?: { maps?: NaverMapsNs }; navermap_authFailure?: () => void }
const w = () => window as NaverWindow

export const getNaverMaps = (): NaverMapsNs | undefined => w().naver?.maps

export const SCRIPT_SELECTOR = 'script[data-naver-maps]'
const TIMEOUT_MS = 10_000
const POLL_MS = 100

/* ── 인증 실패 감지: SDK 가 로드 뒤 언제든 navermap_authFailure 를 부른다 ── */
let authFailed = false
let hookInstalled = false
const authListeners = new Set<() => void>()
// 대입으로 덮어쓰지 않는다: 먼저 걸린 핸들러(예: 상세 MiniMap)를 보존해 이어서 부른다. 한 번만 건다.
function installAuthHook() {
  if (hookInstalled) return
  hookInstalled = true
  const win = w()
  const prev = win.navermap_authFailure
  const hook = () => {
    authFailed = true
    authListeners.forEach((fn) => fn())
    if (prev) prev() // 다른 담당이 먼저 건 훅도 그대로 부른다
  }
  win.navermap_authFailure = hook
}

function waitForSdk(script: HTMLScriptElement | null): Promise<MapLoad> {
  return new Promise((resolve) => {
    const started = Date.now()
    let done = false
    const finish = (s: MapStatus) => {
      if (done) return
      done = true
      window.clearInterval(timer)
      script?.removeEventListener('error', onError)
      resolve({ status: authFailed ? 'auth_failed' : s })
    }
    const onError = () => finish('error')
    script?.addEventListener('error', onError)
    // load 이벤트는 이미 지나갔을 수 있으므로(다른 담당이 먼저 삽입) 전역 존재를 짧게 확인한다.
    const timer = window.setInterval(() => {
      if (authFailed) finish('auth_failed')
      else if (getNaverMaps()) finish('ready')
      else if (Date.now() - started > TIMEOUT_MS) finish('error')
    }, POLL_MS)
  })
}

let shared: Promise<MapLoad> | null = null

/** 재사용용 로더(상세 MiniMap 도 쓸 수 있다). 인증 실패를 따라가려면 useNaverMaps 나 onNaverMapsAuthFailure 를 쓴다. */
export function loadNaverMaps(): Promise<MapLoad> {
  if (!shared) {
    shared = (async (): Promise<MapLoad> => {
      let cfg
      try {
        cfg = await fetchMapsConfig()
      } catch {
        return { status: 'error' }
      }
      if (!cfg.enabled || !cfg.client_id) return { status: 'disabled' }
      installAuthHook()
      if (authFailed) return { status: 'auth_failed' }
      if (getNaverMaps()) return { status: 'ready' }
      let script = document.querySelector<HTMLScriptElement>(SCRIPT_SELECTOR)
      if (!script) {
        script = document.createElement('script')
        script.setAttribute('data-naver-maps', '')
        script.async = true
        script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(cfg.client_id)}`
        document.head.appendChild(script)
      }
      return waitForSdk(script)
    })().then((r) => {
      if (r.status === 'error') shared = null // 다음 진입 때 다시 시도
      return r
    })
  }
  return shared
}

/** 로드 뒤 인증 실패 알림 구독. 반환값으로 해제한다. */
export function onNaverMapsAuthFailure(fn: () => void): () => void {
  authListeners.add(fn)
  return () => {
    authListeners.delete(fn)
  }
}
export const isNaverMapsAuthFailed = () => authFailed

/** 테스트용: 공유 상태를 비운다. */
export function resetNaverMapsLoader() {
  shared = null
  authFailed = false
  hookInstalled = false
  authListeners.clear()
}

/** 로더 상태 + 로드 뒤 인증 실패까지 따라가는 훅. */
export function useNaverMaps(): MapLoad {
  const [state, setState] = useState<MapLoad>({ status: authFailed ? 'auth_failed' : 'loading' })
  useEffect(() => {
    let alive = true
    const onAuth = () => alive && setState({ status: 'auth_failed' })
    authListeners.add(onAuth)
    loadNaverMaps().then((r) => alive && setState(authFailed ? { status: 'auth_failed' } : r))
    return () => {
      alive = false
      authListeners.delete(onAuth)
    }
  }, [])
  return state
}

/* ── 링크·거리 도우미 ── */
export interface GeoPoint {
  name: string
  lat: number
  lng: number
}

// 네이버 지도 웹(map.naver.com/p/directions)은 EPSG:3857(웹 메르카토르) x,y 를 받는다.
function toWebMercator(lat: number, lng: number): [number, number] {
  const R = 6378137
  const x = (lng * Math.PI * R) / 180
  const y = R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))
  return [x, y]
}
const seg = (p: GeoPoint) => {
  const [x, y] = toWebMercator(p.lat, p.lng)
  return `${x.toFixed(7)},${y.toFixed(7)},${encodeURIComponent(p.name)},,`
}

/** 두 지점 사이 네이버 지도 웹 길찾기(대중교통 탭). 경로·시간은 네이버 지도가 계산한다. */
export function naverDirectionsUrl(from: GeoPoint, to: GeoPoint): string {
  return `https://map.naver.com/p/directions/${seg(from)}/${seg(to)}/-/transit`
}

/** 두 좌표 사이 직선(대원) 거리 km. 이동 거리가 아니다. */
export function straightLineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

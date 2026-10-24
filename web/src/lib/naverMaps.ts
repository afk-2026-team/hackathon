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

/* ── 네이버 지도 길안내 링크 ──
 * 웹: map.naver.com/p/directions/{출발}/{도착}/{경유지 ':' 구분 | -}/{transit|car|walk}
 *   각 지점 = "경도,위도,이름,," (WGS84). 출발을 모르면 '-' 로 두면 네이버가 출발지 입력 칸을 비워 둔다.
 *   2026-10-24 헤드리스 Edge 로 실측: 서울역→강남역 대중교통·자동차·도보, 경유지 2곳(도보), 출발 생략 모두 정확히 찍힘.
 * 앱: NAVER 지도 URL Scheme(공식 문서 maps-url-scheme) nmap://route/{public|car|walk}?slat&slng&sname&dlat&dlng&dname
 *   &v1lat..v5lat(경유지 최대 5)&appname=<웹 페이지 URL>. 출발을 빼면 앱이 현재 위치에서 출발한다.
 */
export type TravelMode = 'transit' | 'car' | 'walk'
export const TRAVEL_MODES: TravelMode[] = ['transit', 'car', 'walk']
export const APP_WAYPOINT_MAX = 5 // URL Scheme 경유지 상한(v1~v5)
const APP_ROUTE: Record<TravelMode, string> = { transit: 'public', car: 'car', walk: 'walk' }
const NMAP_PACKAGE = 'com.nhn.android.nmap'
export const NMAP_IOS_STORE = 'https://itunes.apple.com/app/id311867728?mt=8'

// 경로 구분자(, / :)가 이름에 있으면 웹 경로가 갈라지므로 공백으로 바꾼다. 나머지는 인코딩한다.
const cleanName = (n: string) => n.replace(/[,/:|]+/g, ' ').replace(/\s+/g, ' ').trim() || '-'
const coord = (v: number) => v.toFixed(7).replace(/0+$/, '').replace(/\.$/, '')
const webSeg = (p: GeoPoint) => `${coord(p.lng)},${coord(p.lat)},${encodeURIComponent(cleanName(p.name))},,`

/** 네이버 지도 웹 길찾기. from 이 없으면 도착지만 넘긴다(네이버가 출발지를 묻는다). */
export function naverWebDirectionsUrl(from: GeoPoint | null, to: GeoPoint, mode: TravelMode = 'transit', waypoints: GeoPoint[] = []): string {
  const via = mode === 'transit' || waypoints.length === 0 ? '-' : waypoints.map(webSeg).join(':')
  return `https://map.naver.com/p/directions/${from ? webSeg(from) : '-'}/${webSeg(to)}/${via}/${mode}`
}

/** 두 지점 사이 네이버 지도 웹 길찾기(대중교통). 경로·시간은 네이버 지도가 계산한다. */
export function naverDirectionsUrl(from: GeoPoint, to: GeoPoint): string {
  return naverWebDirectionsUrl(from, to, 'transit')
}

function routeQuery(from: GeoPoint | null, to: GeoPoint, waypoints: GeoPoint[], appname: string): string {
  const parts: string[] = []
  const add = (k: string, v: string) => parts.push(`${k}=${encodeURIComponent(v)}`)
  if (from) {
    add('slat', String(from.lat)); add('slng', String(from.lng)); add('sname', cleanName(from.name))
  }
  add('dlat', String(to.lat)); add('dlng', String(to.lng)); add('dname', cleanName(to.name))
  waypoints.slice(0, APP_WAYPOINT_MAX).forEach((w, i) => {
    add(`v${i + 1}lat`, String(w.lat)); add(`v${i + 1}lng`, String(w.lng)); add(`v${i + 1}name`, cleanName(w.name))
  })
  add('appname', appname)
  return parts.join('&')
}

/** 앱 URL Scheme(iOS·기타). 대중교통은 경유지를 넘기지 않는다. */
export function naverAppRouteUrl(from: GeoPoint | null, to: GeoPoint, mode: TravelMode, appname: string, waypoints: GeoPoint[] = []): string {
  return `nmap://route/${APP_ROUTE[mode]}?${routeQuery(from, to, mode === 'transit' ? [] : waypoints, appname)}`
}

/** Android Chrome intent. 앱이 없으면 browser_fallback_url(웹 길찾기)로 연다. */
export function naverAndroidIntentUrl(from: GeoPoint | null, to: GeoPoint, mode: TravelMode, appname: string, fallback: string, waypoints: GeoPoint[] = []): string {
  const q = routeQuery(from, to, mode === 'transit' ? [] : waypoints, appname)
  return `intent://route/${APP_ROUTE[mode]}?${q}#Intent;scheme=nmap;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;package=${NMAP_PACKAGE};S.browser_fallback_url=${encodeURIComponent(fallback)};end`
}

export type Platform = 'android' | 'ios' | 'desktop'
export function detectPlatform(ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent, touchPoints = typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints ?? 0): Platform {
  if (/Android/i.test(ua)) return 'android'
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && touchPoints > 1)) return 'ios' // iPadOS 는 Mac UA
  return 'desktop'
}

export interface DirectionsRequest {
  from: GeoPoint | null
  to: GeoPoint
  mode: TravelMode
  waypoints?: GeoPoint[]
}
/** appname 은 문서 요구대로 웹 페이지 URL(경로·질의 없이 origin 만). */
export const appName = () => (typeof window === 'undefined' ? 'jinseonmi' : window.location.origin)

/**
 * 길안내 열기. 데스크톱 → 새 탭에 웹 길찾기. Android → intent(앱 없으면 웹). iOS → nmap:// 후 1.5초 안에 화면이
 * 그대로면(앱 없음) 웹 길찾기로(문서의 타이머 방식, 스토어 대신 웹 — 외국인 방문객은 앱이 없을 수 있다).
 * 위치·좌표는 서버로 보내지 않고 링크에만 쓴다.
 */
export function openNaverDirections(req: DirectionsRequest, env: { platform?: Platform; navigate?: (url: string) => void; openTab?: (url: string) => void } = {}): string {
  const platform = env.platform ?? detectPlatform()
  const navigate = env.navigate ?? ((u: string) => { window.location.href = u })
  const openTab = env.openTab ?? ((u: string) => { window.open(u, '_blank', 'noopener,noreferrer') })
  const wps = req.waypoints ?? []
  const web = naverWebDirectionsUrl(req.from, req.to, req.mode, wps)
  if (platform === 'desktop') {
    openTab(web)
    return web
  }
  if (platform === 'android') {
    const url = naverAndroidIntentUrl(req.from, req.to, req.mode, appName(), web, wps)
    navigate(url)
    return url
  }
  const url = naverAppRouteUrl(req.from, req.to, req.mode, appName(), wps)
  const started = Date.now()
  navigate(url)
  window.setTimeout(() => {
    if (document.visibilityState === 'visible' && Date.now() - started < 2000) navigate(web)
  }, 1500)
  return url
}

/** 브라우저 현재 위치를 한 번 묻는다(사용자 클릭 때만). 거부·실패·미지원이면 null. 저장·전송하지 않는다. */
export function currentPosition(timeoutMs = 8000): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    const geo = typeof navigator === 'undefined' ? undefined : navigator.geolocation
    if (!geo) return resolve(null)
    geo.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 60_000 },
    )
  })
}

/** Day 전체를 순서대로 여는 다리(leg) 나누기: 한 링크에 출발+경유 5+도착 = 최대 7곳, 다음 다리는 이전 도착에서 시작. */
export function chunkRoute(points: GeoPoint[], maxPerLeg = APP_WAYPOINT_MAX + 2): { from: GeoPoint; to: GeoPoint; waypoints: GeoPoint[] }[] {
  const legs: { from: GeoPoint; to: GeoPoint; waypoints: GeoPoint[] }[] = []
  let i = 0
  while (i < points.length - 1) {
    const slice = points.slice(i, i + maxPerLeg)
    legs.push({ from: slice[0], to: slice[slice.length - 1], waypoints: slice.slice(1, -1) })
    i += slice.length - 1
  }
  return legs
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

import type { CatalogItem, ListPrice, Preferences, ProfilePayload } from './types'

// 기기에만 저장한다. 손상되거나 모르는 형태는 버리고 온보딩을 다시 연다(fail-closed).
// 저장 공간은 계정별로 나뉜다: 'guest' 또는 'user:<id>'. 서로의 프로필·카트·여행이 섞이지 않는다.
export type Namespace = 'guest' | `user:${string}`
const PREFIX = 'korea-locally'
export const keyFor = (ns: Namespace, name: 'profile' | 'cart' | 'trip' | 'start') => `${PREFIX}/${ns}/${name}`
export const ENTRY_KEY = `${PREFIX}/entry`
// 계정 분리 이전 형식(guest 로 옮긴다)
const OLD_KEYS = { profile: `${PREFIX}/profile`, cart: `${PREFIX}/cart`, trip: `${PREFIX}/trip` } as const
const LEGACY_PROFILE_KEY = 'kl.profile'
const PROFILE_VERSION = 1

// 저장소 접근 자체가 막힌 환경(사생활 보호 모드 등)에서도 앱이 멈추지 않게 한다.
function safeGet(s: Storage, k: string): string | null {
  try {
    return s.getItem(k)
  } catch {
    return null
  }
}
function safeSet(s: Storage, k: string, v: string): void {
  try {
    s.setItem(k, v)
  } catch {
    /* 저장 실패는 이번 세션 메모리 상태로만 유지 */
  }
}
function safeRemove(s: Storage, k: string): void {
  try {
    s.removeItem(k)
  } catch {
    /* noop */
  }
}

export interface Profile {
  version: typeof PROFILE_VERSION
  country: string
  language: string
  currency: string
  gender: string | null
  age_range: string | null
  preferences: Preferences | null
  onboarded_at: string
  tutorial_done: boolean
}

export interface CartLine {
  item_id: string
  title: string
  category: CatalogItem['category']
  price_krw: number | null
  // 원화 가격이 없을 때 판매처 표시가격(통화 그대로). 오래된 저장본에는 없을 수 있다(카탈로그로 보강).
  list_price?: ListPrice | null
  qty: number
}

export interface TripEntry {
  entry_id: string
  item_id: string
  title: string
  category: CatalogItem['category']
  location: CatalogItem['location']
  day: number
}

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const optStr = (v: unknown): string | null => (isStr(v) ? v : null)

function readJson(storage: Storage, key: string): unknown {
  const raw = safeGet(storage, key)
  if (raw == null) return undefined
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

function parsePreferences(v: unknown): Preferences | null {
  if (!v || typeof v !== 'object') return null
  const p = v as Record<string, unknown>
  const out: Preferences = {}
  if (Array.isArray(p.interests)) {
    const interests = p.interests.filter(isStr)
    if (interests.length) out.interests = interests
  }
  if (typeof p.budget_krw === 'number' && p.budget_krw > 0) out.budget_krw = p.budget_krw
  if (isStr(p.current_product)) out.current_product = p.current_product
  return Object.keys(out).length ? out : null
}

/** 저장된 값을 현재 버전 Profile 로 바꾼다. 쓸 수 없으면 null. */
export function migrateProfile(v: unknown): Profile | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  // v0: 초기 시안의 {country, lang} 형태
  const language = isStr(o.language) ? o.language : isStr(o.lang) ? o.lang : null
  if (!isStr(o.country) || !language) return null
  if (o.version !== undefined && o.version !== PROFILE_VERSION) return null
  return {
    version: PROFILE_VERSION,
    country: o.country,
    language,
    currency: isStr(o.currency) ? o.currency : 'KRW',
    gender: optStr(o.gender),
    age_range: optStr(o.age_range),
    preferences: parsePreferences(o.preferences),
    onboarded_at: isStr(o.onboarded_at) ? o.onboarded_at : new Date(0).toISOString(),
    tutorial_done: o.tutorial_done === true,
  }
}

/** 계정 분리 이전 데이터를 guest 공간으로 한 번 옮긴다. */
export function migrateLegacy(storage: Storage = localStorage): void {
  for (const name of ['profile', 'cart', 'trip'] as const) {
    const old = safeGet(storage, OLD_KEYS[name])
    if (old != null) {
      if (safeGet(storage, keyFor('guest', name)) == null) safeSet(storage, keyFor('guest', name), old)
      safeRemove(storage, OLD_KEYS[name])
    }
  }
  const legacy = migrateProfile(readJson(storage, LEGACY_PROFILE_KEY))
  if (legacy && safeGet(storage, keyFor('guest', 'profile')) == null) saveProfile('guest', legacy, storage)
  safeRemove(storage, LEGACY_PROFILE_KEY)
}

export function loadProfile(ns: Namespace, storage: Storage = localStorage): Profile | null {
  return migrateProfile(readJson(storage, keyFor(ns, 'profile')))
}

export function saveProfile(ns: Namespace, p: Profile, storage: Storage = localStorage): void {
  safeSet(storage, keyFor(ns, 'profile'), JSON.stringify(p))
}

export type EntryChoice = 'guest' | 'google'
export function loadEntry(storage: Storage = localStorage): EntryChoice | null {
  const v = safeGet(storage, ENTRY_KEY)
  return v === 'guest' || v === 'google' ? v : null
}
export function saveEntry(v: EntryChoice | null, storage: Storage = localStorage): void {
  if (v) safeSet(storage, ENTRY_KEY, v)
  else safeRemove(storage, ENTRY_KEY)
}

export function toPayload(p: Profile): ProfilePayload {
  const payload: ProfilePayload = { country: p.country, language: p.language, currency: p.currency }
  if (p.gender) payload.gender = p.gender
  if (p.age_range) payload.age_range = p.age_range
  if (p.preferences) payload.preferences = p.preferences
  return payload
}

function loadList<T>(key: string, valid: (x: unknown) => x is T, storage: Storage): T[] {
  const v = readJson(storage, key)
  return Array.isArray(v) ? v.filter(valid) : []
}

const isCartLine = (x: unknown): x is CartLine => {
  const o = x as CartLine
  return !!o && isStr(o.item_id) && isStr(o.title) && Number.isInteger(o.qty) && o.qty > 0
}
const isTripEntry = (x: unknown): x is TripEntry => {
  const o = x as TripEntry
  return !!o && isStr(o.entry_id) && isStr(o.item_id) && isStr(o.title) && Number.isInteger(o.day) && o.day > 0
}

export const loadCart = (ns: Namespace, s: Storage = localStorage) => loadList(keyFor(ns, 'cart'), isCartLine, s)
export const saveCart = (ns: Namespace, c: CartLine[], s: Storage = localStorage) => safeSet(s, keyFor(ns, 'cart'), JSON.stringify(c))
export const loadTrip = (ns: Namespace, s: Storage = localStorage) => loadList(keyFor(ns, 'trip'), isTripEntry, s)
export const saveTrip = (ns: Namespace, t: TripEntry[], s: Storage = localStorage) => safeSet(s, keyFor(ns, 'trip'), JSON.stringify(t))

/** 지정한 계정 공간만 지운다. 다른 계정·게스트 데이터는 그대로 둔다. */
export function clearAll(ns: Namespace, s: Storage = localStorage): void {
  for (const n of ['profile', 'cart', 'trip', 'start'] as const) safeRemove(s, keyFor(ns, n))
}

// ── 출발지(숙소). 사용자가 지오코딩 후보에서 직접 고른 값만 저장한다(담당 F). ──
export interface StartPoint {
  label: string
  address: string
  lat: number
  lng: number
  coords_source: 'naver_maps_geocode'
}

const inRange = (v: unknown, lim: number): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= lim

export function parseStart(v: unknown): StartPoint | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (!isStr(o.label) || !isStr(o.address) || !inRange(o.lat, 90) || !inRange(o.lng, 180)) return null
  if (o.coords_source !== 'naver_maps_geocode') return null
  return { label: o.label, address: o.address, lat: o.lat, lng: o.lng, coords_source: 'naver_maps_geocode' }
}

/** 손상·모르는 형태는 지우고 null(fail-closed). */
export function loadStart(ns: Namespace, s: Storage = localStorage): StartPoint | null {
  const raw = readJson(s, keyFor(ns, 'start'))
  if (raw === undefined) {
    if (safeGet(s, keyFor(ns, 'start')) != null) safeRemove(s, keyFor(ns, 'start'))
    return null
  }
  const v = parseStart(raw)
  if (!v) safeRemove(s, keyFor(ns, 'start'))
  return v
}
export function saveStart(ns: Namespace, v: StartPoint, s: Storage = localStorage): void {
  const ok = parseStart(v)
  if (ok) safeSet(s, keyFor(ns, 'start'), JSON.stringify(ok))
}
export const clearStart = (ns: Namespace, s: Storage = localStorage) => safeRemove(s, keyFor(ns, 'start'))

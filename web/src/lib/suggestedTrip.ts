import type { TripEntry } from './storage'
import type { CatalogItem } from './types'

// 첫 진입 My Trip 추천 일정. 실제 카탈로그 항목만 쓰고, 고르는 기준은 태그·주소·좌표다(하드코딩 id 없음).
// 의료는 사용자가 의료 관심사를 고른 경우에만 정보 확인용 경유지 1곳으로 넣는다.

// tripwire: lib/options.ts INTERESTS 중 의료 관심사 코드. 관심사 목록이 바뀌면 함께 확인한다.
export const MEDICAL_INTERESTS = ['dermatology', 'checkup', 'dental', 'plastic_surgery'] as const
const MAX_STOPS = 3

export interface SuggestInput {
  catalog: CatalogItem[]
  ranked?: CatalogItem[] | null // 서버 추천 순서(/v1/discovery/recommendations). 실패하면 null → 카탈로그 기본 코스
  interests?: string[]
  budgetKrw?: number
}

const inSeoul = (i: CatalogItem) => i.tags.includes('seoul') || (i.location?.address ?? '').startsWith('서울')
const hasCoords = (i: CatalogItem) => typeof i.location?.lat === 'number' && typeof i.location?.lng === 'number'
const overlap = (i: CatalogItem, codes: readonly string[]) => i.tags.filter((t) => codes.includes(t)).length

// 서버가 순위를 준 항목을 먼저, 나머지는 카탈로그 순서로(결정론). 서버 항목도 카탈로그에 있는 id 만 쓴다.
function ordered(catalog: CatalogItem[], ranked: CatalogItem[] | null | undefined): CatalogItem[] {
  const byId = new Map(catalog.map((i) => [i.id, i]))
  const seen = new Set<string>()
  const out: CatalogItem[] = []
  for (const r of ranked ?? []) {
    const i = byId.get(r.id)
    if (i && !seen.has(i.id)) (seen.add(i.id), out.push(i))
  }
  for (const i of catalog) if (!seen.has(i.id)) (seen.add(i.id), out.push(i))
  return out
}

const byScore = (codes: readonly string[]) => (list: CatalogItem[]) =>
  list.map((i, n) => ({ i, n, s: overlap(i, codes) })).sort((a, b) => b.s - a.s || a.n - b.n).map((x) => x.i)

export function suggestTrip({ catalog, ranked, interests = [], budgetKrw }: SuggestInput): TripEntry[] {
  const all = ordered(catalog, ranked)
  const medicalWanted = MEDICAL_INTERESTS.filter((c) => interests.includes(c))
  const beautyCodes = interests.filter((c) => !(MEDICAL_INTERESTS as readonly string[]).includes(c))

  const medical = medicalWanted.length
    ? byScore(medicalWanted)(all.filter((i) => i.kind === 'place' && i.category === 'medical' && inSeoul(i) && hasCoords(i) && overlap(i, medicalWanted) > 0))[0]
    : undefined
  const beautyPlaces = byScore(beautyCodes)(all.filter((i) => i.kind === 'place' && i.category === 'beauty' && inSeoul(i)))
  const stops = [...beautyPlaces.slice(0, medical ? MAX_STOPS - 1 : MAX_STOPS), ...(medical ? [medical] : [])]

  // 제품은 지도 경유지가 아니라 체크리스트 1개. 예산이 있으면 그 안의 원화 가격만.
  const products = byScore(beautyCodes)(
    all.filter((i) => i.kind === 'product' && i.category === 'beauty' && (!budgetKrw || (i.price_krw != null && i.price_krw <= budgetKrw))),
  )
  const items = [...stops, ...products.slice(0, 1)]

  return items.map((i) => ({
    entry_id: `suggested-${i.id}`,
    item_id: i.id,
    title: i.title,
    category: i.category,
    location: i.kind === 'place' ? i.location : null,
    day: 1,
    source: 'suggested' as const,
  }))
}

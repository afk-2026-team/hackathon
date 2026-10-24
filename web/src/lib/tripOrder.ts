import type { TripEntry } from './storage'

/**
 * 한 날짜의 항목만 서버가 돌려준 순서(item_id)대로 다시 놓는다. 다른 날짜 항목의 위치·순서는 그대로 두고,
 * 순서에 없는 그날 항목(좌표 없음·체크리스트)은 원래 상대 순서를 지켜 뒤에 둔다. 항목을 지우거나 새로 만들지 않는다.
 */
export function reorderDay(trip: TripEntry[], day: number, orderedItemIds: string[]): TripEntry[] {
  const dayEntries = trip.filter((e) => e.day === day)
  const rank = new Map(orderedItemIds.map((id, i) => [id, i]))
  const ordered = [
    ...dayEntries.filter((e) => rank.has(e.item_id)).sort((a, b) => rank.get(a.item_id)! - rank.get(b.item_id)!),
    ...dayEntries.filter((e) => !rank.has(e.item_id)),
  ]
  let k = 0
  return trip.map((e) => (e.day === day ? ordered[k++] : e))
}

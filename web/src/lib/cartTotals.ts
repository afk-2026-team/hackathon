import type { CartLine } from './storage'
import type { CatalogItem } from './types'

// 카트 합계는 원 통화별로만 더한다. 통화가 다른 금액을 환율로 합치지 않고, 가격을 모르는 항목은 0원으로 치지 않는다.
export interface CurrencyTotal {
  currency: string
  amount: number
  lines: number // 이 통화로 계산한 카트 줄 수
  listed: boolean // 판매처 표시가격(원화 판매가가 아님) 기준인지
}

export interface CartTotals {
  totals: CurrencyTotal[] // KRW 먼저, 나머지는 통화 코드 순
  unpriced: number // 가격 정보가 없는 줄 수
}

export function linePrice(l: CartLine): { amount: number; currency: string; listed: boolean } | null {
  if (typeof l.price_krw === 'number') return { amount: l.price_krw, currency: 'KRW', listed: false }
  const lp = l.list_price
  if (lp && typeof lp.amount === 'number' && lp.amount >= 0 && /^[A-Z]{3}$/.test(lp.currency)) return { amount: lp.amount, currency: lp.currency, listed: true }
  return null
}

export function cartTotals(cart: CartLine[]): CartTotals {
  const map = new Map<string, CurrencyTotal>()
  let unpriced = 0
  for (const l of cart) {
    const p = linePrice(l)
    if (!p) {
      unpriced += 1
      continue
    }
    const key = `${p.currency}:${p.listed ? 'list' : 'sale'}`
    const cur = map.get(key) ?? { currency: p.currency, amount: 0, lines: 0, listed: p.listed }
    cur.amount += p.amount * l.qty
    cur.lines += 1
    map.set(key, cur)
  }
  const totals = [...map.values()].sort((a, b) => (a.currency === 'KRW' ? -1 : b.currency === 'KRW' ? 1 : a.currency.localeCompare(b.currency)))
  return { totals, unpriced }
}

/** 저장된 카트 줄을 현재 카탈로그 값으로 보강한다. 수량·선택은 그대로 두고, 카탈로그에 없는 항목도 지우지 않는다. */
export function refreshCartFromCatalog(cart: CartLine[], catalog: Map<string, CatalogItem>): { cart: CartLine[]; changed: boolean } {
  let changed = false
  const next = cart.map((l) => {
    const item = catalog.get(l.item_id)
    if (!item) return l
    const list_price = item.list_price ?? null
    const same = l.price_krw === item.price_krw && JSON.stringify(l.list_price ?? null) === JSON.stringify(list_price) && l.title === item.title && l.category === item.category
    if (same) return l
    changed = true
    return { ...l, title: item.title, category: item.category, price_krw: item.price_krw, list_price }
  })
  return { cart: next, changed }
}

import type { CountryContext, Source } from './types'

// 백엔드 비교 계약(POST /v1/discovery/compare, GET /v1/discovery/reference-products)과
// 화면용 뷰모델. 화면은 Comparison 만 읽는다.
export interface PriceFact {
  amount: number
  currency: string
  basis: string
  source: Source
}

export interface ReferenceProduct {
  id: string
  brand: string
  title: string
  form: string | null
  volume_ml: number | null
  key_ingredients: string[] | null
  ingredients_complete: boolean
  ingredients_basis: string
  price: PriceFact | null
  sources: Source[]
  provenance: string
}

export type PointAttribute = 'key_ingredients' | 'volume_ml' | 'form'
type PointValue = string | number | string[] | null

export interface Point {
  attribute: PointAttribute
  current: PointValue
  candidate: PointValue
  basis: string
  sources: Source[]
}

export interface CompareResponse {
  current: ReferenceProduct | null
  current_status: 'matched' | 'unknown'
  candidate: {
    id: string
    title: string
    form: string | null
    volume_ml: number | null
    key_ingredients: string[] | null
    ingredients_complete: boolean
    ingredients_basis: string
    price: PriceFact | null
    sources: Source[]
  }
  common: Point[]
  differences: Point[]
  unverified: Point[]
  price: PriceComparison
  country_context: CountryContext
  notice: string
  generated_at: string
}

export interface PriceComparison {
  current: PriceFact | null
  candidate: PriceFact | null
  comparable: boolean
  note: string
}

export interface CompareRow {
  attribute: PointAttribute
  kind: 'common' | 'difference' | 'unverified'
  /** 성분 목록이 전성분이 아닌 쪽. 목록에 없는 성분을 '없음'으로 읽지 않게 표시한다 */
  partial: { current: boolean; candidate: boolean }
  current: string | null
  candidate: string | null
  basis: string
  sources: Source[]
}

export interface Comparison {
  currentName: string
  matched: boolean
  candidateTitle: string
  rows: CompareRow[]
  price: PriceComparison
  notice: string
  countryContext: CountryContext
}

export function formatMoney(amount: number, currency: string): string {
  if (currency === 'KRW') return `₩${amount.toLocaleString('en-US')}`
  return `${currency} ${amount.toLocaleString('en-US')}`
}

function display(attr: PointAttribute, v: PointValue): string | null {
  if (v == null || (Array.isArray(v) && v.length === 0) || v === '') return null
  if (Array.isArray(v)) return v.join(', ')
  if (attr === 'volume_ml' && typeof v === 'number') return `${v} ml`
  return String(v)
}

export function fromApi(res: CompareResponse, currentName: string): Comparison {
  const isIng = (p: Point) => p.attribute === 'key_ingredients'
  const toRow = (kind: CompareRow['kind']) => (p: Point): CompareRow => ({
    attribute: p.attribute,
    kind,
    partial: {
      current: isIng(p) && !!res.current && !res.current.ingredients_complete,
      candidate: isIng(p) && !res.candidate.ingredients_complete,
    },
    current: display(p.attribute, p.current),
    candidate: display(p.attribute, p.candidate),
    basis: p.basis,
    sources: p.sources ?? [],
  })
  return {
    currentName: res.current?.title ?? currentName,
    matched: res.current_status === 'matched' && !!res.current,
    candidateTitle: res.candidate.title,
    rows: [
      ...res.common.map(toRow('common')),
      ...res.differences.map(toRow('difference')),
      ...(res.unverified ?? []).map(toRow('unverified')),
    ],
    price: res.price ?? { current: null, candidate: res.candidate.price, comparable: false, note: '' },
    notice: res.notice,
    countryContext: res.country_context,
  }
}

/** 입력한 이름이 참고 제품 목록과 정확히 같으면 id 로 보낸다(대소문자·공백 무시). */
export function matchReference(name: string, refs: ReferenceProduct[]): ReferenceProduct | undefined {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
  const n = norm(name)
  return refs.find((r) => norm(r.title) === n || norm(`${r.brand} ${r.title}`) === n)
}

export interface ExplainResponse {
  text: string
  mode: 'llm' | 'fallback'
  fallback_reason: null | 'llm_unavailable' | 'timeout' | 'validation_failed' | 'llm_error'
  sources: Source[]
  notice: string
  generated_at: string
}

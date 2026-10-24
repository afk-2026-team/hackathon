import { useMemo, useState } from 'react'
import type { ExploreProps } from './contracts'
import type { CatalogItem, CategoryFilter } from '../lib/types'
import { useRecommendations } from '../lib/useRecommendations'
import { INTERESTS, countryName } from '../lib/options'
import { fill, useLang, useT, type Key } from '../lib/i18n'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import { ItemRow } from '../components/explore/ItemRow'
import { BEAUTY_TYPES, MEDICAL_FIELDS, facetOf, fieldKey, regionLabel, typeKey, type Facet } from '../components/explore/facets'
import '../styles/explore.css'

// 담당: 탐색·검색·카트(D). 기획 §3.1 — Real picks 와 Sponsored 를 섞지 않는다.
// 목록 순서는 카탈로그의 큐레이션 순서이며 측정 순위가 아니다. 필터는 순서를 바꾸지 않고 걸러내기만 한다.

type Lane = 'real' | 'sponsored'
type MedKind = 'all' | 'place' | 'guide'
const PAGE = 20
const CATS: { c: CategoryFilter; key: Key }[] = [
  { c: 'all', key: 'explore.tabAll' },
  { c: 'beauty', key: 'explore.tabBeauty' },
  { c: 'medical', key: 'explore.tabMedical' },
]

interface Filters {
  cat: CategoryFilter
  picked: Set<string> | null // null = 아직 건드리지 않음 → 프로필 관심사를 미리 선택한 상태
  types: Set<string>
  fields: Set<string>
  regions: Set<string>
  kind: MedKind
}
const initial = (cat: CategoryFilter): Filters => ({ cat, picked: null, types: new Set(), fields: new Set(), regions: new Set(), kind: 'all' })

const toggled = (set: Set<string>, code: string) => {
  const next = new Set(set)
  if (next.has(code)) next.delete(code)
  else next.add(code)
  return next
}
const hitsAny = (have: string[], want: Set<string>) => want.size === 0 || have.some((x) => want.has(x))

export function Explore({ profile, category, onCategory, onOpen, onAddCart, onSearch, cartQty, tripIds }: ExploreProps) {
  const t = useT()
  const lang = useLang()
  const { state, retry } = useRecommendations(profile, category)
  const [lane, setLane] = useState<Lane>('real')
  // 필터는 탭(카테고리)마다 새로 시작한다. 다른 탭에서 만든 값은 무시한다.
  const [rawFilters, setFilters] = useState<Filters>(() => initial(category))
  if (rawFilters.cat !== category) setFilters(initial(category)) // 탭이 바뀌면 렌더 중에 바로 초기화(React 파생 상태 패턴)
  const f = rawFilters.cat === category ? rawFilters : initial(category)
  const update = (patch: (prev: Filters) => Partial<Filters>) =>
    setFilters((prev) => {
      const base = prev.cat === category ? prev : initial(category)
      return { ...base, ...patch(base) }
    })

  const items: CatalogItem[] = useMemo(() => (state.status === 'ready' ? state.data.items : []), [state])
  const medical = category === 'medical'
  const beautyTab = category === 'beauty'

  // 항목별 필터 키는 한 번만 계산한다(수백 개여도 렌더마다 주소를 다시 파싱하지 않는다).
  const facets = useMemo(() => new Map<string, Facet>(items.map((i) => [i.id, facetOf(i)])), [items])
  const facet = (i: CatalogItem) => facets.get(i.id) ?? facetOf(i)

  const { real, sponsored } = useMemo(
    () => ({ real: items.filter((i) => i.sponsorship !== 'sponsored'), sponsored: items.filter((i) => i.sponsorship === 'sponsored') }),
    [items],
  )
  const laneItems = lane === 'real' ? real : sponsored
  const curationOf = useMemo(() => new Map(laneItems.map((i, n) => [i.id, n + 1])), [laneItems])

  // 칩 후보: 결과(두 레인 모두)에 실제로 있는 값만. 레인을 바꿔도 칩이 사라지지 않게 한다.
  const interestChips = useMemo(() => {
    if (medical) return []
    const tags = new Set(items.flatMap((i) => i.tags))
    return INTERESTS.filter((x) => tags.has(x.code))
  }, [items, medical])
  const typeChips = useMemo(() => {
    if (!beautyTab) return []
    const have = new Set(items.flatMap((i) => facet(i).types))
    return BEAUTY_TYPES.filter((x) => have.has(x))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, beautyTab, facets])
  const fieldChips = useMemo(() => {
    if (!medical) return []
    const have = new Set(items.flatMap((i) => facet(i).fields))
    return MEDICAL_FIELDS.filter((x) => have.has(x))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, medical, facets])
  const regionChips = useMemo(() => {
    if (!medical) return [] as string[]
    const seen: string[] = []
    for (const i of items) {
      const r = facet(i).region
      if (r && !seen.includes(r)) seen.push(r)
    }
    return seen.sort((a, b) => a.localeCompare(b, 'ko'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, medical, facets])

  const interestCodes = new Set(interestChips.map((x) => x.code))
  const selected = new Set([...(f.picked ?? new Set(profile.preferences?.interests ?? []))].filter((c) => interestCodes.has(c)))
  const types = new Set([...f.types].filter((x) => (typeChips as string[]).includes(x)))
  const fields = new Set([...f.fields].filter((x) => (fieldChips as string[]).includes(x)))
  const regions = new Set([...f.regions].filter((x) => regionChips.includes(x)))
  const kind: MedKind = medical ? f.kind : 'all'
  const filterKey = [category, lane, kind, [...selected], [...types], [...fields], [...regions]].join('|')

  // 단계별로 걸러 칩 개수를 "다른 필터를 적용한 뒤" 기준으로 보여 준다.
  const { byKind, shown, kindCounts, regionCounts } = useMemo(() => {
    const kindCounts = { all: laneItems.length, place: 0, guide: 0 }
    for (const i of laneItems) {
      if (i.kind === 'place') kindCounts.place++
      else if (i.kind === 'guide') kindCounts.guide++
    }
    const byKind = kind === 'all' ? laneItems : laneItems.filter((i) => i.kind === kind)
    const beforeRegion = byKind.filter(
      (i) => hitsAny(i.tags, selected) && hitsAny(facet(i).types, types) && hitsAny(facet(i).fields, fields),
    )
    const regionCounts = new Map<string, number>()
    for (const i of beforeRegion) {
      const r = facet(i).region
      if (r) regionCounts.set(r, (regionCounts.get(r) ?? 0) + 1)
    }
    const shown = regions.size === 0 ? beforeRegion : beforeRegion.filter((i) => regions.has(facet(i).region ?? ''))
    return { byKind, shown, kindCounts, regionCounts }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, laneItems, facets])

  const fieldCount = (code: string) => byKind.filter((i) => hitsAny(i.tags, selected) && facet(i).fields.includes(code)).length
  const typeCount = (code: string) => byKind.filter((i) => hitsAny(i.tags, selected) && facet(i).types.includes(code)).length

  // 페이지: 필터·탭·레인이 바뀌면 처음 20개로 돌아간다.
  const [page, setPage] = useState({ key: '', n: PAGE })
  const limit = page.key === filterKey ? page.n : PAGE
  const visible = shown.slice(0, limit)
  const left = shown.length - visible.length

  const anyFilter = selected.size + types.size + fields.size + regions.size > 0 || kind !== 'all'
  const clearAll = () => update(() => ({ picked: new Set(), types: new Set(), fields: new Set(), regions: new Set(), kind: 'all' }))

  const chip = (on: boolean, label: string, onClick: () => void, key: string) => (
    <button key={key} type="button" aria-pressed={on} className={`chip${on ? ' is-on' : ''}`} onClick={onClick}>
      {label}
    </button>
  )

  return (
    <div className={`ex ex--${category}`}>
      <div className="ex-top">
        <button type="button" className="searchbox" onClick={onSearch}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M20 20l-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          <span>{t('explore.searchPlaceholder')}</span>
        </button>
      </div>
      <div className="tabs" role="tablist">
        {CATS.map(({ c, key }) => (
          <button key={c} type="button" role="tab" aria-selected={c === category} className={`tabs__item${c === category ? ' is-on' : ''}`} onClick={() => onCategory(c)}>
            {t(key)}
          </button>
        ))}
      </div>

      {state.status === 'loading' && <LoadingState />}
      {state.status === 'error' && <ErrorState message={state.message} onRetry={retry} />}
      {state.status === 'ready' && (
        <>
          <p className={`ex-country${state.data.country_context.status === 'insufficient' ? ' is-thin' : ''}`}>
            {state.data.country_context.status === 'supported'
              ? fill(t('explore.countrySupported'), { country: countryName(state.data.country_context.country) })
              : t('explore.countryInsufficient')}
          </p>

          <div className="ex-bar">
            <div className="seg" role="tablist">
              {(['real', 'sponsored'] as const).map((l) => (
                <button key={l} type="button" role="tab" aria-selected={lane === l} className={`seg__item${lane === l ? ' is-on' : ''}`} onClick={() => setLane(l)}>
                  {fill(t('explore.segCount'), { label: t(l === 'real' ? 'explore.segReal' : 'explore.segSponsored'), n: l === 'real' ? real.length : sponsored.length })}
                </button>
              ))}
            </div>
          </div>

          {medical && (kindCounts.place > 0 && kindCounts.guide > 0) && (
            <div className="hscroll ex-chips" role="group" aria-label={t('explore.kinds')}>
              {([
                ['all', 'explore.kindAll', kindCounts.all],
                ['place', 'explore.kindClinics', kindCounts.place],
                ['guide', 'explore.kindGuides', kindCounts.guide],
              ] as const).map(([k, key, n]) =>
                chip(kind === k, fill(t('explore.chipCount'), { label: t(key), n }), () => update(() => ({ kind: k })), k),
              )}
            </div>
          )}

          {interestChips.length > 0 && (
            <div className="hscroll ex-chips" role="group" aria-label={t('explore.interests')}>
              {interestChips.map((x) =>
                chip(selected.has(x.code), t(`shell.i.${x.code}` as Key), () => update(() => ({ picked: toggled(selected, x.code) })), x.code),
              )}
            </div>
          )}

          {typeChips.length > 0 && (
            <div className="hscroll ex-chips ex-chips--sub" role="group" aria-label={t('explore.types')}>
              {typeChips.map((x) =>
                chip(types.has(x), fill(t('explore.chipCount'), { label: t(typeKey(x)), n: typeCount(x) }), () => update(() => ({ types: toggled(types, x) })), x),
              )}
            </div>
          )}

          {fieldChips.length > 0 && (
            <div className="hscroll ex-chips" role="group" aria-label={t('explore.fields')}>
              {fieldChips.map((x) =>
                chip(fields.has(x), fill(t('explore.chipCount'), { label: t(fieldKey(x)), n: fieldCount(x) }), () => update(() => ({ fields: toggled(fields, x) })), x),
              )}
            </div>
          )}

          {regionChips.length > 0 && (
            <div className="hscroll ex-chips ex-chips--sub" role="group" aria-label={t('explore.regions')}>
              {regionChips.map((r) =>
                chip(regions.has(r), fill(t('explore.chipCount'), { label: regionLabel(r, lang), n: regionCounts.get(r) ?? 0 }), () => update(() => ({ regions: toggled(regions, r) })), r),
              )}
            </div>
          )}

          <p className="ex-lane-note">{t(lane === 'real' ? 'explore.realNote' : 'explore.sponsoredNote')}</p>

          {laneItems.length === 0 ? (
            lane === 'sponsored'
              ? <EmptyState title={t('explore.sponsoredEmptyTitle')} body={t('explore.sponsoredEmptyBody')} />
              : <EmptyState title={t('explore.realEmptyTitle')} body={t('explore.realEmptyBody')} />
          ) : shown.length === 0 ? (
            <EmptyState
              title={t('explore.filterEmptyTitle')}
              body={t('explore.filterEmptyBody')}
              action={<button type="button" className="btn btn--ghost btn--small" onClick={clearAll}>{t('explore.clearFilters')}</button>}
            />
          ) : (
            <>
              <div className="ex-meta">
                <span className="ex-meta__count" aria-live="polite">{fill(t('explore.resultCount'), { n: shown.length })}</span>
                {anyFilter && <button type="button" className="btn btn--text ex-meta__clear" onClick={clearAll}>{t('explore.clearFilters')}</button>}
                <span className="ex-meta__cur">{t('explore.curationNote')}</span>
              </div>
              <ul className="ex-list" aria-label={t(lane === 'real' ? 'explore.listLabelReal' : 'explore.listLabelSponsored')}>
                {visible.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    currency={profile.currency}
                    curation={curationOf.get(item.id)}
                    qty={cartQty[item.id] ?? 0}
                    inTrip={tripIds.has(item.id)}
                    onOpen={onOpen}
                    onAdd={onAddCart}
                  />
                ))}
              </ul>
              {left > 0 && (
                <div className="ex-more">
                  <button type="button" className="btn btn--ghost ex-more__btn" onClick={() => setPage({ key: filterKey, n: limit + PAGE })}>
                    {fill(t('explore.more'), { n: left })}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

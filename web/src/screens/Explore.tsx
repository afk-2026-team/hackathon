import { useMemo, useState } from 'react'
import type { ExploreProps } from './contracts'
import type { CatalogItem, CategoryFilter } from '../lib/types'
import { useRecommendations } from '../lib/useRecommendations'
import { INTERESTS, countryName } from '../lib/options'
import { fill, useLang, useT, type Key } from '../lib/i18n'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import { ItemRow } from '../components/explore/ItemRow'
import '../styles/explore.css'

// 담당: 탐색·검색·카트(D). 기획 §3.1 — Real picks 와 Sponsored 를 섞지 않는다.
// 목록 순서는 카탈로그의 큐레이션 순서이며 측정 순위가 아니다.

type Lane = 'real' | 'sponsored'
const CATS: { c: CategoryFilter; key: Key }[] = [
  { c: 'all', key: 'explore.tabAll' },
  { c: 'beauty', key: 'explore.tabBeauty' },
  { c: 'medical', key: 'explore.tabMedical' },
]
const INTEREST_KO: Record<string, string> = {
  skincare: '스킨케어',
  makeup: '메이크업',
  hair: '헤어',
  dermatology: '피부과 방문',
  checkup: '건강검진',
  dental: '치과',
  neighborhoods: '동네 탐방',
}

export function Explore({ profile, category, onCategory, onOpen, onAddCart, onSearch, cartQty, tripIds }: ExploreProps) {
  const t = useT()
  const lang = useLang()
  const { state, retry } = useRecommendations(profile, category)
  const [lane, setLane] = useState<Lane>('real')
  // null = 아직 사용자가 건드리지 않음 → 프로필 관심사를 미리 선택한 상태로 본다.
  const [picked, setPicked] = useState<Set<string> | null>(null)

  const items: CatalogItem[] = state.status === 'ready' ? state.data.items : []
  const available = useMemo(() => {
    const tags = new Set(items.flatMap((i) => i.tags))
    return INTERESTS.filter((x) => tags.has(x.code))
  }, [items])
  const availableCodes = new Set(available.map((x) => x.code))
  const selected = new Set(
    [...(picked ?? new Set(profile.preferences?.interests ?? []))].filter((c) => availableCodes.has(c)),
  )

  const real = items.filter((i) => i.sponsorship !== 'sponsored')
  const sponsored = items.filter((i) => i.sponsorship === 'sponsored')
  const laneItems = lane === 'real' ? real : sponsored
  const shown = selected.size === 0 ? laneItems : laneItems.filter((i) => i.tags.some((tag) => selected.has(tag)))

  const toggle = (code: string) => {
    const next = new Set(selected)
    if (next.has(code)) next.delete(code)
    else next.add(code)
    setPicked(next)
  }

  return (
    <div className="ex">
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

          {available.length > 0 && (
            <div className="hscroll ex-chips" role="group" aria-label={t('explore.interests')}>
              {available.map((x) => (
                <button key={x.code} type="button" aria-pressed={selected.has(x.code)} className={`chip${selected.has(x.code) ? ' is-on' : ''}`} onClick={() => toggle(x.code)}>
                  {lang === 'ko' ? INTEREST_KO[x.code] ?? x.label : x.label}
                </button>
              ))}
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
              action={<button type="button" className="btn btn--ghost btn--small" onClick={() => setPicked(new Set())}>{t('explore.clearFilters')}</button>}
            />
          ) : (
            <>
              <p className="ex-curation">{t('explore.curationNote')}</p>
              <ul className="ex-list" aria-label={t(lane === 'real' ? 'explore.listLabelReal' : 'explore.listLabelSponsored')}>
                {shown.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    currency={profile.currency}
                    curation={laneItems.indexOf(item) + 1}
                    qty={cartQty[item.id] ?? 0}
                    inTrip={tripIds.has(item.id)}
                    onOpen={onOpen}
                    onAdd={onAddCart}
                  />
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  )
}

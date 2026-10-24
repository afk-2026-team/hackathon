import { useState } from 'react'
import { ApiError, planTrip, type TripPlanResponse } from '../../lib/api'
import { fill, useT } from '../../lib/i18n'
import type { TripEntry } from '../../lib/storage'

interface Props {
  day: number
  entries: TripEntry[] // 그날 항목(장소·체크리스트 모두)
  start: { lat: number; lng: number } | null // 숙소 또는 현재 위치(저장 안 함)
  onApply: (orderedItemIds: string[]) => void
}

type State = { status: 'idle' } | { status: 'loading' } | { status: 'error'; message: string } | { status: 'done'; plan: TripPlanResponse }

const REASON_KEY = {
  no_address: 'trip.plan.reason.no_address',
  geocode_unavailable: 'trip.plan.reason.geocode_unavailable',
  geocode_no_result: 'trip.plan.reason.geocode_no_result',
  geocode_failed: 'trip.plan.reason.geocode_failed',
} as const

/**
 * 서버 방문 순서 제안. 가까운 곳부터 잇는 근접 순서(직선거리 기준)이며 최적 경로·이동 시간이 아니다.
 * 결과는 그날 항목 순서에만 적용하고, 좌표를 못 찾은 장소·체크리스트는 지우지 않고 뒤에 둔다.
 */
export function TripPlan({ day, entries, start, onApply }: Props) {
  const t = useT()
  const [state, setState] = useState<State>({ status: 'idle' })
  const ids = entries.map((e) => e.item_id)
  if (ids.length < 2) return null

  const run = async () => {
    setState({ status: 'loading' })
    try {
      const plan = await planTrip(ids, start ? { lat: start.lat, lng: start.lng } : null)
      onApply(plan.stops.map((s) => s.item_id))
      setState({ status: 'done', plan })
    } catch (e) {
      setState({ status: 'error', message: e instanceof ApiError ? e.message : t('trip.plan.error') })
    }
  }

  return (
    <section className="trip-plan-suggest card" aria-labelledby="trip-plan-h" aria-busy={state.status === 'loading'}>
      <div className="trip-row trip-plan-suggest__head">
        <h3 id="trip-plan-h" className="trip-h3">{t('trip.plan.title')}</h3>
        <button type="button" className="btn btn--primary btn--small" onClick={run} disabled={state.status === 'loading'}>
          {state.status === 'loading' ? t('trip.plan.loading') : fill(t('trip.plan.cta'), { n: day })}
        </button>
      </div>
      <p className="trip-fine">{t('trip.plan.method')}</p>
      {!start && <p className="trip-fine">{t('trip.plan.noStart')}</p>}
      {state.status === 'error' && (
        <div className="trip-note" role="alert">
          {state.message}{' '}
          <button type="button" className="btn btn--text" onClick={run}>{t('trip.plan.retry')}</button>
        </div>
      )}
      {state.status === 'done' && (
        <div className="trip-plan-suggest__result" role="status">
          <p className="trip-muted">{fill(t('trip.plan.applied'), { n: state.plan.stops.length })}</p>
          {state.plan.origin_status !== 'none' && state.plan.origin_status !== 'ok' && <p className="trip-fine">{t('trip.plan.originMissing')}</p>}
          {state.plan.unlocated.length > 0 && (
            <ul className="trip-plan-suggest__unlocated">
              {state.plan.unlocated.map((u) => (
                <li key={u.item_id} className="trip-fine">{u.title} — {t(REASON_KEY[u.reason])}</li>
              ))}
            </ul>
          )}
          {state.plan.checklist.length > 0 && <p className="trip-fine">{fill(t('trip.plan.checklist'), { n: state.plan.checklist.length })}</p>}
        </div>
      )}
    </section>
  )
}

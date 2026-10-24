import type { ExploreProps } from './contracts'
import { useRecommendations } from '../lib/useRecommendations'
import { ErrorState, LoadingState } from '../components/States'

// 담당: 탐색·검색·카트(D). 임시 골격.
export function Explore({ profile, category, onCategory, onOpen }: ExploreProps) {
  const { state, retry } = useRecommendations(profile, category)
  return (
    <section className="sec">
      {(['all', 'beauty', 'medical'] as const).map((c) => (
        <button key={c} type="button" className={`chip${c === category ? ' is-on' : ''}`} onClick={() => onCategory(c)}>{c}</button>
      ))}
      {state.status === 'loading' && <LoadingState />}
      {state.status === 'error' && <ErrorState message={state.message} onRetry={retry} />}
      {state.status === 'ready' && state.data.items.map((i) => (
        <button key={i.id} type="button" onClick={() => onOpen(i)}>{i.title}</button>
      ))}
    </section>
  )
}

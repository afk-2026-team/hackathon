import type { HomeProps } from './contracts'
import { useRecommendations } from '../lib/useRecommendations'
import { ErrorState, LoadingState } from '../components/States'
import { CategoryBadge } from '../components/Common'

// 담당: 셸·홈(C). 임시 골격.
export function Home({ profile, onOpen, onBrowse }: HomeProps) {
  const { state, retry } = useRecommendations(profile, 'all')
  return (
    <section className="sec">
      <button type="button" className="chip" onClick={() => onBrowse('beauty')}>Beauty</button>
      <button type="button" className="chip" onClick={() => onBrowse('medical')}>Medical</button>
      {state.status === 'loading' && <LoadingState />}
      {state.status === 'error' && <ErrorState message={state.message} onRetry={retry} />}
      {state.status === 'ready' && state.data.items.map((i) => (
        <button key={i.id} type="button" onClick={() => onOpen(i)}><CategoryBadge category={i.category} /> {i.title}</button>
      ))}
    </section>
  )
}

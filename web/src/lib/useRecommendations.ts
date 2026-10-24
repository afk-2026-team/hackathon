import { useCallback, useEffect, useState } from 'react'
import { ApiError, fetchRecommendations } from './api'
import type { CategoryFilter, ProfilePayload, RecommendationResponse } from './types'

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: RecommendationResponse }

export function useRecommendations(profile: ProfilePayload, category: CategoryFilter) {
  const [state, setState] = useState<State>({ status: 'loading' })
  const key = JSON.stringify([profile, category])

  const load = useCallback(() => {
    let cancelled = false
    setState({ status: 'loading' })
    fetchRecommendations(profile, category)
      .then((data) => !cancelled && setState({ status: 'ready', data }))
      .catch((e: unknown) => {
        if (cancelled) return
        setState({ status: 'error', message: e instanceof ApiError ? e.message : 'Something went wrong while loading picks.' })
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => load(), [load])
  return { state, retry: load }
}

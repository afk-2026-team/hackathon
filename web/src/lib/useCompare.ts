import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, fetchCompare, fetchExplain, fetchReferenceProducts } from './api'
import { fromApi, matchReference, type Comparison, type ExplainResponse, type ReferenceProduct } from './compare'
import type { ProfilePayload } from './types'

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: Comparison }

type ExplainState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: ExplainResponse }

// 참고 제품 목록은 한 번만 받아 둔다(실패하면 이름으로만 비교 요청).
let refsCache: Promise<ReferenceProduct[]> | null = null
export function loadReferences(): Promise<ReferenceProduct[]> {
  if (!refsCache) refsCache = fetchReferenceProducts().then((r) => r.items, () => {
    refsCache = null
    return []
  })
  return refsCache
}
export function resetReferenceCache() {
  refsCache = null
}

export function useReferences() {
  const [refs, setRefs] = useState<ReferenceProduct[]>([])
  useEffect(() => {
    let alive = true
    loadReferences().then((r) => alive && setRefs(r))
    return () => {
      alive = false
    }
  }, [])
  return refs
}

/**
 * 비교와 짧은 비교 요약. generation 번호로 마지막 요청의 결과만 반영한다
 * (입력을 빠르게 바꾸거나 재시도를 연타하거나 화면을 떠나도 늦은 응답이 덮어쓰지 않는다).
 */
export function useCompare(profile: ProfilePayload, candidateId: string, currentName: string | undefined) {
  const [state, setState] = useState<State>({ status: 'idle' })
  const [explain, setExplain] = useState<ExplainState>({ status: 'idle' })
  const gen = useRef(0)
  const key = JSON.stringify([profile, candidateId, currentName])

  const load = useCallback(() => {
    const my = ++gen.current
    const live = () => gen.current === my
    setExplain({ status: 'idle' })
    if (!currentName) {
      setState({ status: 'idle' })
      return
    }
    setState({ status: 'loading' })
    loadReferences()
      .then((refs) => {
        const ref = matchReference(currentName, refs)
        const body = { profile, candidate_id: candidateId, ...(ref ? { current_product_id: ref.id } : { current_product_name: currentName }) }
        return fetchCompare(body).then((res) => ({ res, body }))
      })
      .then(({ res, body }) => {
        if (!live()) return
        setState({ status: 'ready', data: fromApi(res, currentName) })
        // 비교가 성공한 뒤에 한 번만 요약을 요청한다. 실패해도 비교 화면은 그대로 둔다.
        setExplain({ status: 'loading' })
        fetchExplain(body).then(
          (data) => live() && setExplain(data.text ? { status: 'ready', data } : { status: 'error' }),
          () => live() && setExplain({ status: 'error' }),
        )
      })
      .catch((e: unknown) => {
        if (!live()) return
        setState({ status: 'error', message: e instanceof ApiError ? e.message : 'Comparison could not be loaded.' })
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => {
    load()
    return () => {
      gen.current++ // 언마운트·입력 변경 시 진행 중 요청 결과를 버린다
    }
  }, [load])

  return { state, explain, retry: load }
}

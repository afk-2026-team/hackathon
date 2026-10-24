// 화면용 훅. 화면 파일은 이 계약만 쓴다:
//   const { state, ask, retry, cancel, reset } = useAssistant(profilePayload)
//   ask('질문') — 질문, ask() — Home 추천 요청. state.turns[].answer.{text,candidates,recommendedIds} / .error.message 를 그린다.
// 프로필(계정·게스트 전환 포함)이 바뀌면 대화를 비우고 진행 중 요청을 취소한다.
import { useCallback, useEffect, useReducer, useRef } from 'react'
import { AssistantError, askAssistant, assistantReducer, initialAssistantState } from './assistant'
import type { ProfilePayload } from './types'

let seq = 0
const nextId = () => `turn-${Date.now().toString(36)}-${++seq}`

export function useAssistant(profile: ProfilePayload | null) {
  const [state, dispatch] = useReducer(assistantReducer, initialAssistantState)
  const inflight = useRef<AbortController | null>(null)
  const lastQuestion = useRef<string | null>(null)
  const profileKey = profile ? JSON.stringify(profile) : ''

  useEffect(() => {
    inflight.current?.abort()
    dispatch({ type: 'reset' })
    return () => inflight.current?.abort()
  }, [profileKey])

  const ask = useCallback(
    async (question?: string) => {
      if (!profile) return
      inflight.current?.abort()
      const ctrl = new AbortController()
      inflight.current = ctrl
      const id = nextId()
      const q = question?.trim() ? question.trim() : null
      lastQuestion.current = q
      dispatch({ type: 'ask', id, question: q })
      try {
        const answer = await askAssistant({ profile, input: q ?? undefined, signal: ctrl.signal })
        if (inflight.current === ctrl) dispatch({ type: 'answer', id, answer })
      } catch (e) {
        const err = e instanceof AssistantError ? e : new AssistantError('Something went wrong. Please try again.', 'http')
        dispatch({ type: 'fail', id, error: { message: err.message, kind: err.kind } })
      } finally {
        if (inflight.current === ctrl) inflight.current = null
      }
    },
    // profileKey 가 같으면 같은 프로필이다
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profileKey],
  )

  const retry = useCallback(() => ask(lastQuestion.current ?? undefined), [ask])
  const cancel = useCallback(() => inflight.current?.abort(), [])
  const reset = useCallback(() => {
    inflight.current?.abort()
    dispatch({ type: 'reset' })
  }, [])

  return { state, ask, retry, cancel, reset }
}

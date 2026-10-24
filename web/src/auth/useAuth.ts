import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Auth, AuthStatus } from './core'

/** 인증 상태 구독 hook. 화면은 이 값만 읽고 SDK 를 직접 다루지 않는다. */
export function useAuth(auth: Auth) {
  const [status, setStatus] = useState<AuthStatus>(auth.getStatus())
  const [session, setSession] = useState<Session | null>(null)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    let alive = true
    let unsub = () => {}
    ;(async () => {
      let st: AuthStatus
      try {
        st = await auth.initializeAuth()
      } catch {
        st = { state: 'unavailable', reason: 'init_failed' }
      }
      if (!alive) return
      setStatus(st)
      let s: Session | null = null
      try {
        s = await auth.getSession()
      } catch {
        s = null
      }
      if (!alive) return
      setSession(s)
      setChecked(true) // 어떤 실패에서도 확인 완료로 넘어가 게스트 진입을 막지 않는다
      try {
        unsub = auth.subscribeAuth((next) => alive && setSession(next))
      } catch {
        /* 구독 실패는 세션 갱신 알림만 잃는다 */
      }
    })()
    return () => {
      alive = false
      unsub()
    }
  }, [auth])

  return { status, session, checked, setSession }
}

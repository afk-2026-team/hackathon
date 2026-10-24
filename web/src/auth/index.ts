import { createClient } from '@supabase/supabase-js'
import { createAuth } from './core'

export * from './core'
export { useAuth } from './useAuth'

// 브라우저 기본 인스턴스. 테스트나 다른 화면은 createAuth 로 의존성을 바꿔 만들 수 있다.
export const auth = createAuth({
  fetch: (...a) => fetch(...a),
  createClient,
  location: window.location,
  history: window.history,
})

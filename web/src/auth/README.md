# web/src/auth — 인증 모듈 사용법

화면과 분리된 Supabase Google 로그인 모듈입니다. 어떤 UI에서도 같은 방식으로 씁니다.

## 서버 계약

- `GET /v1/auth/config` → `{ supabase_url, publishable_key, google_enabled, callback_path }`
  - 공개 설정만 받습니다. 프론트에는 비밀키나 Google client secret을 두지 않습니다.
- `GET /v1/auth/me` (`Authorization: Bearer <access_token>`) → 서버가 검증한 `{ id, email?, display_name?, avatar_url? }`
  - 로컬 세션만으로 권한을 판단하지 말고, 서버 쪽 판단이 필요할 때 이 결과를 씁니다.

## API (`import { auth, useAuth, CALLBACK_PATH } from './auth'`)

| 함수 | 설명 |
|---|---|
| `auth.initializeAuth()` | 설정을 읽고 PKCE 클라이언트를 만듭니다. 상태는 `ready` / `disabled`(Google 꺼짐) / `unavailable` 중 하나입니다. `unavailable`은 503·네트워크·형식 오류·시간 초과(`reason: 'timeout'`)일 때입니다. 여러 번 불러도 한 번만 실행하고, 결과를 거부(reject)하지 않습니다. |
| `auth.signInWithGoogle()` | `ready`일 때만 동작합니다. 복귀 주소는 항상 `location.origin + '/auth/callback'`이고, scopes는 `openid email profile`입니다. 실패하면 거부하지 않고 `{ error }`를 돌려줍니다(`google_unavailable`·`sign_in_failed`·`timeout`·`unexpected_redirect` 등). |
| `auth.handleAuthCallback()` | `/auth/callback`에서 호출합니다. 진입하자마자 주소에서 code를 지우고, code를 한 번만 교환합니다(StrictMode 이중 실행에 안전). 교환에는 시간 제한이 있습니다. 결과는 `{ ok: true, session }` 또는 `{ ok: false, error: 'cancelled' \| 'missing_code' \| 'timeout' \| ... }`입니다. |
| `auth.getSession()` / `auth.subscribeAuth(cb)` | 현재 세션을 읽고 변경을 구독합니다. 구독 함수는 해제 함수를 돌려줍니다. 세션 확인이 실패하거나 시간을 넘기면 `getSession`은 `null`입니다(화면 표시용). |
| `auth.signOut()` | 이 기기 세션만 끝냅니다(`scope: 'local'`). `{ signedOut, error }`를 돌려줍니다. 세션이 없다는 것을 **확인했을 때만** `signedOut: true`입니다. 세션이 남아 있거나 확인 자체가 실패하면 `signedOut: false`입니다. |
| `auth.fetchMe(session)` | `/v1/auth/me`를 호출합니다. 실패하면 `null`입니다. |
| `useAuth(auth)` | React hook입니다. `{ status, session, checked, setSession }`를 돌려줍니다. |

테스트나 다른 환경에서는 `createAuth({ fetch, createClient, location, history, timeoutMs? })`로 의존성을 바꿔 만듭니다. `timeoutMs` 기본값은 8000입니다.

## 화면 연결 규칙(현재 앱 기준)

- 첫 화면은 Google 또는 게스트 중에서 고릅니다. 게스트는 항상 가능하고, 고른 값은 `korea-locally/entry`에 기억합니다.
- 저장 공간은 계정별로 나뉩니다. `korea-locally/guest/*`와 `korea-locally/user:<id>/*`(`lib/storage.ts`의 `Namespace`)이며, 서로 섞지 않습니다.
- Google이 `disabled`·`unavailable`이면 버튼을 비활성화하고 이유를 보여줍니다. 성공한 것처럼 보이지 않게 합니다.
- 인증을 기다리는 화면(콜백 처리 중, Google 복귀 확인 중)에도 게스트로 계속하는 버튼을 둡니다. 게스트를 고른 뒤 늦게 끝난 콜백은 화면을 바꾸지 않습니다.

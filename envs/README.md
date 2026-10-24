# 팀 공통 시크릿 매니저

키 값은 **Infisical**에 둡니다. 앱 시작 시 한 번 읽어 해당 프로세스에만 전달하며 `.env` 파일을 만들지 않습니다. 네 명의 Claude 모두 같은 실행기·서버 모듈을 사용합니다.

## 처음 한 번

1. Infisical 초대를 수락하고 `afk-2026-team` 조직의 `afk-sparks-rag` 프로젝트에 참여합니다.
2. Node.js 24 이상과 [Infisical CLI](https://infisical.com/docs/cli/overview)를 설치합니다. 로컬 확인 버전은 CLI `0.44.8`입니다.
3. **hackathon 저장소**에서 자기 계정으로 로그인합니다. Cloud US를 선택합니다.

```sh
infisical login
node scripts/secrets.mjs check --env dev
```

프로젝트와 `/app` 경로는 `infisical.config.json`에 연결되어 있어 `infisical init`을 다시 할 필요가 없습니다. 점검은 이름과 `OK/MISSING/INVALID`만 출력하며 유료 API를 호출하지 않습니다.

## 앱 실행

```sh
# 탐색 화면과 API: 외부 키 없이 실행(각각 별도 터미널)
uv run python -m app.discovery_server
npm --prefix web run dev

# Google 로그인을 포함하는 탐색 API
node scripts/secrets.mjs run --env dev --services supabase -- uv run python -m app.discovery_server

# 기존 Claude·Jev 채팅 서버
node scripts/secrets.mjs run --env dev --services ash_workflow -- uv run python -m app.serve

# 특정 서비스만 확인
node scripts/secrets.mjs check --env dev --services nebius
```

`--services`를 생략하면 등록 서비스 전체를 사용합니다. 선택한 서비스의 필수 설정이 없거나 잘못됐으면 앱을 시작하지 않습니다. 설치·전체 실행은 [저장소 안내](../README.md)를 따릅니다. Windows에서 공통 시크릿 실행기로 Node 앱을 시작할 때는 `npm.cmd` 대신 `node --run dev`처럼 직접 실행할 수 있는 명령을 사용합니다.

| 서비스 | 등록 설정 |
| --- | --- |
| `claude` | `ANTHROPIC_API_KEY`, `CLAUDE_API_MODEL` |
| `supabase` | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_STORAGE_BUCKET` |
| `nebius` | `NEBIUS_API_KEY`, `NEBIUS_BASE_URL`, `NEBIUS_EMBEDDING_MODEL`, `NEBIUS_EMBEDDING_DIMENSIONS` |
| `naver` | `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`, `NAVER_API_BASE_URL` |
| `youtube` | `YOUTUBE_API_KEY` |
| `ash_workflow` | `ASH_ANTHROPIC_API_KEY`, `ASH_JEV_KEY` |

키를 수정하면 앱을 재시작합니다. 개인 키 override는 사용하지 않으며 네 명 모두 공유 값을 읽습니다. `dev`와 `prod`는 현재 같은 외부 자원·크레딧·할당량을 공유합니다.

## 서버 코드에서 읽기

```js
// 파일 위치에 맞게 상대 경로 조정. 서버 전용입니다.
import { getServiceSecrets, getSecret, getPublicConfig } from "../src/server/secrets.mjs";

const { ANTHROPIC_API_KEY, CLAUDE_API_MODEL } = getServiceSecrets("claude");
// 위 값을 Anthropic SDK의 apiKey와 요청의 model에 전달합니다.
const youtubeKey = getSecret("YOUTUBE_API_KEY");
// 키나 설정 객체를 console.log / 응답 JSON에 넣지 않습니다.
const browserConfig = getPublicConfig();
// SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY 두 항목만 반환합니다.
```

TypeScript 타입 선언도 제공합니다. 프론트엔드는 이 서버 모듈을 직접 import하지 않고 필요한 공개 설정만 서버에서 전달받습니다. 서버 키를 `NEXT_PUBLIC_`·`VITE_`로 만들지 않습니다. Supabase 공개 키 사용 시에도 테이블 접근 권한은 별도로 설정해야 합니다.

Python은 같은 실행기로 시작한 뒤 `os.environ["ANTHROPIC_API_KEY"]`처럼 읽습니다. Infisical 조회 로직을 Python 앱에 또 만들 필요는 없습니다.

## 배포·CI

Node와 Infisical CLI가 설치된 실행 환경에서 사용할 수 있습니다. 배포 플랫폼의 비밀 환경변수에 **한 방식**을 설정합니다.

| 인증 방식 | 비밀 환경변수 |
| --- | --- |
| 발급된 단기 토큰 | `INFISICAL_TOKEN` |
| Universal Auth | `INFISICAL_CLIENT_ID`와 `INFISICAL_CLIENT_SECRET` |

```sh
node scripts/secrets.mjs run --env prod --services claude,supabase -- node --run start
```

Universal Auth는 시작할 때 토큰을 받아 메모리에서 사용합니다. 인증 정보는 하위 앱에 전달하지 않습니다. 읽기 실패 시 이전 키를 재사용하지 않습니다. 로그인·네트워크·권한·만료를 확인한 뒤 다시 실행하세요. 이 변경은 배포 플랫폼 연결이나 키 유효기간 연장을 수행하지 않습니다. 서버리스 플랫폼에서 CLI를 실행할 수 없다면 그 플랫폼의 Infisical 동기화 방식으로 같은 설정 이름을 주입해야 합니다.

## 새 설정 추가·검증

1. 실제 값은 Infisical의 해당 환경 `/app`에 등록합니다.
2. `infisical.config.json`의 서비스와 타입을 갱신합니다. 키 값은 넣지 않습니다.
3. Node/TypeScript 공통 타입 `src/server/secrets.d.mts`를 맞춥니다.
4. 테스트와 해당 환경의 `check`를 실행합니다.

```sh
node --test tests/secrets/*.test.mjs
node scripts/secrets.mjs check --env dev
```

`.gitignore`는 사고 예방용이며 이미 커밋한 비밀값을 지우지 않습니다. 실제 키가 노출됐다면 해당 키를 폐기·재발급해야 합니다.

공식 참고: [CLI 문서](https://infisical.com/docs/cli/reference), [Universal Auth 로그인](https://infisical.com/docs/api-reference/endpoints/universal-auth/login). 설정 정본은 `infisical.config.json`, Claude 공통 규칙은 `../.claude/rules/secrets.md`입니다.

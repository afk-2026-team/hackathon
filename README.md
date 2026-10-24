# Jinseonmi · 진선미

방문자가 Google 로그인 또는 게스트 이용을 선택하고, 국가·언어에 맞춰 뷰티·의료 정보를 출처와 함께 살펴보며 관심 항목과 방문 일정을 저장하는 앱입니다. 제품명은 **진선미**입니다. 제품 방향은 [최종 기획안](docs/strategy/strategy_26102413_통합플랫폼_최종기획안.md)을 따릅니다.

## 로컬 실행

Python 3.12 이상, Node.js 24 이상과 uv가 필요합니다.

```sh
uv sync
npm --prefix web ci
```

터미널 두 개에서 각각 실행합니다.

```sh
# 1. 탐색·추천 API — 외부 모델 키 없이 실행
uv run python -m app.discovery_server

# 2. 화면 — /v1 요청은 위 API로 전달
npm --prefix web run dev
```

화면: http://localhost:5173 · API: http://127.0.0.1:8001

Google 로그인까지 사용할 때는 첫 번째 터미널에서 다음 명령으로 API를 실행합니다. Infisical 팀 초대 수락과 CLI 로그인이 선행되어야 합니다.

```sh
node scripts/secrets.mjs run --env dev --services supabase -- uv run python -m app.discovery_server
```

Google 로그인과 Claude 비교 요약을 함께 사용할 때는 `--services supabase,ash_workflow`로 실행합니다. 모델 키가 없거나 응답을 사용할 수 없어도 출처가 있는 비교 사실은 표시됩니다.

모든 실연동 기능(지도·블로그 후기·숏폼·비교 요약·Google 로그인)을 함께 쓰려면 다음과 같이 실행합니다.

```sh
node scripts/secrets.mjs run --env dev --services supabase,naver,naver_maps,youtube,ash_workflow -- uv run python -m app.discovery_server
```

### Home AI 조언(8001 + 8000)

Home의 "Ask about your trip / 여행에 대해 물어보세요"는 브라우저가 같은 origin의 `POST /v1/responses`를 부릅니다. 탐색 서버(8001)가 이 요청을 AI 서버(`app.serve`, 기본 `http://127.0.0.1:8000`, `JINSEONMI_AI_UPSTREAM`으로 변경 가능)로 전달합니다. 따라서 **두 서버를 모두 실행해야** AI 답변이 나옵니다. 모델 키는 8000 쪽에만 주입합니다.

```sh
# 터미널 1 — 탐색 서버(8001, Vite /v1 프록시 대상)
node scripts/secrets.mjs run --env dev --services supabase,naver,naver_maps,youtube,ash_workflow -- uv run python -m app.discovery_server
# 터미널 2 — AI 서버(8000)
node scripts/secrets.mjs run --env dev --services ash_workflow -- uv run python -m app.serve
# 터미널 3 — 화면(5173)
cd web && npm run dev
```

8000이 꺼져 있으면 Home AI 영역은 오류 문구와 "다시 시도"를 보여줍니다. 탐색·비교·저장 기능은 그대로 쓸 수 있습니다.

| 서비스 | 화면에서 쓰는 곳 | 없을 때 |
|---|---|---|
| `naver_maps` | 의료·장소 상세 지도, My Trip 지도·숙소 주소 찾기(`/v1/maps/*`) | 지도 대신 안내와 네이버·구글 지도 링크 |
| `naver` | 상세·검색의 블로그 후기(`/v1/evidence/blog`, NAVER API HUB) | 503 안내 |
| `youtube` | 제품 상세 숏폼(`/v1/evidence/videos`, 크리에이터 유료 광고 신고만 협찬 표시) | 503 안내 |
| (키 없음) | 통화 환산(`/v1/fx`, ECB 기준율) | ECB 가 주지 않는 통화는 원화만 표시 |

- 지도 JS(Dynamic Map)는 NAVER Cloud 콘솔의 Maps 앱에 **웹 서비스 URL**(예: `http://localhost:5173`)이 등록된 주소에서만 뜹니다. 미등록이면 화면에 등록 안내가 나옵니다. 현재 Maps 앱에서 Geocoding 만 활성이라 경로는 방문 순서를 잇는 직선(실제 경로 아님)과 구간별 네이버 지도 길찾기 링크로 보여 줍니다.
- 지오코딩은 한글 도로명 주소만 찾습니다. 카탈로그 장소 주소와 숙소 입력은 한글 주소를 씁니다.
- Windows 에서 실행기가 `infisical` 을 찾지 못하면 `infisical.exe` 가 있는 폴더(npm 전역 설치 시 `@infisical/cli/bin`)를 PATH 앞에 두고, Git Bash 에서는 `MSYS_NO_PATHCONV=1` 로 실행합니다.

Google 제공자가 설정되지 않았거나 인증 서버 연결에 실패해도 게스트로 시작할 수 있습니다. 설정된 브라우저 주소를 일관되게 사용합니다. `localhost`와 `127.0.0.1`은 서로 다른 저장소와 로그인 세션을 사용합니다.

## 배포 (Vercel: 프런트 + API)

- **공개 주소:** 데모 https://jinseonmi.vercel.app · API 상태 https://jinseonmi-api.vercel.app/health
- **프로젝트 2개(팀 geond):**
  - 프런트 `jinseonmi`: `web/` 디렉터리, `web/.vercel` 연결
  - API `jinseonmi-api`: 저장소 루트, 루트 `.vercel` 연결. 루트 `index.py`의 `app`이 단일 FastAPI 함수다.
- **API 구성(`deploy/vercel_app.py`):** 공개 라우트는 discovery 앱 그대로다(catalog·recommendations·compare·explain·auth·maps·evidence·fx·`/health`).
  - `/v1/responses`는 기존 프록시 규칙(기본 `kbeauty-sonnet`, 입력 검증, 60초, 503/504/502)을 같은 프로세스의 AI 앱으로 연결한다.
  - AI 레지스트리는 첫 AI 요청에서 1회 만든다. AI 키가 없으면 AI만 503이고 나머지는 동작한다.
- **업로드 범위·감지:** 루트 `vercel.json`의 `"framework": "fastapi"`로 FastAPI 함수를 빌드한다. CLI로 만든 프로젝트는 기본이 Other라 이 설정이 없으면 함수가 만들어지지 않는다. 루트 `.vercelignore`는 제외 목록이다. 남는 것은 `index.py`, `deploy/vercel_app.py`, `app/`, `Crawling_DB/`, `envs/agent_config.yaml`·`envs/models/`, `pyproject.toml`, `uv.lock`, `vercel.json`이다. 허용 목록식(`/*` + `!dir/`)은 Vercel에서 디렉터리를 다시 넣지 못해 쓰지 않는다. 문서·web·tests·`.env.local`은 올리지 않는다.
- **순서:**
  1. 서버 환경값: Infisical **prod** `/app`의 runtime 키 10개를 Vercel `jinseonmi-api` production에 sensitive로 넣는다. 값을 출력하거나 파일로 남기지 않는다.
     - `ASH_ANTHROPIC_API_KEY`, `ASH_JEV_KEY`
     - `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`
     - `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`, `NAVER_API_BASE_URL`
     - `NAVER_MAPS_CLIENT_ID`, `NAVER_MAPS_CLIENT_SECRET`
     - `YOUTUBE_API_KEY`
  2. API 배포: 저장소 루트에서 `vercel deploy --prod --yes`
  3. 프런트 배포: `web/`에서 배포한다. `/v1/*`는 API 배포 URL로 rewrite한다(백엔드에 CORS 미들웨어가 없으므로 같은 origin 유지).
  4. 키를 바꾸면 Infisical prod를 먼저 고친 뒤 Vercel 환경값을 다시 동기화하고 API를 재배포한다(실행 시 한 번 읽는다).
- **함께 맞출 것:**
  - Supabase Redirect URLs에 `<프런트 URL>/auth/callback`을 추가한다.
  - NAVER Maps 웹서비스 URL에 프런트 도메인을 등록한다.

## 구성과 작업 경계

| 경로 | 담당 |
|---|---|
| `web/` | 온보딩, 프로필, Home·Explore·My Trip, 담기·일정, 튜토리얼 |
| `web/src/screens/contracts.ts`, `web/src/Workspace.tsx` | 화면 props 계약과 탭·상세 라우팅(`#home`·`#explore/<id>`·`#trip`) |
| `web/src/styles.css`, `web/src/styles/*.css` | 디자인 토큰(뷰티 민트·의료 코랄)과 화면별 스타일 |
| `web/src/strings/*.ts` | 화면 영역별 영어·한국어 문구 |
| `web/src/auth/` | 화면에서 분리한 Google 로그인·콜백·세션 관리 |
| `app/api/v1/discovery.py`, `app/services/discovery.py` | 국가·개인 조건을 받는 탐색 API |
| `app/services/discovery_compare.py`, `app/services/discovery_explain.py` | 현재 제품 비교와 확인된 사실을 이용한 짧은 요약 |
| `app/api/v1/auth.py`, `app/services/auth.py` | 공개 인증 설정과 서버 측 사용자 확인 |
| `app/schemas/discovery.py` | 프론트·백엔드 공통 데이터 계약 |
| `app/data/` | 출처가 있는 후보와 확인 시점 |
| `app/api/v1/{maps,evidence,fx}.py`, `app/services/{maps,evidence,fx}.py` | 지도 공개 설정·지오코딩, 블로그·숏폼 근거, 환율 프록시(키는 서버에만) |
| `app/discovery_server.py` | 모델 키 없이 실행하는 탐색 서버(키를 주입하면 실연동 엔드포인트가 켜짐) |
| `app/serve.py`, `app/graph/` | 기존 Claude·Jev 채팅 서버 |
| `scripts/secrets.mjs`, `src/server/secrets.mjs` | 팀 공통 Infisical 접근 |

첫 구현은 브라우저에 프로필·담은 항목·일정을 저장합니다. 게스트와 Google 계정별 저장 공간을 구분하며, 다른 기기 간 동기화는 별도 작업입니다. 국가별 근거가 부족하면 공통 후보와 부족 상태를 반환하며, 국적·성별·연령으로 피부나 의료 적합성을 추정하지 않습니다.

## 현재 제품 비교

Explore의 제품 상세에서 현재 쓰는 제품을 선택하거나 이름을 입력합니다. 등록된 제품과 일치하면 표시 성분·제형·용량·가격을 출처와 함께 비교하며, 확인되지 않은 정보는 비워 둡니다. 일부 성분 목록에 없는 성분을 제품에 없다고 판정하지 않고, 통화 또는 용량이 다르거나 용량이 없으면 가격 우열을 계산하지 않습니다.

현재 확인된 비교 데이터는 CeraVe Moisturizing Cream과 ILLIYOON 75ml에 한정됩니다. 모델은 서버가 준비한 사실을 선택해 요약하며 제품의 효능이나 의료 적합성을 판정하지 않습니다. API 계약과 응답 형식은 [비교 API 안내](app/data/discovery_api_contract.md)를 참고합니다.

## Google 로그인 연결

- 프론트는 `/v1/auth/config`에서 Supabase URL·공개 키·Google 제공자 상태만 받습니다. Google 클라이언트 비밀값과 Supabase 비밀 키는 프론트에 넣지 않습니다.
- 웹앱 복귀 주소는 현재 origin의 `/auth/callback`으로 고정합니다. Supabase URL 설정에는 사용할 앱 주소별 콜백을 등록합니다.
- Google OAuth 클라이언트의 리디렉션 주소는 앱 주소가 아니라 Supabase의 `https://<project-ref>.supabase.co/auth/v1/callback`입니다.
- `/v1/auth/me`는 Supabase에 토큰을 검증받아 사용자를 확인합니다. 브라우저에 보관된 세션 정보만으로 서버 권한을 부여하지 않습니다.
- 요청 범위는 이메일·기본 프로필입니다. 테스트 모드의 Google 앱은 등록된 테스트 계정만 사용할 수 있습니다.

새 화면을 합칠 때 `web/src/auth/`의 인증 인터페이스를 재사용하고 게스트 경로를 유지합니다. 영어 화면·Google 로그인 앱은 **Jinseonmi**, 한국어 화면은 **진선미**로 표시합니다. 브라우저 제목도 현재 화면 언어를 따릅니다.

## 기존 AI 채팅 실행

```sh
node scripts/secrets.mjs check --env dev --services ash_workflow
node scripts/secrets.mjs run --env dev --services ash_workflow -- uv run python -m app.serve
```

이 채팅 서버는 기존 모델 설정을 사용합니다. 탐색·비교 사실 조회는 Claude 키 없이도 실행되며, 모델을 사용하는 비교 요약에만 `ash_workflow`가 필요합니다. 키를 프론트에 넣거나 `.env`로 복사하지 않습니다. [팀 시크릿 사용법](envs/README.md)을 참고합니다.

## 확인 명령

```sh
npm --prefix web test
npm --prefix web run build
uv run pytest tests/discovery tests/auth tests/live -q
node --test tests/secrets/*.test.mjs
```

## 다음 구현 순서

1. 국가별 제품 맥락·현재 사용 제품의 비교 근거를 확보하고 추천 품질을 높입니다.
2. 의료기관·장소 데이터를 확보하고, Maps 앱에 Directions 를 활성화하면 직선 연결을 실제 경로로 바꿉니다.
3. 숏폼·블로그 근거의 협찬 판별 범위를 넓히고(현재는 크리에이터 신고만), 원화 가격 근거를 늘립니다.
4. 계정별 서버 저장·다른 기기 간 동기화, 공유 링크와 공개 데모 배포를 붙입니다.

실제 예약·결제·의료 판단은 현재 구현 범위에 포함하지 않습니다. 현재 후보의 범위와 출처는 [데이터 안내](app/data/README.md)에 기록합니다.

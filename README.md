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

Google 제공자가 설정되지 않았거나 인증 서버 연결에 실패해도 게스트로 시작할 수 있습니다. 설정된 브라우저 주소를 일관되게 사용합니다. `localhost`와 `127.0.0.1`은 서로 다른 저장소와 로그인 세션을 사용합니다.

## 구성과 작업 경계

| 경로 | 담당 |
|---|---|
| `web/` | 온보딩, 프로필, Home·Explore·My Trip, 담기·일정, 튜토리얼 |
| `web/src/auth/` | 화면에서 분리한 Google 로그인·콜백·세션 관리 |
| `app/api/v1/discovery.py`, `app/services/discovery.py` | 국가·개인 조건을 받는 탐색 API |
| `app/api/v1/auth.py`, `app/services/auth.py` | 공개 인증 설정과 서버 측 사용자 확인 |
| `app/schemas/discovery.py` | 프론트·백엔드 공통 데이터 계약 |
| `app/data/` | 출처가 있는 후보와 확인 시점 |
| `app/discovery_server.py` | 모델 키 없이 실행하는 탐색 서버 |
| `app/serve.py`, `app/graph/` | 기존 Claude·Jev 채팅 서버 |
| `scripts/secrets.mjs`, `src/server/secrets.mjs` | 팀 공통 Infisical 접근 |

첫 구현은 브라우저에 프로필·담은 항목·일정을 저장합니다. 게스트와 Google 계정별 저장 공간을 구분하며, 다른 기기 간 동기화는 별도 작업입니다. 국가별 근거가 부족하면 공통 후보와 부족 상태를 반환하며, 국적·성별·연령으로 피부나 의료 적합성을 추정하지 않습니다.

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

이 채팅 서버는 기존 모델 설정을 사용합니다. 탐색 서버 실행에 Claude 키를 넣을 필요는 없습니다. 키를 프론트에 넣거나 `.env`로 복사하지 않습니다. [팀 시크릿 사용법](envs/README.md)을 참고합니다.

## 확인 명령

```sh
npm --prefix web test
npm --prefix web run build
uv run pytest tests/discovery tests/auth -q
node --test tests/secrets/*.test.mjs
```

## 다음 구현 순서

1. 국가별 제품 맥락·현재 사용 제품의 비교 근거를 확보하고 추천 품질을 높입니다.
2. 의료기관·장소 데이터를 확보하고 지도 경로와 일정 제안을 연결합니다.
3. 확인된 숏폼 콘텐츠, 협찬 정보와 환율을 연결합니다.
4. 계정별 서버 저장·다른 기기 간 동기화, 공유 링크와 공개 데모 배포를 붙입니다.

실제 예약·결제·의료 판단은 현재 구현 범위에 포함하지 않습니다. 현재 후보의 범위와 출처는 [데이터 안내](app/data/README.md)에 기록합니다.

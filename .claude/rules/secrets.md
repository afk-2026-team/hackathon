# 팀 공통 시크릿 사용 규칙

네 명 모두 같은 Infisical 프로젝트의 공유 키를 사용한다. 프로젝트·경로·환경·키 이름의 정본은 `envs/infisical.config.json`이다.

1. 외부 키가 필요한 앱 실행은 `node scripts/secrets.mjs run --env dev --services <사용할 서비스> -- <앱 명령>`으로 한다. `claude`, `supabase`, `nebius`, `naver`, `youtube`, `ash_workflow` 중 필요한 것만 선택한다. 서비스 옵션을 생략하면 모두 선택된다. 공개 카탈로그만 쓸 때 `app.discovery_server`는 키 없이 실행하며, Google 로그인까지 사용할 때는 `--services supabase`로 실행한다. 프론트에 비밀값을 주입하지 않는다.
2. Node/TypeScript 서버 코드에서는 `src/server/secrets.mjs`의 `getSecret`, `getServiceSecrets`를 사용한다. 요청마다 Infisical을 호출하거나 서비스별로 조회·캐시 코드를 새로 만들지 않는다. Python 등은 같은 실행기로 주입받은 환경변수를 사용한다.
3. 연결 점검은 `node scripts/secrets.mjs check --env dev`로 한다. 키 값 대신 `OK/MISSING/INVALID`만 보고한다. 인증 실패나 누락이면 멈추며 로컬 `.env`·기존 프로세스 값·샘플 키로 몰래 대체하지 않는다.
4. 비밀값은 코드·대화·노션·오류·스크린샷·Git에 넣지 않는다. `env`, `printenv`, `console.log(process.env)`, raw `infisical export` 출력, 값을 담은 셸 인자도 사용하지 않는다. 공통 실행기는 export 출력을 메모리에서만 처리한다.
5. 이 모듈은 서버 전용이다. Client Component·브라우저 번들에서 import하지 않는다. 클라이언트에 필요한 설정은 서버의 `getPublicConfig()` 결과만 전달한다. `NEXT_PUBLIC_`·`VITE_`에 서버 키를 연결하지 않는다.
6. 키 추가 시 `envs/infisical.config.json`의 서비스와 타입, `src/server/secrets.d.mts`를 함께 갱신하고 테스트한다. 실제 값은 권한 있는 담당자가 Infisical에 등록한다. 누락을 이유로 새 키를 임의 발급하거나 권한을 넓히지 않는다.
7. 개발자는 자기 계정으로 `infisical login`한다. 배포·CI는 비밀 환경변수 `INFISICAL_TOKEN` 또는 `INFISICAL_CLIENT_ID`·`INFISICAL_CLIENT_SECRET`을 사용한다. 자격증명은 앱 프로세스에 넘기지 않는다.
8. 실행 시 한 번 읽으며 키를 바꾸면 앱을 재시작한다. `dev`·`prod`는 현재 같은 외부 자원과 사용량을 공유한다. 환경 이름만으로 데이터·비용이 격리됐다고 설명하지 않는다.

이 실행기는 **앱 API용**이다. Claude Code 자체는 각자 기존 로그인으로 실행하며 `secrets.mjs run -- claude`처럼 앱 키 전체를 Claude 세션에 주입하지 않는다.

자세한 사용법과 설치·배포 조건은 `envs/README.md`를 따른다.

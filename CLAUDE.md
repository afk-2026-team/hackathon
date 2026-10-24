# CLAUDE.md

> 세션마다 로드되는 목표·불변식·경계·참조만 둔다. 절차 정본은 `.claude/rules/workflow.md`,
> 문서 규약은 `.claude/rules/docs.md`, 지식 조회는 스킬 `wiki-desk` 다.

## 목표

- 주제: K-뷰티·K-의료를 찾는 전 세계 소비자를 위한 서비스.
- 해결방법론: 한국을 찾는 외국인이 K-뷰티와 K-의료를 한곳에서 탐색하고, 근거를 보며 고른 뒤, 방문 경로·일정까지 잇는 통합 플랫폼.
- 타깃: 한국을 방문해 뷰티 쇼핑과 의료 방문을 함께 고려하는 외국인(의료 세부 범위는 미정).
- 범위: 뷰티와 의료를 수평 확장한다(12:51~13:07 팀 합의). 화면은 Discover(탐색)와 My Trip(추천 장소·경로·일정)이다.
- 국가별 추천(사용자 추가 확정 요구): 선택한 국가·언어·통화와 개인 조건에 따라 후보와 추천 이유를 조정한다. 국가만으로 피부·취향을 단정하지 않는다. 대상국은 미정이다.
- 제품 방향 정본: `docs/strategy/strategy_26102413_통합플랫폼_최종기획안.md` — 합의·제안·미정을 구분해 두었으니 미정 항목은 임의로 확정하지 않는다.
- 팀 저장소: https://github.com/afk-2026-team/hackathon (참조)
- 모든 과업은 interview → plan → devlog → checklist 순서의 아티팩트 체인으로 수행한다.

## 불변식

- **의도 우선**: 사람의 의도는 `docs/interview/` 에 승인 표식(`status: approved` + `approved_quote`)으로 고정된다.
  승인된 interview 없이 plan 을 쓰지 않는다. 승인 이후의 plan·devlog·checklist 발행과 작업 수행은 사람 게이트 없이 진행한다.
- **정보는 아티팩트가 나른다**: 단계 사이 정보는 대화 기억이 아니라 문서와 frontmatter `upstream` 사슬이 나른다.
- **완료 = 검증**: checklist 의 인수기준이 전부 PASS 하기 전에는 완료를 선언하지 않는다.
- **결정론 출처 표시**: 측정·모의·추정 값은 데이터에서 구분한다(`provenance`·`*_source`). 실측인 척하는 것이 금지다.
- **원문 불변 서고**: `__llm-wiki/` 는 원문을 복사·요약하지 않는 포인터 카드다. 답의 근거는 `path:시작-끝` 원문 구간이다.

## 안전 경계

- 승인된 interview 범위 밖의 비가역·외부 행동(배포·대량 삭제·원격 push·외부 발행)은 하지 않는다 — 필요하면 interview 를 재개한다.
- 외부 스킬·플러그인·MCP 는 사용자 검수 없이 설치하지 않는다.
- 비밀값·개인 경로·사설 주소를 추적 파일에 적지 않는다.
- 시크릿 정본은 팀 Infisical이다. 네 명 모두 `scripts/secrets.mjs` 실행기와 `src/server/secrets.mjs` 접근 모듈을 사용한다. 개별 `.env` 복사·별도 조회 코드·키 출력은 만들지 않는다. 상세 규칙은 `.claude/rules/secrets.md`를 따른다.

## 명령

- 시크릿 점검(값 미출력): `node scripts/secrets.mjs check --env dev`
- 앱 실행: `node scripts/secrets.mjs run --env dev --services claude,supabase -- node --run dev` (실제 앱 명령에 맞게 변경)
- 시크릿 테스트: `node --test tests/secrets/*.test.mjs`
- 지식 조회: `node .claude/skills/wiki-desk/src/cli.ts query --terms "<핵심어>" --terms "<동의어>"`
- 문서 이름: `node .claude/skills/wiki-desk/src/cli.ts name --type <interview|plan|devlog|checklist> --topic <주제>`
- 서고 입고: `node .claude/skills/wiki-desk/src/cli.ts sync --apply` → `… check`
- 스킬 테스트: `node --test .claude/skills/wiki-desk/tests/`

## 자주 틀리는 것

- (아직 없음 — 같은 실수가 두 번 나오면 한 줄씩 추가한다)

## 참조

- 작업수행규칙: `.claude/rules/workflow.md` · 문서발행규칙: `.claude/rules/docs.md`
- 제품 기획 정본: `docs/strategy/strategy_26102413_통합플랫폼_최종기획안.md` (이전 이력: `docs/strategy/strategy_26102411_K뷰티_제품_구체화.md`)
- 사서: `.claude/skills/wiki-desk/SKILL.md` · 환경 명세: `seed/spec.md`(비추적 로컬 사본)
- 시크릿 사용법: `envs/README.md` · 설정 계약: `envs/infisical.config.json`

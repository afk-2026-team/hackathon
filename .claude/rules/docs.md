# docs.md — 문서발행규칙

> 목표: 의도·계획·실행·검증을 역할별 문서로 분리하고, 재현 가능한 이름과 `upstream` 증거사슬로 잇는다.
> 이름 생성은 `wiki-desk name`(구현 `.claude/skills/wiki-desk/src/doc_naming.ts`)이 소유한다.

## 1. 명명 SSOT

- 형식: `docs/<type>/<type>_<YYMMDDHH>[_<MM>_<SS>]_<주제>.md`
  - `type` ∈ 계약 `naming.doc_types`(기본 `interview|plan|devlog|checklist`).
  - `YYMMDDHH` = 계약 `naming.utc_offset` 기준 현지시 2자리 연도 절대시각. 상대날짜·`_seq_` 금지.
  - `_MM_SS` 는 **같은 type·같은 시(hour)** 에 이미 문서가 있을 때만 붙인다. 두 형태가 모두 점유되면 이름 생성이 실패한다(세 번째 형식을 만들지 않는다).
  - `주제` = `[A-Za-z0-9_.가-힣]+` (공백·경로구분자 금지, 단어 사이 `_`).
- 이름은 손으로 짓지 않는다: `node .claude/skills/wiki-desk/src/cli.ts name --type plan --topic 주제`.

## 2. 4단 문서 matrix

| 폴더 | 역할 | 쓰는 시점 | frontmatter 필수 키 | `upstream` |
|---|---|---|---|---|
| `interview/` | 의도 싱크(intent) — 인터뷰 도구의 최종 seed/결정 원장을 md 로 | 작업 착수 전 | `title`·`status`(`draft`/`approved`)·`approved_quote`·`approved_at`·`tool` | 없음 |
| `plan/` | Planner — 목표·범위·단계·리스크·AC | interview 승인 직후 | `title`·`upstream` | interview 문서 |
| `devlog/` | Builder — 실행 서사·결정·재현 명령·최종 상태 | 작업 중·후 | `title`·`upstream` | plan 문서 |
| `checklist/` | Validator — AC 별 판정·증거·실패 라우팅 | 실행 후 | `title`·`upstream`·`verdict`(`PASS`/`FAIL`/`PARKED`) | devlog 문서 |

- `upstream` 값은 **프로젝트 루트 상대 경로 문자열 하나**다(예 `docs/plan/plan_26102411_검색_기능.md`).
- 서고 입고 때 `upstream` 이 없거나 가리키는 파일이 없으면 카드에 `needs_review` 와 사유(`upstream.missing`·`upstream.not_found`)가 붙는다. 입고는 멈추지 않는다.
- 인터뷰 도구는 중립이다. 우로보로스(`ooo interview` → seed) 같은 도구를 쓰면 그 최종 결과를 이 폴더에 md 로 저장한다. 도구가 없으면 에이전트가 직접 소크라테스식 문답을 하고 결정 원장을 적는다.

## 3. 공통 작성 규칙

- 폴더마다 `example.md` 가 양식이다. 새 문서를 쓰기 전에 그 폴더의 `example.md` 를 읽는다.
- 판정에는 유효 맥락(대상·환경·일자)을 붙인다. 후속은 `- [ ] 후속:` 으로 열고, 해소 문서 경로를 적어 `- [x]` 로 닫는다. 미결은 `- PARKED: <사유>`.
- 뒤 문서가 앞 문서의 판정을 뒤집을 때만 앞 문서 헤더에 `> ⛔ SUPERSEDED by <경로>` 를 단다. 단순 보완은 인용만 한다.
- 가변 파일의 줄 번호를 인용할 때는 그 줄의 리터럴을 함께 적는다.
- 원문 문서는 발행 후 고치지 않는 것이 기본이다(정정은 새 문서). 오탈자 수준만 예외.

## 4. 추적·보관

| 경로 | git | 비고 |
|---|---|---|
| `docs/*/example.md` | 추적 | 양식 배포용 |
| `docs/*/*` (그 밖) | 비추적 | `.gitignore` 의 `docs/*/*` + `!docs/*/example.md` |
| `__llm-wiki/contract.json`·`receipt.json` | 추적 | 서고 계약·소유 기록 |
| `__llm-wiki/` 그 밖(카드·index·log·캐시) | 비추적 | 원문에서 재생성 가능 |

## 5. 폴더 확장 규약

4개는 최소 조건이다. 폴더를 더할 때는 아래를 **함께** 바꾼다(하나라도 빠지면 침묵 누락이 된다).

1. `docs/<새폴더>/example.md` 작성(역할·파일명 규칙·frontmatter·양식).
2. 서고 계약 `naming.doc_types` 에 type 추가, `source_roots` 에 폴더 추가, `excluded_roots` 에 그 `example.md` 추가,
   `authority_rules` 에 규칙 추가(필요하면 `upstream_rules` 도).
3. 이 문서 §2 matrix 에 행 추가.
4. `sync --apply` → `check` 로 확인.

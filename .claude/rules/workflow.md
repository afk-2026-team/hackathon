# workflow.md — 작업수행규칙

> 목표: 사람의 의도를 검증 가능한 상태 전이로 바꾸고, 실패를 원인에 맞는 단계로 되돌린다.
> 항상 참인 경계는 `CLAUDE.md`, 문서 형식은 `.claude/rules/docs.md` 가 소유한다.

## 1. 상태·owner 계약

| 상태 | 역할(owner) | 입력 | 출력 | 통과 게이트 | 실패 라우팅 |
|---|---|---|---|---|---|
| S0 interview | 의도 싱크(에이전트 질문 + 사람 답) | 사람의 요청 | `docs/interview/interview_*.md` (`status: approved`) | **HITL ① — 유일한 사람 게이트** | 모호하면 질문을 계속한다 |
| S1 plan | **Planner** | 승인된 interview | `docs/plan/plan_*.md` (`upstream` = interview) | 인수기준(AC)이 기계 판정 가능 | 의도 공백 → S0 재개 |
| S2 build | **Builder** | plan | 코드·설정 변경 + `docs/devlog/devlog_*.md` (`upstream` = plan) | plan 의 단계를 모두 수행 또는 PARKED 사유 기재 | 계획 결함 → S1 |
| S3 validate | **Validator** | devlog + plan 의 AC | `docs/checklist/checklist_*.md` (`upstream` = devlog) | AC 전부 PASS | §4 실패 라우팅 |
| S4 ingest | 사서(`wiki-desk`) | 이번 작업 단위의 문서 전부 | 서고 카드 | `check` 의 `ok: true` | `needs_review` 사유를 고친 뒤 재입고 |

- **HITL 은 S0 끝 한 곳뿐이다.** interview 문서가 `status: approved` 가 된 뒤의 plan·devlog·checklist 발행과
  작업 수행은 사람 승인 없이 진행한다. 사람에게 다시 묻는 경우는 §4 의 *의도 충돌* 과 *연속 FAIL 상한* 두 가지뿐이다.
- 승인된 interview 의 범위 밖 행동(비가역·외부 발행 포함)은 자율 진행 대상이 아니다 — S0 를 재개한다.

## 2. 진입 규칙

- **plan 진입**: 대상 interview 의 frontmatter 가 `status: approved` 이고 `approved_quote` 가 사람 발화의 전사일 때만
  plan 을 쓴다. 에이전트가 자기 문장으로 `approved_quote` 를 채우는 것은 위조다.
- **근거 조회(권장)**: 새 interview·plan 을 쓰기 전에 `wiki-desk query` 로 선행 결정·실패를 찾아 본문에 `path:시작-끝` 으로 인용한다.
  못 찾은 것은 "선행 근거 없음"이라고 적고 진행한다.
- **이름**: 문서 이름은 손으로 짓지 않고 `wiki-desk name` 으로 받는다(docs.md §1).

## 3. 단계별 의무

- **Planner(S1)**: 목표·범위·단계·리스크·**인수기준(AC-n)** 을 쓴다. 각 AC 는 `CHECK`(실행할 것) + `EXPECT`(기대 관측)를 가진다.
  코드는 바꾸지 않는다(읽기만).
- **Builder(S2)**: plan 의 단계를 수행하고 devlog 에 결정·시도/폐기·재현 명령(verbatim)·최종 상태를 남긴다.
  plan 과 다르게 해야 하면 devlog 에 이탈과 이유를 적는다. 이탈이 AC 를 바꾸면 plan 결함(§4)이다.
- **Validator(S3)**: 새 눈으로 AC 를 하나씩 실행해 `EVIDENCE`(실제 출력·경로)와 판정을 적는다. 고치지 않고 판정만 한다.
  판정 근거가 없는 PASS 는 FAIL 이다.

## 4. 실패 라우팅

| FAIL 원인 | 되돌아갈 곳 | 처리 |
|---|---|---|
| 구현 결함(plan 은 옳고 실행이 틀림) | S2 | 새 devlog 를 발행(`upstream` = 같은 plan)하고 다시 S3 |
| 계획 결함(AC·단계 자체가 틀림) | S1 | 새 plan 을 발행하고 옛 plan 헤더에 `> ⛔ SUPERSEDED by <새 plan 경로>` |
| 의도 충돌·의도 모호 | S0 | interview 재개(사람에게 질문) — 새 interview 문서 또는 기존 문서 갱신 후 재승인 |

- **연속 FAIL 상한 = 3** (같은 AC 가 연속 3회 FAIL — 이 파일에서만 쓰는 국소 상수). 도달하면 자율 루프를 멈추고
  checklist 에 `PARKED:` 와 함께 사람에게 에스컬레이션한다.
- 원인을 판정할 수 없으면 *의도 모호* 로 취급한다(추측으로 S2 를 반복하지 않는다).

## 5. 서고 입고 시점

- checklist 로 작업 단위가 끝나면(전부 PASS 또는 PARKED) 그 단위의 interview→plan→devlog→checklist 를 **한 번에** 입고한다:
  `node .claude/skills/wiki-desk/src/cli.ts sync` (계획 확인) → `… sync --apply` → `… check`.
- 계획에 예상 밖 변경(원문 아닌 파일의 갱신·고아 카드)이 보이면 적용하지 않고 원인을 확인한다.
- `needs_review` 가 이번 문서에서 나오면(이름 규칙 위반·`upstream` 누락/미실재 등) 문서를 고치고 다시 입고한다.

## 6. 결정론 규율 — 출처 표시와 4종 안티패턴

결정론으로 계산한 값과 그렇지 않은 값은 **데이터에서 구분되어야 한다.** 구분이 없으면 하류 판정이 무엇을 근거로 삼았는지
알 수 없다. 산출물은 값 옆에 출처 필드(`provenance: measured|mock|dry-run|estimate`, `<값>_source`)를 둔다.
처방은 **금지가 아니라 표시**다 — 모의(mock)는 배선 점검에 필요하다. 문제는 그것이 *실측인 척하는 것*이다.

4종 안티패턴의 양태는 `금지`가 아니라 `자제`다. 패턴 이름만으로 기각하지 않고, 기각하려면 **결함 칸의 조건**을 지목한다.
정당 칸에 해당하면 그대로 쓰되 출처를 표시한다.

| 패턴 | **정당** | **결함** |
|---|---|---|
| 모킹 | 테스트 평면의 격리(외부 의존 차단) | **프로덕션 산출물과 같은 모양으로 나오는 것** |
| 폴백 | fail-loud 폴백(대체 후 로그·예외), 순수 파서의 `None`/`null`(호출부가 fail-closed 처리) | **결정·게이트·안전 경로에서 원인을 삼키는 침묵 폴백** |
| 하드코딩 | tripwire(변경 시 리뷰를 강제하는 닫힌 목록) | **파생 가능한데 손으로 적은 것** |
| 매직넘버 | 그 파일에서만 쓰는 국소 상수 | **같은 개념이 두 곳 이상에 손으로 적힌 값** |

- 단일 소유가 불가능하면(정적 파일끼리 서로를 생성할 수 없을 때) **교차검증**이 차선이다.
- 개념 중복은 값 스캔으로 찾지 못한다(같은 값이 여러 곳에 있어도 대개 무관하다). 계기는 술어·검증 실패이며, 신호가 온 것만 단일 소유로 올린다.

## 7. 완료 판정

작업 단위는 checklist 의 AC 가 전부 PASS 하고 §5 입고 뒤 `check` 가 `ok: true` 일 때 완료다.

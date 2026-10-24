# checklist/ — 검증 판정 (Validator · 실행 후)

> 추적되는 양식. 실제 checklist 는 비추적. 규칙 정본: `.claude/rules/docs.md` · `.claude/rules/workflow.md` §3·§4.

## 역할
- plan 의 AC 를 **새 눈으로** 하나씩 실행해 증거와 판정을 남긴다. 고치지 않고 판정만 한다.
- 이 문서가 작업 단위의 끝이다. 종료 후 서고 일괄 입고(workflow.md §5).

## 파일명 규칙
```
docs/checklist/checklist_<YYMMDDHH>[_<MM>_<SS>]_<주제>.md
```

## frontmatter (필수)
```yaml
---
title: <한 줄 제목>
upstream: docs/devlog/devlog_<...>.md   # 검증한 devlog 경로(루트 상대)
verdict: PASS        # PASS | FAIL | PARKED
---
```

## 본문 양식
```markdown
# <제목>

## 1. 판정 표
| AC | CHECK | EXPECT | EVIDENCE(실제 관측·경로) | 판정 | 연속 FAIL |
|---|---|---|---|---|---|
| AC-1 | | | | - [x] PASS | 0 |

## 2. 실패 라우팅 (FAIL 이 있을 때)
| AC | 원인 분류(구현/계획/의도) | 되돌아갈 곳 | 다음 문서 |
|---|---|---|---|
- 연속 FAIL 3회 도달 시: `- PARKED: <AC> — 사람 에스컬레이션`

## 3. 종합
- verdict: PASS | FAIL | PARKED
- 서고 입고: `sync --apply` 후 `check` 결과는 사용자 보고에 적는다(이 문서를 다시 고치지 않는다).
```

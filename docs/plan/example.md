# plan/ — 계획서 (Planner · interview 승인 직후)

> 추적되는 양식. 실제 plan 은 비추적. 규칙 정본: `.claude/rules/docs.md` · `.claude/rules/workflow.md` §3.

## 역할
- 승인된 interview 를 실행 가능한 단계와 **기계 판정 가능한 인수기준(AC)** 으로 바꾼다.
- 코드를 바꾸지 않고 읽기만 하며 쓴다. 폐기·대체되면 헤더에 `> ⛔ SUPERSEDED by <후속 plan 경로>`.

## 파일명 규칙
```
docs/plan/plan_<YYMMDDHH>[_<MM>_<SS>]_<주제>.md
```

## frontmatter (필수)
```yaml
---
title: <한 줄 제목>
upstream: docs/interview/interview_<...>.md   # 승인된 interview 경로(루트 상대)
---
```

## 본문 양식
```markdown
# <제목>

## 1. 목표·범위
## 2. 비범위
## 3. 단계
1. <단계> — 바꿀 파일: `<경로>`
## 4. 리스크
## 5. 인수기준
| AC | 대응 SC | CHECK(실행할 것) | EXPECT(기대 관측) |
|---|---|---|---|
| AC-1 | SC-1 | `<명령 또는 확인 절차>` | `<exit 0 · 출력에 X 포함 등>` |
## 6. 선행 근거
```

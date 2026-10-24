# devlog/ — 작업 로그 (Builder · 작업 중·후)

> 추적되는 양식. 실제 devlog 는 비추적. 규칙 정본: `.claude/rules/docs.md` · `.claude/rules/workflow.md` §3.

## 역할
- plan 을 수행한 **서사**: 무엇을 했고, 무엇을 시도했다 버렸고(음성 결과 포함), 무엇이 남았나.
- 다음 세션이 이 문서만으로 이어서 일할 수 있어야 한다.

## 파일명 규칙
```
docs/devlog/devlog_<YYMMDDHH>[_<MM>_<SS>]_<주제>.md
```

## frontmatter (필수)
```yaml
---
title: <한 줄 제목>
upstream: docs/plan/plan_<...>.md   # 수행한 plan 경로(루트 상대)
---
```

## 본문 양식
```markdown
# <제목>

## 1. 수행 내역 (plan 단계 대응)
| 단계 | 결과 | 비고 |
|---|---|---|
## 2. 결정과 근거
## 3. 시도-폐기 경로 (음성 결과 포함)
## 4. 재현 명령 (verbatim)
    <명령을 요약하지 말고 그대로>
## 5. plan 이탈
- 없음 / <이탈 내용과 이유 — AC 에 영향이 있으면 plan 결함>
## 6. 최종 상태
- 변경 파일:
- 미커밋:
- [ ] 후속:
- PARKED:
```

# research/ — 외부 조사 (웹·문헌 리서치 결과)

> 이 `example.md` 는 양식이다. research 실물도 **git 추적** 대상이다(팀 공유).
> 규칙 정본: `.claude/rules/docs.md` §2·§4 · 출처 표시 규율 `.claude/rules/workflow.md` §6.

## 역할
- strategy(또는 plan)가 던진 질문을 외부 자료로 조사한 결과다. 결정 문서가 아니라 **근거 자료**다.
- 모든 사실 주장에 출처 URL 을 단다. 출처 등급을 구분한다:
  `확인`(1차 출처 원문 확인) · `2차`(기사·블로그 등 2차 출처) · `미확인`(찾지 못함 — 지어내지 않는다).
- 조사 시점(`researched_at`)을 적는다. 약관·API 한도·통계는 시간에 따라 바뀐다.

## 파일명 규칙
```
docs/research/research_<YYMMDDHH>[_<MM>_<SS>]_<주제>.md
```
- 이름은 `node .claude/skills/wiki-desk/src/cli.ts name --type research --topic <주제>` 로 받는다.

## frontmatter (필수)
```yaml
---
title: <한 줄 제목>
upstream: docs/strategy/strategy_<...>.md   # 조사를 촉발한 문서(루트 상대)
researched_at: <ISO 8601, 오프셋 포함>
method: <예: web-search 서브에이전트 4축 병렬 + 병합>
---
```

## 본문 양식
```markdown
# <제목>

## 0. 요약 (한 화면)
## 1. <조사 축 1>
## 2. <조사 축 …>
## N. 권고 (다음 결정에 넘길 것)
## 출처
```

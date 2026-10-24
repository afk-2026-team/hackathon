# strategy/ — 팀 전략 기록 (팀 논의 결과 · 사람이 작성)

> 이 `example.md` 는 양식이다. strategy 실물도 **git 추적** 대상이다(팀 공유).
> 규칙 정본: `.claude/rules/docs.md` §2·§4.

## 역할
- 팀 논의에서 확정한 방향·제품 구상·남은 쟁점·확인할 과제를 남긴다. 사람(팀)이 쓰는 원문이다.
- 에이전트는 내용을 고치지 않는다(이름 정정·frontmatter 보강만). 전략이 바뀌면 새 문서를 쓴다.
- research 문서의 `upstream` 이 된다.

## 파일명 규칙
```
docs/strategy/strategy_<YYMMDDHH>[_<MM>_<SS>]_<주제>.md
```
- 이름은 `node .claude/skills/wiki-desk/src/cli.ts name --type strategy --topic <주제>` 로 받는다(공백 금지, 단어 사이 `_`).

## frontmatter (필수)
```yaml
---
title: <한 줄 제목>
---
```

## 본문 양식 (권장)
```markdown
## <회차·주제> (<시각>)

**확정한 방향**
**제품의 핵심으로 논의한 것**
**확장 아이디어 · 구현 범위는 미정**
**바로 확인할 과제**
```

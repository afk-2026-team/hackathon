# interview/ — 의도 싱크 (작업 **착수 전** · 유일한 사람 게이트)

> 이 `example.md` 는 추적되는 양식이다. 실제 interview 문서는 이 폴더에 추가하되 git 추적 대상이 아니다.
> 규칙 정본: `.claude/rules/docs.md` · `.claude/rules/workflow.md` §1.

## 역할
- 사람의 의도·제약·성공 기준을 질문으로 좁혀 **승인된 의도**로 고정한다(playbook 의 `intent.md`).
- 인터뷰 도구(예: 우로보로스 seed)의 최종 결과물을 md 로 담는 자리다. 도구가 없으면 에이전트가 직접 문답한다.
- 이 문서가 `status: approved` 가 되기 전에는 plan 을 쓰지 않는다.

## 파일명 규칙
```
docs/interview/interview_<YYMMDDHH>[_<MM>_<SS>]_<주제>.md
```
- 이름은 `node .claude/skills/wiki-desk/src/cli.ts name --type interview --topic <주제>` 로 받는다.

## frontmatter (필수)
```yaml
---
title: <한 줄 제목>
status: draft            # draft → approved (사람 승인 뒤에만)
approved_quote: null     # 승인한 사람 발화를 그대로 전사. 에이전트 문장 ✗
approved_at: null        # 승인 시각(ISO 8601, 오프셋 포함)
tool: manual             # ouroboros | manual | <도구명>
ambiguity: null          # 도구가 내는 모호도(있으면) — 출처: 도구 산출
---
```

## 본문 양식
```markdown
# <제목>

## 1. 요청 원문
> <사람의 첫 요청을 그대로>

## 2. 문제·목표
## 3. 제약 (반드시 지킬 것)
## 4. 비범위 (하지 않을 것)
## 5. 결정 원장
| # | 질문 | 사람의 답(원문 요지) | 결정 |
|---|---|---|---|
| Q1 | | | |

## 6. 성공 기준 (plan 의 AC 로 내려갈 것)
- SC-1:
## 7. 선행 근거
- `<path:시작-끝>` 또는 "선행 근거 없음"
## 8. 미해결 질문
- (비어 있어야 승인 가능)
```

## 승인 절차
1. 미해결 질문이 비었는지 확인한다.
2. 사람에게 요약을 보이고 승인 발화를 받는다.
3. `status: approved`, `approved_quote: "<발화 원문>"`, `approved_at: <시각>` 을 채운다. 이후부터 자율 진행이다.

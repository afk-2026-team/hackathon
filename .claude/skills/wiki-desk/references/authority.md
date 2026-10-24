# 권위와 검토 경계

> 원천: `spec.md` §8.2(authority) · `.claude/rules/workflow.md` §1. 새 사실을 더하지 않는다.

## 권위 순위

| pattern | document_type | authority_rank | role |
|---|---|---|---|
| `docs/checklist/**` | checklist | 100 | validation-verdict |
| `docs/devlog/**` | devlog | 85 | execution-narrative |
| `docs/plan/**` | plan | 55 | plan |
| `docs/interview/**` | interview | 40 | intent |
| (fallback) | reference | 0 | reference |

- 규칙은 계약 `authority_rules` 의 **첫 일치**를 쓰고, 없으면 `fallback` 이다.
- 순서의 뜻: 검증 판정(checklist) > 실행 서사(devlog) > 계획(plan) > 의도(interview). 실행에 가까울수록 최신 사실이다.
- 점수에는 `authority_rank · authority_weight` 가 더해진다(매칭 문서에만).

## 검토 경계

`authority_rank` 가 높은 후보를 먼저 읽는 것은 탐색 우선순위일 뿐이다 — 의미상 승인이나 결과 수용을 판정하지 않는다.

네 판정은 서로 대체할 수 없다:

| 판정 | 무엇이 답하나 | 무엇을 답하지 않나 |
|---|---|---|
| 위치/존재 | `query`·`tree`·`read` 의 `path:시작-끝` | 그 내용이 옳은지 |
| 지식 신선도 | `stale`·`card.stale`(카드 해시 ≠ 원문 해시) | 원문이 최신 결정인지 |
| 지식 확인 | 사람이 더한 `verified` | 작업이 받아들여졌는지 |
| 작업 수용 | 사람 게이트(interview 승인)와 checklist 의 AC 판정 | — (서고가 대신 판정하지 않는다) |

- 사람 게이트는 interview 승인(HITL ①) 하나뿐이다. 서고 검색 결과는 그 게이트를 대신하지 않는다.
- 헌법(`CLAUDE.md`·`.claude/`)은 색인하지 않는다.

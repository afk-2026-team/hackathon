# 유지보수

> 원천: `spec.md` §8.8 · §8.10 · `.claude/rules/workflow.md` §5. 새 사실을 더하지 않는다.

## 입고 시점

작업 단위가 checklist 로 끝나면(전부 PASS 또는 PARKED) 그 단위의 interview→plan→devlog→checklist 를 한 번에 입고한다:
`sync`(계획 확인) → `sync --apply` → `check`. 계획에 예상 밖 변경이 보이면 적용하지 않고 원인을 확인한다.

## 상태별 처리

| 상태 | 신호 | 처리 |
|---|---|---|
| stale | `card.stale` · query `stale` | 원문 해시 ≠ 카드 해시. `sync --apply` 로 갱신(span 은 항상 현재 원문 기준) |
| 누락 | `card.missing` · query `missing_cards` | 원문은 있는데 카드 없음. `sync --apply` |
| 사람 키 | 카드 frontmatter 에 사람이 OKF 키(`reviewed_by` 등)만 더함 | 소유로 인정. 갱신 때 사람 키를 도구 키 뒤에 다시 쓴다 |
| 재확인 | sync `reverify` | `verified` 가 있는 카드의 원문이 바뀜. 쓰지 않는다 — 사람이 다시 확인한다 |
| 보호 | sync `protected` | 사람이 고친 카드·`index.md`·`log.md`. 덮어쓰지 않는다 |
| invalid | sync `invalid` · `card.invalid` · query `invalid_cards` | 카드 파싱 불가. 사람이 고친 것이면 원인을 확인해 정리 |
| 고아 | `card.orphan` · sync `orphans_blocked` | 카드는 있는데 원문 없음. 사실 확인 후 `--accept-removed PATH` 또는 `--relocate OLD=NEW` |
| needs_review | sync `needs_review` · 카드 `review_reasons` | 파일명 규칙 위반·frontmatter 파싱 불가·`upstream.missing`·`upstream.not_found` 등. 문서를 고쳐 다시 입고 |

- 지정 안 된 고아가 있으면 `sync --apply` 는 아무것도 쓰지 않는다.
- 보존 이동은 카드를 `<archive_dir>/<원문>.card.md` 로 바이트 그대로 옮긴다.

## 색인 캐시

- `__llm-wiki/.cache/index.json` 은 파생물이다. 질의 때 원문 sha256 이 같은 문서는 재사용하고 나머지만 재색인한다.
- 형태가 틀리면 예외 없이 전량 재색인하고 사유를 `index_cache_reset` 에 적는다. 지워도 다음 질의가 다시 만든다.

## 실패 보고

실패 명령·exit code·부분 상태를 그대로 보고하고 같은 입력을 근거 없이 재시도하지 않는다.
지식 회수·카드 갱신·형식 적합성·의미상 판단을 구분해 보고하고, 부분 성공을 전체 완료로 평탄화하지 않는다.

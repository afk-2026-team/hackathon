# OKF 카드 형식

> 원천: `spec.md` §8.5 · §8.7 · §8.13. 새 사실을 더하지 않는다.

## 포인터 카드

- 원문 1건당 카드 1건: `<wiki_dir>/<cards_dir>/<원문 상대경로>.card.md`. 접미사 `.card.md` 를 떼면 원문 경로다.
- 카드는 원문 본문을 복사하지 않는다(`copy_policy: path_reference`). 원문 frontmatter 값을 그대로 옮긴 메타와 원문 경로·해시만 가진다.
- `description` 은 원문 값이 없으면 `null` 이다 — 생성·요약하지 않는다.

## 필드(순서 고정)

| 필드 | 값 |
|---|---|
| `type` | 원문 `document_type` → 파일명 `prefix` → 계약 authority 의 `document_type` 중 처음 비공백 |
| `title` | 원문 `title`(별칭 흡수) → 파일명 `title` group 의 `_`→공백 → `null` |
| `description` | 원문 값 또는 `null` |
| `resource` | 원문 루트 상대 경로 |
| `tags` | `[type, ...원문 tags 의 문자열 원소]` 중복 제거 |
| `generated` | `{by: "process:wiki-desk-ts", at: <명령 시각 UTC>}` |
| `authority` | 계약의 첫 일치 규칙 또는 `fallback` |
| `source_meta` / `source_meta_unknown` | 별칭으로 흡수된 원문 키 / 매핑되지 않은 키·충돌 키(원형) |
| `needs_review` · `review_reasons` | 판정 불가 사유의 표면화(사유가 있으면 `true`) |
| `source_sha256` | 원문 원 바이트의 sha256 — stale 판정 근거 |

그 뒤에 사람이 더한 키(`extra`)가 원래 순서대로 온다. `verified` 는 도구가 만들지 않는다 — 사람이 더하는 키다.

`review_reasons` 순서: UTF-8 디코딩 불가 → 파일명 규칙 위반 → frontmatter 파싱 불가 → 키 충돌 → 빈 값 → tags 문제 → `upstream.missing` / `upstream.not_found`.

## 운영 파일

| 파일 | 내용 |
|---|---|
| `index.md` | `okf_version: "0.2"` frontmatter + type 별 카드 목록(type 이름순, 항목은 원문 경로순) |
| `log.md` | `# 위키 변경 이력` + `## YYYY-MM-DD`(UTC) 날짜 그룹, 최신 날짜가 위 |
| `receipt.json` | 도구가 쓴 파일과 sha256 — 사람이 고친 파일을 덮어쓰지 않게 하는 소유 근거 |
| `.gitignore` | `<cache_dir>/` |

## 검사(`check`)

- OKF 검사 코드: `okf.frontmatter_parse` · `okf.missing_frontmatter` · `okf.missing_type` · `okf.generated_by` · `okf.verified_by` · `okf.sources_shape` · `okf.source_resource` · `okf.runtime_missing` · `okf.index_frontmatter` · `okf.log_date`.
- 대응 검사 코드: `card.missing` · `card.invalid` · `card.stale` · `card.orphan` · `card.unrecognized`.
- `check` 의 OKF PASS 는 형식 적합성일 뿐이다. 내용이 옳다거나 승인됐다는 판정이 아니다.
- 알 수 없는 키·type·깨진 링크는 문제가 아니다. issues 가 있으면 JSON 을 출력하고 exit 1.

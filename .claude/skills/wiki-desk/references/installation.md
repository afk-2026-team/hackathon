# 설치·제거

> 원천: `spec.md` §3 · §8.1 · §8.14(remove). 새 사실을 더하지 않는다.

## 패키지

- 위치 `.claude/skills/wiki-desk/` — 폴더 전체가 한 단위다(SKILL.md 만 복사하면 CLI 가 빠진다).
- Node.js ≥ 24 가 `.ts` 를 빌드 없이 직접 실행한다. 런타임 npm 의존성 0, 표준 모듈만 쓴다.
- 원문(`source_roots` 아래)에는 쓰기 경로 자체가 없다. 쓰기는 `wiki_dir` 범위 트랜잭션만 하고, `--apply` 가 있을 때만 쓴다.
- daemon·hook·cron·자동 갱신은 없다.

## 설치 순서

1. 사전 점검(쓰기 0): `node --version` ≥ 24 · git 저장소 여부 · 기존 파일 충돌 · `date +%:z`.
2. 계약 원본 `assets/project-contract.json` 작성(`naming.utc_offset` = `date +%:z` 결과).
3. `init --contract …` (계획 확인) → `init --contract … --apply` → `status`.
4. 첫 작업 단위가 checklist 로 끝나면 `sync` → `sync --apply` → `check`.

## 명령별 쓰기

| 명령 | 쓰는 것 | 쓰지 않는 것 |
|---|---|---|
| `init --apply` | `contract.json`(원본 바이트) · `.gitignore` · `index.md` · `log.md` · `receipt.json` | 위키가 이미 있으면 아무것도(거부) |
| `sync --apply` | 바뀐 카드 · 보존 이동 · `log.md` · `index.md` · 없어진 `.gitignore` · `receipt.json` | 원문 · 사람이 고친 카드/`index.md`/`log.md`(`protected`) · 지정 안 된 고아가 있으면 전부 |
| `check` · `status` · `query` · `read` · `tree` · `name` | 없음(`query` 는 파생 캐시 `.cache/index.json` 만) | — |
| `remove --apply` | receipt 기록과 해시가 같은 생성물·캐시 삭제 · `receipt.json` 재작성 · 빈 하위 디렉터리 삭제 | `contract.json` · 사람이 고친 파일(`preserved`) · 원문 |

## 제거

```bash
node .claude/skills/wiki-desk/src/cli.ts remove           # 계획(쓰기 0)
node .claude/skills/wiki-desk/src/cli.ts remove --apply   # 적용
```

출력 `{applied, deletes, preserved, kept}`. 원문은 어떤 경우에도 대상이 아니다.

## 확인의 한계

- 파일 존재나 `status` 성공은 host 가 스킬을 인식했다는 뜻이 아니다. 스킬 인식은 host(Claude Code)가 `SKILL.md` 를 로드했는지로 따로 확인한다.
- 트랜잭션은 단일 협조 writer 를 전제하며, OS 크래시 원자성은 보장하지 않는다.

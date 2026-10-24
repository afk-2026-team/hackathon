# Crawling_DB — Home 조언자용 예제 지식 번들 (동결)

> **상태: 동결된 예제(example-v1).** 2026-10-24 에 한 번 크롤링한 30건이다. 더 크롤링·수정하지 않는다.
> 라이브서버(`app.serve`)는 새 DB 가 생길 때까지 이 폴더를 계속 읽는다.
> 같은 내용(이 README 제외)이 팀 Supabase Storage 에 불변 스냅샷으로 올라가 있다 → [아래 §6](#6-supabase-스냅샷).

이 문서는 "이 DB 가 **어떻게 구조화돼 있는지**"를 처음 보는 팀원이 5분 안에 이해하도록 쓴 안내서다.
데이터 자체는 사람이 읽을 수 있는 마크다운 파일이다. `cat` 으로 열면 된다.

---

## 1. 한 줄 요약

**한 파일 = 한 건의 근거(블로그 후기 글 또는 리뷰 영상).**
파일 맨 위 YAML(frontmatter)에는 검색·필터에 쓰는 값이 있고, 아래 본문에는 사람이 읽는 요약과 출처가 있다.
형식은 Google 의 [Open Knowledge Format(OKF) v0.2](https://github.com/GoogleCloudPlatform/open-knowledge-format)를 따른다.

## 2. 폴더 구조

```
Crawling_DB/
├── README.md        ← 지금 이 문서(사람용 안내. 데이터 아님, 업로드 제외)
├── index.md         ← 번들 목차. okf_version: "0.2"
├── log.md           ← 크롤링 실행 이력(날짜별, 최신이 위)
├── products/        ← 제품 후기 15건 (Naver 블로그)
│   ├── index.md
│   └── naver-blog-<블로거ID>-<글번호>.md
├── clinics/         ← 피부과·의원 후기 10건 (Naver 블로그)
│   ├── index.md
│   └── naver-blog-<블로거ID>-<글번호>.md
└── videos/          ← 리뷰 영상 5건 (YouTube)
    ├── index.md
    └── youtube-<videoId>.md
```

| 폴더 | 건수 | 출처 API | `content_kind` | `category` |
|---|---|---|---|---|
| `products/` | 15 | Naver API Hub 블로그 검색 | `product` | skincare 6 · suncare 3 · makeup 6 |
| `clinics/` | 10 | Naver API Hub 블로그 검색 | `clinic` | k_medical 10 |
| `videos/` | 5 | YouTube Data API v3 | `video` | skincare 3 · k_medical 2 |

- **파일 이름 = 원천 ID.** 같은 글·영상을 다시 크롤링하면 같은 파일을 덮어쓴다(중복 없음).
- **Concept ID** = 폴더 기준 경로에서 `.md` 를 뗀 값이다(예 `clinics/naver-blog-khshi001-224435086306`). AI 응답이 근거를 인용할 때 이 ID 를 `[ ]` 로 감싸 쓴다.

> Naver 쇼핑·지역 검색은 이 프로젝트의 NCP 앱에서 비활성(401/404)이라 쓰지 못했다. 그래서 제품·의원 정보도
> **블로그 후기 글**이다. 가격·주소 같은 정형 데이터가 아니므로 `type: Blog Review` 로 표시한다.

## 3. 파일 하나 뜯어보기

```markdown
---
type: Blog Review                     # OKF 필수. 이 건이 무엇인가
title: 홍대피부과 홍대입술필러 후기, …   # 글 제목(API 원문, HTML 태그 제거)
description: '입술은 피부가 얇고 …'     # API 가 준 스니펫(최대 200자)
resource: https://blog.naver.com/…    # 원문 링크
tags: [k_medical, clinic, naver_blog]
category: k_medical                   # ← Jev 판단 라벨과 같은 어휘(retrieve 필터)
category_source: crawl_query          # category 는 '어떤 검색어로 찾았나'가 정했다는 뜻
content_kind: clinic                  # product | clinic | video
source_kind: naver_blog               # naver_blog | youtube
crawl_query: 홍대 피부과 후기          # 실제로 쓴 검색어
sponsored: unknown                    # yes | no | unknown (아래 §4)
country_signals: []                   # 국가가 '명시'된 경우만 ISO 코드
language_signals: [ko]                # 표기 언어(ISO 639-1)
language_source: script               # 문자 체계로 본 관측값
provenance: measured                  # API 실측값이라는 표시
sources:                              # 이 건이 어디서 왔나(OKF §5.1)
  - id: naver-api-hub-blog            #   검색 API(조회 범위)
  - id: origin                        #   원문 글 — 작성자·게시일 포함
generated: {by: heak-crawler/0.1.0, at: '2026-10-24T14:12:…+09:00'}
status: draft                         # 사람이 검수하지 않음 → 응답에 '미검수' 표시
stale_after: '2027-01-22T…'           # 이 시각 이후엔 '오래됨' 표시
---

# Summary
(스니펫)[^origin]

# Source meta
| 필드 | 값 |  ← 블로거 이름·게시일, 또는 채널·조회수
```

## 4. 필드 사전

### OKF 표준 필드
| 필드 | 필수 | 의미 |
|---|---|---|
| `type` | ✅ | `Blog Review` 또는 `Review Video` |
| `title` · `description` · `resource` · `tags` | 권장 | 제목·스니펫·원문 URL·분류 태그 |
| `sources` | — | 출처 목록. `id: origin` 이 원문(작성자 `author`, 게시일 `last_modified`) |
| `generated` | — | 누가(`heak-crawler/0.1.0`) 언제 만들었나 |
| `status` | — | 모두 `draft`(미검수) |
| `stale_after` | — | 신선도 만료 시각. 제품·영상 30일, 의원 90일 |

### 이 번들의 확장 필드 (OKF 가 허용하는 producer 필드)
| 필드 | 값 | 어떻게 정했나 |
|---|---|---|
| `category` | skincare · suncare · makeup · k_medical | **검색어가 정함**(`category_source: crawl_query`). 글 내용을 판정한 값이 아니다 |
| `content_kind` | product · clinic · video | 검색어 계획이 정함 |
| `source_kind` | naver_blog · youtube | 수집 API |
| `sponsored` | `yes` / `no` / `unknown` | 글에 협찬 표시 문구('협찬'·'제공받아'·'#ad' 등)가 있으면 `yes`. '내돈내산'·'not sponsored' 같은 **작성자 자기 선언**이면 `no` + `sponsored_source: self_declared_text`. 문구가 없으면 `unknown`(문구가 없다고 비협찬으로 단정하지 않는다) |
| `sponsored_evidence` | 문자열 | 판정 근거가 된 원문 조각 |
| `foreigner_friendly` | `true` 또는 없음 | '외국인'·'통역'·'English' 같은 문구가 있을 때만. `foreigner_evidence` 에 근거 |
| `country_signals` | ISO 3166 코드 목록 | 텍스트에 국가명이 **명시**된 경우만. `country_evidence` 에 근거. 국가만으로 취향을 단정하지 않는다 |
| `language_signals` | ISO 639-1 목록 | 블로그는 문자 체계 관측(`script`), YouTube 는 채널 등록 오디오 언어(`youtube_defaultAudioLanguage`) |
| `provenance` | `measured` | 모든 값이 실제 API 응답에서 왔다(모의·추정 아님) |

실측 분포(2026-10-24): `sponsored` no 6 · unknown 24, `foreigner_friendly` 7건, `country_signals` 있는 건 1건.

## 5. AI workflow 가 이 번들을 쓰는 방법

1. 라이브서버가 기동할 때 이 폴더를 한 번 읽는다(`envs/agent_config.yaml` → `knowledge.bundle_path`).
2. Jev 가 질문(또는 온보딩 프로필)을 보고 `category`·`content_kind`·`medical_intent` 를 판단한다.
3. `retrieve` 노드가 frontmatter 만으로 **결정론 필터**를 해서 상위 5건을 고른다(LLM 없음).
   - 필터: category 일치 → content_kind 일치(없으면 완화).
   - 정렬: 신호 점수 → 최신순 → ID 순.
4. 응답 모델(Sonnet)이 그 5건만 근거로 답하고, 항목마다 `[concept id]`·출처 URL·협찬 상태를 붙인다.

자세한 요청·응답 규격은 [`workflow/ai_workflow_manual.html`](../workflow/ai_workflow_manual.html) 에 있다.

## 6. Supabase 스냅샷

| 항목 | 값 |
|---|---|
| 위치 | Supabase Storage 버킷 `rag-documents`(비공개) → `crawling_db/example-v1/` |
| 내용 | 이 폴더의 `.md` 35개(concept 30 + index.md 4 + log.md 1, 이 README 제외) + `manifest.json` |
| `manifest.json` | 파일별 `path`·`sha256`·`bytes`, 업로드 시각, 원본 커밋 |
| 성격 | **불변 스냅샷.** 덮어쓰지 않는다. 새 버전은 `example-v2/` 같은 새 경로로 올린다 |
| 접근 | 비공개 버킷이라 공개 URL 이 없다. 팀 실행기로 서버 키를 주입받아 읽는다 |

## 7. 명령 모음

```bash
# 구조 검증 (30건·위반 0 이면 exit 0)
uv run python -m app.knowledge.validate Crawling_DB

# 스냅샷 해시 검증 (Supabase 에서 다시 내려받아 manifest 와 대조)
node scripts/secrets.mjs run --env dev --services supabase -- uv run python -m crawler.upload_supabase --verify

# (참고) 크롤러 — 동결 상태이므로 실행하지 않는다. 다시 돌리면 파일이 갱신된다
# node scripts/secrets.mjs run --env dev --services naver,youtube -- uv run python -m crawler.run --out Crawling_DB
```

## 8. 알려진 한계

- 블로그 후기라 **사실 검증이 안 된** 개인 의견이다(`status: draft`). 협찬 표시가 없는 광고가 섞여 있을 수 있다.
- `category` 는 검색어로 정했다. 예를 들어 `clinics/naver-blog-on_curation-224444090613` 은 의원이 아니라 약국 안내 글이다.
- 국가 신호는 거의 없다(1/30). 국가별 추천 근거로는 부족하다 → 응답에 "국가 근거 부족"으로 표시된다.

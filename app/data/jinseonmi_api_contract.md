# 진선미 API 계약 (백엔드 실측 기준)

- **기준:** 2026-10-24 KST, 브랜치 `feature/integrate-journey-api-20261024` 작업 트리. main `62e7291`과 머지 중인 `origin/feature/web-hwahae-gangnam-ui`의 백엔드 추가분(maps·evidence·fx)을 포함한다.
- **origin/main `535a5e1` 반영 확인:** `62e7291` 이후 app 변경은 `app/knowledge/okf.py`의 README 제외 규칙 1건뿐이다(그래프 지식 로딩). 라우트·요청·응답 스키마 변화는 없다. 나머지 변경은 매뉴얼, PPT_Kit, crawler 업로더다.
- **정본:** Pydantic `app/schemas/{discovery,auth,live,responses,openai}.py`, 라우트 `app/api/v1/*.py`. 이 문서가 코드와 다르면 코드가 맞다.
- **예시 출처:** 모든 JSON 예시는 `TestClient`로 실제 생성한 응답을 줄인 것이다. 키가 필요한 것은 `scripts/secrets.mjs`로 1회 호출했다. 형식만 보인 예시는 **[형식 예시]**로 표시했다.

## 0. 호스트와 실행

| 호스트 | 실행 | 포함 라우트 | 비고 |
|---|---|---|---|
| **A. discovery_server** `127.0.0.1:8001` | `node scripts/secrets.mjs run --env dev --services supabase,naver,naver_maps,youtube,ash_workflow -- uv run --frozen python -m app.discovery_server` | discovery·auth·maps·evidence·fx·`/health`, **`POST /v1/responses`(B로 넘기는 명시 프록시, §3.10)**, `web/dist`가 있으면 SPA | Vite dev(5173)의 `/v1` 프록시 대상. 키가 없어도 뜨며, 키가 필요한 라우트만 503을 준다. 프록시는 B가 꺼져 있으면 503 |
| **B. app.serve** `0.0.0.0:8000` | `node scripts/secrets.mjs run --env dev --services ash_workflow -- uv run python -m app.serve` | `/v1/chat/completions`, `/v1/responses`, `/v1/models`, discovery·auth, `/health` | 기동 시 Jev·Claude 키가 필수이고 없으면 기동을 거부한다. **maps·evidence·fx는 없다** |

- **오류 형식:**
  - A: `{"error": {"message", "param"}}`
  - B: OpenAI envelope `{"error": {"message", "type", "param", "code"}}`. 단 B에서도 discovery의 422 메시지는 chat 예시가 붙은 B 핸들러를 탄다.
- **8001 재시작 반영(2026-10-24 15시대, 컨트롤러):** `/openapi.json`에 maps·geocode·fx·`/v1/responses`가 노출된다.

## 1. 엔드포인트 목록

| # | method | path | 호스트 | 인증 | 상태 |
|---|---|---|---|---|---|
| 1 | GET | `/v1/discovery/catalog` | A·B | 없음 | 구현 |
| 2 | POST | `/v1/discovery/recommendations` | A·B | 없음 | 구현(규칙 기반) |
| 3 | GET | `/v1/discovery/reference-products` | A·B | 없음 | 구현 |
| 4 | POST | `/v1/discovery/compare` | A·B | 없음 | 구현 |
| 5 | POST | `/v1/discovery/explain` | A·B | 없음(서버가 `ASH_ANTHROPIC_API_KEY` 사용) | 구현. 키 없으면 fallback |
| 6 | GET | `/v1/auth/config` | A·B | 없음 | 구현 |
| 7 | GET | `/v1/auth/me` | A·B | `Authorization: Bearer <supabase access_token>` | 구현 |
| 8 | GET | `/v1/maps/config` | A | 없음 | 구현 |
| 9 | GET | `/v1/maps/geocode?query=` | A | 없음(서버 naver_maps 키) | 구현 |
| 10 | GET | `/v1/evidence/blog?query=&display=` | A | 없음(서버 naver 키) | 구현 |
| 11 | GET | `/v1/evidence/videos?query=&lang=&max=` | A | 없음(서버 youtube 키) | 구현 |
| 12 | GET | `/v1/fx?base=KRW` | A | 없음(키 불필요) | 구현 |
| 13 | POST | `/v1/chat/completions` | B | 없음 | 구현(OpenAI 호환) |
| 14 | POST | `/v1/responses` | B 직접 · A 프록시 | 없음 | 구현(OpenAI Responses 호환). A는 `app/api/v1/assistant_proxy.py`가 검증 후 B로 전달 |
| 15 | GET | `/v1/models` | B | 없음 | 구현 |
| — | POST | `/v1/inputs/prepare` | — | — | **미구현.** `app/api/v1/inputs.py`는 라우트가 아니라 chat·responses 공용 입력 매핑 헬퍼다 |
| — | — | session·state·질문-응답 저장 API | — | — | **미구현.** 별도 세션 엔드포인트나 서버 측 대화 저장소가 없다(§4) |

## 2. 프로필 전파 (UI → 서버)

| UI 저장값(`lib/storage.ts` Profile) | discovery 계열(#2·#4·#5 `body.profile`) | `/v1/responses`·chat(`metadata.profile`) | 비고 |
|---|---|---|---|
| `country` | `country`(필수, alpha-2, 예 `US`·`XX`) | `country`(대문자로 정규화) | 국가로 피부·취향·시술 적합성을 추정하지 않는다 |
| `language` | `language`(필수, 2~35자) | `language`(소문자, `-` 앞만 사용) | |
| `currency` | `currency`(필수, ISO 4217 3자) | B 직접: 선택 수신·검증(§2-1) · A 프록시: 받지 않음 | UI 경로에서는 보내지 않는다 |
| `gender` | `gender?`(받지만 계산에 미사용) | `gender`(프로필에 저장, Home 요청 문장에는 미사용) | |
| `age_range` | `age_range?`(받지만 미사용) | **`age_band`** | **필드명 불일치.** 어댑터가 `age_range`를 `age_band`로 바꿔야 한다 |
| `preferences.interests[]` | `preferences.interests` | B 직접: 평탄 `interests` 수신·검증 · A 프록시: 받지 않음 → UI는 Home `input` 문장으로 전달 | 태그·카테고리 정확 일치만 사용 |
| `preferences.budget_krw` | `preferences.budget_krw`(≥0) | B 직접: 평탄 `budget_krw` 수신·검증 · A 프록시: 받지 않음 → UI는 Home `input` 문장으로 전달 | recommendations는 예산 초과를 제외, explain은 within/above |
| `preferences.current_product` | `preferences.current_product`(≤200자, 단어 겹침) / compare·explain은 `current_product_id`(목록) 또는 `current_product_name` | B 직접: 평탄 `current_product` 수신·검증 · A 프록시: 받지 않음 → UI는 Home `input` 문장으로 전달 | 이름이 기준 제품명과 정확히 같으면 서버가 matched로 본다 |
| (session) | 없음 | `X-Thread-Id` 헤더 — `multi_turn.enabled=false`라 지금은 불필요. 켜면 필수(없으면 400) | 별도 session_id 필드는 없다 |

- **discovery 요청은 extra 필드를 금지한다**(`extra="forbid"`). 모르는 키를 보내면 422다.
- **B의 `/v1/responses`·chat 요청은 extra를 허용하고 무시한다. A 프록시는 extra를 금지한다(422).**

### 2-1. AI 경로별 선호 전달 (중복 없음)

| 경로 | `metadata.profile`에 실리는 것 | 관심사·예산·현재 제품 | 근거 |
|---|---|---|---|
| **UI (5173 → A 프록시 → B)** | `language`·`country`·`gender?`·`age_band?`(UI `age_range`를 변환) | 질문이 없을 때 `web/src/lib/assistant.ts` `homeQuestion`이 `input` 문장으로 보낸다: `[Home] I'm interested in … My budget is about KRW … I currently use … What K-beauty products or clinics should I look at first on my trip to Korea?` 선호가 없으면 `input: null`로 B의 Home 요청을 쓴다. 성별·연령은 문장에 넣지 않는다 | A 프록시의 `AssistantProfile`이 4필드 외에는 422로 막으므로 metadata와 문장에 이중으로 실리지 않는다 |
| **B 직접 호출(서버 간·테스트)** | 위 4필드 + 선택 `currency`(ISO 4217 3자)·`interests`(문자열 ≤10개·각 ≤40자)·`budget_krw`(0 < n ≤ 100,000,000, 정수화)·`current_product`(≤200자). 형식이 틀리면 400(`param=metadata.profile.<field>`) | `input` 없이 오면 Home 요청 문장 끝에 ` Their stated preferences: interests …; budget about KRW …; currently uses ….`를 붙인다. respond 턴의 `[Profile]` 줄에도 표시된다 | `app/api/v1/inputs.py` `PREFERENCE_FIELDS`, `app/graph/nodes.py` `PROFILE_KEYS`. B에 반영되려면 8000 재시작이 필요하다 |

## 3. 상세

### 3.1 GET /v1/discovery/catalog
- **응답:** `{items: CatalogItem[]}`
- **CatalogItem:**
  - `id`, `kind`(product·place·guide), `category`(beauty·medical)
  - `title`, `subtitle`, `description`, `image_url|null`, `price_krw|null`, `location|null{name,lat?,lng?,address?}`
  - `sources[{label,url,checked_at}]`(1개 이상)
  - `sponsorship`(sponsored·not_sponsored·unknown)
  - `reasons[]`, `country_codes[]`, `tags[]`, `provenance`
- **오류:** 파일 없음·계약 위반은 503.

`200`
```json
{"items": [{"id": "beauty-illiyoon-ceramide-ato-concentrate-cream-75ml", "kind": "product", "category": "beauty", "title": "ILLIYOON Ceramide Ato Concentrate Cream 75ml", "subtitle": "일리윤 세라마이드 아토 집중 크림 · 75ml", "description": "A moisturizing cream the seller describes for dry areas of the face and body. Seller label: made in South Korea by Amorepacific Corporation.", "image_url": "https://image.oliveyoung.co.kr/cfimages/cf-goods/uploads/images/thumbnails/10/0000/0023/A00000023323706ko.png?l=ko", "price_krw": 6900.0, "location": null, "sources": [{"label": "OLIVE YOUNG Global product info (ingredients, size)", "url": "https://global.oliveyoung.com/product/detail?prdtNo=GA251034628", "checked_at": "2026-10-24"}, {"label": "OLIVE YOUNG Korea listing (KRW 6,900, seen in browser)", "url": "https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000233237", "checked_at": "2026-10-24"}], "sponsorship": "unknown", "reasons": ["Ingredient list includes Ceramide NP, Cholesterol and Phytosphingosine (seller label)", "Described as a cream for dry face and body areas"], "country_codes": [], "tags": ["skincare", "moisturizer", "cream", "ceramide"], "provenance": "official_seller_page; price_krw=browser_observed_2026-10-24 (Korean store price, may change)"}], "_count": 20}
```

### 3.2 POST /v1/discovery/recommendations
- **요청:** `{profile: Profile, category?: "all"|"beauty"|"medical"}`
- **응답:** `{items: CatalogItem[], country_context: {country, status: supported|insufficient, explanation}, generated_at}`
- **정렬:** 일치 점수 순이고, sponsored는 항상 자연 후보 뒤다. **인기 순위가 아니다.**
- **오류:** 422(프로필 형식), 503(카탈로그)

`200`
```json
{"items": [{"id": "beauty-illiyoon-ceramide-ato-concentrate-cream-75ml", "sponsorship": "unknown", "reasons": ["Ingredient list includes Ceramide NP, Cholesterol and Phytosphingosine (seller label)", "Described as a cream for dry face and body areas", "Listed price ₩6,900 is within your budget of ₩30,000."]}], "country_context": {"country": "US", "status": "insufficient", "explanation": "We have no sourced information specific to US yet, so these results come from general sources. Your country is not used to guess skin type or treatment suitability."}, "generated_at": "2026-10-24T05:58:57+00:00", "_count": 15}
```

### 3.3 GET /v1/discovery/reference-products
- **응답:** `{items: ReferenceProduct[]}`
- **ReferenceProduct 필드:**
  - `id`, `brand`, `title`, `form|null`, `volume_ml|null`
  - `key_ingredients|null`, `ingredients_complete`, `ingredients_basis`
  - `price|null{amount,currency,basis,source}`
  - `market_codes[]`, `sources[]`, `provenance`
- 현재 1건(CeraVe)이다.

`200`
```json
{"items": [{"id": "ref-cerave-moisturizing-cream", "brand": "CeraVe", "title": "CeraVe Moisturizing Cream", "volume_ml": null, "price": {"amount": 14.99, "currency": "USD", "basis": "Price shown on the brand's official US product page. The page text does not state which size this price is for.", "source": {"label": "CeraVe US official product page", "url": "https://www.cerave.com/skincare/moisturizers/moisturizing-cream", "checked_at": "2026-10-24"}}}]}
```

### 3.4 POST /v1/discovery/compare
- **요청:** `{profile, candidate_id, current_product_id?, current_product_name?}`. current는 둘 중 하나가 필수다.
- **응답 필드:**
  - `current|null`, `current_status: matched|unknown`
  - `candidate{id,title,form,volume_ml,key_ingredients,ingredients_complete,ingredients_basis,price,sources}`
  - `common[]`, `differences[]`, `unverified[]` — 각 Point는 `{attribute: key_ingredients|volume_ml|form, current, candidate, basis, sources}`
  - `price{current,candidate,comparable,note}`, `country_context`, `notice`, `generated_at`
- **판정 규칙:**
  - `comparable`은 통화와 용량이 모두 같을 때만 true다.
  - 부분 목록에서는 '없음'을 차이로 만들지 않는다.
- **오류:** 404(없는 id, product가 아닌 후보), 422, 503

`200`
```json
{"current_status": "matched", "common": [{"attribute": "key_ingredients", "current": ["Ceramide NP", "Cholesterol", "Phytosphingosine"], "candidate": ["Ceramide NP", "Cholesterol", "Phytosphingosine"]}, {"attribute": "form", "current": "cream", "candidate": "cream"}], "price": {"comparable": false, "note": "Prices are in different currencies and are shown as listed, without conversion."}, "country_context": {"country": "US", "status": "supported", "explanation": "The CeraVe details come from its official page for US. Your country is not used to guess skin type, preferences or treatment suitability."}}
```

오류 예:

`404`
```json
{"error": {"message": "candidate product not found", "param": null}}
```

`422`
```json
{"error": {"message": "Invalid request: profile.country — String should match pattern '^[A-Za-z]{2}$'", "param": "profile.country"}}
```

### 3.5 POST /v1/discovery/explain
- **요청:** compare와 같다.
- **응답:** `{text, mode: llm|fallback, fallback_reason: null|llm_unavailable|timeout|validation_failed|llm_error, sources[], notice, generated_at}`
- **동작:** 서버가 사실 문장을 만들고 모델은 fact_id만 고른다. 모델 자유 문장은 나가지 않는다.
- **LLM 실패:** 오류가 아니라 200과 fallback이다.

`200`
```json
{"text": "Both labels list Ceramide NP, Cholesterol, Phytosphingosine. Both are a cream. Some ingredients could not be checked because an ingredient list is partial or missing. Listed prices are USD 14.99 and KRW 6,900, shown as listed and are not compared. Its listed price is within your budget of KRW 30,000.", "mode": "fallback", "fallback_reason": "llm_unavailable", "sources_n": 3}
```

### 3.6 GET /v1/auth/config · GET /v1/auth/me
- **config 응답:** `{supabase_url, publishable_key, google_enabled, callback_path:"/auth/callback"}`
  - 설정이 없거나, 공개키가 아니거나, provider 상태 확인에 실패하면 503
- **me 응답:** `{id, email|null, display_name|null, avatar_url|null}`
  - 토큰 없음·형식 오류·Supabase 거부는 401(`WWW-Authenticate: Bearer`)
  - 원격 장애는 503

`200`
```json
{"supabase_url": "https://xdperpgoxyxdhvuprjdi.supabase.co", "publishable_key": "sb_publishable_…", "google_enabled": true, "callback_path": "/auth/callback"}
```

`401`
```json
{"error": {"message": "Missing bearer token", "param": null}}
```

### 3.7 GET /v1/maps/config · GET /v1/maps/geocode (A만)
- **config:** `{provider:"naver", enabled, client_id|null}`. client_id는 도메인 제한 공개 식별자다.
- **geocode:** `query` 2~200자. 응답은 `{query, results[{address,road_address,jibun_address,english_address,lat,lng}], provenance, fetched_at}`
  - 키 없음은 503, 원격 오류는 502다.
  - **주의:** POI 이름("서울역")은 결과가 비었다(주소 검색 API). UI는 주소 문자열을 넘겨야 하며, 빈 결과 상태가 필요하다.

키 없는 실행(현재 기본):

`200`
```json
{"provider": "naver", "enabled": false, "client_id": null}
```

`200`
```json
{"query": "서울역", "results": [], "provenance": "naver_maps_geocode", "fetched_at": "2026-10-24T05:59:19+00:00"}
```

### 3.8 GET /v1/evidence/blog · GET /v1/evidence/videos (A만)
- **blog:**
  - 요청: `query` 2~100자, `display` 1~20(기본 6)
  - 응답: `{query,total,items[{title,url,excerpt,author,posted_on,sponsorship:"unknown"}],provenance,fetched_at}`
  - NAVER 검색 API 특약상 결과는 가공·AI 입력 없이 출처·원문 링크와 함께 표시해야 한다.
- **videos:**
  - 요청: `query`, `lang` en|ko, `max` 1~10(기본 6)
  - 응답: `{query,items[{video_id,title,channel,published_at,thumbnail_url,url,embed_url,sponsorship: sponsored|unknown, sponsorship_source}],provenance,fetched_at,cached}`
  - **주의:** 제목에 "#ad"가 있어도 YouTube의 유료 PPL 플래그가 없으면 `unknown`이다.
- **오류:** 키 없음 503, 원격 오류 502

`200`
```json
{"query": "일리윤 세라마이드 아토 집중 크림", "total": 11032, "items": [{"title": "일리윤 세라마이드 아토 집중 크림 후기｜건성 피부 장벽크림 화잘....", "url": "https://blog.naver.com/mi_tto0104/224448546398", "excerpt": "이번에 사용해 본 제품은 바로 일리윤 세라마이드 아토 집중 크림이에요 일리윤 하면 보습크림으로 워낙 유명하잖아요? 이번에 사용해 본 제품은 일리윤의 대표 보습 장벽크림인 세라마이드 아토 집중...", "author": "미또뽀또.zip", "posted_on": "2026-10-21", "sponsorship": "unknown"}], "provenance": "naver_api_hub_blog_search", "fetched_at": "2026-10-24T05:59:19+00:00"}
```

`200`
```json
{"query": "ILLIYOON ceramide cream", "items": [{"video_id": "El-FePWiZ0o", "title": "the one product my mom has used for 10+ years! Here’s how and why. #skincare #korean #ad", "channel": "ahnestkitchen", "published_at": "2026-06-05T05:10:20Z", "thumbnail_url": "https://i.ytimg.com/vi/El-FePWiZ0o/hqdefault.jpg", "url": "https://www.youtube.com/watch?v=El-FePWiZ0o", "embed_url": "https://www.youtube.com/embed/El-FePWiZ0o", "sponsorship": "unknown", "sponsorship_source": null}], "provenance": "youtube_data_api_search", "fetched_at": "2026-10-24T05:59:20+00:00", "cached": false}
```

### 3.9 GET /v1/fx (A만)
- **응답:** `{base:"KRW", date, rates{통화: 1 KRW당 금액}, source{label,url}, fetched_at}`
- ECB 기준율이며 키가 필요 없다. `base`가 KRW가 아니면 422, 원격 오류는 502다.

`200`
```json
{"base": "KRW", "date": "2026-10-23", "rates": {"AUD": 0.00107517, "BRL": 0.00381022, "CAD": 0.00105669}, "source": {"label": "European Central Bank reference rates (via Frankfurter)", "url": "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html"}, "fetched_at": "2026-10-24T05:58:58+00:00"}
```

`422`
```json
{"error": {"message": "Invalid request: query.base — Input should be 'KRW'", "param": "query.base"}}
```

### 3.10 POST /v1/responses (B 직접 · A 프록시) · POST /v1/chat/completions (B만)
- **요청 `/v1/responses`:**
  - `{model:"kbeauty-sonnet", input?: string | ChatMessage[], stream?: bool, metadata?: {profile?: {language,country,gender,age_band}}}`
  - extra 필드는 허용하고 무시한다. input이 목록이면 마지막 항목이 `role:"user"`여야 한다(아니면 400).
  - **input 없이 `metadata.profile`만 주면 서버가 Home 추천 요청 문장을 만든다.** input도 profile도 없으면 400이다.
- **응답:** `{id:"resp_…", object:"response", created_at, status: completed|incomplete, model, output:[{type:"message", id, status, role:"assistant", content:[{type:"output_text", text, annotations:[]}]}], incomplete_details|null, metadata}`
  - `stream=true`면 SSE로 `response.created` → `response.output_item.added`·`content_part.added`·`output_text.delta`… → `response.completed|incomplete`를 보낸다.
- **오류:** 없는 model은 404 `model_not_found`, 형식 오류는 400(OpenAI envelope)이다.
- **A 프록시(`app/api/v1/assistant_proxy.py`) 규칙:**
  - 요청: `{model?: string(기본 JINSEONMI_AI_MODEL 또는 "kbeauty-sonnet"), input?: string|null(≤2000자, 앞뒤 공백 제거), stream?: false, metadata: {profile: {language(2~8자), country(2자), gender?(≤32자), age_band?(≤16자)}}}`
  - `stream=true`, extra 필드(프로필 안 포함), 2000자 초과, `metadata` 누락은 B 호출 전에 422로 막는다. 오류 형식은 A의 `{"error": {"message", "param"}}`다.
  - 업스트림은 `JINSEONMI_AI_UPSTREAM`(기본 `http://127.0.0.1:8000`), 시간 상한 60초다. `X-Thread-Id`가 오면 그대로 넘긴다.
  - 실패 매핑: B 미기동 503, 시간 초과 504, 읽을 수 없거나 `object≠"response"`인 응답 502. B의 4xx·5xx는 상태를 유지하고 B의 `error.message`를 담는다(UI는 이 문구를 `detail`로만 보관하고 사용자 문구는 따로 쓴다).
  - 실측(2026-10-24): `5173/v1/responses` → A → B 200, 8.6초, `status:"completed"`.
- **chat/completions:** `{model, messages[], stream?, metadata?}`이며 응답은 OpenAI `chat.completion` 형식이다.
- **출력 텍스트:** 모델 자유 문장이다. 구조화된 상품 카드·출처 필드는 **없다.** 화면 카드는 discovery 계열 응답으로 그려야 한다.

[형식 예시 — 코드 스키마 기준의 요청·응답 모양이다. 실제 호출 결과(5173 → A 프록시 → B, 200·8.6초·completed)는 위 "A 프록시 규칙"의 실측 항목에 적었다]

```json
{"model": "kbeauty-sonnet", "metadata": {"profile": {"language": "en", "country": "US"}}}
```

```json
{"id": "resp_…", "object": "response", "created_at": 1761285600, "status": "completed", "model": "kbeauty-sonnet", "output": [{"type": "message", "id": "msg_…", "status": "completed", "role": "assistant", "content": [{"type": "output_text", "text": "…", "annotations": []}]}], "incomplete_details": null, "metadata": {"profile": {"language": "en", "country": "US"}}}
```

## 4. 미구현과 모호점

1. **`/v1/inputs/prepare` 라우트 없음.** 입력 매핑은 서버 내부(`graph_input_from`)에서만 한다. UI가 필요하면 새 계약을 정해야 한다.
2. **session·state·질문-응답 저장 없음.**
   - `/v1/responses`는 요청마다 독립적이다(multi_turn off). `previous_response_id`는 받지만 무시한다(extra 허용).
   - 대화 이어 가기가 필요하면 multi_turn 설정과 `X-Thread-Id`(서버 메모리, 재시작 시 소멸)가 필요하다.
3. **호스트 분리는 A 프록시로 해결했다.** A의 `POST /v1/responses`가 B로 넘긴다(§3.10). B 라우터를 A에 직접 합치지 않은 이유는 `app.state.registry`·lifespan 의존 때문이다. chat/completions·models는 여전히 B에만 있다.
4. **필드명 불일치:** UI·discovery는 `age_range`, responses는 `age_band`를 쓴다. `web/src/lib/assistant.ts` `toAssistantProfile`이 변환한다.
5. **responses 출력은 자유 텍스트다.** 출처·카드 구조가 없으므로 사실 근거 UI는 compare·explain·evidence로 그린다.
6. **geocode는 주소 검색이다.** 장소명은 빈 결과가 나올 수 있다.
7. **카탈로그 건수:** 머지 작업 트리는 20건이다(beauty product 11, beauty place 3, beauty guide 1, medical guide 3, medical place 2). main `62e7291`은 7건이다. 예시의 recommendations는 beauty와 예산 30,000원 조건이라 15건이 나왔다. compare 대상 표시사항(성분·용량)은 ILLIYOON 1건만 있고, 나머지 product는 `unverified`로 나온다.

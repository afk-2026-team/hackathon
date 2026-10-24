# discovery API 계약 · 예시

정본 스키마는 `app/schemas/discovery.py`다. 아래 응답 예시는 2026-10-24 현재 동봉 데이터로 실제 생성한 출력이며, `sources`는 지면상 `…`로 줄였다.

## 기존 (변경 없음)

- `GET /v1/discovery/catalog` → `{items: CatalogItem[]}`
- `POST /v1/discovery/recommendations` → `{items, country_context, generated_at}`

## 신규

### `GET /v1/discovery/reference-products`

사용자가 "지금 쓰는 제품"으로 고를 해외 제품 목록이다. 데이터 파일은 `discovery_reference_products.json`이다.

ReferenceProduct 필드:

| 필드 | 형식 | 규칙 |
|---|---|---|
| `id`, `brand`, `title` | string | |
| `form` | string \| null | |
| `volume_ml` | number \| null | 공식 페이지에 없으면 null |
| `key_ingredients` | string[] \| null | 표시 성분 이름 |
| `ingredients_complete` | boolean | 전성분이 아니면 false |
| `ingredients_basis` | string | 어느 표시에서 가져왔는지 |
| `price` | PriceFact \| null | |
| `market_codes` | string[] | 출처가 그 국가 공식 페이지일 때만 |
| `sources` | Source[] | |
| `provenance` | string | |

PriceFact = `{amount, currency(ISO 4217), basis, source:{label,url,checked_at}}`

### `POST /v1/discovery/compare`

요청:
```json
{
  "profile": {"country": "US", "language": "en", "currency": "USD"},
  "candidate_id": "beauty-illiyoon-ceramide-ato-concentrate-cream-75ml",
  "current_product_id": "ref-cerave-moisturizing-cream"
}
```

- `current_product_id`(목록 id)와 `current_product_name`(자유 입력) 중 하나는 필수다.
- 이름만 주면 공백·대소문자를 정규화해 등록 제품명과 정확히 일치할 때만 연결한다. 일치하지 않으면 `current_status:"unknown"`으로 후보 표시사항만 돌려준다. 자유 입력 원문은 응답과 로그에 남기지 않는다.

응답(실제 출력):
```json
{
  "current": {
    "id": "ref-cerave-moisturizing-cream",
    "…": "ReferenceProduct"
  },
  "current_status": "matched",
  "candidate": {
    "id": "beauty-illiyoon-ceramide-ato-concentrate-cream-75ml",
    "title": "ILLIYOON Ceramide Ato Concentrate Cream 75ml",
    "form": "cream",
    "volume_ml": 75.0,
    "key_ingredients": [
      "Ceramide NP",
      "Cholesterol",
      "Phytosphingosine"
    ],
    "ingredients_complete": false,
    "ingredients_basis": "Ingredients named on the seller's label (OLIVE YOUNG Global), as recorded in the catalog on 2026-10-24. The full list was not re-verified, so missing items are not treated as absent.",
    "price": {
      "amount": 6900.0,
      "currency": "KRW",
      "basis": "Korean OLIVE YOUNG store price seen in a browser on 2026-10-24. It may change.",
      "source": {
        "label": "OLIVE YOUNG Korea listing",
        "url": "https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000233237",
        "checked_at": "2026-10-24"
      }
    },
    "sources": [
      "…"
    ]
  },
  "common": [
    {
      "attribute": "key_ingredients",
      "current": [
        "Ceramide NP",
        "Cholesterol",
        "Phytosphingosine"
      ],
      "candidate": [
        "Ceramide NP",
        "Cholesterol",
        "Phytosphingosine"
      ],
      "basis": "Both labels list these ingredient names. Amounts and formulas are not compared.",
      "sources": [
        "…"
      ]
    },
    {
      "attribute": "form",
      "current": "cream",
      "candidate": "cream",
      "basis": "Same product form on both pages.",
      "sources": [
        "…"
      ]
    }
  ],
  "differences": [],
  "unverified": [
    {
      "attribute": "key_ingredients",
      "current": [
        "Ceramide AP",
        "Ceramide EOP",
        "Sodium Hyaluronate",
        "Petrolatum",
        "Dimethicone"
      ],
      "candidate": null,
      "basis": "At least one list is partial, so an ingredient missing here may still be in the product.",
      "sources": [
        "…"
      ]
    },
    {
      "attribute": "volume_ml",
      "current": null,
      "candidate": 75.0,
      "basis": "Size (ml) is not recorded for one of the products.",
      "sources": [
        "…"
      ]
    }
  ],
  "price": {
    "current": {
      "amount": 14.99,
      "currency": "USD",
      "basis": "Price shown on the brand's official US product page. The page text does not state which size this price is for.",
      "source": {
        "label": "CeraVe US official product page",
        "url": "https://www.cerave.com/skincare/moisturizers/moisturizing-cream",
        "checked_at": "2026-10-24"
      }
    },
    "candidate": {
      "amount": 6900.0,
      "currency": "KRW",
      "basis": "Korean OLIVE YOUNG store price seen in a browser on 2026-10-24. It may change.",
      "source": {
        "label": "OLIVE YOUNG Korea listing",
        "url": "https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000233237",
        "checked_at": "2026-10-24"
      }
    },
    "comparable": false,
    "note": "Prices are in different currencies and are shown as listed, without conversion."
  },
  "country_context": {
    "country": "US",
    "status": "supported",
    "explanation": "The CeraVe details come from its official page for US. Your country is not used to guess skin type, preferences or treatment suitability."
  },
  "notice": "This compares label information only (listed ingredients, size, listed price) from the linked pages. It does not mean the products work the same way or are clinically equivalent. Check the package before buying.",
  "generated_at": "2026-10-24T05:16:14+00:00"
}
```

## 판정 규칙

- **비교 대상:** `key_ingredients`·`volume_ml`·`form`의 표시값만 비교한다. 함량·처방·효능·임상 동등성은 비교하지 않는다(`notice`).
- **결과 분류:**
  - `common`: 양쪽 표시가 같은 항목이다.
  - `differences`: 양쪽 값을 모두 알고 서로 다른 항목이다. 성분 차이는 **상대가 전성분일 때만** "상대에 없음"으로 말한다.
  - `unverified`: 한쪽이 미확인이거나 목록이 일부라 판단할 수 없는 항목이다. 값은 null 또는 확인할 수 없는 쪽 이름이다.
- **가격:** 통화와 용량이 **모두 같을 때만** `comparable:true`다. 통화나 용량이 다르거나 용량이 없으면 false다. 환율 환산과 ml당 단가 계산은 하지 않는다.
- **국가 맥락:** 현재 제품 출처가 선택 국가의 공식 페이지(`market_codes`)이거나, 후보 `country_codes`에 출처가 있을 때만 `supported`다. 국가로 피부·취향·시술 적합성을 추정하지 않는다.
- **오류:**
  - 후보·현재 제품 id가 없거나, 후보가 product가 아니면 404
  - 계약을 위반한 입력은 422
  - 데이터 파일 오류는 503(파일명만 표시, 경로·비밀값 없음)
- **테스트용 경로:** `DISCOVERY_REFERENCE_PATH`, `DISCOVERY_FACTS_PATH`로 데이터 경로를 바꿀 수 있다.

### `POST /v1/discovery/explain`

요청은 `/compare`와 같다. 응답 형식은 `{text, mode, fallback_reason, sources, notice, generated_at}`이다(FE 계약 그대로).

- **동작:**
  1. 서버가 compare 결과로 사실 문장 목록 `{fact_id, text, sources}`를 만든다. 가격·예산의 within/above는 서버가 계산한다.
  2. 모델에는 `fact_id`와 `text`만 보내고, 최대 3개 id를 골라 순서를 정하게 한다(`{"fact_ids": [...]}`).
  3. **응답 `text`는 서버에 저장된 사실 문장을 이어 붙인 것이다. 모델이 쓴 자유 문장은 화면에 나가지 않는다.**
  4. 부분 성분 목록 고지("Some ingredients could not be checked…")는 모델이 고르지 않아도 항상 붙는다.
- **mode:**
  - `llm`: 유효한 id 선택
  - `fallback`: 모든 사실을 기본 순서로 이은 결정적 문장
- **fallback_reason:**
  - `llm_unavailable`: 키 없음
  - `timeout`: 8초 초과
  - `validation_failed`: JSON 아님, 빈 목록, 없는 id, 중복, 4개 이상
  - `llm_error`: 429·권한 등, 재시도 없음
- **모델 입력:** 국가·성별·연령·URL은 넘기지 않는다.
- **실제 호출:** 2026-10-24 최종 1회 결과는 `claude-haiku-5-5`, `mode=llm`, text 202자, 출처 3개였다.

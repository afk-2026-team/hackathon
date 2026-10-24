# app/data — discovery 공개 근거 카탈로그

`discovery_catalog.json`은 `/v1/discovery/*` API가 읽는 소수의 큐레이션 후보입니다. 형식은 `{ "items": CatalogItem[] }`이고 계약은 `docs/plan/plan_26102413_42_12_온보딩부터_앱구현.md`를 따릅니다.

- 각 항목은 공개 공식 페이지(판매처·공공 포털)에서 2026-10-24에 확인한 사실만 담습니다.
- 인기 순위, 효능, 피부 적합성, 진단·시술 적합성, 예약 가능 여부는 담지 않습니다.
- 배열 순서는 큐레이션 순서이며 측정된 순위가 아닙니다.

## 필드 규칙

| 필드 | 규칙 |
|---|---|
| `tags` | 프론트 관심사 필터와 맞춥니다. 크림 3종은 판매처 분류(Skincare > Moisturizers > Cream)에 근거해 `skincare`를 붙였습니다. |
| `id` | 안정 ID: `<category>-<brand/기관>-<제품/안내>`. 바꾸면 사용자 저장 데이터가 끊깁니다. |
| `kind` / `category` | `product` · `place` · `guide` / `beauty` · `medical`. 의료는 공식 안내(`guide`)만 넣었습니다. |
| `title` / `subtitle` | 기본 UI가 영어라 `title`·`description`·`reasons`·`sources[].label`은 짧은 영어로 씁니다. `title`은 판매처·기관 표기를 따르고, `subtitle`은 한국어 제품명·기관명(매장에서 찾을 때 쓰는 이름)입니다. |
| `description` / `reasons` | 출처에 적힌 사실만 씁니다. 추천 이유는 "왜 비교해 볼 만한가"를 사실로 설명하며, 효과 보장 문구는 쓰지 않습니다. |
| `image_url` | 판매처 페이지에 게시된 제품 이미지 URL입니다(파일 복사 아님). 저작권은 브랜드·판매처에 있으며 판매처 홍보 배지가 이미지에 포함돼 있습니다. 시연·연구 참조용이고, 정식 서비스 전에 이용 허락을 받아야 합니다. 없으면 `null`. |
| `price_krw` | 원화 가격을 직접 확인한 경우에만 정수로 넣습니다. ILLIYOON 6,900원은 국내 올리브영 페이지를 브라우저로 관찰한 값입니다(curl은 봇 차단 403). 묶음 상품이나 미확인 가격은 `null`이며 변동될 수 있습니다. |
| `location` | 공식 출처에서 주소를 확인한 경우에만 값을 넣습니다. 현재는 Medical Korea 서울 안내센터 1곳만 공식 페이지 주소로 들어 있습니다. 좌표(`lat`·`lng`)는 검증 전이라 넣지 않았으므로, 지도는 주소 검색 링크로 넘깁니다. |
| `sources[]` | `{label,url,checked_at}`. 화면에서 클릭 가능해야 합니다. |
| `sponsorship` | 근거 없이 `not_sponsored`로 두지 않습니다. 현재는 모두 `unknown`입니다. |
| `country_codes` | 해당 국가와의 관련성을 뒷받침하는 출처가 있을 때만 값을 넣습니다. 현재는 모두 `[]`이며, 국가 선호를 지어내지 않습니다. 따라서 API의 `country_context`는 대부분 `insufficient`가 맞습니다. |
| `provenance` | 출처 종류와 값별 예외를 적습니다(예: `price_krw=browser_observed_…`, `location=null(…)`). |

## 현재 항목 (7)

- **beauty product 3:**
  - ILLIYOON Ceramide Ato Concentrate Cream 75ml
  - Torriden Dive-In Soothing Cream 100ml(리뉴얼)
  - ROUND LAB Birch Juice Moisturizing Cream 80ml(2개 묶음 SKU)
- **beauty guide 1:** VISITKOREA 세금 환급 안내
- **medical guide 2:** Medical Korea 포털, 외국인환자 유치기관 등록 조회
- **medical place 1:** Medical Korea Information Center (Seoul) — 서울역 공항철도 B2, 인천공항 T1 창구 정보 포함

## 후속 작업 (이번 범위 밖)

1. **수집:**
   - 판매처·브랜드 공식 페이지의 이용약관을 확인한 뒤 수집기를 만듭니다.
   - NAVER 검색 결과는 API HUB 특약(가공·AI 활용·캐싱 제한)을 재확인하기 전에는 수집·순위·AI 판별 입력으로 쓰지 않습니다.
   - 올리브영 국내 사이트는 봇 차단이 있으므로 우회하지 않습니다.
2. **가격·환율:**
   - 가격 확인 시각을 저장하고, 판매처마다 따로 둡니다.
   - 통화 환산은 공식 환율 출처와 기준 시각을 함께 표시합니다. 숫자 환율을 하드코딩하지 않습니다.
   - 배송비·관세·재고는 판매처에서 최종 확인하도록 안내합니다.
3. **지도:**
   - 장소를 추가할 때는 공식 주소를 확인한 뒤 지도 API 약관 범위 안에서 좌표를 붙입니다.
   - 이동 시간을 추정해 넣지 않고 공식 지도 앱 링크로 넘깁니다.
4. **의료기관 데이터:**
   - 외국인환자유치 정보시스템의 등록·평가인증 목록은 이번 조사에서 공개 전국 API를 확인하지 못했습니다. 지자체 공공데이터(일부 지역)를 우선 검토합니다.
   - 진단·시술 적합성·회복 일정은 데이터로 만들지 않고 의료기관 안내로 넘깁니다.
5. **국가별 추천:** 국가별 배송 가능 여부(예: OLIVE YOUNG Global 배송 국가 목록)처럼 출처가 있는 사실부터 `country_codes`에 연결합니다. 상품 단위 판매 가능 여부는 별도로 확인해야 합니다.

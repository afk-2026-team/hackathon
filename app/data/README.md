# app/data — discovery 공개 근거 카탈로그

`discovery_catalog.json`은 `/v1/discovery/*` API가 읽는 소수의 큐레이션 후보입니다. 형식은 `{ "items": CatalogItem[] }`이고 계약은 `docs/plan/plan_26102413_42_12_온보딩부터_앱구현.md`를 따릅니다.

- 각 항목은 공개 공식 페이지(판매처·공공 포털)에서 2026-10-24에 확인한 사실만 담습니다.
- 인기 순위, 효능, 피부 적합성, 진단·시술 적합성, 예약 가능 여부는 담지 않습니다.
- 배열 순서는 큐레이션 순서이며 측정된 순위가 아닙니다.

## 필드 규칙

| 필드 | 규칙 |
|---|---|
| `tags` | 프론트 관심사 필터(`web/src/lib/options.ts` INTERESTS: `skincare`·`makeup`·`hair`·`dermatology`·`checkup`·`dental`·`neighborhoods`)와 맞추고 세부 태그를 덧붙입니다. 제품은 판매처 분류(예: Skincare > Moisturizers > Cream, Hair > Treatments)에 근거해 붙였습니다. 공공 의료 안내 장소(메디컬코리아·강남메디컬투어센터)는 의료 관심사 전체(`dermatology`·`checkup`·`dental`)에 걸리는 안내 창구라 세 코드를 모두 붙였습니다. |
| `id` | 안정 ID: `<category>-<brand/기관>-<제품/안내>`. 바꾸면 사용자 저장 데이터가 끊깁니다. |
| `kind` / `category` | `product` · `place` · `guide` / `beauty` · `medical`. 의료는 공공기관 안내(`guide`)와 공공 안내센터(`place`)만 넣고 개별 병원·의원은 넣지 않습니다. `category` 값이 두 개뿐이라 관광안내소(명동관광정보센터·하이커 그라운드)는 `beauty`로 두고 `provenance`에 그 이유를 적었습니다. |
| `title` / `subtitle` | 기본 UI가 영어라 `title`·`description`·`reasons`·`sources[].label`은 짧은 영어로 씁니다. `title`은 판매처·기관 표기를 따르고, `subtitle`은 한국어 제품명·기관명(매장에서 찾을 때 쓰는 이름)입니다. 제품의 한국어명은 OLIVE YOUNG Global 상품 데이터에 함께 실린 한국어 상품명에서 기획 문구(증정·한정 등)를 덜어낸 것입니다. |
| `description` / `reasons` | 출처에 적힌 사실만 씁니다. 추천 이유는 "왜 비교해 볼 만한가"를 사실로 설명하며, 효과 보장 문구는 쓰지 않습니다. |
| `image_url` | 판매처 페이지에 게시된 제품 이미지 URL입니다(파일 복사 아님). 저작권은 브랜드·판매처에 있으며 판매처 홍보 배지가 이미지에 포함돼 있습니다. 시연·연구 참조용이고, 정식 서비스 전에 이용 허락을 받아야 합니다. 없으면 `null`. |
| `price_krw` | 원화 가격을 직접 확인한 경우에만 정수로 넣습니다. ILLIYOON 6,900원은 국내 올리브영 페이지를 브라우저로 관찰한 값입니다(curl은 봇 차단 403, 우회하지 않음). OLIVE YOUNG Global은 USD만 보여 주므로 원화로 환산해 넣지 않고 `null`입니다. 묶음 상품이나 미확인 가격도 `null`이며 변동될 수 있습니다. |
| `location` | 공식 출처에서 주소를 확인한 장소만 넣습니다. `address`는 **공식 페이지에 적힌 한국어 도로명 주소**를 씁니다(NAVER 지오코딩은 영문 주소를 찾지 못함). 지오코딩이 실패하지 않도록 층·건물명 같은 덧붙임은 빼고 도로명+건물번호만 두며, 층·영문 주소는 `description`·`provenance`에 남깁니다. 좌표(`lat`·`lng`)는 넣지 않습니다 — 서버가 실행 중 NAVER 지오코딩으로 붙이고 출처를 표시합니다. 한국어 주소를 공식 출처에서 확인하지 못한 장소는 넣지 않습니다. |
| `sources[]` | `{label,url,checked_at}`. 화면에서 클릭 가능해야 합니다. |
| `sponsorship` | 근거 없이 `not_sponsored`로 두지 않습니다. 현재는 모두 `unknown`입니다. |
| `country_codes` | 해당 국가와의 관련성을 뒷받침하는 출처가 있을 때만 값을 넣습니다. 현재는 모두 `[]`이며, 국가 선호를 지어내지 않습니다. 따라서 API의 `country_context`는 대부분 `insufficient`가 맞습니다. |
| `provenance` | 출처 종류와 값별 예외를 적습니다(예: `price_krw=browser_observed_…`, `location=null(…)`). |

## 현재 항목 (491)

배열 순서는 큐레이션 순서이며 인기·측정 순위가 아닙니다.

- **beauty product 11:** (출처는 모두 OLIVE YOUNG Global 상품 페이지, ILLIYOON만 국내 페이지 가격 추가)
  - 크림: ILLIYOON Ceramide Ato Concentrate Cream 75ml · Torriden Dive-In Soothing Cream 100ml(리뉴얼) · ROUND LAB Birch Juice Moisturizing Cream 80ml(2개 묶음 SKU)
  - 선케어: Beauty of Joseon Relief Sun : Rice + Probiotics 50mL(단품 페이지에 SPF 표기가 없어 SPF는 넣지 않음)
  - 토너·에센스·마스크: Anua Heartleaf 77 Hyaluron Soothing Toner 350ml · COSRX Advanced Snail 96 Mucin Power Essence 100mL · ROUND LAB 1025 Dokdo Toner 500ml(+100ml 묶음) · MEDIHEAL W.H.P Charcoal Mineral Mask Sheet 10P
  - 메이크업: rom&nd The Juicy Lasting Tint Mini 1g(색상 옵션) · CLIO Kill Cover Founwear Cushion The Original(+리필, 19N 단일 옵션)
  - 헤어: Mise-en-Scene Perfect Serum Super Rich 80ml(단품/세트 옵션)
- **beauty product +75 (2026-10-24 대량 보강):** 스킨케어 43·선케어 3·메이크업 17·헤어 5·바디 7. 출처는 OLIVE YOUNG Global 상품 페이지(페이지가 스스로 부르는 공개 상품 데이터), 71개에 `list_price`(USD 판매가, 기간 할인 중일 수 있음), 기존 9개에도 `list_price` 보강. 바디 제품은 `body` 태그로 구분하고 얼굴용 `cleanser`·`lotion` 칩 태그는 붙이지 않음. 상세: [sources_products.md](sources_products.md)
- **beauty guide 1:** VISITKOREA 세금 환급 안내
- **medical guide 3:** Medical Korea 포털, 외국인환자 유치기관 등록 조회, 한국의료분쟁조정중재원 외국인 조정 신청 안내
- **place 5 (My Trip 지도용, 모두 한국어 도로명 주소):**
  - medical: 메디컬코리아 안내센터(서울역 공항철도 B2) — `서울특별시 용산구 청파로 378` (보건복지부 보도자료), 강남메디컬투어센터(강남구청 운영) — `서울특별시 강남구 압구정로 161`
  - beauty: 올리브영 명동 타운 — `서울특별시 중구 명동길 53` (공식 매장 페이지)
  - 관광안내(category=beauty): 명동관광정보센터 — `서울특별시 중구 을지로 66` (VISITKOREA 국문), 하이커 그라운드(한국관광공사 서울센터, 5층 관광안내센터) — `서울특별시 중구 청계천로 40`

- **medical place +196 (2026-10-24 대량 보강):** 외국인환자 유치 등록 의료기관 — 피부과 66·치과 75·상급종합/종합병원 55(서울 155·부산 32·제주 9). 출처: KHIDI 외국인환자 유치기관 현황(2026-07-21)·Medical Korea 영문 목록(data.go.kr, 이용허락범위 제한 없음), HIRA 전국 병의원 현황(공공누리 1유형 — 출처 표시 의무, 좌표), NHIS 검진기관(checkup 근거). `lat`/`lng` 는 HIRA 공식 좌표. `international_clinic` 태그는 "정부 등록" 사실이며 국제진료센터 운영 여부는 확인하지 않음(화면 라벨: 외국인환자 유치 등록). 영문명은 공식 목록 원문 그대로(오타 포함). 상세: [sources_hospitals.md](sources_hospitals.md)

- **medical place +200 성형외과 (2026-10-24, 사용자 결정으로 포함 — 기획안 §2·§7 의 의료 범위 [미정] 중 성형외과를 넣기로 함):** 위와 같은 출처·매칭 규칙. 판정은 KHIDI 상호명 '성형외과' + HIRA 종별 의원·병원 + HIRA 성형외과 전문의 1명 이상. 서울 183(강남 135·서초 46 등)·부산 13·제주 4, 좌표 HIRA 공식 값, 태그 `plastic_surgery`. 기존 종합병원 33곳에도 HIRA 성형외과 전문의 근거로 `plastic_surgery` 태그 추가. 시술 효과·가격·후기는 넣지 않음. 상세: [sources_hospitals.md](sources_hospitals.md) "성형외과 추가" 절

## 필드 추가
- `list_price`(선택): 원화 가격을 확인하지 못했을 때 판매처에 표시된 다른 통화 가격 `{amount, currency, basis, source}`. 환산해 `price_krw` 에 넣지 않는다. 화면은 통화 그대로 보여 주고 ECB 기준율 환산을 '약'으로 덧붙인다.

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

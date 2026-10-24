# staging/products — 뷰티 제품 추가분 메모 (2026-10-24, 데이터 담당 P)

## 파일
- `products.json` — 새 제품 75개 (`{ "items": CatalogItem[] }`), 기존 카탈로그 id 와 겹치지 않음.
- `products_patch.json` — 기존 카탈로그 OLIVE YOUNG Global 출처 제품 9개에 붙일 `list_price`. 다른 필드는 없음.

## 출처·수집 방법
- 모든 값은 OLIVE YOUNG Global 상품 페이지(`https://global.oliveyoung.com/product/detail?prdtNo=…`)에서 2026-10-24에 확인했다. 화해·강남언니 데이터, 순위, 리뷰, 평점, "best/인기" 배지는 쓰지 않았다.
- 상품 페이지가 브라우저에서 스스로 부르는 공개 요청(`/product/detail-data`: 영문·한국어 상품명, 카테고리 경로, 판매가, 옵션 / `/product/description-info`: 용량, 제조사, 제조국, 전성분)을 상품마다 한 번씩, 요청 간 0.7초 간격으로 받았다. 로그인·쿠키·차단 우회 없음.
- 상품번호는 (1) 같은 상품 페이지의 "관련 상품" 요청(`/product/relation-list`)이 돌려준 번호, (2) 웹 검색 결과에 나온 Global 상품 URL(Isntree 선젤)에서 찾았다. Global 검색·카테고리 목록 페이지(302/403)와 국내 올리브영은 쓰지 않았고 우회하지 않았다. 참고: `robots.txt` 자체가 curl 에 403 을 돌려줘 내용을 확인하지 못했다 — 정식 수집기 전 이용약관 확인 필요(README 후속 작업 1과 같음).
- 보조 스크립트(저장소 밖): `afk-hackathon-tools/products/{discover.py, fetch.py, spec.py, build.py}`. 원본 응답은 `afk-hackathon-tools/products/data/raw/<prdtNo>.json`.

## 필드 규칙 적용
- `title`: 판매처 영문 상품명. 앞의 판매처 홍보 접두어(`[NCT PICK!]`, `[NEW Soy Beige Core]`, `[30 SHADES/SINGLE]`, `[20 colors]`, `[Upgraded]`)만 덜어냈다.
- `subtitle`: 판매처 데이터의 한국어 상품명에서 기획 문구(증정·기획·(역)/(온)/(AD)·출시월 코드·대표 색상명)를 덜어낸 이름 · 용량. 75개 모두 판매처 한국어명이 있었다.
- `description`/`reasons`: 판매처 카테고리 경로, 용량, 제조국, 제조사/책임판매업자, 전성분에 실제로 적힌 성분명만 쓴다(빌드 스크립트가 성분명이 전성분 문자열에 있는지 검사). 판매처의 효능 문구(whyWeLoveIt·featured ingredient 설명)는 쓰지 않았다.
- `image_url`: 상품 페이지 대표 이미지(`cdn-image.oliveyoung.com/prdtImg/...`). 75개 전수 200 확인. 이미지에는 판매처 배지가 있을 수 있고 저작권은 브랜드·판매처에 있다.
- `price_krw`: 모두 `null` (USD 를 원화로 환산하지 않음).
- `list_price`: 상품의 모든 옵션 판매가가 같을 때만 그 판매가(`saleAmt`)를 USD 로 넣었다. 정가(`nrmlAmt`)·할인율은 넣지 않았다. 다수가 판매처 기간 할인(예: 2026-10-01~10-31) 중이라 값이 바뀔 수 있다.
- `tags`: 관심사 코드(`skincare`/`makeup`/`hair`) + PM 이 알려 준 세부 유형 철자 + 성분 태그. 목록에 없는 보조 태그: `mist`(페이스 미스트), `body`(바디·핸드 제품), `scalp`, `powder`, 성분 태그(`rice`, `pdrn`, `centella`, `retinol`, `retinoid`, `retinal`, `vitamin_c`, `peptide`, `bha`, `propolis`, `oat`, `squalane`, `collagen`, `hyaluronic_acid`, `ceramide`).
- 바디 제품(바디로션·바디워시·핸드크림)은 관심사 코드가 따로 없어 `skincare` + `body` 로 두었다(바디워시는 `cleanser`, 바디로션은 `lotion`). PM 판단에 따라 바꿔도 된다.
- `sponsorship: unknown`, `location: null`, `country_codes: []`.

## 구성 (75)
- 스킨케어 43: 토너 8 · 세럼/에센스/앰플 10 · 페이스 미스트 2 · 크림 10 · 아이 3 · 클렌저 6 · 시트 마스크 4
- 선케어 3 (Purito Seoul Daily Soft Touch, d'Alba Waterfull Tone-Up Blue, Isntree Hyaluronic Acid Watery Sun Gel)
- 메이크업 17: 쿠션 2 · 파운데이션 1 · 컨실러 1 · 파우더 1 · 프라이머/베이스 1 · 립 6 · 블러시 1 · 아이섀도 1 · 아이라이너 2 · 마스카라 1
- 헤어 5, 바디 7
- 같은 제품의 용량·색상 변형은 대표 1개만 넣었다. 기존 Mise-en-Scene Perfect Serum Super Rich 와 Original 은 변형으로 보고 Original 은 넣지 않았다.

## 값별 예외
- `list_price` 생략(옵션마다 판매가가 다름): LANEIGE Lip Sleeping Mask EX(19.2~20.0), WAKEMAKE Any-Proof Pen Eyeliner(12.18~16.0), CLIO Sharp So Simple Pencil Liner(7.7~13.2), Mise-en-Scene Salon 10 Peptide Repair Hair Mask(18.06~39.0). 패치에서도 Mise-en-Scene Perfect Serum Super Rich(10.91~18.0)는 제외.
- 패치 중 ROUND LAB Birch Juice Cream·1025 Dokdo Toner·CLIO Kill Cover Cushion 은 기존 항목처럼 묶음 상품 페이지라 basis 에 "bundle listing" 을 덧붙였다. ILLIYOON 은 `price_krw` 가 이미 있어 패치 제외.
- 옵션 상품(색상·타입·단품/세트)은 판매가가 같아도 옵션 구성이 다르다 — reasons 에 옵션 수를 적었다.
- TIRTIR Milk Skin Toner: 판매처 전성분·제조사가 한국어로만 실려 있어 성분명을 한국어 그대로 썼다.
- COSRX Advanced The Vitamin C 23 Serum 20g: 한국어 상품명에 "기획 (+선세럼 15ml)" 가 붙어 있으나 영문명·용량 표기는 20g 단품이라 subtitle 은 20g 으로 두었다(증정품 포함 여부는 매장 확인).
- ETUDE Duo Fixing Tint: 대표 옵션에 증정 스트레스볼(중국산)이 붙어 있고, 본품 제조국(South Korea)만 적었다.
- Purito Seoul 선크림의 SPF50+ PA++++ 는 판매처 상품명 표기 그대로이며, 다른 선케어 2개는 상품명에 SPF 가 없어 SPF 를 적지 않았다.
- AESTURA Regederm365 Retinoid Eye Serum: 전성분에 Retinol 은 없고 Hydroxypinacolone Retinoate(50ppm)가 있어 그 이름으로 적었다.

## 넣지 않은 후보
- celimax Pore + Dark Spot Brightening Cream 35ml: 제목은 35ml 인데 판매처 용량 칸이 "175ml / 80P" 로 서로 달라 보류.
- Isntree Onion Fresh Fluid Sun Cream 50mL(GA240322673): 데이터 요청이 빈 응답 — 판매 중단 가능성, 확인 못 함.
- ROUND LAB Birch Juice Moisturizing Sunscreen, SKIN1004 Hyalu-Cica Sun Serum, Beauty of Joseon Aqua Fresh: Global 에서 단품 페이지를 찾지 못하고 묶음(1+1·트리플·증정) 페이지만 확인됨.
- 세트·더블팩·한정판(Sanrio·Anpanman·miffy 에디션, "[4 DAYS ONLY]" 등)·리필 전용 SKU 는 단품 비교가 어려워 제외.
- 비한국 브랜드(The Ordinary, Eucerin, URIAGE, BIORGA)는 K-뷰티 범위 밖으로 보고 제외.
- AOU Tone-Up Dazzling Cream: 메이크업 베이스인지 스킨케어인지 판매처 분류를 확인하지 않아 보류.

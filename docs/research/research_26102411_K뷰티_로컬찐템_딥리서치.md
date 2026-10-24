---
title: K-뷰티 로컬 찐템 플랫폼 — 전략 과제 딥리서치 (데이터·광고판별·경쟁·해외마케터)
upstream: docs/strategy/strategy_26102411_K뷰티_제품_구체화.md
researched_at: "2026-10-24T11:40:00+09:00"
method: web-search 서브에이전트 4축 병렬(WebSearch·WebFetch·curl 관측) + 메인 세션 병합
---

# K-뷰티 로컬 찐템 플랫폼 — 전략 과제 딥리서치

> 입력: `docs/strategy/strategy_26102411_K뷰티_제품_구체화.md` 의 "바로 확인할 과제" 1~4 와 확장 아이디어.
> 이 문서는 **근거 자료**다. 결정은 하지 않는다. 결정은 strategy·interview 로 넘긴다.
>
> **출처 등급 표기** (축마다 조사자가 쓴 이름이 조금 다르며, 뜻은 아래와 같다)
> - `[1차]`·`[확인]`: 공식 문서·약관·정부/기업 원문을 직접 열어 확인함
> - `[2차]`: 언론·로펌·블로그 등 2차 출처
> - `[미검증]`·`[미확인]`: 검색 요약에서만 봤거나 찾지 못함. 이 등급의 수치는 피치·화면에 인용하지 말 것
> - `[실측]`: 조사 환경 IP에서 curl 로 직접 관측함. 다른 환경에서는 다를 수 있음
> - `[추정]`: 근거를 바탕으로 한 추론

## 0. 요약 (한 화면)

| 과제 | 핵심 발견 | 데모 함의 |
|---|---|---|
| 1. 데이터 확보 | 올리브영: **공개 API 없음**, 봇 차단 403 [실측], 약관이 무단 상업 이용·재배포를 금지 [1차]. 네이버 블로그 API: 25,000회/일, **`total` 은 기간 무관 누적값**이라 "최근 언급량"으로 쓸 수 없음, 쿼리당 최대 약 1,100건 [1차]. 데이터랩은 **상대지수(최댓값 100)** [1차]. YouTube: **2026-06-01 개편 후 search.list 100회/일** [1차], 자가신고 유료광고 필드 있음. Instagram API 는 앱검수·비즈니스 인증 때문에 당일 불가. TikTok oEmbed 는 무인증 [1차] | 실측 신호 = 네이버 3종 + YouTube. 올리브영 랭킹 = 수작업 스냅샷(`provenance: manual-snapshot`). IG·TikTok = 임베드만 |
| 2. 광고 판별 | 2024-12-01 시행 개정 지침: 블로그는 **제목·첫 부분 표시** 의무 [2차]. 공정위 적발 2024년 22,011건 중 **26.5% 무표시, 17.3% 이미지·작은 글씨** [2차] → 키워드 제외로는 원리상 못 잡는 몫이 큼. 한국어 블로그 협찬 라벨 공개 데이터셋 없음. 영어권 LLM 분류 F1 최대 0.93이나 애매한 사례에서 10pt 넘게 하락 [1차] | 지표명은 "광고 표시 없는 블로그 언급 수(Naver API 기준)". 원시 → 키워드 제외 → AI 분류 3단으로 보여 주고, 우리 소표본 정밀도·재현율을 별도로 적음 |
| 3. 사용자 가치·경쟁 | 2025년 방한객 1,894만 명, 쇼핑 품목 1위 향수·화장품 71.8% [2차]. 올리브영 외국인 매출 비중 2026-08 33% [2차]. **국내 Top100과 Global Top100은 32개만 겹침**(개인 분석, 1일 스냅샷) [2차]. 화해 Global 영어판 있음, 협찬 필터 공개 없음 [1차] | 차별점 = "현지에서도 인기 / 해외에서만 인기" 교차검증 배지 + 공개된 광고 필터 + 상품 단위 증거 카드 |
| 4. 해외 마케터·확장 | 수출 2025년 114억 달러(미국 1위) [2차]. 거시 리포트(Euromonitor 등)는 상품 단위 로컬 신호가 없고, 국내 도구(썸트렌드 등)는 한국어 UI뿐 → "상품 단위 + 로컬 근거 + 영어 + 출처" 조합은 이번 검색에서 경쟁자를 찾지 못함. 위치: 카카오 로컬 반경 검색 [1차]. 올리브영 재고 API 없음 | 마케터용 = 영어 요약 1페이지. 위치 = 카카오 로컬로 근처 매장까지만. 개인화 = 규칙 기반 최소 구현 |

**축 사이 상충·주의**
- 공정위 뒷광고 수치(2024년 22,011건)를 2축은 `[2차]`(국감 보도·viva100 원문)로, 3축은 `[미검증]` 으로 기록했다. 2축이 원문 기사를 직접 연 쪽이다. 인용할 때는 2축의 출처를 쓴다.
- 올리브영 매장 수: 3축 1,381개(2025 보도), 4축 "1,360개 이상"(기업 페이지 검색 요약). 시점이 다르다. 인용할 때는 기업 페이지 원문을 재확인할 것.
- 수출 통계는 모두 식약처·KHIDI 발표를 인용한 보도(2차)다. 피치에 쓰기 전에 식약처 보도자료 원문을 확인할 것.

## 1. 데이터 확보 — 무엇을 오늘 합법적·실무적으로 가져올 수 있나

표기: **[1차]** 공식 문서/약관 원문에서 직접 확인 · **[2차]** 제3자 자료 · **[미검증]** 근거를 찾지 못함 · **[실측]** 이번 조사에서 curl로 직접 관측한 것(조사 환경 IP 기준, 일반화 주의)


### 1. 올리브영 (국내 oliveyoung.co.kr / Global global.oliveyoung.com)

- **공식 공개 API·데이터 피드: 찾지 못함 [미검증 = 없음으로 추정]**. 검색해도 오픈API·개발자 포털이 나오지 않았다.
- **봇 차단 [실측]**: `www.oliveyoung.co.kr/`, `/robots.txt`, `/llms.txt`, `/store/main/getBestList.do` 가 전부 HTTP 403 + "잠시만 기다려 주세요 - 올리브영" 대기/차단 페이지를 반환했다(curl, 브라우저 UA). `global.oliveyoung.com/robots.txt` 도 403 "Access restricted"였다. 그래서 **robots.txt 내용은 확인하지 못함 [미검증]**.
  - 예외: `https://global.oliveyoung.com/display/page/best-seller` 는 200(약 315KB, title "Bestsellers | OLIVE YOUNG Global")이었다. 다만 상품 목록은 JS로 늦게 불러오는 구조로 보여 정적 HTML에서 순위를 바로 뽑기는 어렵다 [실측].
- **이용약관 [1차]** (회원 이용약관 개정 안내, 2020-07-02 시행본 — 현행본인지는 미검증): https://image.oliveyoung.co.kr/uploads/member_rule/rule.html
  - 제12조(회원의 의무) 3호: "회사가 제공하는 서비스를 통하여 얻은 정보를 회사의 사전 승낙 없이 이외의 목적으로 사용하거나 복제, 유통, 상업적으로 이용하려는 행위" 금지.
  - 제24조 ②: "서비스를 이용함으로써 얻은 정보를 회사의 사전 승낙 없이 복제, 송신, 출판, 배포, 방송 기타 방법에 의하여 영리목적으로 이용하거나 제3자에게 이용하게 하여서는 아니 됩니다."
  - '크롤링'이라는 단어를 직접 쓴 조항은 찾지 못했다. 그래도 **상업 서비스에서 랭킹을 재배포하는 것은 약관과 충돌할 위험이 높다.** 현행 약관 페이지: https://www.oliveyoung.co.kr/store/company/terms.do (403이라 본문 미확인)
- **랭킹 페이지 구조 [2차]**: 국내 랭킹은 `getBestList.do` 에 `dispCatNo=900000100100001`(전체 고정)과 카테고리 필터 `fltDispCatNo` 를 쓰고, Playwright 같은 동적 렌더링이 필요하다는 설명이 있다 — https://digitalbiztalk.com/tools/apify-actors/kitschy_marigold/oliveyoung-ranking-scraper . 카테고리 URL이 `dispCatNo` 패턴을 쓴다는 점은 검색 스니펫의 oliveyoung.co.kr/llms.txt 인용으로만 봤다 [2차, 본문 403].
- **제3자 데이터 공급원 [2차, 정확성·적법성 미검증]**
  - Apify "Olive Young Scraper"(Global, 랭킹 약 100개, $5/1K건부터): https://apify.com/kdatafactory/oliveyoung-scraper
  - Apify "K-Beauty Rankings Feed"(올리브영 Global + 글로우픽 + 화해 통합, 올리브영 레코드에는 평점·리뷰수가 null): https://apify.com/kdatafactory/kbeauty-rankings-feed
  - Apify "OliveYoung Bestseller Ranking Scraper"(국내 21개 카테고리 Top100, $2/1K건부터): https://apify.com/yohan.kim/oliveyoung-ranking-scraper
  - Bright Data "OLIVE YOUNG Global" 데이터셋(상업용): https://brightdata.com/products/datasets/olive-young
  - GitHub k-beauty-tracker(오픈소스 스크레이퍼, LICENSE 파일 미확인): https://github.com/kyungwonchai/k-beauty-tracker
  - 위 도구들은 모두 스크레이핑 기반이라 약관 리스크가 그대로 남는다.

### 2. 네이버 검색 API (블로그) / 데이터랩

#### 2-1. 블로그 검색 [1차] — https://developers.naver.com/docs/serviceapi/search/blog/blog.md
- 엔드포인트: `GET https://openapi.naver.com/v1/search/blog.json` (XML은 `.xml`).
- 인증: 헤더 `X-Naver-Client-Id`, `X-Naver-Client-Secret`(비로그인 방식). 개발자센터에 앱을 등록하면 바로 발급된다. 사용량은 클라이언트 아이디별로 합산된다.
- **일일 한도: 검색 API 전체 25,000회/일.**
- 파라미터: `query`(필수), `display`(기본 10, 최대 100), `start`(기본 1, 최대 1000), `sort`=`sim`|`date`. **기간 필터 파라미터는 없다.**
- 응답 필드: `lastBuildDate`, `total`("총 검색 결과 개수"), `start`, `display`, `items[]`{`title`, `link`, `description`(요약 패시지), `bloggername`, `bloggerlink`, `postdate`(작성일, 예 `20161208`)}.
- **`total` 을 "언급량"으로 쓸 수 있나 (해석)**: `total` 은 기간을 가리지 않는 누적 검색 결과 수다. "최근 N일 언급량"이 아니다. 문서에 정확도 보장 표현도 없다 [미검증]. 최근 언급량은 `sort=date` 로 받아 `postdate` 가 기간 안에 드는 글을 세는 방식이 현실적이다. 단, 쿼리 하나로 닿는 범위는 `start≤1000`, `display≤100` 이므로 최대 약 1,100건이다. 인기 키워드는 짧은 기간만 셀 수 있다.
- 광고·협찬 구분 필드는 없다(문서의 필드 목록 기준) [1차]. 따라서 "협찬/원고료" 같은 공지 문구를 `description` 에서 찾는 휴리스틱이 필요하다. 다만 description 은 요약이라 공지 문구가 빠질 수 있다 [미검증].

#### 2-2. 데이터랩 통합 검색어 트렌드 [1차] — https://developers.naver.com/docs/serviceapi/datalab/search/search.md
- `POST https://openapi.naver.com/v1/datalab/search`, **하루 1,000회**.
- `startDate` 는 2016-01-01부터. `timeUnit`=`date`|`week`|`month`(일간·주간·월간). `keywordGroups` 는 최대 5쌍, 그룹마다 keywords 최대 20개. `device`(pc/mo), `gender`(m/f), `ages` 로 필터할 수 있다.
- **`ratio` 는 상대값이다**: "구간별 결과에서 가장 큰 값을 100으로 설정한 상댓값". 절대 검색량이 아니다. 같은 요청에 묶은 최대 5그룹끼리만 비교할 수 있다.

#### 2-3. 데이터랩 쇼핑인사이트 [1차] — https://developers.naver.com/docs/serviceapi/datalab/shopping/shopping.md
- **하루 1,000회**. `startDate` 는 2017-08-01부터. `timeUnit` 은 일·주·월.
- 분야별 트렌드(`/v1/datalab/shopping/categories`)의 `category` 는 최대 3쌍이다. 분야 코드는 네이버쇼핑 URL의 `cat_id` 값이다. 기기·성별·연령별 하위 엔드포인트(예 `/v1/datalab/shopping/category/device`)와 키워드별 엔드포인트도 있다.
- `ratio` = "구간별 클릭량의 상대적 비율"(최댓값 100). 검색량이 아니라 **쇼핑 클릭량**의 상대 지수다.
- 키워드 엔드포인트의 키워드 개수 상한은 이번에 확인하지 못했다 [미검증].

### 3. 숏폼 영상

#### 3-1. YouTube Data API v3 [1차]
- **쿼터 (2026-06-01 개편)**: search.list 와 videos.insert 가 별도 버킷으로 분리됐다. 쿼터 계산기 현행본 기준 **search.list 는 기본 하루 100회(호출당 1)**, 그 밖의 엔드포인트는 합산 **하루 10,000 units** 이다. 리셋은 태평양시 자정. 페이지를 넘길 때마다 호출 1회로 계산된다.
  - https://developers.google.com/youtube/data/determine_quota_cost · 개정이력 https://developers.google.com/youtube/v3/revision_history (2026-06-01 granular quota, 2026-06-03 `videos.batchGetStats` 신설: 자체 버킷 10,000/일)
  - ⚠ 2026년 이전 자료의 "search.list = 100 units"는 이제 맞지 않는다. 핵심 변화는 **검색은 하루 100회뿐**이라는 점이다.
- **Shorts 처리**: 공식 Shorts 필터는 없다. `videoDuration=short` 는 "4분 미만"이라 Shorts 와 일치하지 않는다(근사치) — https://developers.google.com/youtube/v3/docs/search/list . Shorts 조회수는 2025-03-31부터 "재생 시작·반복 재생" 기준으로 집계된다(revision_history).
- **광고 분리에 유용함**: search.list 에 `videoPaidProductPlacement=true` 필터("크리에이터가 유료 프로모션으로 표시한 영상")가 있다. videos 리소스에는 `paidProductPlacementDetails.hasPaidProductPlacement` 가 있다 — https://developers.google.com/youtube/v3/docs/videos . **크리에이터가 스스로 신고한 값**이라 표시가 빠진 협찬은 잡지 못한다.
- `regionCode=KR`, `relevanceLanguage=ko`, `publishedAfter` 로 "한국 최근" 범위를 좁힐 수 있다. `pageInfo.totalResults` 는 "근사치, 최대 1,000,000"이라 언급량 지표로 쓰기에 부적합하다(search/list 문서).
- 임베드: `videos.list` 의 `player.embedHtml` 이나 IFrame 플레이어를 쓴다. 정책상 플레이어 기능을 수정·차단하면 안 되고, API 데이터는 30일 안에 삭제하거나 갱신해야 하며, 스크레이핑은 금지다 — https://developers.google.com/youtube/terms/developer-policies (III.E.4, III.E.6, III.I).

#### 3-2. Instagram (Graph API 해시태그 검색 / oEmbed)
- 해시태그 검색 [1차]: **Business 또는 Creator 계정 1개당, 7일 롤링 기간에 고유 해시태그 30개**까지다. 앱 검수(Instagram Public Content Access)와 `instagram_basic` 권한이 필요하다 — https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-facebook-login/hashtag-search . Stories 는 지원하지 않는다.
- oEmbed [1차]: `GET graph.facebook.com/instagram_oembed`, **시간당 1,000회**. 비공개·비활성·연령제한 계정, Stories 는 지원하지 않는다. **메타데이터는 프런트엔드 표시에만 쓸 수 있고 분석 용도는 금지**다 — https://developers.facebook.com/docs/instagram-platform/oembed
- "Meta oEmbed Read" 기능 [1차]: **앱 검수를 통과하고 비즈니스 인증을 마쳐야** 라이브 데이터를 쓸 수 있다 — https://developers.facebook.com/docs/features-reference/meta-oembed-read
- 2025-11-03부터 `thumbnail_url` 같은 필드가 제거됐다는 보고가 있다 [2차] — https://meta.discourse.org/t/configure-an-app-token-for-instagram-oneboxes/223548 (1차 레퍼런스의 필드 목록에도 thumbnail 이 없다: https://developers.facebook.com/docs/graph-api/reference/instagram-oembed)
- **결론**: 앱 검수와 비즈니스 인증 때문에 하루 안에 API로 연동하기는 사실상 불가능하다. 데모에서는 **Instagram이 공식 제공하는 "퍼가기" 임베드 HTML을 게시물마다 손으로 복사**해 넣는 것이 현실적이다. 이 경로가 약관상 허용되는지는 이번에 확인하지 못했다 [미검증].

#### 3-3. TikTok
- 임베드/oEmbed [1차]: `GET https://www.tiktok.com/oembed?url=<영상 URL>`. 문서에 인증·승인 요구가 언급되지 않는다. 응답에 `html`(iframe), `embed_product_id` 등이 있다. 문서에 "Embed Videos will be deprecated soon"이라고 적혀 있고 신규 연동에는 Embed Player 를 권장한다. 앱에서 삭제된 영상은 임베드도 막힌다 — https://developers.tiktok.com/doc/embed-videos
- Research API [1차]: 미국·EEA·영국·캐나다·스위스의 학술기관, 일부 EU 비영리 연구기관, 브라질(청소년 안전 연구)만 대상이다. "Be independent of commercial interests" 조건 때문에 **해커톤 팀은 자격이 없다** — https://developers.tiktok.com/products/research-api/
- Display API [2차]: 로그인한 사용자 **본인** 영상만 다룬다. 앱 승인도 필요하다. 임의 영상 검색에는 쓸 수 없다 — https://thetoolstrunk.com/does-tiktok-have-an-api/

### 4. 기타 한국 뷰티 신호원

- **화해(버드뷰)**: 공개 API는 찾지 못했다 [미검증]. robots.txt [실측, 1차]는 `Disallow: /api/`, `/hwahae-rank`, `/hwahae-award`, `/product-search`, `/goods-view` 등으로 **랭킹 경로의 크롤링을 명시적으로 막고** 있다 — https://www.hwahae.co.kr/robots.txt . 랭킹은 매주 목요일에 발표하고 산정 기준은 비공개다 [1차 블로그] — https://blog.hwahae.co.kr/all/how-to/tip/1805
- **글로우픽**: 공개 API는 찾지 못했다 [미검증]. robots.txt 요청이 403이었다 [실측]. 리뷰 데이터는 자체 서비스에만 쓰는 것으로 보인다 [2차] — https://cosmorning.com/news/article.html?no=35470
- **무신사 뷰티**: 랭킹 API는 자사 앱·웹용 내부 API로만 설명된다 [1차 뉴스룸] — https://newsroom.musinsa.com/newsroom-menu/2024-0826-teammusinsa . robots.txt 요청은 Cloudflare 차단 403이었다 [실측].
- **카카오(다음 검색 API)** [1차/2차 혼재]: `GET https://dapi.kakao.com/v2/search/blog` 가 있다. 응답의 `meta.total_count`(검색된 문서 수), `pageable_count`(노출 가능 수), 문서별 `datetime`(작성시간) [1차] — https://developers.kakao.com/docs/latest/ko/daum-search/dev-guide . 블로그는 page 최대 50, size 최대 50 [1차, 같은 문서]. 쿼터는 다음 검색 전체 50,000/일, 블로그 30,000/일 [2차: 검색 요약, 원문 확인 권장] — https://developers.kakao.com/docs/latest/ko/getting-started/quota . 네이버를 보조하는 두 번째 블로그 언급 신호로 쓸 수 있다.
- **Google Trends**: 공식 Trends API 는 **알파 단계이고 신청한 곳만 쓸 수 있다**(2025-07-24 발표). 상대 지수, 5년 롤링, 일·주·월·연 집계, 지역 필터를 제공한다 — https://developers.google.com/search/apis/trends , https://developers.google.com/search/blog/2025/07/trends-api . 당일 승인은 기대하기 어렵다 [추정]. 비공식 pytrends 는 공식 API가 아니다(안정성·약관 미검증).


### 데모 당일 권고

1. **바로 쓸 수 있는 실측 신호는 네이버 3종(블로그 25,000/일, 데이터랩·쇼핑인사이트 각 1,000/일)과 YouTube로 고정**한다. 키 발급이 즉시 끝나고 1차 문서로 한도가 확인된다. 카카오 블로그 검색은 선택적 보조 신호로 둔다.
2. **올리브영 랭킹은 라이브 크롤링하지 않는다.** 봇 차단(403)과 약관 제12조·제24조(사전 승낙 없는 상업적 이용·재배포 금지)가 걸린다. 데모는 사람이 공개 랭킹 화면에서 옮긴 소량 스냅샷을 `provenance: manual-snapshot` 같은 출처 표시와 수집 일시를 붙여 쓴다. 서비스화하려면 제휴나 데이터 라이선스를 별도 과제로 남긴다.
3. **"언급량"은 `total` 이 아니라 `sort=date` + `postdate` 기간 집계로 정의**한다. 그 값이 최대 약 1,100건 상한에 걸려 잘렸을 수 있다는 점(`truncated` 플래그)도 함께 표시한다. 검색량은 데이터랩의 상대 지수(최댓값 100)임을 UI에 명시한다.
4. **YouTube는 search.list 하루 100회가 병목**이다. 데모 상품 10~20개만 미리 검색해 videoId 를 캐시하고(30일 규칙 준수), 통계는 videos.list 로 갱신한다. `videoPaidProductPlacement` / `hasPaidProductPlacement` 를 "광고 신호(자가 신고)"로 노출한다.
5. **Instagram·TikTok은 API 연동 대신 임베드만** 쓴다. TikTok은 oEmbed(인증 없음)로, Instagram은 공식 퍼가기 HTML을 손으로 큐레이션한다. Research API, 해시태그 검색, oEmbed Read 는 자격·검수 때문에 당일 진행이 불가능하므로 범위 밖으로 선언한다.

## 2. 광고 판별 — 협찬·뒷광고를 얼마나 걸러낼 수 있나

> 표기: **[확인]** = 1차 출처(공정위·정부·논문 원문·공식 API 문서)에서 직접 확인 · **[2차]** = 언론·로펌·블로그 요약 · **[미확인]** = 검색 요약에서만 봤고 원문 대조 못 함.
> 수치는 출처에 있는 것만 적었다. 출처에 없는 수치는 "수치 없음"으로 남겼다.

### 1. 공정위 「추천·보증 등에 관한 표시·광고 심사지침」

#### 연혁
- **2020-06-22 개정, 2020-09-01 시행** — SNS 매체별 표시 방법(사진·동영상 포함)을 규정함. 공정위가 2020-08-31 「경제적 이해관계 표시 안내서」를 배포함. [확인] https://www.consumer.go.kr/user/bbs/consumer/1/117/bbsDataView/2525.do?page=4 · 안내서 원문: https://www.ftc.go.kr/www/selectReportUserView.do?key=10&rpttype=1&report_data_no=8706
  - 배경은 2020년 7월부터 이어진 유튜버 "뒷광고" 사태(한혜연·강민경, 이어 참PD가 폭로)와 2020-08-24 공정위원장의 인플루언서 간담회. [2차] https://en.wikipedia.org/wiki/2020_Korean_YouTube_backdoor_advertising_controversy
  - 그보다 앞선 2019년 12월, 인스타그램 대가 미표시에 대한 첫 법 집행이 있었음. 7개 사업자에 과징금 총 2억 6,900만 원. 아모레퍼시픽·LG생활건강 등 **화장품 업체가 포함**됨. [확인] https://www.ftc.go.kr/www/selectBbsNttView.do?bordCd=3&key=12&nttSn=41303&pageIndex=6&pageUnit=10&rltnNttSn=46018&searchCnd=all&searchViolt=0609
- **2024-11-15 개정 발표, 2024-12-01 시행** (행정예고 2024-08-20~09-09). [확인: 보도자료 제목·일자] https://www.korea.kr/briefing/pressReleaseView.do?newsId=156660604 · [2차: 내용] https://www.kimchang.com/ko/insights/detail.kc?sch_section=4&idx=30241 · https://www.seoul.co.kr/news/economy/2024/11/15/20241115500074
  - 블로그·카페 같은 **문자 중심 매체는 "게시물의 제목 또는 첫 부분"에 표시**해야 함. 그전에는 첫 부분 또는 끝 부분이 허용됐음. 개정 사유는 모바일의 '더보기'에 표시가 가려진다는 것.
  - 제목에 넣을 때는 표시문구가 잘리지 않아야 함. 첫 부분에 넣을 때는 글자 크기나 색을 본문과 다르게 해야 함.
  - "소정의 수수료를 지급받을 수 있음" 같은 **조건부·모호한 표현은 부적절**함.
  - **미래·조건부 대가도 표시 대상**: 할인코드·구매링크 판매 수수료, 후기 작성 뒤 구매대금 환급("페이백").
  - 개정은 **소급 적용되지 않음**. 2024-12-01 이전 게시물은 끝 부분 표시도 당시 기준으로 적법이었을 수 있음. → 시계열을 볼 때 표시 위치 분포가 이 날짜를 경계로 바뀜. [2차]
- **2026-05-31 발표, 2026-06-01 시행: AI 가상인물 표시 의무.** 문자 매체는 제목이나 첫 부분에 "AI를 기반으로 생성된 가상인물이 포함된 게시물입니다" 등을 표시해야 함. [2차] https://www.fnnews.com/news/202605311349189793 (행정예고 2026-04-08: https://www.ddaily.co.kr/page/view/2026040811563569528)
- 2025-12-02 개정 안내서 「Q&A로 알아보는 경제적 이해관계 표시」가 배포됐다는 블로그 주장이 있음. [미확인] https://bizvian.com/sponsored-review-rules/

#### 표시 문구 패턴 (키워드 사전 후보)
- **권장 방향**: "협찬", "광고", "#광고 #협찬", "업체로부터 원고료를 제공받아 작성된 글"처럼 대가 관계를 구체적으로 적는 형태. [2차] https://www.saladentreport.co.kr/news/articleView.html?idxno=2759 · 서울신문(위)
- **부적절로 명시된 표현**: "체험단", "Thanks to", "소정의 수수료를 지급받을 수 있음". [2차] 위키백과(위), 서울신문(위)
  → **이 단어들은 지금도 실제 글에 쓰이므로** 제외 사전에 넣어야 함. 법적으로 부적절한 표현이라도 광고 신호인 것은 같음.
- 실무에서 흔한 문구(사전 후보, 출처 아닌 관찰 기반 목록): "소정의 원고료", "제품을 제공받아", "업체로부터 … 제공받아", "금전적 지원", "무상 제공", "협찬", "광고", "체험단", "서포터즈", "원고료", "#ad", "#sponsored", "유료광고 포함"(유튜브 라벨). [미확인: 빈도 근거 없음]
- 체험단 플랫폼은 리뷰어에게 **포스트 하단 "스폰서 배너(이미지)"** 삽입을 요구하기도 함. 이 배너는 플랫폼 요구사항일 뿐 법정 표시(제목·첫 부분)를 대신하지 못함. [2차] https://modootogether.com/notice_view.php?no_id=4 · https://incomeflowlab.com/guides/blog-sponsorship-experience-group

### 2. 뒷광고(미표시·부적절 표시) 규모 — 공정위 모니터링

- **연도별 적발(뒷광고 의심 게시물)**: 2021년 17,020 · 2022년 21,037 · 2023년 25,966 · 2024년 22,011 · 2025년 22,675, 합계 108,709. [2차: 2026-10-21 국감, 박성훈 의원실이 공정위에서 받은 자료] https://www.sentv.co.kr/article/view/sentv202610210017 · https://www.hankyung.com/article/202610215513H
- **2024년 상세** (공정위 발표 2025-03-16, 한국인터넷광고재단 위탁): [2차] https://www.viva100.com/article/20250316500387
  - 플랫폼별: 인스타그램 10,195 · **네이버 블로그 9,423** · 유튜브 1,409.
  - 유형별: 더보기·설명란·댓글 등 **잘 안 보이는 위치에 표시 10,553건(39.4%)** · **아예 미표시 7,095건(26.5%)** · **작은 글자·흐릿한 이미지로 표시 4,640건(17.3%)**.
  - 품목별: 보건·위생용품 5,200(23.6%), 의류·섬유·신변용품 4,774(21.7%), 식료품 2,492(11.3%). 이 기사에는 **'화장품' 단독 분류 수치가 없음**.
  - 시정 26,033건 (적발 건수보다 많음. 집계 기준이 다른 것으로 보임).
- 2025년 품목별: 기타 서비스(식당·미용실) 5,791(25.5%), 의류·섬유·신변용품 3,725, 보건·위생용품 3,500. [2차] sentv(위)
- **팀이 해석할 때 주의할 점**
  - 이 수치는 **공정위가 표본 모니터링으로 "찾은" 건수**임. 전체 모집단 대비 비율이 아니므로 "블로그의 X%가 뒷광고"로 환산할 수 없음.
  - 그래도 유형 분포가 보여 주는 것은 분명함. 적발 건의 26.5%는 **표시 문구가 아예 없어서** 키워드 제외로 원리상 잡을 수 없음. 17.3%는 **이미지·작은 글자로 표시돼서** 텍스트 키워드로 놓치기 쉬움. → 키워드 제외는 하한(lower bound) 보정일 뿐임.

### 3. 탐지 연구·도구

#### 한국어(네이버 블로그 등)
- **AD Finder: 머신러닝을 활용한 실시간 광고성 블로그 리뷰 탐지 프로그램** (조민서·박상근, 경희대, KCC 2024 논문집 pp.2346–2348). [확인: 서지] https://www.dbpia.co.kr/journal/articleDetail?nodeId=NODE11862532 · 캡스톤 보고서 http://uxc.khu.ac.kr/file/capston/%EC%A1%B0%EB%AF%BC%EC%84%9C_2023_2.pdf
  - 이미지 수, 동영상 여부, 댓글 수 등 블로그 특징 8개로 분류함. 협찬 문구 변수에 모델이 지나치게 의존한다는 한계를 스스로 지적함. [미확인: 검색 요약 기준, PDF 텍스트 추출 실패] **성능 수치 확인 못 함.**
- **광고 글 필터링 모델 적용 및 성능 향상 방안** (한국산학기술학회논문지 21권 11호). KorBERT를 쓰고 데이터는 **네이버 지식iN 답변**(블로그 아님). 정확도 89.2%, 정밀도 84.3%. [미확인: 검색 요약 수치, 원문 대조 못 함] https://www.kais99.org/jkais/journal/Vol21No11/vol21no11p01.pdf
- **기계학습기법을 이용한 광고 외식 블로그의 자동분류** (KCI, 2016). 성능 수치 확인 못 함. [확인: 서지만] https://www.kci.go.kr/kciportal/ci/sereArticleSearch/ciSereArtiView.kci?sereArticleSearchBean.artiId=ART002103668
- 상업성 블로그 예측(블로거 행동 특성 기반 ML), Knowledge Management Research 2020. 수치 확인 못 함. [확인: 서지만] https://www.koreascience.or.kr/article/JAKO202029565519184.pdf
- "KoBERT 기반 웹 확장 프로그램을 이용한 블로그 리뷰의 광고성 판별 시스템" (한국컴퓨터정보학회 2024 하계). [미확인: 서지만 검색에서 봄]
- **공개 데이터셋**: 네이버 블로그 협찬 라벨 데이터셋은 찾지 못함 (선행 근거 없음).
- 이미지 배너(레뷰·리뷰노트 등 체험단 스탬프) **OCR·이미지 분류로 탐지한 연구는 찾지 못함** (선행 근거 없음). 기법 자체는 가능하지만 성능 근거가 없음.

#### 영어권(Instagram·YouTube 등)
- **Zarei et al., "Characterising and Detecting Sponsored Influencer Posts on Instagram"** (arXiv 2011.05757, 2020). 인플루언서 약 12K 계정, 포스트 35K를 모니터링함. Contextual LSTM의 **F1 0.89** (정밀도 0.88, 재현율 0.87), Random Forest는 F1 0.83. 모델이 **표시 없는 협찬 의심 포스트 약 3.8K건(약 17.7%)**을 찾았고, 그중 절반을 사람이 검수하니 81%가 실제 홍보, 11%가 오탐, 8%가 판정 불가였음. [확인] https://ar5iv.labs.arxiv.org/html/2011.05757
- **Kim, Jiang, Wang, "Discovering Undisclosed Paid Partnership on Social Media via Aspect-Attentive Sponsored Post Learning"** (WSDM 2021). 텍스트·이미지·인플루언서-브랜드 그래프를 결합함. [확인: 서지] 수치는 확인 못 함.
- **Gui et al., "Evaluating LLM-Generated Legal Explanations for Regulatory Compliance in Social Media Influencer Marketing"** (arXiv 2510.08111, 2025). 인스타그램 1,143건, gpt-5-nano·gemini-2.5-flash-lite로 협찬 여부를 분류했고 **F1 최대 0.93**. **애매한 사례에서는 10포인트 넘게 하락**함. 추론 오류 유형 중 "hidden ads" miscue가 28.57%로 가장 높았음. 프롬프트에 법령을 넣어도 탐지 정확도는 일관되게 오르지 않았음. [확인] https://arxiv.org/abs/2510.08111
- **Gui et al., "Across Platforms and Languages: Dutch Influencers and Legal Disclosures on Instagram, YouTube and TikTok"** (ASONAM 2024). 인플루언서 150명, 포스트 292,315건. 결론은 "generally underdisclosed". [확인] https://arxiv.org/abs/2407.12451
- 해시태그 표시 기반 협찬 식별은 "high-precision, conservative lower bound"라는 지적이 있음. [미확인: 검색 요약] https://arxiv.org/html/2610.06164v1
- Twitter 미표시 비율 연구(Marketing Science, "How Much Influencer Marketing Is Undisclosed?"). [미확인: 원문 403] https://pubsonline.informs.org/doi/fpi/10.1287/mksc.2024.0838
- 주의: 위 F1들은 데이터셋·라벨 기준이 달라서 **서로 비교할 수 없고, 한국어 블로그로 옮겨 쓸 수도 없음.**

### 4. 알려진 함정

- **이미지 속 표시**: 공정위 2024년 적발의 17.3%가 "작은 글자 또는 흐릿한 이미지" 표시임. 체험단 플랫폼은 하단 배너 이미지를 요구함. → 텍스트만 보면 놓침. OCR/VLM이 필요함. [2차] viva100(위), modootogether(위)
- **네이버 검색 API의 한계** [확인] https://api.ncloud-docs.com/docs/naver-api-hub-search-blog.md
  - `description`은 "블로그 포스트 내용을 요약한 패시지 정보"일 뿐 **본문 전체가 아님**. 첫 부분 표시 문구가 스니펫에 들어갈 수도 있지만 보장되지 않음. 이미지는 아예 없음.
  - `display` 최대 100, `start` 최대 1000 → 한 쿼리로 **최대 약 1,100건**만 회수됨. `total`은 "총 검색 결과 개수"이지 회수 가능한 건수가 아님.
  - 일일 호출 25,000회. 정렬은 `sim` 또는 `date`.
  - → "제외 전/후 건수"를 **`total` 기반 쿼리 차이**(예: `-협찬` 연산자)로 낼지, **회수한 표본 안의 비율**로 낼지를 명확히 해야 함. 둘은 다른 측정임. 네이버 검색 연산자가 API에서 어떻게 동작하는지는 확인 못 함 [미확인].
- **본문 크롤링**: 전체 본문과 이미지를 보려면 각 포스트를 가져와야 함(이용약관·속도 제한 검토 필요. 이번 조사 범위 밖).
- **체험단 플랫폼 생태계**: 레뷰·리뷰노트·모두모여체험단 등이 제품 제공의 대가로 리뷰를 대량 생산함. 적법하게 표시해도 "협찬" 대신 "체험단"을 쓰거나 표시를 하단 배너로만 하는 경우가 있음. [2차]
- **시점 경계**: 2024-12-01 이전 글은 끝 부분 표시가 허용됐음 → 스니펫·첫 부분만 보는 방식은 옛 글에서 재현율이 더 낮음. [2차, 추론]
- **간접 대가**: 구매링크 수수료·페이백도 경제적 이해관계임 → "#제휴링크", "쿠팡 파트너스 활동의 일환으로…" 같은 문구도 사전에 넣어야 함. [2차: 개정 내용] / [미확인: 구체 문구]
- **반대 방향 오류**: "내돈내산"이라고 적었다고 진짜 구매가 되는 것은 아님. 2026년 국감에서 보도된 뒷광고들이 '내돈내산' 위장 사례였음. [2차] https://www.sentv.co.kr/article/view/sentv202610210017
- **근본 한계**: 표시 문구가 없는 글이 "실제 구매"를 뜻하지 않음. 미표시 광고, 구매 없는 언급, 질문 글, 재판매자 글이 섞여 있음.

### 데모 당일 권고

- **지표 이름을 정직하게**: "실구매 수"나 "진짜 인기"가 아니라 **"광고 표시 문구가 없는 블로그 언급 수(Naver API 검색 결과 기준)"** / "Mentions without sponsorship disclosure"로 부른다. 화면에 "구매를 증명하지 않음 · 미표시 광고가 섞여 있을 수 있음"을 상시 표기한다.
- **하한·상한으로 보여주기**: 원시 언급 수 → 키워드 제외 후 → (AI 분류 후) 3단을 보여 준다. 공정위 2024년 적발의 26.5%가 무표시, 17.3%가 이미지·작은 글자 표시였다는 점을 근거로 "키워드 제외는 광고를 덜 걸러낸 상한값"이라고 설명한다. 단, 이 비율을 우리 데이터에 곱하는 보정은 하지 않는다(모집단 비율이 아님).
- **출처 표시 필드**: 모든 수치에 `provenance`(measured/estimate)와 `count_source`(`naver_api_total` vs `sampled_items`), 수집 일시, 쿼리, 사용한 키워드 사전 버전을 붙인다. AI 분류 결과는 `estimate`이며, 직접 검수한 소표본의 정밀도·재현율을 같이 적는다(논문 F1을 우리 성능처럼 인용하지 않는다).
- **키워드 사전 공개**: "협찬·광고·원고료·제공받아·체험단·서포터즈·Thanks to·수수료·파트너스" 등 사전 전문과 한계(이미지 배너·스니펫 절단 미탐)를 데모에서 보여 준다. 질문이 나오면 "스니펫 기반이라 본문·이미지 표시는 못 봄"이라고 먼저 말한다.
- **비교는 상대 순위로**: 절대 건수보다 제품 간 상대 순위와 광고 비중(표시 글 비율)을 보여 준다. "광고 비중이 높은 제품" 자체를 외국인에게 유용한 신호로 제시한다.

## 3. 사용자 가치·경쟁 — 우리만 보여줄 수 있는 것

표기: **[확인]** 1차 출처(기업·정부 발표 원문)를 직접 열어 확인함 / **[2차]** 언론·블로그 원문을 열어 확인함(1차 출처는 미확인) / **[미검증]** 검색 요약에서만 봤고 원문은 열지 않음. 숫자는 출처에 있는 값만 옮겼다.

### 1. 관광객 수요

#### 방한 외래객
- 2025년 연간 외래객은 1,894만 명으로 역대 최대다. 2026년 1~9월은 1,711만 명으로 전년 동기(1,408만 명)보다 21.5% 늘었다. 1~9월 국적 순위는 중국 547만, 일본 312만, 대만 186만, 미주 162만, 유럽 119만 명이다. 같은 기간 관광 관련 카드 지출은 15.94조 원으로 47.7% 늘었다. **[2차]** https://www.koreatimes.co.kr/lifestyle/travel-food/20261022/foreign-visitors-to-korea-top-171-mil-through-september-closing-in-on-2025-level
- 2025년 12월에 정부가 낸 연간 전망치는 1,870만 명이었다(2019년 기존 최고 1,750만 명). **[미검증]** https://www.mcst.go.kr/site/s_notice/press/pressView.jsp?pSeq=22165

#### 쇼핑 품목 중 화장품
- 「2025 외래관광객조사 4분기 잠정 보고서」 기준으로 쇼핑 참여율은 79.2%, 쇼핑 품목 1위는 향수·화장품(71.8%), 2위는 의류(48.0%)다. **[2차]** https://fashionbiz.co.kr/article/225640 (2026-04-21)
  - 연도별 향수·화장품 비율은 2019년 69.7%, 2023년 61.6%, 2024년 68.3%로 계속 1위였다. **[미검증]** (검색 요약)
  - 2025년 최종 보고서 PDF는 2026-05-26에 등록돼 있지만 열어 보지 않았다. **[미검증]** https://touraz.kr/statistics?bbsSeq=310303_1127&boardMode=V
- 한국관광공사 카드 데이터(2025년 1~9월, 전년 대비)에 따르면 쇼핑은 관광 지출의 51%를 차지한다. 뷰티·헬스 결제 건수는 40.4% 늘었고, 그중 화장품은 35%, 약국은 67%, 건강식품은 75.1% 늘었다. 1회 결제액은 2019년 15만 원에서 2025년 12만 원으로 줄었다. 즉 소액으로 여러 번 사는 패턴이다. **[2차]** https://www.newspim.com/news/view/20251216000161
- 2024년 조사에서 정보를 얻는 경로는 SNS 30.5%, 동영상 사이트 17.3%, 글로벌 포털 16.0% 순이었다. **[미검증]** https://kbthink.com/investment/deepdive/research/250714-3.html

#### 올리브영 외국인 매출
- 2025년 별도 매출은 5조 8,335억 원(+21.8%)이다. 방한 외국인 매출은 1~11월 누계 1조 원이었고, 매출 중 외국인 비중은 2024년 21%에서 2025년 28%로 올랐다. 매장 수는 1,381개다. **[2차]** https://byline.network/2026/03/19_cjoliveyoung-2/
- 2026년 1~8월(올리브영 발표, 2026-08-31 보도) **[2차]** https://www.dailian.co.kr/news/view/1684349/
  - 외국인 누적 구매액이 1조 원을 넘었다. 작년보다 3개월 빠르다. 결제는 1,101만 건이고, 매출은 전년 동기 대비 47% 늘었다.
  - 외국인 매출 비중은 2022년 2%에서 2026년 8월 33%가 됐다.
  - 구매 국적은 192개국이다. 상위 5개국은 **미국·싱가포르·일본·중국·태국**이다(GTF 세금 환급 데이터 기준).
  - 1인 평균 6개 상품을 사고, 35%는 한 번에 10만 원 이상 결제한다. 5월 자체 설문에서는 1인당 평균 2.8개 매장을 방문했다. 인기 카테고리는 기초 > 색조 > 헤어 순이다.
  - 지역 매장의 외국인 매출 증가율은 강원 +105%, 경주 +88%, 대전 +80%, 전주 +62%다.
- 2024년 외국인 매출은 전년 대비 +140%였다. 국적별로는 이탈리아 +250%, 스페인 +226%, 멕시코 +400%가 늘었다. **[미검증]** https://corp.oliveyoung.com/ko/news/45

#### 올리브영의 관광객 대응
- '글로벌관광상권' 매장은 151개(2026년 8월, 전체의 10% 이상)다. 이 매장에는 외국어 가능 직원과 다국어 안내문을 둔다. 6월부터 서울 일부 매장에 8개 언어 음성을 지원하는 'AI쇼핑 어시스턴트'를 들였다. **[2차]** (위 데일리안)
- 즉시 세금 환급은 일부 매장에서만 된다(121개, 2025년 6월 기준). 실물 여권과 1만 5천 원 이상 구매가 필요하다. **[2차]** https://lacha.co.kr/korea-guide/en/olive-young-foreigner-shopping-tips/
- 명동 매장은 하루 평균 약 3,000명이 찾고 약 90%가 외국인이라는 VisitKorea 자료가 있다(약 2년 전 자료). **[미검증]** VisitKorea 페이지(HTTP 400으로 열리지 않음)
- 올리브영N 성수의 체험 이용객 약 70%, 피부 진단 이용객 97%가 외국인이라는 보도가 있다. **[미검증]** https://www.harpersbazaar.co.kr/article/1876558 등
- "K-Beauty must-buy" 같은 공식 큐레이션 리스트는 이번 조사에서 1차 출처를 찾지 못했다. 공개된 must-buy 리스트는 대부분 제3자 블로그(Klook, KKday, Trazy 등)가 만든 것이다.

### 2. 경쟁·대체재

| 서비스 | 보여주는 것 | 한국 내 인기 근거 | 외국어 | 광고 표시·필터 |
|---|---|---|---|---|
| 올리브영 국내 웹·앱 랭킹 | 실시간·주간 판매 랭킹, 리뷰 | **있음** (판매 기반, 리뷰 수가 많음) | 국내 앱은 한국어만. 회원 가입에 한국 번호·외국인등록번호 필요 [2차] | 체험단 리뷰 표시가 있다고 알려져 있으나 이번 조사에서 미확인 |
| 올리브영 Global Mall | 해외 배송몰, 자체 베스트셀러 | **없음**. 해외 구매자 기준 별도 차트 | 영어, USD | 미확인 |
| 화해 Global 웹 | 카테고리 랭킹, 어워드, 리뷰 880만 건(LLM 번역), 성분, AI 추천 | **있음** (국내 리뷰 기반) | 영어(2024-11 출시). 일본어는 2025년 예정. 앱은 한국어만 [확인] | "Clean Review Policy"를 내세움. 광고·협찬 필터는 언급 없음. 광고 사업을 겸함 [확인] |
| 글로우픽 | 사용자 리뷰 기반 랭킹, 어워드 | **있음** | 영어 미지원 답변 vs 앱스토어 "KO+1" 표기로 엇갈림 [미검증] | 샘플링 이벤트를 운영함. 외부에 유료 리뷰 대행 업체가 존재 [미검증] |
| GlowOlive 등 영어 다이제스트 블로그 | 올리브영 국내 랭킹 Top5를 주 1회 스크린샷해 영어·7개 언어로 해설 | **있음** (수작업 스냅샷) | 다국어 | 제휴 링크 수수료를 고지함 [2차] |
| Creatrip | 여행 가이드, 올리브영 추천 블로그, 약국 제휴, 배달, 구매대행 | 일부 (블로그 추천 수준, 최신성이 낮음) | 다국어 | 제휴 상품 중심 [미검증] |
| Klook / KKday / Trazy 가이드 | "Olive Young 必買 TOP35" 같은 정적 리스트 | 일부 (랭킹 순위를 인용하지만 시점이 고정됨) | 다국어 | 제휴·커머스 성격 [미검증] |
| 小红书(RED) / TikTok haul | 숏폼 하울, 필수템 리스트 | **약함**. "RED에서 뜬 마스크팩을 한국인은 거의 안 산다" [2차] | 자국어 | 협찬 표기가 섞여 있음. 정량 데이터는 미확인 |
| Reddit r/AsianBeauty | 커뮤니티 Q&A·후기 | 개인 경험 | 영어 | 이번 검색으로 스레드를 확보하지 못함 [미검증] |
| 네이버지도 / 구글맵 | 매장 위치, 리뷰(파파고 번역) | 매장 단위만 (상품 인기 없음) | 네이버는 4개 언어(기계 번역) | 해당 없음. 방한객 56.2%가 네이버지도, 33.9%가 구글맵을 씀 [미검증] |

출처
- 화해 Global: https://www.prnewswire.com/news-releases/hwahae-launches-global-website-to-bring-k-beauty-to-global-audiences-302302112.html
- 앱 한국어 전용 답변: https://apps.apple.com/us/app/id940056100
- 글로우픽: https://play.google.com/store/apps/details?id=com.glowdayz.glowmee&hl=en_US
- GlowOlive: https://www.glowolive.net/en/olive-young-korea-weekly-ranking-2026-w42/
- Creatrip: https://creatrip.com/en/blog/12420
- Trazy: https://blog.trazy.com/olive-young-shopping-guide/
- Klook: https://www.klook.com/zh-TW/blog/must-buy-products-from-olive-young/
- RED 관련 인용: https://yeoti.cn/olive-young%E5%BF%85%E4%B9%B0/ (2026-03-25)
- 지도: https://www.koreatimes.co.kr/amp/business/tech-science/20250414/naver-keeps-google-in-check-over-map-service-for-tourists , https://www.kedglobal.com/newsView/ked202409020002

**핵심 근거: 국내 차트와 글로벌 차트는 다르다** **[2차, 개인 분석]** https://dev.to/cocomoon/olive-young-has-two-best-seller-charts-i-matched-them-by-barcode-32-of-the-top-100-are-the-same-gmm
- 올리브영 국내 Top100과 Global Top100을 바코드(EAN)로 맞춰 봤다. 하루치 스냅샷이다.
- 겹치는 상품은 32개다(하한값). 브랜드는 국내 68개, 글로벌 62개 중 31개가 겹친다.
- Beauty of Joseon, SKIN1004, medicube, Purito, manyo 등은 글로벌 차트에만 있다. 국내 차트에는 라로슈포제·바이오더마 같은 비한국 브랜드 제품이 12개 들어 있다.
- 리뷰 수는 국내 Top100이 약 515만 건(중앙값 약 2.1만), 글로벌이 약 10.6만 건(중앙값 387)이다.
- 같은 상품의 글로벌 가격 중앙값은 국내의 1.59배다.
- 저자도 표본 32쌍, 단일 시점이라는 한계를 밝혔다.

### 3. 외국인 관광객의 페인포인트

- **언어·회원 장벽**: 국내 앱은 한국어만 지원하고, CJ ONE 가입에는 한국 휴대폰 또는 외국인등록번호가 필요하다. 그래서 쿠폰·포인트를 받기 어렵다. 글로벌관광상권 밖 매장은 가격표가 한국어만 있을 수 있다. 1+1이 반값을 뜻하지 않는다는 점도 혼동된다. 세일 날짜는 1~2일 전에야 공지된다. **[2차]** https://lacha.co.kr/korea-guide/en/olive-young-foreigner-shopping-tips/ (2026-10-01)
- **해외 SNS 인기와 현지 인기의 괴리**: "很多在小红书上很火的面膜，在 Olive Young 其实很少韩国人买"(RED에서 뜬 마스크팩 상당수를 올리브영에서 한국인은 거의 사지 않는다). 같은 글은 GlowPick·화해 랭킹 표식을 보라고 권한다. **[2차]** https://yeoti.cn/olive-young%E5%BF%85%E4%B9%B0/ . 위 바코드 분석(글로벌 전용 브랜드)과 같은 방향의 근거다.
- **광고 섞인 후기**: 공정위의 SNS 뒷광고 점검 결과는 다음과 같다. **[미검증]**
  - 2024년에 의심 게시물 22,011건을 찾았고 시정은 26,033건이었다. 숏폼 비중이 늘었다. https://www.viva100.com/article/20250316500387
  - 연간 모니터링 건수는 2025년 22,675건이다. https://www.intn.co.kr/news/articleView.html?idxno=2054213
  - 식약처의 화장품 부당광고 적발은 2021~2025년 9월 12,617건이다. https://www.medifonews.com/news/article.html?no=207910
  - 화장품·플랫폼별 SNS 수치는 찾지 못했다.
- **가짜 상품·가격**: 해외 온라인의 K-화장품 위조품이 2023년 약 1.68만 건에서 2025년 3.6만 건 이상으로 늘었다는 글이 있다(지재권 당국 인용). 환급은 수수료를 빼면 대략 5~8%라고 한다. **[2차, 블로그]** https://klifechoice.com/korea-beauty-shopping-foreigners/ . 일부 관광객은 가성비 매장(오프뷰티 등)과 가격을 비교한다. **[미검증]** https://hankyung.com/amp/2026012879517
- **선택 과잉·탐색 비용**: 1인당 평균 2.8개 매장을 돌고 평균 6개 상품을 산다. **[2차]** (데일리안) 랭킹이 하루에도 바뀐다는 지적도 있다. **[2차]** (GlowOlive)
- **공백**: 외국인 뷰티 쇼핑의 불편(언어·정보 신뢰)을 직접 물은 공식 설문은 이번 조사에서 찾지 못했다.

### 4. 공백 분석: 올리브영 랭킹과 숏폼 피드가 못 보여주는 것

1. **"한국인이 실제로 사는가"를 다른 근거와 대조한 결과가 없다.** 국내 판매 랭킹(올리브영), 리뷰 기반 랭킹(화해·글로우픽), 해외 숏폼 인기는 각각 따로 있다. 그런데 "해외에서만 뜬 상품"과 "현지에서도 1위인 상품"을 구분해 주는 영어 서비스는 확인되지 않았다(바코드 분석은 개인 일회성).
2. **광고를 걸러낸 버즈가 없다.** 화해는 리뷰 검수를 내세우지만 광고 사업을 겸하고, 협찬 필터를 따로 공개하지 않는다. 숏폼은 협찬이 섞여 있다. 체험단·협찬을 뺀 국내 언급량을 근거와 함께 보여주는 곳은 확인되지 않았다.
3. **근거를 외국어로 시계열 추적하지 못한다.** 국내 랭킹은 실시간이고 한국어다. 블로그 다이제스트는 주 1회 Top5 스크린샷 수준이고, 가이드 리스트는 시점이 고정돼 있다.
4. **쇼핑 동선과 연결되지 않는다.** 상품 인기, 매장(세금 환급·외국어 상권), 국내가와 글로벌가 차이(중앙값 1.59배)를 한 화면에서 보여주는 곳이 없다.
5. **숏폼을 '증거'로 붙이지 않는다.** 숏폼은 상품과 묶이지 않은 흐름형 피드라, 해당 상품의 국내 크리에이터 영상을 근거 묶음으로 보여주지 못한다.

### 차별점 권고

- **"로컬 검증 배지"를 핵심으로 둔다.** 국내 판매 랭킹, 국내 리뷰 랭킹, 광고를 걸러낸 국내 버즈를 교차해 "현지에서도 인기 / 해외에서만 인기"로 표시한다. 각 신호 옆에는 출처와 측정 시점(provenance)을 붙인다.
- **광고 필터를 투명하게 공개한다.** 협찬·체험단 표기("#광고", "제품제공" 등)를 감지하는 규칙과 걸러낸 비율을 공개한다. 기존 서비스에는 공개된 협찬 필터가 없다는 점이 차별 포인트다.
- **상품 단위 증거 묶음을 만든다.** 순위 추이(시계열), 국내 리뷰 요약(번역), 국내 숏폼 2~3개를 상품 카드 하나에 담는다. 피드형 숏폼과 달리 "왜 찐템인가"에 답하는 구조다.
- **관광객 맞춤 실행 정보를 붙인다.** 환급 가능 매장, 외국어 상권, 국내가와 글로벌몰 가격 차이를 함께 보여준다. 상위 국적(미국·싱가포르·일본·중국·태국) 언어를 우선 지원한다.
- **해커톤 범위에서 정직하게 표시한다.** 랭킹·버즈 수치가 실측(크롤링)인지 모의인지 화면과 데이터에 표기한다. 경쟁 블로그도 제휴 고지를 하는 만큼 신뢰가 핵심 가치다.

## 4. 해외 마케터·확장(위치·개인화)

표기: **[확인]** = 1차 출처(기관·기업 원문 페이지)를 직접 열어 확인 / **[2차]** = 언론·블로그·비교사이트에서 인용된 값 / **[미확인]** = 근거가 약하거나 찾지 못함.
수치는 출처에 적힌 값만 옮겼다. 추정한 값은 없다.


### 1. 해외 마케터·바이어용 K-뷰티 트렌드 인텔리전스 현황

| 제공자 | 무엇을 주나 | 가격대 | 한국 로컬 신호 | 근거 |
|---|---|---|---|---|
| **올리브영 어워즈** (CJ올리브영) | 연 1회 부문별 1~3위. 2025년판은 구매 약 1.8억 건으로 40개 부문 166개 상품 선정 | 무료(공개) | **강함**: 국내 1위 H&B 채널의 실제 구매 데이터. 단 연 1회이고 API·다운로드 없음 | [2차] https://www.insight.co.kr/news/535111 · https://www.beautynury.com/news/view/109997/cat/10 · 공식 페이지 https://www.oliveyoung.co.kr/store/amusement/award.do?awardedYear=2025 (WebFetch 403, [미확인]) |
| 올리브영 외국인 구매 통계(보도) | 외국인 매출 비중, 국적 순위, 지역별 증가율 | 무료(보도자료) | 강함. 단 **집계값만 있고 상품 단위 데이터는 없음** | [2차] https://www.asiae.co.kr/en/article/2026083109505920861 (오프라인 외국인 비중 2022년 2%에서 2026년 8월 33%. 구매액 순위 미국·싱가포르·일본·중국·태국) · https://www.koreatimes.co.kr/business/companies/20251203/olive-young-hits-680-mil-in-foreign-tourist-purchases |
| **Euromonitor** (Passport) | 국가·카테고리 시장 규모, 채널, 소비자 설문 | 엔터프라이즈 견적제 | 중간: 시장 규모·채널 거시 데이터. 상품·SNS 신호 없음 | [확인] https://www.euromonitor.com/newsroom/press-releases/august-2026/k-beauty-global-growth-beauty-market-2026 (2026-08-05 발표: 2025년 글로벌 K-뷰티 온라인 시장 USD 15bn, 2024년 12.5bn에서 약 22% 성장. 해외 온라인 매출 중 미국 54%, 중국 66%에서 21%로 감소, 서유럽 3%에서 10%로 증가) |
| **Mintel** (GNPD 등) | 신제품 출시 DB, 소비자 리포트 | 연 USD 2~5만 이상이라는 **추정**이 있음 | 중간: APAC 기사 수준 | [2차·가격 미확인] https://gravelai.com/blog/mintel-gnpd-alternatives · [확인] https://www.mintel.com/insights/beauty-and-personal-care/korean-beauty-trends-continue-to-capture-consumers-in-apac/ |
| Kantar | — | — | K-뷰티 전용 리포트를 찾지 못함 | [미확인] |
| **Spate** | 검색·TikTok 기반 AI 트렌드 예측(성분·카테고리 성장) | 비공개. 비교 블로그는 "$$ 중간 B2B SaaS"로 분류 | **있음**: "New Wave of K-Beauty" 리포트가 **Naver 검색**을 분석함 ("Naver is the go-to search platform for South Korean consumers") | [확인] https://www.spate.nyc/reports/new-wave-of-kbeauty · [2차] https://beautymatter.com/articles/south-koreas-25-billion-beauty-market · 가격 [2차] https://gravelai.com/blog/spate-vs-trendalytics |
| Trendalytics | 패션·뷰티·리테일 트렌드 | 비공개. 비교 블로그는 "$$$" | 한국 특화 근거 없음 | [2차] https://gravelai.com/blog/spate-vs-trendalytics |
| **Google Trends API** | 5년 롤링, 일·주·월 집계, 지역·하위지역 필터, 요청 간 일관된 스케일 | alpha, 신청제. 가격 미공개 | 약함: 한국 검색 1위는 Naver | [확인] https://developers.google.com/search/blog/2025/07/trends-api (2025-07-24) · https://developers.google.com/search/apis/trends |
| Brandwatch / Sprinklr | 글로벌 소셜 리스닝 | 엔터프라이즈 | **Naver 블로그·카페 지원을 1차 출처로 확인하지 못함**. 비교 글은 Naver를 Meltwater·Pulsar 쪽에만 표기 | [2차] https://brandmentions.com/blog/best-multilingual-social-listening-tools/ · https://www.meltwater.com/en/blog/korean-social-media |
| **썸트렌드(Sometrend)** | 국내 소셜 버즈·연관어·감성 | Free / Basic 29,700원·30일 / Premium 149,000원·30일 / Business(클라우드) 월 200만원(1~10인) | **강함**: 블로그·네이버뉴스(Free부터), Instagram(Basic부터), 커뮤니티·YouTube(Premium부터), 티스토리·네이버카페·다음(Business). 요금 페이지에 뷰티 전용 상품은 없음 | [확인] https://some.co.kr/service/pricing |
| 썸트렌드 MCP(API) | 크레딧제 API. "Sometrend Beauty \| Glowcast" 포함 | Starter 15만 / Pro 50만 / Business 100만원(VAT 별도) | 강함 | [2차·검색 요약] https://apps.some.co.kr/home (직접 열어보지 않음) |
| **블랙키위** | 네이버 키워드 검색량, 블로그·카페 발행량 | Basic 29,700원·30일(13,800원 할인 표기 있음), Premium 89,100원·30일, 14일 무료 체험 | 강함(네이버 검색량) | [2차·검색 요약] https://blackkiwi.net/pricing |
| KOTRA 해외시장뉴스 | 국가별 화장품 시장 동향 기사·보고서 | 무료 | 수출 측 정보. 국내 소비 신호는 아님 | [확인·검색 결과] https://dream.kotra.or.kr/user/extra/kotranews/bbs/linkView/jsp/Page.do?dataIdx=244709 (튀르키예 기초화장품, 2026-10-21) |
| 관세청 K-뷰티 화장품 HS 가이드북 | HS 코드 분류(완제품 87, 부자재 33, 원료 782, 오류사례 50) | 무료 | 해당 없음(통관) | [2차] https://www.cncnews.co.kr/mobile/article.html?no=10631 |

**빈틈 정리**
- 거시 리포트(Euromonitor·Mintel)는 비싸고 **상품 단위의 국내 실구매·리뷰 신호가 없다.**
- 국내 도구(썸트렌드·블랙키위)는 로컬 신호가 강하지만 **한국어 UI이고 해외 마케터용 영어 요약이 없다.** 다국어 지원은 확인하지 못했다([미확인]).
- 올리브영 어워즈·랭킹은 가장 강한 "현지 실판매" 신호다. 그러나 연 1회이고 기계 판독 경로가 없다.
- Spate는 Naver를 쓰지만 성분·카테고리 수준이고, 출처와 근거를 상품 단위로 묶어 보여주지 않는다.
- 결론: **"상품 단위 + 한국 로컬 근거(구매 랭킹·리뷰·검색량) + 영어 설명 + 출처 링크"** 조합은 비어 있다. 단, 이것은 이번 검색으로 경쟁 제품을 찾지 못했다는 뜻이며, 없다는 것을 입증한 것은 아니다.

### 2. K-뷰티 수출 규모 (공식 집계)

- **2024년**: 약 102억 달러, 전년 대비 +20.6%, 처음으로 100억 달러 돌파. 식약처 발표 [2차] https://www.cosmeticsdesign-asia.com/Article/2025/01/15/k-beauty-price-hike-why-amorepacific-lg-hh-are-raising-their-prices · https://www.geniepark.co.kr/news/articleView.html?idxno=60345 (일부 매체는 101.8억 달러로 표기)
- **2025년**: **114억 달러로 역대 최대**, 전년 대비 약 12% 증가. 식약처 발표, 2026-01-09 보도 [2차] https://www.mt.co.kr/living/2026/01/09/2026010913550875248
  - 국가별: **미국 22억 달러(처음 1위)**, 중국 20억, 일본 11억. 아랍에미리트 8위, 폴란드 9위(처음 10위권 진입)
  - 수출국 수: 2024년 172개국에서 2025년 202개국으로 증가
  - 품목: 기초 85.4억 달러(+12%), 색조 15.1억(+12%), 방향용 +46%(가장 높은 증가율)
  - 증가율은 출처별로 12.0~12.2%. 세계 2위(1위 프랑스)라는 보도도 있음 [2차] https://www.thekbs.co.kr/news/articleView.html?idxno=14719
  - KHIDI는 2025년 114억 달러(+12.0%)로 집계했고, **2026년은 125.35억 달러(+9.9%)로 전망**했다 [2차] http://www.cmn.co.kr/mobile/sub_view.asp?news_idx=48759 · KHIDI 보도자료 목록 https://www.khidi.or.kr/board/view?linkId=48921081&menuId=MENU00100
- **2026년 상반기**: **70억 달러(잠정)**, 전년 동기 대비 +27.3%, 상반기 기준 역대 최대. 미국 14.5억 달러(20.7%, +41.5%), 중국 10.1억(-6.6%), 일본 5.8억. 기초 54.8억, 색조 7.2억 [2차] https://www.cncnews.co.kr/mobile/article.html?no=11061 · https://www.hankyung.com/article/202607022049i
- 관세청 원자료와 무역협회(KITA) HS 3304 통계는 이번 조사에서 직접 확인하지 못했다 [미확인]. 발표에 쓸 숫자는 식약처 보도자료 원문을 한 번 더 확인할 것을 권한다.

### 3. 위치 기반(주변 매장·재고·가격)

- **올리브영 매장 재고 조회**: 국내 앱의 상품 상세에서 "구매 가능 올영 매장 찾기"로 매장별 재고를 본다. 올리브영 공식 X 계정 [확인·SNS] https://x.com/oliveyoung/status/1886708760842002439
  - 국내 앱은 한국어만 지원한다. 영어 사용자는 글로벌몰(global.oliveyoung.com)로 안내된다. 글로벌몰과 글로벌 앱의 재고·가격은 국내 매장과 다르다 [2차·블로그] https://koreaexperience.com/blog/smart-shopping-at-olive-young-using-the-app-and-maximizing-sales-2026 · https://koreasorted.com/olive-young-korea/
  - 국내 매장은 1,360개 이상 [확인] https://corp.oliveyoung.com/en/about/business?tab=numbers (검색 요약)
  - **공개 재고 API는 찾지 못했다** [미확인 = 없다고 보고 설계]. 스크래핑은 약관과 차단 위험이 있다.
- **카카오 로컬 API(키워드 장소 검색)** [확인] https://developers.kakao.com/docs/ko/local/dev-guide
  - `GET https://dapi.kakao.com/v2/local/search/keyword.json`, 헤더 `Authorization: KakaoAK {REST_API_KEY}`
  - `x`, `y`, `radius`(0~20000m), `rect`, `sort=distance`, `size` 1~15, `page` 1~45, `pageable_count`는 최대 45
  - 카테고리 코드에 화장품은 없다(MT1 대형마트, CS2 편의점, PM9 약국 등). 따라서 `query="올리브영"`과 좌표로 검색한다.
  - 쿼터 수치는 문서에 없다. 앱 관리 화면에서 확인해야 한다 https://developers.kakao.com/docs/latest/ko/getting-started/quota. 대량 수집으로 계정이 차단된 사례가 있다 [2차] https://devtalk.kakao.com/t/api/150293
- **네이버 지역 검색 API**: `local.json`, `display`는 최대 5, `start`는 1뿐이다. 즉 **한 번에 결과 5개만 받는다.** 정렬은 random 또는 comment [2차] https://api.ncloud-docs.com/docs/naver-api-hub-search-local.md. 일 25,000회 한도는 커뮤니티·서드파티 문서에만 나온다 [미확인] https://devtalk.kakao.com/t/api/119448. developers.naver.com은 WebFetch가 막혀 원문을 보지 못했다.
  - 판단: 주변 매장 표시에는 **카카오 로컬이 반경 검색과 페이지 수에서 유리하다.**
  - 저장·재배포와 지도 표시 조건 같은 약관 원문은 확인하지 못했다 [미확인]. 발표용 데모는 실시간 호출 결과를 표시만 하는 것을 권한다.
- **면세점·가격 비교**: 면세점과 올리브영 가격을 비교하는 서비스나 공개 데이터는 찾지 못했다 [미확인]. 남은 자료는 2014·2019년 소비자원 조사 같은 오래된 것뿐이다 https://www.ajunews.com/view/20190909182609104. 2025년 1~11월 국내 화장품 택스리펀(Global Tax Free) 거래 중 올리브영 비중이 88%라는 보도가 있다 [2차] https://www.koreaherald.com/article/10554766 (검색 요약).

### 4. 뷰티 개인화 추천 사례

- **화해**: 6가지 피부 타입(복합성·건성·악건성·지성·수부지·중성)별 추천, 맞춤 리뷰, 성분 정보("인생템 찾기") [2차] https://beautynury.com/news/view/93988/cat/20. 이후 AI "궁합 점수"(피부 타입·고민·리뷰 기반)와 "내 사용템"(주의 성분, 함께 쓰면 안 되는 성분 조합 경고)을 추가했다 [2차] https://platum.kr/archives/285898 (403, 제목 기준) · App Store https://apps.apple.com/kr/app/id940056100. 리뷰 규모는 600만~1,000만 건으로 시점별로 다르게 표기된다 [2차].
- **올리브영**: 오프라인 "스킨스캔"을 앱 AI 피부 진단으로 확장했다. 사진과 전자 문진으로 피부 유형, 모공, 색소, 수분, 유분, 주름을 분석해 상품과 루틴을 추천하고, 재측정으로 변화를 추적한다 [2차] https://www.joongangenews.com/news/articleView.html?idxno=548106 · https://www.etnews.com/20260424000276
- **아모레퍼시픽**: 스마트폰 촬영으로 멜라닌·홍반·모공·주름을 요소별 AI 모델이 분석하고 개인정보는 비식별화한다. 생성형 "AI 뷰티 카운셀러"를 운영한다 [2차] https://zdnet.co.kr/view/?no=20260520155338. ChatGPT 안의 아모레몰 앱으로 탐색부터 결제까지 가능하다 [2차] https://m.news.nate.com/view/20260317n38058
- **해커톤 최소 구현안**(설계 제안이며 출처 없음)
  1. 온보딩 3문항: 피부 타입(화해의 6분류 차용), 고민 1~2개, 예산
  2. 규칙과 가중치로 랭킹: 로컬 인기 점수 × 타입 일치(리뷰 태그) − 회피 성분 페널티
  3. 저장·조회 이벤트를 세션이나 로컬 저장소에 쌓고, N회 이후 "비슷한 것" 카드를 먼저 노출(능동 추천 연출)
  4. 사진 피부 진단은 제외한다. 민감정보이고, 검증할 수 없는 정확도 주장이 된다.

### 해커톤 범위 권고

- **차별점은 근거다.** "이 상품이 한국에서 실제로 인기 있다"를 상품 단위로 보여주고, 근거 2~3종(올리브영 랭킹·어워즈, 네이버 검색량 추이, 리뷰 수)을 출처 링크와 수집 시각과 함께 영어로 붙인다. 거시 수치(2025년 수출 114억 달러, 미국 1위)는 피치의 시장 크기 슬라이드에만 쓰고 식약처 원문으로 재확인한다.
- **해외 마케터용은 리포트 한 장으로 끝낸다.** 카테고리별 Top N과 상승 키워드를 영어 요약 한 페이지로 내보낸다. Spate·Euromonitor와 경쟁하지 말고 "상품 단위 로컬 증거"라는 빈틈을 겨눈다.
- **위치 기능은 카카오 로컬 키워드 검색 하나만 쓴다.** 범위는 "근처 올리브영 매장 + 앱 재고 조회로 가는 딥링크 안내"까지다. 실시간 재고와 가격 비교는 공개 API가 없으므로 범위에서 뺀다. 넣는다면 `provenance: mock` 표시가 필수다.
- **개인화는 규칙 기반 최소 구현으로 한다.** 3문항 온보딩, 가중치 랭킹, 회피 성분 필터, 행동 누적 후 추천 카드. AI 피부 진단과 사진 수집은 제외한다.
- **모든 수치에 출처를 붙인다.** 수집 데이터에 `provenance: measured|mock|estimate`와 `*_source` URL을 둔다. 수집하지 못한 신호(예: 재고)를 실측처럼 보이게 하지 않는다.

## 5. 통합 권고 (다음 strategy·interview 로 넘길 결정 후보)

1. **핵심 흐름은 "로컬 인기 근거 카드"로 한다.** 상품 하나에 국내 랭킹 스냅샷, 네이버 블로그 언급(광고 표시 제외 전후), 데이터랩 추이, YouTube 국내 영상 2~3개를 묶는다. 탐색 화면은 이 카드를 넘겨 보는 형태로 붙인다. (축 1·2·3)
2. **"해외에서만 인기" 대비를 차별점으로 내세운다.** 올리브영 국내와 Global 차트가 크게 다르다는 근거(축 3, 개인 분석)를 데모 상품 선정에 쓴다. 단, 이 수치는 하루치 개인 분석이라 직접 재확인한 뒤에 인용한다.
3. **광고 판별은 "투명한 하한/상한"으로 표현한다.** 키워드 사전을 공개하고, 걸러낸 비율과 한계(무표시·이미지 표시는 못 잡음)를 화면에 상시 적는다. 실구매·실사용의 근거로 표현하지 않는다(전략 문서 과제 2와 일치). (축 2)
4. **모든 수치에 출처를 붙인다.** `provenance: measured|manual-snapshot|mock|estimate`, `count_source`, 수집 일시, 쿼리를 둔다. (workflow.md §6, 축 1·2·4 공통)
5. **당일 범위에서 뺄 것:** 올리브영 라이브 크롤링, Instagram API, TikTok Research API, 실시간 재고·가격, 사진 피부 진단. 개인화와 위치 기능은 넣는다면 규칙 기반과 카카오 로컬 수준으로만. (축 1·4)
6. **열린 질문(팀 결정 필요):** 데모 상품 수(10~20개 권고), 올리브영 스냅샷의 수집 방식과 담당, 광고 판별 소표본 검수 규모, 2차 타깃용 영어 리포트를 데모에 포함할지.

## 6. 조사 한계
- 올리브영 현행 약관·robots.txt 본문, 공정위 2024-11-15 보도자료 첨부, 2025 외래관광객조사 최종 PDF, 일부 논문의 성능 수치는 403이나 추출 실패로 원문을 확인하지 못했다.
- 봇 차단 관측([실측])은 조사 환경 IP 기준이다.
- 이 문서는 2026-10-24 시점 조사다. API 한도·약관·통계는 바뀔 수 있다.

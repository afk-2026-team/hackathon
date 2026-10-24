# 진선미/Jinseonmi 프론트 통합 명세

- 작성: 2026-10-24, 화면 통합 담당
- 근거: `docs/plan/plan_26102414_54_34_프론트_브랜치_백엔드_E2E_통합.md`
- 비교 대상
  - 기반: `origin/feature/web-hwahae-gangnam-ui`(바다, af13015)
  - UX 참고: `origin/prototype/jinseonmi-ui:prototype/ui-mockup/index.html`(예은, 단일 HTML 목업, 문구 키 142개)
  - 보호본: 로컬 main `62e7291`

## 0. 원칙

1. **화면 골격은 바다 브랜치를 쓴다.** 진입·온보딩·인증은 62e7291을 그대로 둔다.
   - 보호 파일: `App.tsx`, `screens/Entry.tsx`, `screens/Onboarding.tsx`, `screens/AuthCallback.tsx`, `auth/**`, `lib/options.ts`
2. 예은 목업은 화면 흐름과 문구만 참고한다. 목업의 표본 데이터는 옮기지 않는다.
   - 목업 스스로 "Sample data — not real rankings, reviews or prices"라고 밝히고 있다.
   - 해당하는 것: 순위 점수, 블로그 언급 수, 검색 트렌드 순위, 표본 환율, 가짜 제품(LUMI 등).
3. 모르는 값은 null 또는 "Unknown"으로 둔다. 외부 API가 실패하면 원인이 있는 상태로 보여준다. 예약 확정이나 임상 적합성은 표시하지 않는다.
4. 저장은 계정별로 나뉜다(`korea-locally/<guest|user:id>/*`). 언어는 EN/KO, 브랜드는 EN Jinseonmi / KO 진선미로 유지한다.

## 1. 예은 UX 적용 판단

| 예은 목업 기능 | 바다 브랜치 상태 | 판단 | 근거·조치 |
|---|---|---|---|
| 언어 → 국가·통화 → 기본정보(선택) → 관심사(선택) 온보딩, 튜토리얼 3단계 | 바다도 새 진입·온보딩 디자인을 가짐 | **그대로 둔다(62e7291)** | 사용자 정본이 보호 대상이다. 바다 `strings/shell.ts`의 onboarding 키는 쓰지 않는다. 튜토리얼은 바다 `Tutorial.tsx`(3단계·Skip)를 쓴다 |
| Home: 추천 + 광고(AD) 분리 + 인기 카테고리 카드 + My Trip 티저 | Home: 히어로·바로가기·Picks·Sponsored 분리·Places·trip 배너 | **이미 적용** | `shell.home.*`. "Rising now"는 측정 데이터가 없어 추가하지 않는다 |
| Real ranking / Sponsored 탭 분리 | Explore `segReal`/`segSponsored`, "Curation order · not a measured ranking" | **이미 적용(더 정직한 표현)** | 목업의 "Ranked by blog mentions · drugstore rank · search trends"는 근거 데이터가 없어 쓰지 않는다 |
| 상품 상세: 협찬 여부 3상태, 근거, 숏폼 영상, + Cart | `ProductDetail`: 이유·출처·VideoShelf(YouTube)·BlogReviews(NAVER)·카트 | **이미 적용** | 목업의 "Why it ranks"(가짜 점수)는 바다의 블로그 검색 수("not a popularity or rank")로 대체한다 |
| **지금 쓰는 제품 → 한국 대안 비교(altBox)** | 없음(main의 ComparePanel이 바다 분기 뒤에 생김) | **추가** | main의 `ComparePanel`·`lib/compare.ts`·`useCompare.ts`를 `ProductDetail`에 연결한다. 현재 제품은 프로필 `preferences.current_product`에 저장한다 |
| 비교: "Different products — this is not a discount" | 없음 | **추가(비교 패널 notice로)** | 서버 `price.comparable`·`note`, 비교 요약(explain) 문구를 그대로 쓴다 |
| 의료 상세: 언어·지역·리뷰 수, 의료 고지 | `PlaceDetail`: 주소·MiniMap(NAVER)·고지·출처 | **이미 적용** | 리뷰 수·언어는 데이터에 없어 추가하지 않는다 |
| 카트: 합계 + 표본 환율 ≈ | `CartSheet`: KRW 합계, 공식 기준환율 ≈, 미표시 가격 제외 안내 | **이미 적용(실제 환율 API)** | `/v1/fx` |
| My Trip: 경로·지도·일정 제안/승인·클리닉 확인 대기 | DayPlan(일자·순서·지도 링크), StartPoint(숙소 지오코딩), TripMap, 쇼핑 체크리스트 | **대부분 적용** | 제안/승인 상태와 "clinic confirmation pending"은 백엔드 상태가 없어 **보류**한다(표시만 하면 확정처럼 보일 위험) |
| My Trip 상단 개인화 편집(선택) | 없음. 설정 → 프로필 수정으로 가능 | **그대로 둔다** | 온보딩 편집 화면(보호본)을 재사용한다 |
| 설정: 언어·국가·온보딩 다시·튜토리얼 다시·초기화 | Settings: 계정·프로필 수정·튜토리얼·초기화 | **이미 적용** | |
| 검색 | `Search`: 카탈로그 검색 + 웹(블로그) 탭, 최근 검색 | **이미 적용** | 목업에는 없음 |

## 2. 화면별 명세

| 화면 | 입력 | 출력·UI 행동 | 필요 API(함수) | 상태(빈·로딩·오류) | 반복 사용·저장 | 언어 |
|---|---|---|---|---|---|---|
| Entry / Callback / Onboarding(보호) | 언어, Google/게스트, 국가·언어·통화, 성별·연령(선택), 관심사·현재 제품(선택) | 게스트는 항상 가능. 완료하면 Home | `auth/*`(`/v1/auth/config`, `/v1/auth/me`) | Google 비활성·시간 초과·취소 시 게스트로 진행 | entry 선택과 프로필 저장, 재방문 시 생략 | EN/KO |
| Home | 프로필 | 히어로, 바로가기, Picks / Sponsored 분리, 장소, My Trip 배너 → 상세·Explore·Search | `fetchRecommendations(profile,'all')` | 로딩, 오류+재시도, 비어 있음 | 카트·여행 개수 배지 | EN/KO |
| Search | 검색어 | 카탈로그 결과(클라이언트 필터) / 블로그 탭 | `fetchCatalog()`, `fetchBlogReviews(q)` | 키 없음(503)·결과 없음 문구 | 최근 검색 | EN/KO |
| Explore | 카테고리, Real/Sponsored, 관심사 필터 | 목록 → 상세, +카트 | `fetchRecommendations(profile, category)` | 필터 결과 없음, 스폰서 없음, 오류 재시도 | 담은 수량 표시 | EN/KO |
| ProductDetail | 상품, 현재 제품 | 이유·출처·**비교 패널(공통·차이·미확인·가격·요약)**·영상·블로그·카트·여행 | `fetchReferenceProducts()`, `fetchCompare(body)`, `fetchExplain(body)`, `fetchVideos(q,lang)`, `fetchBlogReviews(q)` | 비교 로딩, 오류+재시도(사실표 유지), 요약 실패 시 요약만 숨김, 영상·블로그 키 없음 | 현재 제품을 프로필에 저장 | EN/KO(API 본문은 원문) |
| PlaceDetail | 장소 | 주소·MiniMap·지도 링크·고지·출처·My Trip 저장 | `fetchMapsConfig()`, 지오코딩(`lib/naverMaps`) | 지도 인증 실패·좌표 없음 → 링크로 대체 | 여행 저장 | EN/KO |
| CartSheet | 카트 | 수량, KRW 합계, ≈환산, 미표시 가격 안내, My Trip 이동 | `fetchFx()` | 환율 실패·기준 없음 → KRW만 | 계정별 카트 | EN/KO |
| My Trip | 여행 항목, 숙소 | 일자·순서·삭제·지도 링크·직선거리, 체크리스트, 쇼핑 요약 | `fetchMapsConfig()`, 지오코딩 | 비어 있음, 지도 키 없음 | 계정별 trip·숙소 | EN/KO |
| Settings | 계정·프로필 | 로그인 전환·로그아웃·프로필 수정(보호 온보딩 edit)·튜토리얼·초기화 | auth | 로그아웃 실패 시 성공으로 처리하지 않음 | | EN/KO |

## 3. 연결 세션에 요청하는 `lib/api.ts` 함수 시그니처

화면은 아래 이름과 형태로 호출한다. `lib/types.ts`·`lib/compare.ts`의 타입은 화면 담당이 유지한다.

```ts
fetchRecommendations(profile: ProfilePayload, category?: CategoryFilter): Promise<RecommendationResponse>
fetchCatalog(): Promise<{ items: CatalogItem[] }>
fetchReferenceProducts(): Promise<{ items: ReferenceProduct[] }>
fetchCompare(body: { profile: ProfilePayload; candidate_id: string; current_product_id?: string; current_product_name?: string }): Promise<CompareResponse>
fetchExplain(body: 같은 body): Promise<ExplainResponse>
fetchMapsConfig(): Promise<MapsConfig>
fetchBlogReviews(query: string, display?: number): Promise<BlogResponse>
fetchVideos(query: string, lang?: 'en' | 'ko', max?: number): Promise<VideoResponse>
fetchFx(): Promise<FxResponse>
class ApiError extends Error { status?: number }  // 실패 시 사용자 문구 + status
```

- 오류 문구에는 상태 코드나 내부 원인을 넣지 않는다. 화면은 `status`(예: 503 = 키 없음)로 분기한다.
- assistant(AI) 기능은 연결 세션이 `lib/assistant*.ts`로 제공한다. 화면 연결 지점은 ProductDetail의 비교 요약 영역 다음으로 둔다(계약이 오면 연결).

## 4. 충돌 해소 방침

| 파일 | 방침 |
|---|---|
| `Workspace.tsx`, `screens/Home.tsx`, `Explore.tsx`, `MyTrip.tsx`, `components/States.tsx`, `styles.css` | 바다 버전을 쓴다. main에서 생긴 기능(ProductDetail 비교 연결, 현재 제품 저장)은 바다 구조에 다시 넣는다 |
| `components/ItemCard.tsx`, `ItemDetail.tsx` | 바다처럼 삭제한다. `explore/ItemRow`, `screens/ItemDetail` → `detail/*`로 대체 |
| `lib/api.ts` | 연결 세션 담당. 위 시그니처를 모두 포함해야 한다 |
| 온보딩 CSS | 보호 온보딩이 쓰는 `.onboarding*`, `.field`, `.choice*`, `.progress`, `.entry*` 클래스를 새 셸 스타일과 함께 유지한다 |

## 5. 하지 않는 것

- 목업의 표본 순위·점수·환율·가짜 제품
- 일정 제안/승인과 클리닉 확인 대기 표시(백엔드 상태가 생기면 다시 검토)
- 보호 파일 수정

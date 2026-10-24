import type { CatalogItem, CategoryFilter, ProfilePayload } from '../lib/types'
import type { CartLine, Namespace, TripEntry } from '../lib/storage'

// 화면 props 계약(PM 소유). Workspace 가 이 형태로 화면을 부른다. 바꿀 일이 있으면 PM 과 맞춘다.
// currency 는 사용자가 고른 통화(ISO 4217). 가격 표시는 components/Common 의 <Price> 를 쓴다.

export interface HomeProps {
  profile: ProfilePayload
  onOpen: (item: CatalogItem) => void
  onBrowse: (category: CategoryFilter) => void // Explore 탭으로 이동
  onSearch: () => void
  onGoTrip: () => void
  tripCount: number
  cartCount: number
}

export interface ExploreProps {
  profile: ProfilePayload
  category: CategoryFilter
  onCategory: (c: CategoryFilter) => void
  onOpen: (item: CatalogItem) => void
  onAddCart: (item: CatalogItem) => void
  onSearch: () => void
  cartQty: Record<string, number> // item_id → 담은 수량
  tripIds: Set<string>
}

export interface DetailProps {
  item: CatalogItem
  ns?: Namespace // 내 숙소(My Trip 출발지)에서 길찾기를 열 때 쓴다
  profile: ProfilePayload
  onBack: () => void
  onAddCart: (item: CatalogItem) => void
  onAddTrip: (item: CatalogItem) => void
  onOpenCart: () => void
  onGoTrip: () => void
  cartQty: number
  inTrip: boolean
  currentProduct?: string // 프로필의 '지금 쓰는 제품' — 제품 비교에 쓴다
  onSetCurrent: (name: string) => void
}

export interface SearchProps {
  profile: ProfilePayload
  onBack: () => void
  onOpen: (item: CatalogItem) => void
}

export interface CartSheetProps {
  cart: CartLine[]
  currency: string
  onChangeQty: (itemId: string, qty: number) => void
  onOpenItem: (itemId: string) => void
  onGoTrip: () => void
  onClose: () => void
}

export interface MyTripProps {
  ns: Namespace // 출발지(숙소) 같은 My Trip 전용 저장에 쓴다
  profile: ProfilePayload
  trip: TripEntry[]
  cart: CartLine[]
  days: number
  onMove: (entryId: string, dir: -1 | 1) => void
  onDay: (entryId: string, day: number) => void
  onRemove: (entryId: string) => void
  onAddDay: () => void
  onExplore: () => void
  onOpenItem: (itemId: string) => void
  onOpenCart: () => void
  onReorderDay?: (day: number, orderedItemIds: string[]) => void // 서버 방문 순서 제안을 그날에 적용
  suggesting?: boolean // 첫 진입 추천 일정을 만드는 중(빈 화면 대신 준비 중 표시)
}

export interface TopbarProps {
  onHome: () => void
  onSearch: () => void
  onCart: () => void
  onSettings: () => void
  cartCount: number
}

import type { DetailProps } from './contracts'
import { ProductDetail } from '../components/detail/ProductDetail'
import { PlaceDetail } from '../components/detail/PlaceDetail'
import '../styles/detail.css'

// 담당: 상세·근거(E). 뷰티 제품은 상품 상세 레이아웃, 의료·장소·안내는 기관 상세 레이아웃.
export function ItemDetail(props: DetailProps) {
  const { item } = props
  if (item.kind === 'product' && item.category === 'beauty') return <ProductDetail {...props} />
  return <PlaceDetail {...props} />
}

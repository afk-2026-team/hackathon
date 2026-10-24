import type { DetailProps } from './contracts'
import { SourceList, SubBar } from '../components/Common'

// 담당: 상세·근거(E). 임시 골격.
export function ItemDetail({ item, onBack, onAddCart, onAddTrip }: DetailProps) {
  return (
    <>
      <SubBar title={item.title} onBack={onBack} />
      <section className="sec">
        <p>{item.description}</p>
        <SourceList sources={item.sources} />
        <button type="button" className="btn btn--primary" onClick={() => onAddCart(item)}>Add to cart</button>
        <button type="button" className="btn btn--ghost" onClick={() => onAddTrip(item)}>Add to My Trip</button>
      </section>
    </>
  )
}

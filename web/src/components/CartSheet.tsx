import type { CartSheetProps } from '../screens/contracts'
import { Price, Sheet } from './Common'

// 담당: 탐색·검색·카트(D). 임시 골격.
export function CartSheet({ cart, currency, onChangeQty, onClose }: CartSheetProps) {
  return (
    <Sheet title="Cart" onClose={onClose}>
      <ul>
        {cart.map((l) => (
          <li key={l.item_id}>
            {l.title} <Price krw={l.price_krw == null ? null : l.price_krw * l.qty} currency={currency} size="sm" />
            <button type="button" onClick={() => onChangeQty(l.item_id, l.qty - 1)}>−</button> {l.qty}
            <button type="button" onClick={() => onChangeQty(l.item_id, l.qty + 1)}>+</button>
          </li>
        ))}
      </ul>
    </Sheet>
  )
}

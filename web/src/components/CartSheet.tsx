import type { CartSheetProps } from '../screens/contracts'
import { CategoryBadge, Price, Sheet } from './Common'
import { EmptyState } from './States'
import { fill, useLang, useT } from '../lib/i18n'
import { convertKrw, formatMoney, fxSourceLine, useFx } from '../lib/currency'
import { cartTotals, linePrice } from '../lib/cartTotals'
import '../styles/explore.css'

// 담당: 탐색·검색·카트(D). 원화 합계 + 선택 통화 환산(ECB 기준율, 출처·기준일 표시).
// 가격 미표기 항목은 합계에서 빠졌다고 밝히고, 환율이 없는 통화는 원화로만 보여준다. 가격 차이를 할인으로 말하지 않는다.
export function CartSheet({ cart, currency, onChangeQty, onOpenItem, onGoTrip, onClose }: CartSheetProps) {
  const t = useT()
  const lang = useLang()
  const fx = useFx()

  // 통화별 소계(원화 판매가, 판매처 표시가격). 서로 더하지 않는다.
  const { totals, unpriced } = cartTotals(cart)
  const krw = totals.find((x) => x.currency === 'KRW' && !x.listed)
  const ready = fx.status === 'ready' ? fx.fx : null
  const converted = krw ? convertKrw(krw.amount, currency, ready) : null
  const noRate = currency !== 'KRW' && ready != null && converted == null && !!krw

  return (
    <Sheet title={t('explore.cartTitle')} onClose={onClose}>
      {cart.length === 0 ? (
        <EmptyState title={t('explore.cartEmptyTitle')} body={t('explore.cartEmptyBody')} />
      ) : (
        <div className="ex-cart">
          <ul className="ex-cart__list">
            {cart.map((l) => (
              <li key={l.item_id} className="ex-cart__line">
                <div className="ex-cart__head">
                  <CategoryBadge category={l.category} />
                  <button type="button" className="ex-cart__title" onClick={() => onOpenItem(l.item_id)}>{l.title}</button>
                </div>
                <div className="ex-cart__row">
                  <div className="ex-qty" role="group" aria-label={fill(t('explore.qty'), { n: l.qty })}>
                    <button type="button" aria-label={fill(t('explore.qtyDown'), { title: l.title })} onClick={() => onChangeQty(l.item_id, l.qty - 1)}>−</button>
                    <span aria-live="polite">{l.qty}</span>
                    <button type="button" aria-label={fill(t('explore.qtyUp'), { title: l.title })} onClick={() => onChangeQty(l.item_id, l.qty + 1)}>+</button>
                  </div>
                  <span className="ex-cart__sub">
                    <span className="sr-only">{t('explore.subtotal')} </span>
                    <LineSubtotal line={l} currency={currency} />
                  </span>
                </div>
              </li>
            ))}
          </ul>

          <div className="ex-cart__total">
            {totals.length === 0 && (
              <div className="ex-cart__sum">
                <span>{t('explore.total')}</span>
                <strong data-testid="cart-total">—</strong>
              </div>
            )}
            {totals.map((x) => (
              <div key={`${x.currency}-${x.listed}`} className="ex-cart__sum">
                <span>{fill(t(x.listed ? 'explore.totalListed' : 'explore.totalIn'), { currency: x.currency })}</span>
                <strong data-testid={`cart-total-${x.currency}${x.listed ? '-listed' : ''}`}>{formatMoney(x.amount, x.currency, lang)}</strong>
              </div>
            ))}
            {totals.length > 1 && <p className="note">{t('explore.perCurrency')}</p>}
            {converted != null && ready && (
              <div className="ex-cart__fx">
                <span>{fill(t('explore.totalFx'), { amount: formatMoney(converted, currency, lang), currency })}</span>
                <span className="provenance">{fxSourceLine(ready)}</span>
              </div>
            )}
            {noRate && <p className="note">{fill(t('explore.noRate'), { currency })}</p>}
            {fx.status === 'error' && currency !== 'KRW' && <p className="note">{t('explore.fxError')}</p>}
            {unpriced > 0 && <p className="note note--warn">{fill(t('explore.unpriced'), { n: unpriced })}</p>}
            <p className="ex-cart__fine">{t('explore.priceNote')}</p>
          </div>

          <div className="ex-cart__actions">
            <button type="button" className="btn btn--primary btn--block btn--lg" onClick={onGoTrip}>{t('explore.goTrip')}</button>
          </div>
        </div>
      )}
    </Sheet>
  )
}

/** 줄 소계: 원화 판매가가 있으면 원화(+선택 통화 환산), 없으면 판매처 표시가격(통화 그대로) × 수량. 둘 다 없으면 미표기. */
function LineSubtotal({ line, currency }: { line: CartSheetProps['cart'][number]; currency: string }) {
  const p = linePrice(line)
  if (!p) return <Price krw={null} currency={currency} size="sm" />
  if (!p.listed) return <Price krw={p.amount * line.qty} currency={currency} size="sm" />
  return <Price krw={null} list={{ ...line.list_price!, amount: p.amount * line.qty }} currency={currency} size="sm" />
}

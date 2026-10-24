import type { CartSheetProps } from '../screens/contracts'
import { CategoryBadge, Price, Sheet } from './Common'
import { EmptyState } from './States'
import { fill, useLang, useT } from '../lib/i18n'
import { convertKrw, formatKrw, formatMoney, fxSourceLine, useFx } from '../lib/currency'
import '../styles/explore.css'

// 담당: 탐색·검색·카트(D). 원화 합계 + 선택 통화 환산(ECB 기준율, 출처·기준일 표시).
// 가격 미표기 항목은 합계에서 빠졌다고 밝히고, 환율이 없는 통화는 원화로만 보여준다. 가격 차이를 할인으로 말하지 않는다.
export function CartSheet({ cart, currency, onChangeQty, onOpenItem, onGoTrip, onClose }: CartSheetProps) {
  const t = useT()
  const lang = useLang()
  const fx = useFx()

  const priced = cart.filter((l) => l.price_krw != null)
  const unpriced = cart.filter((l) => l.price_krw == null)
  const total = priced.reduce((sum, l) => sum + (l.price_krw ?? 0) * l.qty, 0)
  const ready = fx.status === 'ready' ? fx.fx : null
  const converted = priced.length > 0 ? convertKrw(total, currency, ready) : null
  const noRate = currency !== 'KRW' && ready != null && converted == null && priced.length > 0

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
                    <Price krw={l.price_krw == null ? null : l.price_krw * l.qty} currency={currency} size="sm" />
                  </span>
                </div>
              </li>
            ))}
          </ul>

          <div className="ex-cart__total">
            <div className="ex-cart__sum">
              <span>{t('explore.total')}</span>
              <strong data-testid="cart-total">{formatKrw(total)}</strong>
            </div>
            {converted != null && ready && (
              <div className="ex-cart__fx">
                <span>{fill(t('explore.totalFx'), { amount: formatMoney(converted, currency, lang), currency })}</span>
                <span className="provenance">{fxSourceLine(ready)}</span>
              </div>
            )}
            {noRate && <p className="note">{fill(t('explore.noRate'), { currency })}</p>}
            {fx.status === 'error' && currency !== 'KRW' && <p className="note">{t('explore.fxError')}</p>}
            {unpriced.length > 0 && <p className="note note--warn">{fill(t('explore.unpriced'), { n: unpriced.length })}</p>}
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

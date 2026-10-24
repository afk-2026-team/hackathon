import { useEffect, useState } from 'react'
import type { CatalogItem, CategoryFilter, ProfilePayload } from '../lib/types'
import { useRecommendations } from '../lib/useRecommendations'
import { ItemCard } from '../components/ItemCard'
import { ItemDetail } from '../components/ItemDetail'
import { CountryNote } from '../components/CountryNote'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import type { CartLine } from '../lib/storage'
import { formatKrw } from '../lib/format'

interface Props {
  profile: ProfilePayload
  category: CategoryFilter
  onCategory: (c: CategoryFilter) => void
  selected: CatalogItem | null
  onSelect: (i: CatalogItem | null) => void
  cart: CartLine[]
  tripIds: Set<string>
  onAddCart: (i: CatalogItem) => void
  onAddTrip: (i: CatalogItem) => void
  onChangeQty: (id: string, qty: number) => void
}

type Feed = 'picks' | 'sponsored'

export function Explore(p: Props) {
  const { state, retry } = useRecommendations(p.profile, p.category)
  const [feed, setFeed] = useState<Feed>('picks')
  const [cartOpen, setCartOpen] = useState(false)

  const items = state.status === 'ready' ? state.data.items : []
  const visible = items.filter((i) => (feed === 'sponsored' ? i.sponsorship === 'sponsored' : i.sponsorship !== 'sponsored'))
  const sponsoredCount = items.filter((i) => i.sponsorship === 'sponsored').length

  useEffect(() => {
    if (feed === 'sponsored' && state.status === 'ready' && sponsoredCount === 0) setFeed('picks')
  }, [feed, sponsoredCount, state.status])

  const count = p.cart.reduce((n, l) => n + l.qty, 0)
  const priced = p.cart.filter((l) => l.price_krw != null)
  const total = priced.reduce((s, l) => s + (l.price_krw ?? 0) * l.qty, 0)
  const unpriced = p.cart.length - priced.length

  return (
    <div className="screen explore">
      <div className="explore__bar">
        <div className="segmented" role="tablist" aria-label="Category">
          {(['all', 'beauty', 'medical'] as CategoryFilter[]).map((c) => (
            <button key={c} role="tab" aria-selected={p.category === c} className={p.category === c ? 'is-on' : ''} onClick={() => p.onCategory(c)}>
              {c === 'all' ? 'All' : c === 'beauty' ? 'Beauty' : 'Medical'}
            </button>
          ))}
        </div>
        <div className="segmented segmented--quiet" role="tablist" aria-label="Feed">
          <button role="tab" aria-selected={feed === 'picks'} className={feed === 'picks' ? 'is-on' : ''} onClick={() => setFeed('picks')}>Picks</button>
          <button role="tab" aria-selected={feed === 'sponsored'} className={feed === 'sponsored' ? 'is-on' : ''} disabled={sponsoredCount === 0} onClick={() => setFeed('sponsored')}>
            Sponsored{sponsoredCount ? ` · ${sponsoredCount}` : ''}
          </button>
        </div>
      </div>

      {state.status === 'loading' && <LoadingState label="Loading picks" />}
      {state.status === 'error' && <ErrorState message={state.message} onRetry={retry} />}
      {state.status === 'ready' && (
        <div className="explore__layout">
          <div className="explore__list">
            <CountryNote ctx={state.data.country_context} />
            {feed === 'sponsored' && <p className="note">Paid placements, shown separately from picks.</p>}
            {visible.length ? (
              <div className="list">
                {visible.map((i) => (
                  <ItemCard key={i.id} item={i} selected={p.selected?.id === i.id} onOpen={p.onSelect} />
                ))}
              </div>
            ) : (
              <EmptyState title="Nothing here yet" body="Try another category." />
            )}
          </div>
          <div className={`explore__detail${p.selected ? ' is-open' : ''}`}>
            {p.selected ? (
              <ItemDetail
                item={p.selected}
                inCart={p.cart.find((l) => l.item_id === p.selected!.id)?.qty ?? 0}
                inTrip={p.tripIds.has(p.selected.id)}
                onAddCart={p.onAddCart}
                onAddTrip={p.onAddTrip}
                onClose={() => p.onSelect(null)}
              />
            ) : (
              <EmptyState title="Pick something" body="Select a product or place to see its sources and sponsorship status." />
            )}
          </div>
        </div>
      )}

      {p.cart.length > 0 && (
        <div className={`cart${cartOpen ? ' is-open' : ''}`}>
          <button type="button" className="cart__bar" aria-expanded={cartOpen} onClick={() => setCartOpen(!cartOpen)}>
            <span>Cart · {count}</span>
            <strong>{formatKrw(total)}{unpriced ? ' +' : ''}</strong>
          </button>
          {cartOpen && (
            <div className="cart__panel">
              <ul>
                {p.cart.map((l) => (
                  <li key={l.item_id}>
                    <span className="cart__title">{l.title}</span>
                    <span className="qty">
                      <button type="button" aria-label={`Decrease ${l.title}`} onClick={() => p.onChangeQty(l.item_id, l.qty - 1)}>−</button>
                      <span aria-live="polite">{l.qty}</span>
                      <button type="button" aria-label={`Increase ${l.title}`} onClick={() => p.onChangeQty(l.item_id, l.qty + 1)}>+</button>
                    </span>
                    <span className="cart__price">{l.price_krw != null ? formatKrw(l.price_krw * l.qty) : 'Not listed'}</span>
                  </li>
                ))}
              </ul>
              <p className="note">
                Prices in KRW from the listed source. {unpriced ? `${unpriced} item${unpriced > 1 ? 's' : ''} without a listed price ${unpriced > 1 ? 'are' : 'is'} not in the total. ` : ''}
                Final price and availability are confirmed by the seller.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

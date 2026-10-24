import { useEffect, useRef, useState } from 'react'
import type { CatalogItem, CategoryFilter, ProfilePayload } from '../lib/types'
import { useRecommendations } from '../lib/useRecommendations'
import { ItemCard } from '../components/ItemCard'
import { ItemDetail } from '../components/ItemDetail'
import { CountryNote } from '../components/CountryNote'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import type { CartLine } from '../lib/storage'
import { formatKrw } from '../lib/format'
import { useT } from '../lib/i18n'

interface Props {
  profile: ProfilePayload
  currentProduct?: string
  onSetCurrent: (name: string) => void
  category: CategoryFilter
  onCategory: (c: CategoryFilter) => void
  selected: CatalogItem | null
  selectedId: string | null
  onSelect: (i: CatalogItem | null) => void
  cart: CartLine[]
  tripIds: Set<string>
  onAddCart: (i: CatalogItem) => void
  onAddTrip: (i: CatalogItem) => void
  onChangeQty: (id: string, qty: number) => void
}

type Feed = 'picks' | 'sponsored'

function useIsDesktop() {
  const q = '(min-width: 960px)'
  const [d, setD] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches)
  useEffect(() => {
    const m = window.matchMedia?.(q)
    if (!m) return
    const on = () => setD(m.matches)
    m.addEventListener?.('change', on)
    return () => m.removeEventListener?.('change', on)
  }, [])
  return d
}

export function Explore(p: Props) {
  const t = useT()
  const { state, retry } = useRecommendations(p.profile, p.category)
  const [feed, setFeed] = useState<Feed>('picks')
  const [listOpen, setListOpen] = useState(false)
  const desktop = useIsDesktop()
  const closeRef = useRef<HTMLDivElement>(null)

  const items = state.status === 'ready' ? state.data.items : []
  const visible = items.filter((i) => (feed === 'sponsored' ? i.sponsorship === 'sponsored' : i.sponsorship !== 'sponsored'))
  const sponsoredCount = items.filter((i) => i.sponsorship === 'sponsored').length

  useEffect(() => {
    if (feed === 'sponsored' && state.status === 'ready' && sponsoredCount === 0) setFeed('picks')
  }, [feed, sponsoredCount, state.status])

  // 딥링크(#explore/<id>)로 들어왔을 때 목록이 도착하면 해당 항목을 연다
  useEffect(() => {
    if (state.status !== 'ready' || !p.selectedId || p.selected?.id === p.selectedId) return
    const hit = items.find((i) => i.id === p.selectedId)
    if (hit) p.onSelect(hit)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status, p.selectedId])

  const sheet = !!p.selected && !desktop
  useEffect(() => {
    if (!sheet) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && p.onSelect(null)
    document.addEventListener('keydown', onKey)
    closeRef.current?.querySelector<HTMLButtonElement>('.detail__close')?.focus()
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden' // 시트 뒤 목록이 같이 스크롤되지 않게
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet])

  const count = p.cart.reduce((n, l) => n + l.qty, 0)
  const priced = p.cart.filter((l) => l.price_krw != null)
  const total = priced.reduce((s, l) => s + (l.price_krw ?? 0) * l.qty, 0)
  const unpriced = p.cart.length - priced.length

  const tabs: [CategoryFilter, string][] = [['all', t('explore.all')], ['beauty', t('explore.beauty')], ['medical', t('explore.medical')]]

  return (
    <div className={`screen explore${p.cart.length > 0 ? ' explore--with-list' : ''}`}>
      <div className="explore__bar">
        <div className="segmented" role="tablist" aria-label="Category">
          {tabs.map(([c, label]) => (
            <button key={c} role="tab" aria-selected={p.category === c} className={p.category === c ? 'is-on' : ''} onClick={() => p.onCategory(c)}>
              {label}
            </button>
          ))}
        </div>
        <div className="segmented segmented--quiet" role="tablist" aria-label="Feed">
          <button role="tab" aria-selected={feed === 'picks'} className={feed === 'picks' ? 'is-on' : ''} onClick={() => setFeed('picks')}>{t('explore.picks')}</button>
          <button role="tab" aria-selected={feed === 'sponsored'} className={feed === 'sponsored' ? 'is-on' : ''} disabled={sponsoredCount === 0} onClick={() => setFeed('sponsored')}>
            {t('explore.sponsored')}{sponsoredCount ? ` · ${sponsoredCount}` : ''}
          </button>
        </div>
      </div>

      {state.status === 'loading' && <LoadingState />}
      {state.status === 'error' && <ErrorState message={state.message} onRetry={retry} />}
      {state.status === 'ready' && (
        <div className="explore__layout">
          <div className="explore__list">
            <CountryNote ctx={state.data.country_context} />
            {feed === 'sponsored' && <p className="note">{t('explore.paid')}</p>}
            {visible.length ? (
              <div className="list">
                {visible.map((i) => (
                  <ItemCard key={i.id} item={i} selected={p.selected?.id === i.id} onOpen={p.onSelect} />
                ))}
              </div>
            ) : (
              <EmptyState title={t('explore.empty')} body={t('explore.emptyBody')} />
            )}
          </div>
          {sheet && <div className="sheet-backdrop" onClick={() => p.onSelect(null)} aria-hidden="true" />}
          <div
            ref={closeRef}
            className={`explore__detail${p.selected ? ' is-open' : ''}`}
            {...(sheet ? { role: 'dialog', 'aria-modal': true, 'aria-label': p.selected!.title } : {})}
          >
            {p.selected ? (
              <ItemDetail
                item={p.selected}
                profile={p.profile}
                currentProduct={p.currentProduct}
                onSetCurrent={p.onSetCurrent}
                inCart={p.cart.find((l) => l.item_id === p.selected!.id)?.qty ?? 0}
                inTrip={p.tripIds.has(p.selected.id)}
                onAddCart={p.onAddCart}
                onAddTrip={p.onAddTrip}
                onClose={desktop ? undefined : () => p.onSelect(null)}
              />
            ) : (
              <EmptyState title={t('explore.pickSomething')} body={t('explore.pickBody')} />
            )}
          </div>
        </div>
      )}

      {p.cart.length > 0 && !sheet && (
        <div className={`cart${listOpen ? ' is-open' : ''}`}>
          <button type="button" className="cart__bar" aria-expanded={listOpen} aria-controls="shopping-panel" onClick={() => setListOpen(!listOpen)}>
            <span>{t('list.title')} · {count}</span>
            <strong>{formatKrw(total)}{unpriced ? ' +' : ''}</strong>
          </button>
          {listOpen && (
            <div className="cart__panel" id="shopping-panel">
              <ul>
                {p.cart.map((l) => (
                  <li key={l.item_id}>
                    <span className="cart__title">{l.title}</span>
                    <span className="qty">
                      <button type="button" aria-label={`− ${l.title}`} onClick={() => p.onChangeQty(l.item_id, l.qty - 1)}>−</button>
                      <span aria-live="polite">{l.qty}</span>
                      <button type="button" aria-label={`+ ${l.title}`} onClick={() => p.onChangeQty(l.item_id, l.qty + 1)}>+</button>
                    </span>
                    <span className="cart__price">{l.price_krw != null ? formatKrw(l.price_krw * l.qty) : t('detail.notListed')}</span>
                  </li>
                ))}
              </ul>
              <p className="cart__total"><span>{t('list.total')}</span><strong>{formatKrw(total)}</strong></p>
              {unpriced > 0 && <p className="note">+ {unpriced} {t('list.unpriced')}</p>}
              <p className="note">{t('list.sellerNote')}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

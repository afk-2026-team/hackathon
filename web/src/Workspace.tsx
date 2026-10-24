import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CatalogItem, CategoryFilter } from './lib/types'
import { fetchCatalog } from './lib/api'
import {
  clearAll, loadCart, loadProfile, loadTrip, saveCart, saveProfile, saveTrip, toPayload,
  type CartLine, type Namespace, type Profile, type TripEntry,
} from './lib/storage'
import { DocTitle, LangContext, toLang, type Lang } from './lib/i18n'
import type { AccountView } from './screens/Settings'
import { Onboarding } from './screens/Onboarding'
import { Home } from './screens/Home'
import { Explore } from './screens/Explore'
import { MyTrip } from './screens/MyTrip'
import { Settings } from './screens/Settings'
import { Search } from './screens/Search'
import { ItemDetail } from './screens/ItemDetail'
import { BottomNav, type Tab } from './components/BottomNav'
import { Topbar } from './components/Topbar'
import { CartSheet } from './components/CartSheet'
import { Tutorial } from './components/Tutorial'
import { Toast } from './components/Common'

// 화면 주소: #home, #explore, #trip, #explore/<itemId>(상세). 새로고침·공유·발표 캡처 때 같은 화면으로 돌아온다.
export function parseHash(hash: string): { tab: Tab; itemId: string | null } {
  const [head, id] = hash.replace(/^#\/?/, '').split('/')
  const tab: Tab = head === 'explore' || head === 'trip' ? head : 'home'
  let itemId: string | null = null
  if (tab === 'explore' && id) {
    try {
      itemId = decodeURIComponent(id)
    } catch {
      itemId = null // 잘못된 % 인코딩은 무시하고 목록만 연다
    }
  }
  return { tab, itemId }
}

// 탭 위에 겹치는 화면. 뒤로 가기는 맨 위 하나를 걷어낸다.
type View = { type: 'detail'; item: CatalogItem } | { type: 'search' } | { type: 'settings' } | { type: 'edit' }

interface WorkspaceProps {
  ns: Namespace
  uiLang: Lang
  account: AccountView
  onSignIn: () => void
  onSignOut: () => void
  onResetDone: () => void
}

// 계정 공간(ns) 하나의 앱 화면. ns 가 바뀌면 key 로 새로 마운트되어 데이터가 섞이지 않는다.
export function Workspace({ ns, uiLang, account, onSignIn, onSignOut, onResetDone }: WorkspaceProps) {
  const [profile, setProfileState] = useState<Profile | null>(() => loadProfile(ns))
  const [cart, setCartState] = useState<CartLine[]>(() => loadCart(ns))
  const [trip, setTripState] = useState<TripEntry[]>(() => loadTrip(ns))
  const [tab, setTab] = useState<Tab>(() => parseHash(window.location.hash).tab)
  const [stack, setStack] = useState<View[]>([])
  // 주소에 담긴 상세 항목 id. 카탈로그를 받은 뒤 상세로 연다.
  const [pendingId, setPendingId] = useState<string | null>(() => parseHash(window.location.hash).itemId)
  const [cartOpen, setCartOpen] = useState(false)
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [extraDays, setExtraDays] = useState(0)
  const [toast, setToast] = useState<string | null>(null)
  // 담은 항목·여행 항목을 다시 열 때 쓰는 id → 항목 표. 실패해도 화면은 계속 쓴다(열기만 못 함).
  const [catalog, setCatalog] = useState<Map<string, CatalogItem>>(new Map())

  useEffect(() => {
    let alive = true
    fetchCatalog()
      .then((c) => alive && setCatalog(new Map(c.items.map((i) => [i.id, i]))))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!pendingId) return
    const item = catalog.get(pendingId)
    if (item) {
      setStack([{ type: 'detail', item }])
      setPendingId(null)
    }
  }, [catalog, pendingId])

  // 탭·상세 이동을 주소에 남겨 브라우저 뒤로 가기로 돌아올 수 있게 한다(첫 진입은 교체).
  const top = stack[stack.length - 1]
  const detailId = top?.type === 'detail' ? top.item.id : null
  useEffect(() => {
    if (pendingId) return // 딥링크를 해석하기 전에는 주소를 덮지 않는다
    const next = detailId ? `#explore/${encodeURIComponent(detailId)}` : `#${tab}`
    if (window.location.hash === next) return
    if (window.location.hash) window.history.pushState(null, '', next)
    else window.history.replaceState(null, '', next)
  }, [tab, detailId, pendingId])

  useEffect(() => {
    const onNavigate = () => {
      const h = parseHash(window.location.hash)
      setCartOpen(false)
      setTab(h.tab)
      setStack([])
      setPendingId(h.itemId)
    }
    window.addEventListener('popstate', onNavigate)
    window.addEventListener('hashchange', onNavigate)
    return () => {
      window.removeEventListener('popstate', onNavigate)
      window.removeEventListener('hashchange', onNavigate)
    }
  }, [])

  const payload = useMemo(() => (profile ? toPayload(profile) : null), [profile])
  const tripIds = useMemo(() => new Set(trip.map((e) => e.item_id)), [trip])
  const cartQty = useMemo(() => Object.fromEntries(cart.map((l) => [l.item_id, l.qty])), [cart])
  const cartCount = cart.reduce((n, l) => n + l.qty, 0)
  const lang = toLang(profile?.language ?? uiLang)
  const clearToast = useCallback(() => setToast(null), [])

  const setProfile = (p: Profile) => {
    saveProfile(ns, p)
    setProfileState(p)
  }
  const setCart = (c: CartLine[]) => {
    saveCart(ns, c)
    setCartState(c)
  }
  const setTrip = (t: TripEntry[]) => {
    saveTrip(ns, t)
    setTripState(t)
  }

  if (!profile || !payload) {
    return <Onboarding uiLang={uiLang} onComplete={(p) => setProfile(p)} />
  }
  if (top?.type === 'edit') {
    return (
      <Onboarding
        uiLang={lang}
        mode="edit"
        initial={profile}
        onCancel={() => setStack(stack.slice(0, -1))}
        onComplete={(p) => {
          setProfile(p)
          setStack(stack.slice(0, -1))
        }}
      />
    )
  }

  const push = (v: View) => setStack([...stack, v])
  const pop = () => setStack(stack.slice(0, -1))
  const openItem = (item: CatalogItem) => push({ type: 'detail', item })
  const openItemId = (id: string) => {
    const item = catalog.get(id)
    if (item) {
      setCartOpen(false)
      push({ type: 'detail', item })
    }
  }
  const goTab = (t: Tab) => {
    setStack([])
    setCartOpen(false)
    setTab(t)
  }

  const addCart = (i: CatalogItem) => {
    const existing = cart.find((l) => l.item_id === i.id)
    setCart(
      existing
        ? cart.map((l) => (l.item_id === i.id ? { ...l, qty: l.qty + 1 } : l))
        : [...cart, { item_id: i.id, title: i.title, category: i.category, price_krw: i.price_krw, qty: 1 }],
    )
    setToast(lang === 'ko' ? '카트에 담았어요' : 'Added to cart')
  }
  const changeQty = (id: string, qty: number) =>
    setCart(qty <= 0 ? cart.filter((l) => l.item_id !== id) : cart.map((l) => (l.item_id === id ? { ...l, qty } : l)))

  const maxDay = trip.reduce((m, e) => Math.max(m, e.day), 1)
  const days = maxDay + extraDays

  const addTrip = (i: CatalogItem) => {
    if (tripIds.has(i.id)) return
    setTrip([...trip, { entry_id: `${i.id}-${Date.now()}`, item_id: i.id, title: i.title, category: i.category, location: i.location, day: 1 }])
    setToast(lang === 'ko' ? '내 여행에 추가했어요' : 'Added to My Trip')
  }
  const moveEntry = (entryId: string, dir: -1 | 1) => {
    const e = trip.find((x) => x.entry_id === entryId)
    if (!e) return
    const sameDay = trip.filter((x) => x.day === e.day)
    const j = sameDay.indexOf(e) + dir
    if (j < 0 || j >= sameDay.length) return
    const other = sameDay[j]
    const a = trip.indexOf(e)
    const b = trip.indexOf(other)
    const next = [...trip]
    next[a] = other
    next[b] = e
    setTrip(next)
  }

  let body: React.ReactNode
  if (top?.type === 'detail') {
    body = (
      <ItemDetail
        key={top.item.id}
        item={top.item}
        ns={ns}
        profile={payload}
        onBack={pop}
        onAddCart={addCart}
        onAddTrip={addTrip}
        onOpenCart={() => setCartOpen(true)}
        onGoTrip={() => goTab('trip')}
        cartQty={cartQty[top.item.id] ?? 0}
        inTrip={tripIds.has(top.item.id)}
        currentProduct={profile.preferences?.current_product}
        onSetCurrent={(name) => setProfile({ ...profile, preferences: { ...(profile.preferences ?? {}), current_product: name } })}
      />
    )
  } else if (top?.type === 'search') {
    body = <Search profile={payload} onBack={pop} onOpen={openItem} />
  } else if (top?.type === 'settings') {
    body = (
      <Settings
        profile={profile}
        onEdit={() => push({ type: 'edit' })}
        onReplayTour={() => {
          setProfile({ ...profile, tutorial_done: false })
          goTab('home')
        }}
        onReset={() => {
          clearAll(ns)
          setCartState([])
          setTripState([])
          setProfileState(null)
          setStack([])
          onResetDone()
        }}
        onClose={pop}
        account={account}
        onSignIn={onSignIn}
        onSignOut={onSignOut}
      />
    )
  } else {
    body = (
      <>
        <Topbar onHome={() => goTab('home')} onSearch={() => push({ type: 'search' })} onCart={() => setCartOpen(true)} onSettings={() => push({ type: 'settings' })} cartCount={cartCount} />
        <main className="content">
          {tab === 'home' ? (
            <Home
              profile={payload}
              onOpen={openItem}
              onBrowse={(c) => {
                setCategory(c)
                goTab('explore')
              }}
              onSearch={() => push({ type: 'search' })}
              onGoTrip={() => goTab('trip')}
              tripCount={trip.length}
              cartCount={cartCount}
            />
          ) : tab === 'explore' ? (
            <Explore
              profile={payload}
              category={category}
              onCategory={setCategory}
              onOpen={openItem}
              onAddCart={addCart}
              onSearch={() => push({ type: 'search' })}
              cartQty={cartQty}
              tripIds={tripIds}
            />
          ) : (
            <MyTrip
              ns={ns}
              profile={payload}
              trip={trip}
              cart={cart}
              days={days}
              onMove={moveEntry}
              onDay={(id, day) => setTrip(trip.map((e) => (e.entry_id === id ? { ...e, day } : e)))}
              onRemove={(id) => setTrip(trip.filter((e) => e.entry_id !== id))}
              onAddDay={() => setExtraDays(extraDays + 1)}
              onExplore={() => goTab('explore')}
              onOpenItem={openItemId}
              onOpenCart={() => setCartOpen(true)}
            />
          )}
        </main>
      </>
    )
  }

  return (
    <LangContext.Provider value={lang}>
      <div className="app">
        <DocTitle />
        {body}
        <BottomNav current={tab} onChange={goTab} badge={trip.length} />
        {cartOpen && (
          <CartSheet
            cart={cart}
            currency={payload.currency}
            onChangeQty={changeQty}
            onOpenItem={openItemId}
            onGoTrip={() => goTab('trip')}
            onClose={() => setCartOpen(false)}
          />
        )}
        <Toast message={toast} onDone={clearToast} />
        {!profile.tutorial_done && !top && <Tutorial onDone={() => setProfile({ ...profile, tutorial_done: true })} />}
      </div>
    </LangContext.Provider>
  )
}

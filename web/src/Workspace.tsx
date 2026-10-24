import { useEffect, useMemo, useState } from 'react'
import type { CatalogItem, CategoryFilter } from './lib/types'
import {
  clearAll, loadCart, loadProfile, loadTrip, saveCart, saveProfile, saveTrip, toPayload,
  type CartLine, type Namespace, type Profile, type TripEntry,
} from './lib/storage'
import { DocTitle, LangContext, toLang, translate, type Lang } from './lib/i18n'
import type { AccountView } from './screens/Settings'
import { Onboarding } from './screens/Onboarding'
import { Home } from './screens/Home'
import { Explore } from './screens/Explore'
import { MyTrip } from './screens/MyTrip'
import { Settings } from './screens/Settings'
import { BottomNav, type Tab } from './components/BottomNav'
import { Tutorial } from './components/Tutorial'

type Overlay = null | 'settings' | 'edit'

// 화면 주소: #home, #explore, #explore/<itemId>, #trip (발표 캡처·새로고침 복원용)
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
  const [selectedId, setSelectedId] = useState<string | null>(() => parseHash(window.location.hash).itemId)
  const [overlay, setOverlay] = useState<Overlay>(null)
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [selected, setSelected] = useState<CatalogItem | null>(null)
  const [extraDays, setExtraDays] = useState(0)

  const payload = useMemo(() => (profile ? toPayload(profile) : null), [profile])
  const tripIds = useMemo(() => new Set(trip.map((e) => e.item_id)), [trip])

  useEffect(() => {
    const next = tab === 'explore' && (selected?.id ?? selectedId) ? `#explore/${encodeURIComponent(selected?.id ?? selectedId!)}` : `#${tab}`
    // 탭·항목 이동은 기록에 남겨 브라우저 뒤로가기로 돌아올 수 있게 한다(첫 진입은 교체)
    if (window.location.hash !== next) {
      if (window.location.hash) window.history.pushState(null, '', next)
      else window.history.replaceState(null, '', next)
    }
  }, [tab, selected, selectedId])

  useEffect(() => {
    const onHash = () => {
      const h = parseHash(window.location.hash)
      setOverlay(null)
      setTab(h.tab)
      setSelectedId(h.itemId)
      setSelected((cur) => (h.itemId && cur?.id === h.itemId ? cur : null))
    }
    window.addEventListener('popstate', onHash)
    window.addEventListener('hashchange', onHash)
    return () => {
      window.removeEventListener('popstate', onHash)
      window.removeEventListener('hashchange', onHash)
    }
  }, [])

  const select = (i: CatalogItem | null) => {
    setSelected(i)
    setSelectedId(i?.id ?? null)
  }

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
  const lang = toLang(profile.language)
  if (overlay === 'edit') {
    return (
      <Onboarding
        uiLang={lang}
        mode="edit"
        initial={profile}
        onCancel={() => setOverlay('settings')}
        onComplete={(p) => {
          setProfile(p)
          setOverlay('settings')
        }}
      />
    )
  }

  const addCart = (i: CatalogItem) => {
    const existing = cart.find((l) => l.item_id === i.id)
    setCart(
      existing
        ? cart.map((l) => (l.item_id === i.id ? { ...l, qty: l.qty + 1 } : l))
        : [...cart, { item_id: i.id, title: i.title, category: i.category, price_krw: i.price_krw, qty: 1 }],
    )
  }
  const changeQty = (id: string, qty: number) =>
    setCart(qty <= 0 ? cart.filter((l) => l.item_id !== id) : cart.map((l) => (l.item_id === id ? { ...l, qty } : l)))

  const maxDay = trip.reduce((m, e) => Math.max(m, e.day), 1)
  const days = maxDay + extraDays

  const addTrip = (i: CatalogItem) => {
    if (tripIds.has(i.id)) return
    setTrip([...trip, { entry_id: `${i.id}-${Date.now()}`, item_id: i.id, title: i.title, category: i.category, location: i.location, day: 1 }])
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

  const goTab = (t: Tab) => {
    setOverlay(null)
    setTab(t)
  }

  return (
    <LangContext.Provider value={lang}>
    <div className="app">
      <header className="topbar">
        <button type="button" className="brand" onClick={() => goTab('home')}>{translate(lang, 'brand')}</button>
        <DocTitle />
        <button type="button" className="icon-btn" aria-label={translate(lang, 'settings.title')} onClick={() => setOverlay('settings')}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path fill="currentColor" d="M12 8.5a3.5 3.5 0 110 7 3.5 3.5 0 010-7zm8.2 2.2l-1.7-.3a6.9 6.9 0 00-.7-1.6l1-1.4-1.9-1.9-1.4 1a6.9 6.9 0 00-1.6-.7l-.3-1.7h-2.7l-.3 1.7a6.9 6.9 0 00-1.6.7l-1.4-1-1.9 1.9 1 1.4a6.9 6.9 0 00-.7 1.6l-1.7.3v2.6l1.7.3c.2.6.4 1.1.7 1.6l-1 1.4 1.9 1.9 1.4-1c.5.3 1 .5 1.6.7l.3 1.7h2.7l.3-1.7c.6-.2 1.1-.4 1.6-.7l1.4 1 1.9-1.9-1-1.4c.3-.5.5-1 .7-1.6l1.7-.3z" />
          </svg>
        </button>
      </header>

      <main className="content">
        {overlay === 'settings' ? (
          <Settings
            profile={profile}
            onEdit={() => setOverlay('edit')}
            onReplayTour={() => {
              setProfile({ ...profile, tutorial_done: false })
              goTab('home')
            }}
            onReset={() => {
              clearAll(ns)
              setCartState([])
              setTripState([])
              setProfileState(null)
              setOverlay(null)
              onResetDone()
            }}
            onClose={() => setOverlay(null)}
            account={account}
            onSignIn={onSignIn}
            onSignOut={onSignOut}
          />
        ) : tab === 'home' ? (
          <Home
            profile={payload}
            onOpen={(i) => {
              select(i)
              goTab('explore')
            }}
            onBrowse={(c) => {
              setCategory(c)
              select(null)
              goTab('explore')
            }}
          />
        ) : tab === 'explore' ? (
          <Explore
            profile={payload}
            currentProduct={profile.preferences?.current_product}
            onSetCurrent={(name) => setProfile({ ...profile, preferences: { ...(profile.preferences ?? {}), current_product: name } })}
            selectedId={selectedId}
            category={category}
            onCategory={(c) => {
              setCategory(c)
              select(null)
            }}
            selected={selected}
            onSelect={select}
            cart={cart}
            tripIds={tripIds}
            onAddCart={addCart}
            onAddTrip={addTrip}
            onChangeQty={changeQty}
          />
        ) : (
          <MyTrip
            trip={trip}
            cart={cart}
            days={days}
            onMove={moveEntry}
            onDay={(id, day) => setTrip(trip.map((e) => (e.entry_id === id ? { ...e, day } : e)))}
            onRemove={(id) => setTrip(trip.filter((e) => e.entry_id !== id))}
            onAddDay={() => setExtraDays(extraDays + 1)}
            onExplore={() => goTab('explore')}
          />
        )}
      </main>

      <BottomNav current={tab} onChange={goTab} badge={trip.length} />

      {!profile.tutorial_done && overlay === null && <Tutorial onDone={() => setProfile({ ...profile, tutorial_done: true })} />}
    </div>
    </LangContext.Provider>
  )
}

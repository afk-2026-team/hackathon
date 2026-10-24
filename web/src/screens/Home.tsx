import { useEffect, useState, type ReactNode } from 'react'
import type { HomeProps } from './contracts'
import type { CatalogItem } from '../lib/types'
import { fetchCatalog } from '../lib/api'
import { useRecommendations } from '../lib/useRecommendations'
import { fill, useLang, useT, type Key } from '../lib/i18n'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import { CategoryBadge, Price, SponsorBadge, Thumb } from '../components/Common'
import { isClinic } from '../components/explore/facets'
import { subtitleBesideTitle } from '../components/detail/parts'
import '../styles/shell.css'

// 섹션별 상한. 나머지는 '전체 보기'로 해당 카테고리 Explore 에서 본다. 순서는 서버가 준 그대로(관심사 정렬 포함) 유지한다.
const PICKS_LIMIT = 6
const PLACES_LIMIT = 8
const TAX_TAG = 'tax_refund'

/** 세금 환급 안내 항목. 추천 결과에 없으면 카탈로그에서 한 번 찾는다. 없으면 바로가기를 숨긴다. */
function useTaxGuide(items: CatalogItem[] | null): CatalogItem | null {
  const fromReco = items?.find((i) => i.kind === 'guide' && i.tags?.includes(TAX_TAG)) ?? null
  const [fromCatalog, setFromCatalog] = useState<CatalogItem | null>(null)
  const need = items != null && !fromReco
  const lang = useLang()
  useEffect(() => {
    if (!need) return
    let alive = true
    fetchCatalog(lang)
      .then((c) => alive && setFromCatalog(c.items?.find((i) => i.kind === 'guide' && i.tags?.includes(TAX_TAG)) ?? null))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [need, lang])
  return fromReco ?? fromCatalog
}

function SectionHead({ title, sub, onMore, extra }: { title: string; sub?: string; onMore?: () => void; extra?: ReactNode }) {
  const t = useT()
  return (
    <div className="sec-h">
      <div>
        <h2>{title}{extra}</h2>
        {sub && <p className="sec-h__sub">{sub}</p>}
      </div>
      {onMore && (
        <button type="button" className="sec-h__more home-more" aria-label={`${t('shell.home.more')} · ${title}`} onClick={onMore}>
          {t('shell.home.more')}
        </button>
      )}
    </div>
  )
}

function PinIcon() {
  return (
    <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
      <path d="M10 1.8c-3.3 0-6 2.6-6 5.9C4 12 10 18.2 10 18.2S16 12 16 7.7c0-3.3-2.7-5.9-6-5.9zm0 8.2a2.3 2.3 0 110-4.6 2.3 2.3 0 010 4.6z" fill="currentColor" />
    </svg>
  )
}

/** 화해 랭킹 리스트 톤의 제품 행. 순위 번호 대신 큐레이션 표시(측정 순위를 지어내지 않는다). */
function ProductRow({ item, currency, onOpen }: { item: CatalogItem; currency: string; onOpen: (i: CatalogItem) => void }) {
  return (
    <li>
      <button type="button" className="home-row" onClick={() => onOpen(item)}>
        <Thumb item={item} size={84} />
        <span className="home-row__info">
          {subtitleBesideTitle(item) && <span className="home-row__sub">{subtitleBesideTitle(item)}</span>}
          <span className="home-row__title">{item.title}</span>
          <Price krw={item.price_krw} list={item.list_price} currency={currency} size="sm" />
          <span className="home-row__badges">
            <SponsorBadge value={item.sponsorship} />
          </span>
          {item.reasons?.[0] && <span className="home-row__reason">{item.reasons?.[0]}</span>}
        </span>
      </button>
    </li>
  )
}

function PlaceCard({ item, onOpen }: { item: CatalogItem; onOpen: (i: CatalogItem) => void }) {
  return (
    <li>
      <button type="button" className={`home-place home-place--${item.category}`} onClick={() => onOpen(item)}>
        <Thumb item={item} size={136} />
        <span className="home-place__badges"><CategoryBadge category={item.category} /></span>
        <span className="home-place__title">{item.title}</span>
        {(item.location?.address || item.location?.name) && (
          <span className="home-place__addr"><PinIcon />{item.location?.address ?? item.location?.name}</span>
        )}
      </button>
    </li>
  )
}

type Shortcut = { key: string; label: Key; tone: 'beauty' | 'medical' | 'ink' | 'sponsor'; icon: ReactNode; onClick: () => void }

const ICONS = {
  beauty: <path d="M12 3.5s-6 6.8-6 11a6 6 0 0012 0c0-4.2-6-11-6-11z" fill="currentColor" />,
  medical: <path d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z" fill="currentColor" />,
  all: <path d="M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z" fill="currentColor" />,
  trip: <path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0113 0c0 5-6.5 11-6.5 11zm0-8.6a2.4 2.4 0 100-4.8 2.4 2.4 0 000 4.8z" fill="currentColor" fillRule="evenodd" />,
  tax: <path d="M6 3h12v18l-3-2-3 2-3-2-3 2zm3 5v2h6V8zm0 4v2h6v-2z" fill="currentColor" fillRule="evenodd" />,
}

// 통합 Home: 검색 → 히어로 → 바로가기 → (여행 요약) → 국가 근거 → 뷰티 추천 → 의료·안내 → 장소 → 협찬(분리).
export function Home({ profile, onOpen, onBrowse, onSearch, onGoTrip, tripCount, cartCount }: HomeProps) {
  const t = useT()
  const { state, retry } = useRecommendations(profile, 'all')
  const items = state.status === 'ready' ? state.data.items : null
  const taxGuide = useTaxGuide(items)

  const shortcuts: Shortcut[] = [
    { key: 'beauty', label: 'shell.home.scBeauty', tone: 'beauty', icon: ICONS.beauty, onClick: () => onBrowse('beauty') },
    { key: 'medical', label: 'shell.home.scMedical', tone: 'medical', icon: ICONS.medical, onClick: () => onBrowse('medical') },
    { key: 'all', label: 'shell.home.scAll', tone: 'ink', icon: ICONS.all, onClick: () => onBrowse('all') },
    { key: 'trip', label: 'shell.home.scTrip', tone: 'ink', icon: ICONS.trip, onClick: onGoTrip },
  ]
  if (taxGuide) shortcuts.push({ key: 'tax', label: 'shell.home.scTax', tone: 'sponsor', icon: ICONS.tax, onClick: () => onOpen(taxGuide) })

  // 협찬 항목은 자연 추천과 섞지 않는다. 표시가 없는 항목(unknown)은 비협찬으로 단정하지 않고 배지로 그대로 알린다.
  const natural = items?.filter((i) => i.sponsorship !== 'sponsored') ?? []
  const sponsored = items?.filter((i) => i.sponsorship === 'sponsored') ?? []
  const picks = natural.filter((i) => i.kind === 'product' && i.category === 'beauty')
  // 홈에는 의료·공식 안내 섹션을 두지 않는다(사용자 요청). 병원은 장소 섹션에도 넣지 않고 '의료' 바로가기(탐색)로 본다.
  const places = natural.filter((i) => i.kind === 'place' && !isClinic(i))

  return (
    <div className="home">
      <div className="home-search">
        <button type="button" className="searchbox" onClick={onSearch}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="6.5" />
            <path d="M16 16l4 4" />
          </svg>
          <span>{t('shell.home.search')}</span>
        </button>
      </div>

      <section className="home-hero" aria-labelledby="home-hero-title">
        <p className="home-hero__eyebrow">{t('shell.home.heroEyebrow')}</p>
        <h1 id="home-hero-title" className="home-hero__title">{t('shell.home.heroTitle')}</h1>
        <p className="home-hero__body">{t('shell.home.heroBody')}</p>
        <div className="home-hero__steps" aria-hidden="true">
          <span className="is-beauty">{t('common.beauty')}</span>
          <i />
          <span className="is-medical">{t('common.medical')}</span>
          <i />
          <span>{t('nav.trip')}</span>
        </div>
      </section>

      <nav className="home-grid" aria-label={t('shell.home.shortcuts')}>
        {shortcuts.map((s) => (
          <button key={s.key} type="button" className={`home-grid__item home-grid__item--${s.tone}`} onClick={s.onClick}>
            <span className="home-grid__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="26" height="26">{s.icon}</svg>
            </span>
            <span className="home-grid__label">{t(s.label)}</span>
          </button>
        ))}
      </nav>

      {(tripCount > 0 || cartCount > 0) && (
        <button type="button" className="home-trip" onClick={onGoTrip}>
          <span className="home-trip__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20">{ICONS.trip}</svg>
          </span>
          <span className="home-trip__text">{fill(t('shell.home.tripBanner'), { trip: tripCount, cart: cartCount })}</span>
          <span className="home-trip__cta">{t('shell.home.tripBannerCta')}</span>
        </button>
      )}

      {state.status === 'loading' && <LoadingState />}
      {state.status === 'error' && <ErrorState message={state.message} onRetry={retry} />}

      {state.status === 'ready' && (
        <>
          {natural.length === 0 && (
            <EmptyState
              title={t('shell.home.emptyTitle')}
              body={t('shell.home.emptyBody')}
              action={<button type="button" className="btn btn--ghost btn--small" onClick={() => onBrowse('all')}>{t('nav.explore')}</button>}
            />
          )}

          {picks.length > 0 && (
            <section className="sec home-sec" aria-label={t('shell.home.picks')}>
              <SectionHead
                title={t('shell.home.picks')}
                sub={t('shell.home.picksSub')}
                extra={<span className="home-curated">{t('shell.home.curated')}</span>}
                onMore={() => onBrowse('beauty')}
              />
              <ul className="home-list">
                {picks.slice(0, PICKS_LIMIT).map((i) => (
                  <ProductRow key={i.id} item={i} currency={profile.currency} onOpen={onOpen} />
                ))}
              </ul>
            </section>
          )}


          {places.length > 0 && (
            <>
              <div className="divider" />
              <section className="sec home-sec" aria-label={t('shell.home.places')}>
                <SectionHead title={t('shell.home.places')} sub={t('shell.home.placesSub')} onMore={() => onBrowse('all')} />
                <ul className="hscroll home-places">
                  {places.slice(0, PLACES_LIMIT).map((i) => (
                    <PlaceCard key={i.id} item={i} onOpen={onOpen} />
                  ))}
                </ul>
              </section>
            </>
          )}

          <div className="divider" />
          <section className="sec home-sec home-sponsored" aria-label={t('shell.home.sponsored')}>
            <SectionHead title={t('shell.home.sponsored')} sub={t('shell.home.sponsoredSub')} />
            {sponsored.length > 0 ? (
              <ul className="home-list">
                {sponsored.map((i) => (
                  <ProductRow key={i.id} item={i} currency={profile.currency} onOpen={onOpen} />
                ))}
              </ul>
            ) : (
              <p className="home-sponsored__empty">{t('shell.home.noSponsored')}</p>
            )}
          </section>
        </>
      )}
    </div>
  )
}

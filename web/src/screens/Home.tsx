import type { CatalogItem, ProfilePayload } from '../lib/types'
import { countryName } from '../lib/options'
import { useRecommendations } from '../lib/useRecommendations'
import { ItemCard } from '../components/ItemCard'
import { Glyph } from '../components/Glyph'
import { CountryNote } from '../components/CountryNote'
import { EmptyState, ErrorState, LoadingState } from '../components/States'

interface Props {
  profile: ProfilePayload
  onOpen: (item: CatalogItem) => void
  onBrowse: (category: 'beauty' | 'medical') => void
}

export function Home({ profile, onOpen, onBrowse }: Props) {
  const { state, retry } = useRecommendations(profile, 'all')

  return (
    <div className="screen home">
      <section className="hero">
        <p className="eyebrow">Visiting from {countryName(profile.country)}</p>
        <h1>Beauty and clinics, the way locals know them.</h1>
      </section>

      <section className="domain-cards" aria-label="Browse by category">
        <button type="button" className="domain-card domain-card--beauty" onClick={() => onBrowse('beauty')}>
          <Glyph category="beauty" size={44} />
          <span>
            <strong>Beauty</strong>
            <small>Skincare, makeup, hair</small>
          </span>
        </button>
        <button type="button" className="domain-card domain-card--medical" onClick={() => onBrowse('medical')}>
          <Glyph category="medical" size={44} />
          <span>
            <strong>Medical</strong>
            <small>Dermatology, checkups, dental</small>
          </span>
        </button>
      </section>

      {state.status === 'loading' && <LoadingState label="Finding picks" />}
      {state.status === 'error' && <ErrorState message={state.message} onRetry={retry} />}
      {state.status === 'ready' && <HomeLists items={state.data.items} ctx={state.data.country_context} onOpen={onOpen} />}
    </div>
  )
}

function HomeLists({ items, ctx, onOpen }: { items: CatalogItem[]; ctx: Parameters<typeof CountryNote>[0]['ctx']; onOpen: (i: CatalogItem) => void }) {
  const sponsored = items.filter((i) => i.sponsorship === 'sponsored')
  const picks = items.filter((i) => i.sponsorship !== 'sponsored')
  if (!items.length) return <EmptyState title="No picks yet" body="We’re still adding verified places and products. Check back soon." />
  return (
    <>
      {sponsored.length > 0 && (
        <section aria-labelledby="sponsored-title">
          <h2 id="sponsored-title" className="section-title">Sponsored</h2>
          <div className="rail">
            {sponsored.map((i) => (
              <ItemCard key={i.id} item={i} onOpen={onOpen} />
            ))}
          </div>
        </section>
      )}
      <section aria-labelledby="picks-title">
        <h2 id="picks-title" className="section-title">Picks for you</h2>
        <CountryNote ctx={ctx} />
        <div className="list">
          {picks.map((i) => (
            <ItemCard key={i.id} item={i} onOpen={onOpen} />
          ))}
        </div>
      </section>
    </>
  )
}

import type { CatalogItem, ProfilePayload } from '../lib/types'
import { countryName } from '../lib/options'
import { useRecommendations } from '../lib/useRecommendations'
import { ItemCard } from '../components/ItemCard'
import { Glyph } from '../components/Glyph'
import { CountryNote } from '../components/CountryNote'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import { useT } from '../lib/i18n'

interface Props {
  profile: ProfilePayload
  onOpen: (item: CatalogItem) => void
  onBrowse: (category: 'beauty' | 'medical') => void
}

export function Home({ profile, onOpen, onBrowse }: Props) {
  const t = useT()
  const { state, retry } = useRecommendations(profile, 'all')

  return (
    <div className="screen home">
      <section className="hero">
        <p className="eyebrow">{t('home.visiting')} · {countryName(profile.country)}</p>
        <h1>{t('home.hero')}</h1>
      </section>

      <section className="domain-cards" aria-label={t('home.browse')}>
        <button type="button" className="domain-card domain-card--beauty" onClick={() => onBrowse('beauty')}>
          <Glyph category="beauty" size={44} />
          <span>
            <strong>{t('explore.beauty')}</strong>
            <small>{t('home.beautySub')}</small>
          </span>
        </button>
        <button type="button" className="domain-card domain-card--medical" onClick={() => onBrowse('medical')}>
          <Glyph category="medical" size={44} />
          <span>
            <strong>{t('explore.medical')}</strong>
            <small>{t('home.medicalSub')}</small>
          </span>
        </button>
      </section>

      {state.status === 'loading' && <LoadingState />}
      {state.status === 'error' && <ErrorState message={state.message} onRetry={retry} />}
      {state.status === 'ready' && <HomeLists items={state.data.items} ctx={state.data.country_context} onOpen={onOpen} />}
    </div>
  )
}

function HomeLists({ items, ctx, onOpen }: { items: CatalogItem[]; ctx: Parameters<typeof CountryNote>[0]['ctx']; onOpen: (i: CatalogItem) => void }) {
  const t = useT()
  const sponsored = items.filter((i) => i.sponsorship === 'sponsored')
  const picks = items.filter((i) => i.sponsorship !== 'sponsored')
  if (!items.length) return <EmptyState title={t('home.noPicks')} body={t('home.noPicksBody')} />
  return (
    <>
      {sponsored.length > 0 && (
        <section aria-labelledby="sponsored-title">
          <h2 id="sponsored-title" className="section-title">{t('explore.sponsored')}</h2>
          <div className="rail">
            {sponsored.map((i) => (
              <ItemCard key={i.id} item={i} onOpen={onOpen} />
            ))}
          </div>
        </section>
      )}
      <section aria-labelledby="picks-title">
        <h2 id="picks-title" className="section-title">{t('home.picks')}</h2>
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

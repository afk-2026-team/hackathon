import { useState } from 'react'
import type { CatalogItem, ProfilePayload } from '../lib/types'
import type { CompareRow, PointAttribute } from '../lib/compare'
import { formatMoney, type PriceFact } from '../lib/compare'
import { useCompare, useReferences } from '../lib/useCompare'
import { useT } from '../lib/i18n'
import '../styles/compare.css'

interface Props {
  profile: ProfilePayload
  item: CatalogItem
  currentName: string | undefined
  onSetCurrent: (name: string) => void
}

const ATTR_KEY: Record<PointAttribute, 'compare.ingredients' | 'compare.size' | 'compare.form'> = {
  key_ingredients: 'compare.ingredients',
  volume_ml: 'compare.size',
  form: 'compare.form',
}

// "지금 쓰는 제품 vs 한국 후보". 서버가 확인한 공통점·차이만 보여주고, 효과가 같다고 말하지 않는다.
export function ComparePanel({ profile, item, currentName, onSetCurrent }: Props) {
  const t = useT()
  const refs = useReferences()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const { state, explain, retry } = useCompare(profile, item.id, editing ? undefined : currentName)

  if (!currentName || editing) {
    return (
      <section className="compare compare--ask" aria-labelledby="compare-ask">
        <h3 id="compare-ask" className="section-title">{t('compare.askTitle')}</h3>
        <form
          className="compare__form"
          onSubmit={(e) => {
            e.preventDefault()
            if (!draft.trim()) return
            onSetCurrent(draft.trim())
            setEditing(false)
          }}
        >
          <label className="sr-only" htmlFor="current-product">{t('compare.askLabel')}</label>
          <input id="current-product" list="reference-products" autoComplete="off" placeholder={t('compare.askPlaceholder')} value={draft} onChange={(e) => setDraft(e.target.value)} />
          <datalist id="reference-products">
            {refs.map((r) => (
              <option key={r.id} value={r.title} />
            ))}
          </datalist>
          <button type="submit" className="btn btn--primary btn--small" disabled={!draft.trim()}>{t('compare.askSubmit')}</button>
        </form>
      </section>
    )
  }

  return (
    <section className="compare" aria-labelledby="compare-title" aria-busy={state.status === 'loading'}>
      <div className="compare__head">
        <h3 id="compare-title" className="section-title">{t('compare.title')}</h3>
        <button type="button" className="link-btn" onClick={() => { setDraft(currentName); setEditing(true) }}>{t('compare.change')}</button>
      </div>

      {state.status === 'loading' && <p className="compare__status">{t('compare.loading')}</p>}
      {state.status === 'error' && (
        <div className="compare__status" role="alert">
          <p>{state.message}</p>
          <button type="button" className="btn btn--ghost btn--small" onClick={retry}>{t('state.retry')}</button>
        </div>
      )}
      {state.status === 'ready' && (
        <>
          <div className="compare__names">
            <div>
              <small>{t('compare.youUse')}</small>
              <strong>{state.data.currentName}</strong>
            </div>
            <span aria-hidden="true" className="compare__arrow">→</span>
            <div className="compare__candidate">
              <small>{t('compare.inKorea')}</small>
              <strong>{state.data.candidateTitle}</strong>
            </div>
          </div>
          {!state.data.matched && <p className="note">{t('compare.notMatched')}</p>}
          {explain.status !== 'idle' && explain.status !== 'error' && (
            <div className="compare__summary" aria-live="polite" aria-busy={explain.status === 'loading'}>
              <h4 className="compare__sub">{t('compare.summary')}</h4>
              {explain.status === 'loading' ? (
                <p className="compare__status">{t('compare.summaryLoading')}</p>
              ) : (
                <>
                  <p>{explain.data.text}</p>
                  {explain.data.sources.length > 0 && (
                    <span className="compare__basis">
                      {explain.data.sources.map((s) => (
                        <a key={s.url} href={s.url} target="_blank" rel="noreferrer">{s.label}</a>
                      ))}
                    </span>
                  )}
                </>
              )}
            </div>
          )}
          {renderRows(t('compare.common'), state.data.rows.filter((r) => r.kind === 'common'))}
          {renderRows(t('compare.different'), state.data.rows.filter((r) => r.kind === 'difference'))}
          {renderRows(t('compare.unverified'), state.data.rows.filter((r) => r.kind === 'unverified'))}
          {state.data.rows.length === 0 && <p className="compare__status">{t('compare.noPoints')}</p>}
          <div className="compare__group">
            <h4 className="compare__sub">{t('compare.price')}</h4>
            <PriceLine label={t('compare.youUse')} price={state.data.price.current} />
            <PriceLine label={t('compare.inKorea')} price={state.data.price.candidate} />
            {!state.data.price.comparable && state.data.price.note && <p className="note">{state.data.price.note}</p>}
          </div>
          {state.data.notice && <p className="note">{state.data.notice}</p>}
        </>
      )}
    </section>
  )

  function renderRows(title: string, rows: CompareRow[]) {
    if (!rows.length) return null
    return (
      <div className="compare__group">
        <h4 className="compare__sub">{title}</h4>
        <dl className="compare__rows">
          {rows.map((r, i) => (
            <div key={`${r.attribute}-${i}`} className="compare__row">
              <dt>{t(ATTR_KEY[r.attribute])}</dt>
              <dd>
                <span className="compare__cell">
                  <small>{t('compare.youUse')}</small>
                  {r.current ?? <span className="unknown">{t('compare.unknown')}</span>}
                  {r.partial.current && r.current && <em className="partial">{t('compare.partial')}</em>}
                </span>
                <span className="compare__cell compare__cell--candidate">
                  <small>{t('compare.inKorea')}</small>
                  {r.candidate ?? <span className="unknown">{t('compare.unknown')}</span>}
                  {r.partial.candidate && r.candidate && <em className="partial">{t('compare.partial')}</em>}
                </span>
                {(r.basis || r.sources.length > 0) && (
                  <span className="compare__basis">
                    {r.basis}
                    {r.sources.map((s) => (
                      <a key={s.url} href={s.url} target="_blank" rel="noreferrer">{s.label}</a>
                    ))}
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    )
  }
}

function PriceLine({ label, price }: { label: string; price: PriceFact | null }) {
  const t = useT()
  if (!price) return <p className="compare__price"><span>{label}</span><span className="unknown">{t('compare.noPrice')}</span></p>
  return (
    <div className="compare__price">
      <span>{label}</span>
      <strong>{formatMoney(price.amount, price.currency)}</strong>
      <span className="compare__basis">
        {price.basis}
        <a href={price.source.url} target="_blank" rel="noreferrer">{price.source.label} · {price.source.checked_at}</a>
      </span>
    </div>
  )
}

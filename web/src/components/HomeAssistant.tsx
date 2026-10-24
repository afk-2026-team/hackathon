import { useState } from 'react'
import type { ProfilePayload } from '../lib/types'
import { useAssistant } from '../lib/assistantHook'
import { MAX_QUESTION_CHARS, type AssistantAnswer, type AssistantCandidate } from '../lib/assistant'
import { useT } from '../lib/i18n'
import { CategoryBadge, Price } from './Common'

interface Props {
  profile: ProfilePayload
  onBrowse: () => void
  onOpenId?: (id: string) => void
}

// Home AI: 사용자가 누를 때만 요청한다(자동 호출 없음). 답은 서버 텍스트 그대로, 카드는 응답 metadata 의 실제 카탈로그 후보로만 만든다(본문 파싱 없음).
export function HomeAssistant({ profile, onBrowse, onOpenId }: Props) {
  const t = useT()
  const { state, ask, retry, cancel } = useAssistant(profile)
  const [draft, setDraft] = useState('')
  const loading = state.status === 'loading'


  return (
    <section className="home-ai" aria-labelledby="home-ai-title">
      <h2 id="home-ai-title" className="home-ai__title">{t('shell.ai.title')}</h2>
      <p className="home-ai__lead">{t('shell.ai.lead')}</p>

      {state.turns.length > 0 && (
        <ol className="home-ai__turns" aria-live="polite">
          {state.turns.map((turn) => {
            return (
              <li key={turn.id} className="home-ai__turn">
                <p className="home-ai__q">
                  <span>{t('shell.ai.you')}</span>
                  {turn.question ?? t('shell.ai.forYou')}
                </p>
                {turn.answer && (
                  <div className="home-ai__a">
                    <p className="home-ai__text">{turn.answer.text}</p>
                  </div>
                )}
                {turn.answer && <Candidates answer={turn.answer} currency={profile.currency} onOpenId={onOpenId} />}
                {turn.error && (
                  <div className="home-ai__error" role="alert">
                    <p>{turn.error.message}</p>
                    <button type="button" className="btn btn--ghost btn--small" onClick={retry} disabled={loading}>{t('shell.ai.retry')}</button>
                  </div>
                )}
                {!turn.answer && !turn.error && (
                  <p className="home-ai__thinking" role="status">
                    {t('shell.ai.thinking')}{' '}
                    <button type="button" className="btn btn--text" onClick={cancel}>{t('shell.ai.cancel')}</button>
                  </p>
                )}
              </li>
            )
          })}
        </ol>
      )}

      {state.turns.length === 0 && (
        <button type="button" className="btn btn--primary btn--block" onClick={() => ask()} disabled={loading}>
          {t('shell.ai.suggest')}
        </button>
      )}

      <form
        className="home-ai__form"
        onSubmit={(e) => {
          e.preventDefault()
          const q = draft.trim()
          if (!q || loading) return
          ask(q)
          setDraft('')
        }}
      >
        <label className="sr-only" htmlFor="home-ai-input">{t('shell.ai.label')}</label>
        <input
          id="home-ai-input"
          value={draft}
          maxLength={MAX_QUESTION_CHARS}
          placeholder={t('shell.ai.placeholder')}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" className="btn btn--ghost" disabled={!draft.trim() || loading}>{t('shell.ai.send')}</button>
      </form>

      {state.turns.some((x) => x.answer) && (
        <>
          <button type="button" className="btn btn--text" onClick={onBrowse}>{t('shell.ai.browse')} →</button>
          <p className="home-ai__note">{t('shell.ai.note')}</p>
        </>
      )}
    </section>
  )
}

function CandidateCard({ c, cited, currency, onOpenId }: { c: AssistantCandidate; cited: boolean; currency: string; onOpenId?: (id: string) => void }) {
  const t = useT()
  return (
    <li className={`home-ai__cand${cited ? ' is-cited' : ''}`}>
      <button type="button" className="home-ai__cand-btn" onClick={() => onOpenId?.(c.id)} disabled={!onOpenId} data-item-id={c.id}>
        {c.image_url ? <img src={c.image_url} alt="" loading="lazy" className="home-ai__cand-img" /> : <span className="home-ai__cand-img home-ai__cand-img--none" aria-hidden="true" />}
        <span className="home-ai__cand-body">
          <span className="home-ai__cand-badges">
            <CategoryBadge category={c.category} />
            {cited && <span className="badge badge--outline">{t('shell.ai.citedBadge')}</span>}
          </span>
          <span className="home-ai__cand-title">{c.title}</span>
          {c.subtitle && <span className="home-ai__cand-sub" lang="ko">{c.subtitle}</span>}
          {c.reasons[0] && <span className="home-ai__cand-reason">{c.reasons[0]}</span>}
          <Price krw={c.price_krw} list={c.list_price} currency={currency} size="sm" />
        </span>
      </button>
    </li>
  )
}

// 서버가 고른 실제 후보. AI 가 답에서 인용한 항목(recommended_ids)과 나머지 관련 후보를 나눠 보여준다.
function Candidates({ answer, currency, onOpenId }: { answer: AssistantAnswer; currency: string; onOpenId?: (id: string) => void }) {
  const t = useT()
  if (answer.candidatesStatus === 'none') return null
  if (answer.candidatesStatus === 'unavailable' && answer.candidates.length === 0) {
    return <p className="home-ai__cand-note" role="note">{t('shell.ai.candidatesUnavailable')}</p>
  }
  const cited = new Set(answer.recommendedIds)
  const citedList = answer.recommendedIds.map((id) => answer.candidates.find((c) => c.id === id)).filter((c): c is AssistantCandidate => !!c)
  const related = answer.candidates.filter((c) => !cited.has(c.id))
  return (
    <div className="home-ai__cands">
      {citedList.length > 0 && (
        <section aria-label={t('shell.ai.citedTitle')}>
          <h3 className="home-ai__cands-h">{t('shell.ai.citedTitle')}</h3>
          <ul className="home-ai__cand-list">{citedList.map((c) => <CandidateCard key={c.id} c={c} cited currency={currency} onOpenId={onOpenId} />)}</ul>
        </section>
      )}
      {related.length > 0 && (
        <section aria-label={t('shell.ai.relatedTitle')}>
          <h3 className="home-ai__cands-h">{t('shell.ai.relatedTitle')}</h3>
          <p className="home-ai__cand-note">{t('shell.ai.relatedNote')}</p>
          <ul className="home-ai__cand-list">{related.map((c) => <CandidateCard key={c.id} c={c} cited={false} currency={currency} onOpenId={onOpenId} />)}</ul>
        </section>
      )}
    </div>
  )
}

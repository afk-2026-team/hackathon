import { useState } from 'react'
import type { ProfilePayload } from '../lib/types'
import { useAssistant } from '../lib/assistantHook'
import { MAX_QUESTION_CHARS } from '../lib/assistant'
import { useT } from '../lib/i18n'

interface Props {
  profile: ProfilePayload
  onBrowse: () => void
}

// Home AI: 사용자가 누를 때만 요청한다(자동 호출 없음). 답은 서버 텍스트 그대로 보여주고, 자유 텍스트를 상품 카드로 파싱하지 않는다.
export function HomeAssistant({ profile, onBrowse }: Props) {
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

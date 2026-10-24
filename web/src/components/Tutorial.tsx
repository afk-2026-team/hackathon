import { useEffect, useRef, useState } from 'react'
import { fill, useT } from '../lib/i18n'
import '../styles/shell.css'

const STEPS = [
  { title: 'shell.tour.t1', body: 'shell.tour.b1' },
  { title: 'shell.tour.t2', body: 'shell.tour.b2' },
  { title: 'shell.tour.t3', body: 'shell.tour.b3' },
] as const

// 실제 하단 메뉴(data-tour="tab-1|2|3")를 1·2·3 순서로 짚는 코치마크. 언제든 바로 건너뛸 수 있다(Esc 포함).
export function Tutorial({ onDone }: { onDone: () => void }) {
  const t = useT()
  const [step, setStep] = useState(0)
  const primary = useRef<HTMLButtonElement>(null)
  const s = STEPS[step]
  const last = step === STEPS.length - 1

  useEffect(() => {
    primary.current?.focus()
  }, [step])

  // 지금 짚는 실제 하단 탭을 강조한다(오버레이 위로 띄움).
  useEffect(() => {
    const el = document.querySelector<HTMLElement>(`[data-tour="tab-${step + 1}"]`)
    el?.classList.add('is-tour-target')
    return () => el?.classList.remove('is-tour-target')
  }, [step])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onDone()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDone])

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body">
      <div className="tour__frame">
        <div className={`tour__card tour__card--${step + 1}`}>
          <div className="tour__top">
            <span className="tour__label">{t('shell.tour.label')}</span>
            <span className="tour__count">{fill(t('shell.tour.step'), { n: step + 1 })}</span>
          </div>
          <div className="tour__steps" aria-hidden="true">
            {STEPS.map((_, i) => (
              <span key={i} className={i === step ? 'is-on' : i < step ? 'is-done' : ''}>{i + 1}</span>
            ))}
          </div>
          <h2 id="tour-title">{t(s.title)}</h2>
          <p id="tour-body">{t(s.body)}</p>
          <div className="tour__actions">
            <button type="button" className="btn btn--text" onClick={onDone}>{t('shell.tour.skip')}</button>
            <button ref={primary} type="button" className="btn btn--primary btn--small" onClick={() => (last ? onDone() : setStep(step + 1))}>
              {last ? t('shell.tour.start') : t('shell.tour.next')}
            </button>
          </div>
          <span className={`tour__arrow tour__arrow--${step + 1}`} aria-hidden="true" />
        </div>
        <span className={`tour__ring tour__ring--${step + 1}`} aria-hidden="true">
          <span>{step + 1}</span>
        </span>
      </div>
    </div>
  )
}

import { useState } from 'react'

const STEPS = [
  { title: 'Home', body: 'Beauty and medical picks for your trip, side by side.' },
  { title: 'Explore', body: 'Open a pick to see its sources and sponsorship status, then add it.' },
  { title: 'My Trip', body: 'Everything you saved, arranged by day. Reorder it any time.' },
]

// 실제 하단 메뉴를 1·2·3 순서로 짚는 안내. 언제든 바로 건너뛸 수 있다.
export function Tutorial({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0)
  const s = STEPS[step]
  const last = step === STEPS.length - 1
  return (
    <div className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <div className={`tour__card tour__card--${step + 1}`}>
        <div className="tour__steps" aria-hidden="true">
          {STEPS.map((_, i) => (
            <span key={i} className={i === step ? 'is-on' : ''}>{i + 1}</span>
          ))}
        </div>
        <h2 id="tour-title">{s.title}</h2>
        <p>{s.body}</p>
        <div className="tour__actions">
          <button type="button" className="btn btn--ghost" onClick={onDone}>Skip</button>
          <button type="button" className="btn btn--primary" onClick={() => (last ? onDone() : setStep(step + 1))}>
            {last ? 'Start' : 'Next'}
          </button>
        </div>
      </div>
      <div className={`tour__pointer tour__pointer--${step + 1}`} aria-hidden="true" />
    </div>
  )
}

import { useState } from 'react'
import { AGE_RANGES, COUNTRIES, CURRENCIES, defaultCurrency, GENDERS, INTERESTS, LANGUAGES } from '../lib/options'
import type { Profile } from '../lib/storage'
import type { Preferences } from '../lib/types'
import { DocTitle, LangContext, toLang, useT, type Lang } from '../lib/i18n'

interface Props {
  initial?: Profile | null
  onComplete: (p: Profile) => void
  mode?: 'onboarding' | 'edit'
  onCancel?: () => void
  uiLang?: Lang
}

// 1) 언어·국가·통화(필수) 2) 성별·연령(미응답 가능) 3) 상세 취향(선택, 건너뛰기)
export function Onboarding(props: Props) {
  const [language, setLanguage] = useState<string>(props.initial ? toLang(props.initial.language) : (props.uiLang ?? ''))
  // 고른 언어가 바로 화면에 적용된다
  return (
    <LangContext.Provider value={language ? toLang(language) : (props.uiLang ?? 'en')}>
      <OnboardingInner {...props} language={language} setLanguage={setLanguage} />
    </LangContext.Provider>
  )
}

function OnboardingInner({ initial, onComplete, mode = 'onboarding', onCancel, language, setLanguage }: Props & { language: string; setLanguage: (v: string) => void }) {
  const t = useT()
  const [step, setStep] = useState(0)
  const [country, setCountry] = useState(initial?.country ?? '')
  const [currency, setCurrency] = useState(initial?.currency ?? '')
  const [gender, setGender] = useState<string | null>(initial?.gender ?? null)
  const [age, setAge] = useState<string | null>(initial?.age_range ?? null)
  const [interests, setInterests] = useState<string[]>(initial?.preferences?.interests ?? [])
  const [budget, setBudget] = useState(initial?.preferences?.budget_krw ? String(initial.preferences.budget_krw) : '')
  const [current, setCurrent] = useState(initial?.preferences?.current_product ?? '')

  const basicsReady = !!language && !!country && !!currency

  function finish(withPreferences: boolean) {
    let preferences: Preferences | null = null
    if (withPreferences) {
      const p: Preferences = {}
      if (interests.length) p.interests = interests
      const b = Number(budget.replace(/[^0-9]/g, ''))
      if (b > 0) p.budget_krw = b
      if (current.trim()) p.current_product = current.trim()
      preferences = Object.keys(p).length ? p : null
    } else if (mode === 'edit') {
      preferences = initial?.preferences ?? null
    }
    onComplete({
      version: 1,
      language,
      country,
      currency,
      gender,
      age_range: age,
      preferences,
      onboarded_at: initial?.onboarded_at ?? new Date().toISOString(),
      tutorial_done: initial?.tutorial_done ?? false,
    })
  }

  const toggle = (code: string) => setInterests((xs) => (xs.includes(code) ? xs.filter((x) => x !== code) : [...xs, code]))

  return (
    <main className="onboarding">
      <header className="onboarding__head">
        <DocTitle />
        <p className="brand">{t('brand')}</p>
        <ol className="progress" aria-label={`Step ${step + 1} of 3`}>
          {[0, 1, 2].map((i) => (
            <li key={i} className={i <= step ? 'is-done' : ''} />
          ))}
        </ol>
        {onCancel && (
          <button type="button" className="btn btn--ghost btn--small" onClick={onCancel}>{t('common.cancel')}</button>
        )}
      </header>

      {step === 0 && (
        <section className="onboarding__step">
          <h1>{mode === 'edit' ? t('ob.basicsEdit') : t('ob.basics')}</h1>
          <p className="lead">{t('ob.basicsLead')}</p>
          <label className="field">
            <span>{t('ob.language')}</span>
            <select value={language} onChange={(e) => setLanguage(e.target.value)}>
              <option value="" disabled>{t('ob.chooseLanguage')}</option>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.name}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t('ob.country')}</span>
            <select
              value={country}
              onChange={(e) => {
                setCountry(e.target.value)
                if (!currency || mode === 'onboarding') setCurrency(defaultCurrency(e.target.value))
              }}
            >
              <option value="" disabled>{t('ob.chooseCountry')}</option>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t('ob.currency')}</span>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="" disabled>{t('ob.chooseCurrency')}</option>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <div className="onboarding__actions">
            <button type="button" className="btn btn--primary btn--block" disabled={!basicsReady} onClick={() => setStep(1)}>{t('common.continue')}</button>
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="onboarding__step">
          <h1>{t('ob.about')}</h1>
          <p className="lead">{t('ob.aboutLead')}</p>
          <fieldset className="field">
            <legend>{t('ob.gender')}</legend>
            <div className="choices">
              {GENDERS.map((g) => (
                <button key={g.code} type="button" className={`choice${gender === g.code ? ' is-on' : ''}`} aria-pressed={gender === g.code} onClick={() => setGender(gender === g.code ? null : g.code)}>
                  {g.label}
                </button>
              ))}
              <button type="button" className={`choice${gender === null ? ' is-on' : ''}`} aria-pressed={gender === null} onClick={() => setGender(null)}>{t('ob.noSay')}</button>
            </div>
          </fieldset>
          <fieldset className="field">
            <legend>{t('ob.age')}</legend>
            <div className="choices">
              {AGE_RANGES.map((a) => (
                <button key={a} type="button" className={`choice${age === a ? ' is-on' : ''}`} aria-pressed={age === a} onClick={() => setAge(age === a ? null : a)}>
                  {a}
                </button>
              ))}
              <button type="button" className={`choice${age === null ? ' is-on' : ''}`} aria-pressed={age === null} onClick={() => setAge(null)}>{t('ob.noSay')}</button>
            </div>
          </fieldset>
          <div className="onboarding__actions">
            <button type="button" className="btn btn--ghost" onClick={() => setStep(0)}>{t('common.back')}</button>
            <button type="button" className="btn btn--primary" onClick={() => setStep(2)}>{t('common.continue')}</button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="onboarding__step">
          <h1>{t('ob.looking')}</h1>
          <p className="lead">{t('ob.lookingLead')}</p>
          <fieldset className="field">
            <legend>{t('ob.interests')}</legend>
            <div className="choices">
              {INTERESTS.map((i) => (
                <button key={i.code} type="button" className={`choice${interests.includes(i.code) ? ' is-on' : ''}`} aria-pressed={interests.includes(i.code)} onClick={() => toggle(i.code)}>
                  {i.label}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="field">
            <span>{t('ob.budget')}</span>
            <input inputMode="numeric" placeholder="e.g. 100000" value={budget} onChange={(e) => setBudget(e.target.value)} />
          </label>
          <label className="field">
            <span>{t('ob.current')}</span>
            <input placeholder="e.g. your daily moisturizer" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </label>
          <div className="onboarding__actions">
            <button type="button" className="btn btn--ghost" onClick={() => finish(false)}>{t('ob.skip')}</button>
            <button type="button" className="btn btn--primary" onClick={() => finish(true)}>{mode === 'edit' ? t('ob.save') : t('ob.done')}</button>
          </div>
        </section>
      )}
    </main>
  )
}

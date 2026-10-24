import { useState } from 'react'
import { AGE_RANGES, COUNTRIES, CURRENCIES, defaultCurrency, GENDERS, INTERESTS, LANGUAGES } from '../lib/options'
import type { Profile } from '../lib/storage'
import type { Preferences } from '../lib/types'
import { DocTitle, fill, LangContext, toLang, useT, type Key, type Lang } from '../lib/i18n'
import '../styles/shell.css'

interface Props {
  initial?: Profile | null
  onComplete: (p: Profile) => void
  mode?: 'onboarding' | 'edit'
  onCancel?: () => void
  uiLang?: Lang
}

/** 선택지 코드 → 화면 문구. 모르는 코드는 options.ts 의 영어 라벨을 쓴다. */
function optionLabel(t: (k: Key) => string, prefix: 'shell.g.' | 'shell.i.', code: string, fallback: string): string {
  const key = `${prefix}${code}` as Key
  const v = t(key)
  return v === undefined ? fallback : v
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
    <main className="shell-page ob">
      <DocTitle />
      <header className="ob__head">
        {step > 0 ? (
          <button type="button" className="icon-btn" aria-label={t('common.back')} onClick={() => setStep(step - 1)}>
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        ) : (
          <span className="brand-mark brand-mark--static brand-mark--sm">
            <span className="brand-mark__word">{t('brand')}</span>
            <span className="brand-mark__dot" aria-hidden="true" />
          </span>
        )}
        <span className="ob__count">{fill(t('shell.ob.step'), { n: step + 1 })}</span>
        {onCancel ? (
          <button type="button" className="btn btn--text" onClick={onCancel}>{t('common.cancel')}</button>
        ) : (
          <span className="ob__head-spacer" />
        )}
      </header>
      <div className="ob__progress" role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={step + 1} aria-label={fill(t('shell.ob.step'), { n: step + 1 })}>
        <span style={{ width: `${((step + 1) / 3) * 100}%` }} />
      </div>

      {step === 0 && (
        <section className="ob__step">
          <span className="ob__tag ob__tag--req">{t('shell.ob.required')}</span>
          <h1 className="ob__title">{mode === 'edit' ? t('ob.basicsEdit') : t('ob.basics')}</h1>
          <p className="lead">{t('ob.basicsLead')}</p>

          <div className="ob__fields">
            <div className="field">
              <label className="field__label" htmlFor="ob-language">{t('ob.language')}</label>
              <select id="ob-language" className="select" value={language} onChange={(e) => setLanguage(e.target.value)}>
                <option value="" disabled>{t('ob.chooseLanguage')}</option>
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>{l.name}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="field__label" htmlFor="ob-country">{t('ob.country')}</label>
              <select
                id="ob-country"
                className="select"
                aria-describedby="ob-country-hint"
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
              <span id="ob-country-hint" className="field__hint">{t('shell.ob.countryHint')}</span>
            </div>
            <div className="field">
              <label className="field__label" htmlFor="ob-currency">{t('ob.currency')}</label>
              <select id="ob-currency" className="select" aria-describedby="ob-currency-hint" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="" disabled>{t('ob.chooseCurrency')}</option>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <span id="ob-currency-hint" className="field__hint">{t('shell.ob.currencyHint')}</span>
            </div>
          </div>
          <div className="ob__actions">
            <button type="button" className="btn btn--primary btn--block btn--lg" disabled={!basicsReady} onClick={() => setStep(1)}>{t('common.continue')}</button>
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="ob__step">
          <span className="ob__tag">{t('shell.ob.optional')}</span>
          <h1 className="ob__title">{t('ob.about')}</h1>
          <p className="lead">{t('ob.aboutLead')}</p>
          <fieldset className="ob__group">
            <legend className="field__label">{t('ob.gender')}</legend>
            <div className="ob__choices">
              {GENDERS.map((g) => (
                <button key={g.code} type="button" className={`chip${gender === g.code ? ' is-on' : ''}`} aria-pressed={gender === g.code} onClick={() => setGender(gender === g.code ? null : g.code)}>
                  {optionLabel(t, 'shell.g.', g.code, g.label)}
                </button>
              ))}
              <button type="button" className={`chip${gender === null ? ' is-on' : ''}`} aria-pressed={gender === null} onClick={() => setGender(null)}>{t('ob.noSay')}</button>
            </div>
          </fieldset>
          <fieldset className="ob__group">
            <legend className="field__label">{t('ob.age')}</legend>
            <div className="ob__choices">
              {AGE_RANGES.map((a) => (
                <button key={a} type="button" className={`chip${age === a ? ' is-on' : ''}`} aria-pressed={age === a} onClick={() => setAge(age === a ? null : a)}>
                  {a}
                </button>
              ))}
              <button type="button" className={`chip${age === null ? ' is-on' : ''}`} aria-pressed={age === null} onClick={() => setAge(null)}>{t('ob.noSay')}</button>
            </div>
          </fieldset>
          <p className="shell-hint">{t('shell.ob.aboutHint')}</p>
          <div className="ob__actions">
            <button type="button" className="btn btn--primary btn--block btn--lg" onClick={() => setStep(2)}>{t('common.continue')}</button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="ob__step">
          <span className="ob__tag">{t('shell.ob.optional')}</span>
          <h1 className="ob__title">{t('ob.looking')}</h1>
          <p className="lead">{t('ob.lookingLead')}</p>
          <fieldset className="ob__group">
            <legend className="field__label">{t('ob.interests')}</legend>
            <div className="ob__choices">
              {INTERESTS.map((i) => (
                <button key={i.code} type="button" className={`chip${interests.includes(i.code) ? ' is-on' : ''}`} aria-pressed={interests.includes(i.code)} onClick={() => toggle(i.code)}>
                  {optionLabel(t, 'shell.i.', i.code, i.label)}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="field">
            <label className="field__label" htmlFor="ob-budget">{t('ob.budget')}</label>
            <input id="ob-budget" className="input" inputMode="numeric" placeholder={t('shell.ob.budgetPh')} value={budget} onChange={(e) => setBudget(e.target.value)} />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="ob-current">{t('ob.current')}</label>
            <input id="ob-current" className="input" placeholder={t('shell.ob.currentPh')} value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div className="ob__actions ob__actions--split">
            <button type="button" className="btn btn--ghost btn--lg" onClick={() => finish(false)}>{t('ob.skip')}</button>
            <button type="button" className="btn btn--primary btn--lg" onClick={() => finish(true)}>{mode === 'edit' ? t('ob.save') : t('ob.done')}</button>
          </div>
        </section>
      )}
    </main>
  )
}

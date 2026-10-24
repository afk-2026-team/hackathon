import type { CountryContext } from '../lib/types'
import { countryName } from '../lib/options'
import { fill, useLang, useT, type Lang } from '../lib/i18n'
import '../styles/shell.css'

/** 화면 언어로 국가 이름을 보여준다. 브라우저가 지역 이름을 모르면 목록 이름을 쓴다. */
export function localCountry(code: string, lang: Lang): string {
  if (code === 'XX' || !/^[A-Z]{2}$/.test(code)) return countryName(code)
  try {
    const name = new Intl.DisplayNames([lang === 'ko' ? 'ko' : 'en'], { type: 'region' }).of(code)
    return name && name !== code ? name : countryName(code)
  } catch {
    return countryName(code)
  }
}

// 국가 근거 상태. 서버 설명(영어)은 원문으로 작게 두고, 상태 자체는 화면 언어 문구로 설명한다.
// 근거가 부족하면 '공통 근거 기반'임을 분명히 알리고, 국가로 피부·시술 적합성을 판단하지 않는다.
export function CountryNote({ ctx }: { ctx: CountryContext }) {
  const t = useT()
  const lang = useLang()
  const country = localCountry(ctx.country, lang)
  const insufficient = ctx.status === 'insufficient'
  const showOriginal = lang !== 'en' && !!ctx.explanation
  return (
    <aside className={`country-note country-note--${ctx.status}`} role="note" aria-label={insufficient ? t('shell.country.insufficientTitle') : undefined}>
      <span className="country-note__icon" aria-hidden="true">
        <svg viewBox="0 0 20 20" width="18" height="18">
          {insufficient ? (
            <path d="M10 2a8 8 0 110 16 8 8 0 010-16zm0 4.2a1 1 0 00-1 1v3.6a1 1 0 002 0V7.2a1 1 0 00-1-1zm0 6.9a1.1 1.1 0 100 2.2 1.1 1.1 0 000-2.2z" fill="currentColor" />
          ) : (
            <path d="M10 2a8 8 0 110 16 8 8 0 010-16zm3.6 5.3a.9.9 0 00-1.3 0L9 10.6 7.7 9.3a.9.9 0 10-1.3 1.3l2 2a.9.9 0 001.3 0l3.9-4a.9.9 0 000-1.3z" fill="currentColor" />
          )}
        </svg>
      </span>
      <div className="country-note__body">
        {insufficient && <strong className="country-note__title">{t('shell.country.insufficientTitle')}</strong>}
        <p>{fill(t(insufficient ? 'shell.country.insufficient' : 'shell.country.supported'), { country })}</p>
        {lang === 'en' && ctx.explanation && <p className="country-note__orig">{ctx.explanation}</p>}
        {showOriginal && (
          <details className="country-note__details">
            <summary>{t('shell.country.original')}</summary>
            <p lang="en">{ctx.explanation}</p>
          </details>
        )}
      </div>
    </aside>
  )
}

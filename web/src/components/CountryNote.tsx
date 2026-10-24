import type { CountryContext } from '../lib/types'

export function CountryNote({ ctx }: { ctx: CountryContext }) {
  return <p className={`country-note country-note--${ctx.status}`}>{ctx.explanation}</p>
}

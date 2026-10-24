import { useT } from '../lib/i18n'

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const t = useT()
  return (
    <div className="state state--error" role="alert">
      <p>{message}</p>
      <button type="button" className="btn btn--primary" onClick={onRetry}>{t('state.retry')}</button>
    </div>
  )
}

export function LoadingState({ label }: { label?: string }) {
  const t = useT()
  return (
    <div className="state" role="status" aria-busy="true">
      <span className="spinner" aria-hidden="true" />
      <p>{label ?? t('state.loading')}…</p>
    </div>
  )
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="state state--empty">
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  )
}

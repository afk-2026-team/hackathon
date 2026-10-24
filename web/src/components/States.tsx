import type { ReactNode } from 'react'
import { useT } from '../lib/i18n'

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const t = useT()
  return (
    <div className="state state--error" role="alert">
      <p>{message}</p>
      {onRetry && <button type="button" className="btn btn--ghost btn--small" onClick={onRetry}>{t('common.retry')}</button>}
    </div>
  )
}

export function LoadingState({ label }: { label?: string }) {
  const t = useT()
  return (
    <div className="state" aria-busy="true">
      <span className="spinner" aria-hidden="true" />
      <p>{label ?? t('common.loading')}…</p>
    </div>
  )
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="state state--empty">
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  )
}

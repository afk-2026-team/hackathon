export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="state state--error" role="alert">
      <p>{message}</p>
      <button type="button" className="btn btn--primary" onClick={onRetry}>Try again</button>
    </div>
  )
}

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="state" aria-busy="true">
      <span className="spinner" aria-hidden="true" />
      <p>{label}…</p>
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

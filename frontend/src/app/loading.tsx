/**
 * Shown while a page is being rendered on the server.
 *
 * Every route here is `force-dynamic` and fetches the portfolio from the API
 * service before it can render, so navigation used to sit on the previous page
 * with no acknowledgement at all until the response came back. This puts the
 * shape of the next page up immediately.
 *
 * It mirrors the real layout — header band, a row of figures, then content —
 * rather than showing a spinner, so the page does not jump when the data
 * arrives.
 */
function Block({ className = '' }: { className?: string }) {
  return <div className={`skeleton rounded-[var(--radius-sm)] ${className}`} aria-hidden />;
}

function Card({ children }: { children?: React.ReactNode }) {
  return (
    <div
      className="rounded-[var(--radius-lg)] border p-3.5"
      style={{ background: 'var(--surface-raised)', borderColor: 'var(--border-subtle)' }}
    >
      {children}
    </div>
  );
}

export default function Loading() {
  return (
    <div className="space-y-5" role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>

      {/* Page header */}
      <div className="flex items-center justify-between gap-4 pb-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="min-w-0 flex-1">
          <Block className="h-5 w-56" />
          <Block className="mt-2 h-3.5 w-[26rem] max-w-full" />
        </div>
        <Block className="h-9 w-36 shrink-0" />
      </div>

      {/* Figures */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}>
            <Block className="h-3 w-24" />
            <Block className="mt-2.5 h-7 w-32" />
            <Block className="mt-3 h-3 w-full" />
          </Card>
        ))}
      </div>

      {/* Content */}
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <Block className="h-4 w-40" />
            <Block className="mt-2 h-3 w-64 max-w-full" />
            <Block className="mt-4 h-48 w-full" />
          </Card>
        ))}
      </div>
    </div>
  );
}

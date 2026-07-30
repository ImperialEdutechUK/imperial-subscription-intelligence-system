'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button, LinkButton } from '@/components/ui/controls';

/**
 * The recovery screen for a page that failed to render.
 *
 * Without this, a page whose data call fails drops to the framework's own error
 * screen — which tells the reader nothing they can act on and offers no way
 * back. The most likely cause here is the API service being unreachable or
 * restarting, which is temporary, so retrying is the first thing offered.
 *
 * The underlying message is deliberately not printed. It is written for whoever
 * maintains this and would say nothing useful to somebody recording a
 * subscription; it goes to the console instead, where the digest identifies the
 * matching server log entry.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Page failed to render:', error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <span
        className="mx-auto grid size-11 place-items-center rounded-full"
        style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}
        aria-hidden
      >
        <AlertTriangle size={20} strokeWidth={2} />
      </span>

      <h1 className="mt-4 text-lg font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
        This page could not be loaded
      </h1>
      <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        Nothing has been changed. This is usually the register being briefly unreachable, so trying again often works. If it
        keeps happening, let your administrator know.
      </p>

      <div className="mt-5 flex items-center justify-center gap-2">
        <Button variant="primary" icon={RefreshCw} onClick={reset}>
          Try again
        </Button>
        <LinkButton href="/" variant="ghost">
          Back to overview
        </LinkButton>
      </div>

      {error.digest ? (
        <p className="mt-6 text-meta" style={{ color: 'var(--text-tertiary)' }}>
          Reference <span className="font-mono">{error.digest}</span> — quote this if you report it.
        </p>
      ) : null}
    </div>
  );
}

import { Compass } from 'lucide-react';
import { LinkButton } from '@/components/ui/controls';

/**
 * Shown for a URL that does not exist — most often a stale bookmark, or a link
 * to something that has since been deleted from the register.
 */
export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <span
        className="mx-auto grid size-11 place-items-center rounded-full"
        style={{ background: 'var(--surface-sunken)', color: 'var(--text-tertiary)' }}
        aria-hidden
      >
        <Compass size={20} strokeWidth={2} />
      </span>

      <h1 className="mt-4 text-lg font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
        There is nothing at this address
      </h1>
      <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        The page may have moved, or the record it pointed at may have been deleted from the register.
      </p>

      <div className="mt-5 flex items-center justify-center gap-2">
        <LinkButton href="/" variant="primary">
          Back to overview
        </LinkButton>
        <LinkButton href="/subscriptions" variant="ghost">
          Open the register
        </LinkButton>
      </div>
    </div>
  );
}

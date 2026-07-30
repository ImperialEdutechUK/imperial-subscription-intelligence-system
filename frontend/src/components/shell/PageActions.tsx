'use client';

import { Plus, Upload } from 'lucide-react';
import { LinkButton } from '@/components/ui/controls';

/**
 * Server components cannot pass a component reference (such as a Lucide icon)
 * across the boundary into a client component — React has nothing to serialise.
 * These small client wrappers keep the icon on the client side of the line so
 * server pages can render the buttons without hitting that.
 */
export function AddSubscriptionButton({ label = 'Add subscription' }: { label?: string }) {
  return (
    <LinkButton href="/subscriptions?new=1" variant="primary" icon={Plus}>
      {label}
    </LinkButton>
  );
}

export function ImportButton({ label = 'Import' }: { label?: string }) {
  return (
    <LinkButton href="/import" icon={Upload}>
      {label}
    </LinkButton>
  );
}

export function DashboardActions() {
  return (
    <div className="flex gap-2">
      <ImportButton />
      <AddSubscriptionButton />
    </div>
  );
}

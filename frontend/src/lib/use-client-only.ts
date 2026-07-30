'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/**
 * True once the component is running in the browser, false during server
 * rendering and on the hydration pass.
 *
 * Components that render into a portal need this: `createPortal` requires a
 * real DOM node, which does not exist on the server. The obvious
 * implementation — `useState(false)` plus an effect that sets it to true —
 * works but triggers a second render on every mount and is flagged by React's
 * lint rules. `useSyncExternalStore` with different server and client snapshots
 * expresses the same thing directly and settles in one pass.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

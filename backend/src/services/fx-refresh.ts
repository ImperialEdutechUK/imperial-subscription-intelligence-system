import { prisma } from '@/lib/db';
import { CURRENCIES } from '@/lib/domain';

/**
 * Keeps the exchange rates current without anyone opening Settings.
 *
 * The rule this has to respect is the one the application was built on: a
 * figure that moves every time a page loads cannot be reconciled against an
 * invoice. So this does NOT fetch on read. It writes the stored rates on a
 * schedule, and every page afterwards reads those stored numbers, which stay
 * put until the next refresh. A total quoted to Finance in the morning is the
 * same total in the afternoon.
 *
 * Each row records where the number came from and when, so a figure can always
 * be traced back to a published rate on a given day. A rate someone has entered
 * by hand is left alone — see `preserveManual`.
 */

const SOURCE_URL = 'https://open.er-api.com/v6/latest/GBP';

/** Marks rows this job owns. Anything with a different source was set by a person. */
export const AUTOMATIC_SOURCE_PREFIX = 'Published rate';

export interface FxRefreshResult {
  ok: boolean;
  updated: string[];
  skippedManual: string[];
  error?: string;
  asOf?: string;
}

export async function refreshFxRates({ preserveManual = true }: { preserveManual?: boolean } = {}): Promise<FxRefreshResult> {
  let payload: { result?: string; rates?: Record<string, number>; time_last_update_utc?: string };

  try {
    // A slow or unreachable provider must never hold up the reminder job that
    // calls this, so the request is bounded.
    const res = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(10_000), cache: 'no-store' });
    if (!res.ok) return { ok: false, updated: [], skippedManual: [], error: `Rate provider returned ${res.status}.` };
    payload = await res.json();
  } catch (e) {
    return { ok: false, updated: [], skippedManual: [], error: e instanceof Error ? e.message : 'Could not reach the rate provider.' };
  }

  const rates = payload.rates;
  if (payload.result !== 'success' || !rates) {
    return { ok: false, updated: [], skippedManual: [], error: 'The rate provider returned no usable rates.' };
  }

  const asOf = payload.time_last_update_utc ?? new Date().toUTCString();
  const existing = await prisma.fxRate.findMany();
  const bySource = new Map(existing.map((r) => [r.code, r.source ?? '']));

  const updated: string[] = [];
  const skippedManual: string[] = [];

  for (const code of CURRENCIES) {
    if (code === 'GBP') continue; // the base needs no rate against itself

    const perGbp = rates[code];
    if (typeof perGbp !== 'number' || !Number.isFinite(perGbp) || perGbp <= 0) continue;

    // A rate a person set is theirs. Overwriting it would silently discard the
    // number their finance team agreed for the period.
    const source = bySource.get(code);
    if (preserveManual && source !== undefined && !source.startsWith(AUTOMATIC_SOURCE_PREFIX)) {
      skippedManual.push(code);
      continue;
    }

    // The provider quotes how much of X one GBP buys; this stores the inverse,
    // because every cost in the register is converted X -> GBP.
    const rateToGbp = Number((1 / perGbp).toFixed(6));

    await prisma.fxRate.upsert({
      where: { code },
      create: { code, rateToGbp, source: `${AUTOMATIC_SOURCE_PREFIX}, ${asOf}` },
      update: { rateToGbp, source: `${AUTOMATIC_SOURCE_PREFIX}, ${asOf}` },
    });
    updated.push(code);
  }

  return { ok: true, updated, skippedManual, asOf };
}

import { refreshFxRates } from '@/services/fx-refresh';
import { guard, json, fail } from '@/lib/http';
import { sessionFromRequest, canEdit } from '@/lib/auth';

/**
 * Refreshes the stored exchange rates from the published source.
 *
 * Reachable two ways, because two different callers need it: the scheduled
 * reminder job, which presents the alerts key and has no session, and an
 * editor pressing a button in the interface.
 *
 * `?force=1` overwrites rates that were entered by hand as well. Without it
 * those are left alone, so a rate someone's finance team agreed for the period
 * survives the nightly run.
 */
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return guard(async () => {
    const url = new URL(request.url);
    const key = url.searchParams.get('key') ?? request.headers.get('x-alerts-key');
    const expected = process.env.ALERTS_API_KEY;
    const viaKey = !!expected && expected.length >= 16 && key === expected;

    const user = await sessionFromRequest(request);
    if (!viaKey && !(user && canEdit(user.role))) {
      return fail('Not authorised. Sign in as an editor, or call with the alerts key.', 401);
    }

    const result = await refreshFxRates({ preserveManual: url.searchParams.get('force') !== '1' });
    if (!result.ok) return fail(result.error ?? 'The rates could not be refreshed.', 502);

    return json(result);
  });
}

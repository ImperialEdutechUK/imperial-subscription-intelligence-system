import { getPortfolio } from '@/services/portfolio';
import { buildObservations } from '@/services/observations';
import { guard, json, requireUser } from '@/lib/http';

/**
 * The whole read model in one response.
 *
 * Every page in the frontend derives from this, so it is one round trip rather
 * than a dozen. `?observations=1` folds in the computed analytics commentary so
 * the dashboard does not need a second call.
 *
 * `departmentIndex` is a Map, which JSON cannot carry — and it holds one entry
 * more than the `departments` array does (the synthetic "unassigned" bucket),
 * so the frontend could not faithfully rebuild it from `departments` alone. It
 * travels as an explicit entry list and is reassembled on the other side.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return guard(async () => {
    await requireUser(request);
    const wantsObservations = new URL(request.url).searchParams.get('observations') === '1';

    const portfolio = await getPortfolio();
    const { departmentIndex, ...rest } = portfolio;

    return json({
      ...rest,
      departmentIndexEntries: [...departmentIndex.entries()],
      ...(wantsObservations ? { observations: buildObservations(portfolio) } : {}),
    });
  });
}

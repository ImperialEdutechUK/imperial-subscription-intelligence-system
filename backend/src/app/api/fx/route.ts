import { upsertFxRate } from '@/services/actions';
import { guard, json, requireEditor } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return guard(async () => {
    const user = await requireEditor(request);
    const { code, rateToGbp, source } = (await request.json()) as { code: string; rateToGbp: number; source?: string };
    return json(await upsertFxRate(user, code, rateToGbp, source));
  });
}

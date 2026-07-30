import { saveSubscription } from '@/services/actions';
import { guard, json, requireEditor } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return guard(async () => {
    const user = await requireEditor(request);
    return json(await saveSubscription(user, await request.json()));
  });
}

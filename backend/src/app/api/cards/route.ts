import { saveCard } from '@/services/actions';
import { guard, json, requireEditor } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return guard(async () => {
    const user = await requireEditor(request);
    return json(await saveCard(user, await request.json()));
  });
}

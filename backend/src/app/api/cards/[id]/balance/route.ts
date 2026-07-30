import { setCardBalance } from '@/services/actions';
import { guard, json, requireEditor } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return guard(async () => {
    const user = await requireEditor(request);
    const { id } = await params;
    const { balance } = (await request.json()) as { balance: number };
    return json(await setCardBalance(user, id, balance));
  });
}

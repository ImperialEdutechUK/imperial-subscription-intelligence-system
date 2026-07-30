import { recordTopUp } from '@/services/actions';
import { guard, json, requireEditor } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return guard(async () => {
    const user = await requireEditor(request);
    const { id } = await params;
    const { amount, note } = (await request.json()) as { amount: number; note?: string };
    return json(await recordTopUp(user, id, amount, note));
  });
}

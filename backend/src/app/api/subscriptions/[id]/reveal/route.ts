import { revealPassword } from '@/services/actions';
import { guard, json, requireAdmin } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return guard(async () => {
    const user = await requireAdmin(request);
    const { id } = await params;
    return json(await revealPassword(user, id));
  });
}

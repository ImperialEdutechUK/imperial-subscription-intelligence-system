import { deleteFxRate } from '@/services/actions';
import { guard, json, requireEditor } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function DELETE(request: Request, { params }: { params: Promise<{ code: string }> }) {
  return guard(async () => {
    const user = await requireEditor(request);
    const { code } = await params;
    return json(await deleteFxRate(user, code));
  });
}

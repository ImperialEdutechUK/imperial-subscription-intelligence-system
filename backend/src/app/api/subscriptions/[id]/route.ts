import { deleteSubscription } from '@/services/actions';
import { guard, json, requireEditor } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return guard(async () => {
    const user = await requireEditor(request);
    const { id } = await params;
    return json(await deleteSubscription(user, id));
  });
}

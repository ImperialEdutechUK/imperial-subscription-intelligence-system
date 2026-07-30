import { archiveSubscription } from '@/services/actions';
import { guard, json, requireEditor } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return guard(async () => {
    const user = await requireEditor(request);
    const { id } = await params;
    const { archived } = (await request.json()) as { archived: boolean };
    return json(await archiveSubscription(user, id, archived));
  });
}

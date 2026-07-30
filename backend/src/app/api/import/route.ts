import { bulkImport, type ImportRow } from '@/services/actions';
import { guard, json, requireEditor } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return guard(async () => {
    const user = await requireEditor(request);
    const { rows } = (await request.json()) as { rows: ImportRow[] };
    return json(await bulkImport(user, rows ?? []));
  });
}

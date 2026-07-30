import { sessionFromRequest } from '@/lib/auth';
import { guard, json } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return guard(async () => {
    const user = await sessionFromRequest(request);
    return json({ user });
  });
}

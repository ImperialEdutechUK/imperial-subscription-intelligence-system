/**
 * The scheduled entry point, called by Vercel Cron.
 *
 * Vercel Cron issues a GET against this deployment carrying
 * `Authorization: Bearer <CRON_SECRET>`. There is no session behind it, so this
 * route authorises the schedule itself and then calls the API service with the
 * shared alerts key rather than a user token.
 */
import { apiRaw } from '@/lib/api';

export const dynamic = 'force-dynamic';

function authorised(request: Request, url: URL): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const apiKey = process.env.ALERTS_API_KEY;

  const bearer = request.headers.get('authorization');
  if (cronSecret && cronSecret.length >= 16 && bearer === `Bearer ${cronSecret}`) return true;

  const key = url.searchParams.get('key') ?? request.headers.get('x-alerts-key');
  if (apiKey && apiKey.length >= 16 && key === apiKey) return true;

  return false;
}

export async function GET(request: Request) {
  const url = new URL(request.url);

  if (!authorised(request, url)) {
    return Response.json(
      {
        error: 'Not authorised.',
        hint: 'Send Authorization: Bearer <CRON_SECRET>, or add ?key=<ALERTS_API_KEY>. Both must be at least 16 characters.',
      },
      { status: 401 },
    );
  }

  const key = process.env.ALERTS_API_KEY ?? '';
  const force = url.searchParams.get('force') === '1' ? '&force=1' : '';
  const upstream = await apiRaw(`/api/alerts/cron?key=${encodeURIComponent(key)}${force}`, { anonymous: true });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

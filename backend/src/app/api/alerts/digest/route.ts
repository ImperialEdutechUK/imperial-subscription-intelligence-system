import { buildDigest } from '@/services/alerts';
import { sessionFromRequest } from '@/lib/auth';

/**
 * Machine-readable digest of what needs attention.
 *
 * Authorised either by an active session (so it can be inspected from a
 * browser) or by the ALERTS_API_KEY shared secret (so an external scheduler
 * such as Power Automate can call it without a login).
 *
 * If ALERTS_API_KEY is unset, key-based access is refused outright rather than
 * defaulting open.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get('key');
  const expected = process.env.ALERTS_API_KEY;

  const user = await sessionFromRequest(request);
  const viaKey = !!expected && expected.length >= 16 && key === expected;

  if (!user && !viaKey) {
    return Response.json(
      {
        error: 'Not authorised.',
        hint: 'Sign in, or call with ?key=<ALERTS_API_KEY>. The key must be set in the environment and be at least 16 characters.',
      },
      { status: 401 },
    );
  }

  const days = Number(url.searchParams.get('days'));
  const digest = await buildDigest(Number.isFinite(days) && days > 0 ? Math.min(365, days) : undefined);

  return Response.json(digest, { headers: { 'Cache-Control': 'no-store' } });
}

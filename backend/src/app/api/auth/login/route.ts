import { authenticate, issueToken, TOKEN_MAX_AGE_SECONDS } from '@/lib/auth';
import { guard, json, fail } from '@/lib/http';

/**
 * Exchanges an email and password for a bearer token.
 *
 * The token is handed back as JSON rather than set as a cookie: the browser
 * never calls this service directly, so the cookie belongs on the frontend's
 * own origin, where it can stay httpOnly and same-site.
 */
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return guard(async () => {
    const body = (await request.json()) as { email?: string; password?: string };
    const email = (body.email ?? '').trim();
    const password = body.password ?? '';
    if (!email || !password) return fail('Enter your email address and password.', 400);

    const user = await authenticate(email, password);
    if (!user) return fail('Those details were not recognised.', 401);

    return json({ ok: true, token: await issueToken(user), expiresIn: TOKEN_MAX_AGE_SECONDS, user });
  });
}

import { sessionFromRequest, canEdit, canAdminister, type SessionUser } from './auth';

/**
 * Shared plumbing for the route handlers.
 *
 * Every endpoint re-checks authorisation itself rather than relying on a
 * gateway. This service is reachable on the public internet (the frontend runs
 * on Vercel, outside Railway's private network), so "the caller must have come
 * through the UI" is not an assumption that can be made anywhere.
 */

export const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export const fail = (error: string, status = 400) => json({ ok: false, error }, status);

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Any signed-in user. */
export async function requireUser(request: Request): Promise<SessionUser> {
  const user = await sessionFromRequest(request);
  if (!user) throw new HttpError(401, 'Not signed in.');
  return user;
}

/** ADMIN or EDITOR — anything that writes. */
export async function requireEditor(request: Request): Promise<SessionUser> {
  const user = await requireUser(request);
  if (!canEdit(user.role)) throw new HttpError(403, 'You do not have permission to make changes.');
  return user;
}

/** ADMIN only — settings, and revealing stored credentials. */
export async function requireAdmin(request: Request): Promise<SessionUser> {
  const user = await requireUser(request);
  if (!canAdminister(user.role)) throw new HttpError(403, 'This action requires administrator access.');
  return user;
}

/**
 * Runs a handler body, turning a thrown HttpError into the right status code
 * and an unexpected throw into a 500 without leaking a stack trace.
 *
 * This is a body wrapper rather than a handler wrapper on purpose: Next.js
 * type-checks exported route handlers against its own generated signatures, and
 * a generic wrapper around the whole export fails that check on dynamic
 * segments. Wrapping only the body keeps each export's signature exact.
 */
export async function guard(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof HttpError) return fail(e.message, e.status);
    console.error('Unhandled error in route handler:', e);
    return fail(e instanceof Error ? e.message : 'Something went wrong.', 500);
  }
}

import 'server-only';
import { cookies } from 'next/headers';

/**
 * The one place this service talks to the API service.
 *
 * Nothing in the browser calls the backend directly. Every request originates
 * from this Next.js server, which means:
 *
 *   · the session cookie stays httpOnly and same-site on this origin
 *   · the backend needs no CORS configuration and no cross-site cookie
 *     exemption, which third-party cookie blocking would otherwise break
 *   · the backend URL and the bearer token are never exposed to page scripts
 *
 * `import 'server-only'` makes that a build error rather than a code review
 * question: if a client component ever imports this file, the build fails.
 */

export const SESSION_COOKIE = 'imperial_subs_session';

export function backendUrl(): string {
  const url = process.env.BACKEND_URL;
  if (!url) {
    throw new Error(
      'BACKEND_URL is not set. It must point at the API service, e.g. ' +
        'https://imperial-subs-api.up.railway.app — see frontend/.env.example.',
    );
  }
  return url.replace(/\/$/, '');
}

/**
 * Dates cross the wire as ISO strings. Pages and components expect real Date
 * objects — `subscriptions/page.tsx` calls `.toISOString()` on renewal dates —
 * so they are revived on the way back in rather than every call site having to
 * remember to parse.
 */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function reviveDates(_key: string, value: unknown) {
  return typeof value === 'string' && ISO_DATE.test(value) ? new Date(value) : value;
}

export async function sessionToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value ?? null;
}

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'DELETE' | 'PUT' | 'PATCH';
  body?: unknown;
  /** Endpoints such as the brand colour are reachable before anyone signs in. */
  anonymous?: boolean;
  /** Forwarded verbatim; used by the download and calendar proxies. */
  headers?: Record<string, string>;
}

/** Issues the request and returns the raw Response, for proxying file downloads. */
export async function apiRaw(path: string, opts: ApiOptions = {}): Promise<Response> {
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

  if (!opts.anonymous) {
    const token = await sessionToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  return fetch(`${backendUrl()}${path}`, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    // This data is per-user and changes on every write; caching it would show
    // one person's register to the next.
    cache: 'no-store',
  });
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * What to tell the person at the screen when the API has not supplied a message
 * of its own.
 *
 * The API's own errors are written for the reader and are used as-is. These
 * cover the cases where all we have is a status code or a transport failure —
 * where the honest answer is what happened, whether their work survived, and
 * what to try next. The hostname, the status number and the exception text go
 * to the server log instead: they help whoever debugs it and mean nothing to a
 * person trying to record a subscription.
 */
function readableFailure(status: number): string {
  if (status === 401) return 'Your session has ended. Sign in again to continue.';
  if (status === 503) {
    return 'Could not reach the register. Nothing has been changed — check your connection and try again.';
  }
  return 'The register ran into an unexpected problem. Nothing has been changed. Try again, and let your administrator know if it keeps happening.';
}

/** Issues the request and parses the JSON body, reviving dates. Throws on failure. */
export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await apiRaw(path, opts);
  } catch (e) {
    // Resolved before the template so a missing BACKEND_URL cannot throw from
    // inside this handler and replace the error we are trying to report.
    const target = process.env.BACKEND_URL ?? '(BACKEND_URL is not set)';
    console.error(`API request failed: ${opts.method ?? 'GET'} ${target}${path}`, e);
    throw new ApiError(503, readableFailure(503));
  }

  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text, reviveDates);
    } catch {
      console.error(`API returned a non-JSON body for ${path} (status ${res.status}):`, text.slice(0, 300));
      throw new ApiError(res.status, readableFailure(res.status));
    }
  }

  if (!res.ok) {
    const supplied = (parsed as { error?: string } | null)?.error;
    if (!supplied) console.error(`API returned ${res.status} with no message for ${path}`);
    throw new ApiError(res.status, supplied ?? readableFailure(res.status));
  }

  return parsed as T;
}

/**
 * The same call, but shaped for the mutation helpers: a failed request becomes
 * `{ ok: false, error }` rather than a thrown exception, because that is the
 * contract the existing form components were already written against.
 */
export async function apiResult<T extends object>(
  path: string,
  opts: ApiOptions = {},
): Promise<T | { ok: false; error: string }> {
  try {
    return await api<T>(path, opts);
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof ApiError ? e.message : readableFailure(500),
    };
  }
}

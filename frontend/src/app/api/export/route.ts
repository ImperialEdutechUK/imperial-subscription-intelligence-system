/**
 * Same-origin passthrough to the API service.
 *
 * These exist so the browser keeps talking to one origin. A download link or a
 * calendar subscription carries this service's session cookie; it cannot carry
 * a bearer token. This route swaps one for the other server-side, which is also
 * why the backend needs no CORS configuration.
 */

import { apiRaw } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const search = new URL(request.url).search;
  const upstream = await apiRaw(`/api/export${search}`);

  // Preserve the filename and content type the API chose.
  const headers = new Headers();
  for (const h of ['content-type', 'content-disposition', 'content-length']) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  headers.set('Cache-Control', 'no-store');

  return new Response(upstream.body, { status: upstream.status, headers });
}

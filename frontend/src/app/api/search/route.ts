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
  const upstream = await apiRaw(`/api/search${search}`);
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

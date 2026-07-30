import { getBrandSettings } from '@/services/settings';
import { guard, json } from '@/lib/http';

/**
 * Deliberately unauthenticated: the frontend's root layout needs the brand
 * colour and organisation name to render the sign-in page itself. It exposes
 * nothing but a hex value and a display name.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  return guard(async () => json(await getBrandSettings()));
}

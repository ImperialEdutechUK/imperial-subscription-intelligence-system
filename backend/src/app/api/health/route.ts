import { prisma } from '@/lib/db';
import { guard, json } from '@/lib/http';

/** Used by Railway's healthcheck and to confirm the database is reachable. */
export const dynamic = 'force-dynamic';

export async function GET() {
  return guard(async () => {
    const started = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    return json({ ok: true, database: 'reachable', latencyMs: Date.now() - started });
  });
}

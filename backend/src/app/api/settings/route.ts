import { prisma } from '@/lib/db';
import { updateSettings } from '@/services/actions';
import { getAlertSettings, getBrandSettings } from '@/services/settings';
import { guard, json, requireUser, requireAdmin } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return guard(async () => {
    await requireUser(request);
    const [brand, alerts, fxRates, users] = await Promise.all([
      getBrandSettings(),
      getAlertSettings(),
      prisma.fxRate.findMany({ orderBy: { code: 'asc' } }),
      prisma.user.findMany({ orderBy: [{ role: 'asc' }, { name: 'asc' }] }),
    ]);
    return json({
      brand,
      alerts,
      fxRates,
      users: users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, active: u.active, lastLoginAt: u.lastLoginAt })),
      alertsKeyConfigured: !!process.env.ALERTS_API_KEY && process.env.ALERTS_API_KEY.length >= 16,
      authDisabled: process.env.AUTH_DISABLED === 'true',
    });
  });
}

export async function POST(request: Request) {
  return guard(async () => {
    const user = await requireAdmin(request);
    const { entries } = (await request.json()) as { entries: Record<string, string> };
    return json(await updateSettings(user, entries ?? {}));
  });
}

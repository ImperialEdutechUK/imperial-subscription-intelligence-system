import { getPortfolio } from '@/services/portfolio';
import { sessionFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const user = await sessionFromRequest(request);
  if (!user) return Response.json({ error: 'Not signed in.' }, { status: 401 });

  const q = (new URL(request.url).searchParams.get('q') ?? '').trim().toLowerCase();
  if (q.length < 2) return Response.json({ results: [] });

  const p = await getPortfolio();
  const results = p.subscriptions
    .filter((s) => {
      const hay = [s.name, s.vendor, s.categoryLabel, s.accountEmail, s.ownerName, s.cardLabel, ...s.tags]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    })
    .slice(0, 8)
    .map((s) => ({
      id: s.id,
      name: s.name,
      vendor: s.vendor,
      monthlyGbp: s.monthlyGbp,
      category: s.categoryLabel,
      departments: s.allocations.map((a) => a.departmentCode),
    }));

  return Response.json({ results }, { headers: { 'Cache-Control': 'no-store' } });
}

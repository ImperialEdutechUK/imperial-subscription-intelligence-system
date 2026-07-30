import { getPortfolio } from '@/server/portfolio';
import { getSession, canEdit as canEditRole } from '@/lib/auth';
import { SectionHeading } from '@/components/ui/kit';
import { DepartmentsView, type DeptRow } from '@/components/departments/DepartmentsView';
import type { FlowLink } from '@/components/charts/RenewalTimeline';
import { round2 } from '@/lib/money';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Departments' };

export default async function DepartmentsPage() {
  const [p, user] = await Promise.all([getPortfolio(), getSession()]);

  const live = p.subscriptions.filter((s) => s.status !== 'CANCELLED');

  const rows: DeptRow[] = p.byDepartment.map((d) => {
    const attached = live
      .flatMap((s) =>
        s.allocations
          .filter((a) => a.departmentId === d.id)
          .map((a) => ({ id: s.id, name: s.name, monthlyGbp: a.monthlyGbp, share: a.share, shared: s.shared })),
      )
      .sort((a, b) => b.monthlyGbp - a.monthlyGbp);

    return {
      id: d.id,
      name: d.name,
      code: d.code,
      color: d.color,
      costCentre: p.departmentIndex.get(d.id)?.costCentre ?? null,
      headName: p.departmentIndex.get(d.id)?.headName ?? null,
      headEmail: p.departmentIndex.get(d.id)?.headEmail ?? null,
      headcount: p.departmentIndex.get(d.id)?.headcount ?? null,
      monthlyGbp: d.monthlyGbp,
      annualGbp: d.annualGbp,
      subscriptionCount: d.subscriptionCount,
      sharedCount: d.sharedCount,
      perHeadMonthly: d.perHeadMonthly,
      soleCostGbp: round2(attached.filter((a) => !a.shared).reduce((a, b) => a + b.monthlyGbp, 0)),
      sharedCostGbp: round2(attached.filter((a) => a.shared).reduce((a, b) => a + b.monthlyGbp, 0)),
      topSubscriptions: attached,
    };
  });

  const flowLinks: FlowLink[] = live
    .filter((s) => s.shared && s.monthlyGbp > 0)
    .flatMap((s) =>
      s.allocations.map((a) => ({
        subscriptionId: s.id,
        subscriptionName: s.name,
        departmentId: a.departmentId,
        departmentName: a.departmentName,
        departmentColor: a.color,
        amount: a.monthlyGbp,
        share: a.share,
      })),
    );

  return (
    <div className="space-y-4">
      <SectionHeading
        title="Departments"
        description="What each department costs in software, including its share of anything used jointly. These figures reconcile exactly to the portfolio total."
      />
      <DepartmentsView rows={rows} flowLinks={flowLinks} totalMonthly={p.totals.monthlyGbp} canEdit={canEditRole(user?.role)} />
    </div>
  );
}

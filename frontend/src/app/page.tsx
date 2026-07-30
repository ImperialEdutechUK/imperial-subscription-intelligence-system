import { getPortfolioWithObservations } from '@/server/portfolio';
import { CATEGORIES } from '@/lib/domain';
import { percentChange } from '@/lib/stats';
import { round2 } from '@/lib/money';
import { EmptyState, SectionHeading } from '@/components/ui/kit';
import { AddSubscriptionButton, DashboardActions, ImportButton } from '@/components/shell/PageActions';
import {
  CardRiskTile,
  DepartmentTile,
  HeadlineTiles,
  MoversTile,
  ObservationsTile,
  RenewalRunwayTile,
  SharedFlowTile,
  SpendMapTile,
  SpendTrendTile,
} from '@/components/dashboard/tiles';
import type { FlowLink } from '@/components/charts/RenewalTimeline';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const { observations, ...p } = await getPortfolioWithObservations();

  if (p.totals.count === 0) {
    return (
      <div className="mx-auto max-w-2xl py-16">
        <EmptyState
          title="Nothing tracked yet"
          description="Add your first subscription, or paste a block of rows straight out of the spreadsheet you keep at the moment. Everything else on this dashboard fills itself in from there."
          action={
            <div className="flex gap-2">
              <AddSubscriptionButton label="Add a subscription" />
              <ImportButton label="Paste from Excel" />
            </div>
          }
        />
      </div>
    );
  }

  const months = p.trend.months;
  const twelveMonthChange = months.length >= 2 ? percentChange(months[0].monthlyGbp, months[months.length - 1].monthlyGbp) : null;

  const next30 = p.renewals.filter((r) => r.days >= 0 && r.days <= 30);
  const dueNext30 = round2(next30.reduce((a, r) => a + r.amountGbp, 0));
  const next90 = p.renewals.filter((r) => r.days >= 0 && r.days <= 91);
  const total90 = round2(next90.reduce((a, r) => a + r.amountGbp, 0));

  const categoryOrder = new Map<string, number>(CATEGORIES.map((c, i) => [c, i]));
  const spendMap = p.subscriptions
    .filter((s) => s.monthlyGbp > 0 && s.status !== 'CANCELLED')
    .map((s) => ({
      key: s.id,
      label: s.name,
      value: s.monthlyGbp,
      group: s.categoryLabel,
      // Colour follows the category, and each category's slot is fixed by its
      // position in the canonical list — so filtering never repaints anything.
      categoryIndex: categoryOrder.get(s.category) ?? 15,
    }));

  const flowLinks: FlowLink[] = p.subscriptions
    .filter((s) => s.shared && s.monthlyGbp > 0 && s.status !== 'CANCELLED')
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
    <div className="space-y-5">
      <SectionHeading
        title="Portfolio overview"
        description="Every subscription the department pays for, normalised to a common monthly figure and split across the departments that use it."
        action={<DashboardActions />}
      />

      <div className="bento">
        <HeadlineTiles
          annualRunRate={p.totals.annualRunRateGbp}
          annualCash={p.totals.annualCashGbp}
          monthly={p.totals.monthlyGbp}
          twelveMonthChange={twelveMonthChange}
          activeCount={p.totals.activeCount}
          totalCount={p.totals.count}
          estimatedShare={p.totals.estimatedShare}
          estimatedAmount={p.totals.estimatedMonthlyGbp}
          sharedCount={p.totals.sharedCount}
          sharedMonthly={p.totals.sharedMonthlyGbp}
          dueNext30={dueNext30}
          renewalsNext30={next30.length}
        />

        <SpendTrendTile months={months} coverageNote={p.trend.coverageNote} coverage={p.trend.coverage} />
        <DepartmentTile data={p.byDepartment} />

        <SpendMapTile data={spendMap} />
        <RenewalRunwayTile
          total90={total90}
          items={next90.map((r) => ({
            id: r.subscriptionId,
            name: r.name,
            days: r.days,
            amountGbp: r.amountGbp,
            cardNeedsTopUp: r.cardNeedsTopUp,
          }))}
        />

        <CardRiskTile cards={p.cards} />
        <ObservationsTile observations={observations} />
        <MoversTile movers={p.movers} />

        <SharedFlowTile links={flowLinks} />
      </div>
    </div>
  );
}

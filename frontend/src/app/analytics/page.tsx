import { getPortfolioWithObservations } from '@/server/portfolio';
import { CATEGORIES } from '@/lib/domain';
import { coefficientOfVariation, gini, hhi, mean, median, paretoPoint, quantile, stdev, sum, topNShare } from '@/lib/stats';
import { SectionHeading } from '@/components/ui/kit';
import { AnalyticsView, type AnalyticsData } from '@/components/analytics/AnalyticsView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Analytics' };

export default async function AnalyticsPage() {
  const { observations, ...p } = await getPortfolioWithObservations();

  const live = p.subscriptions.filter((s) => s.status !== 'CANCELLED' && s.monthlyGbp > 0);
  const values = live.map((s) => s.monthlyGbp);
  const names = live.map((s) => s.name);
  const sorted = [...values].sort((a, b) => a - b);

  const m = mean(values);
  const med = median(values);
  const sd = stdev(values);
  const cv = coefficientOfVariation(values);
  const h = hhi(values);
  const t3 = topNShare(values, 3);
  const t5 = topNShare(values, 5);
  const g = gini(values);
  const par = paretoPoint(values);

  const categoryOrder = new Map<string, number>(CATEGORIES.map((c, i) => [c, i]));

  const data: AnalyticsData = {
    months: p.trend.months,
    coverageNote: p.trend.coverageNote,
    byCategory: p.byCategory.map((c) => ({ ...c, index: categoryOrder.get(c.key) ?? 15 })),
    byBillingModel: p.byBillingModel,
    values,
    names,
    observations,
    stats: {
      n: values.length,
      total: sum(values),
      mean: m.value,
      median: med.value,
      stdev: sd.value,
      cv: cv.value,
      q1: quantile(sorted, 0.25),
      q3: quantile(sorted, 0.75),
      min: sorted[0] ?? 0,
      max: sorted[sorted.length - 1] ?? 0,
      hhi: h.value,
      top3Share: t3.value,
      top5Share: t5.value,
      gini: g.value,
      pareto: par.value,
      methods: {
        total: 'Sum of the monthly-equivalent cost of every subscription that is not cancelled.',
        mean: m.method,
        median: med.method,
        stdev: sd.method,
        cv: cv.method,
        quartiles: 'First and third quartiles by linear interpolation — the same definition Excel uses for PERCENTILE.INC.',
        range: 'Cheapest and most expensive single subscription by monthly cost.',
        hhi: h.method,
        top3: t3.method,
        top5: t5.method,
        gini: g.method,
        pareto: par.method,
      },
      reliability: {
        mean: m.reliability,
        median: med.reliability,
        stdev: sd.reliability,
        cv: cv.reliability,
        hhi: h.reliability,
        top3: t3.reliability,
        top5: t5.reliability,
        gini: g.reliability,
        pareto: par.reliability,
      },
    },
  };

  return (
    <div className="space-y-4">
      <SectionHeading
        title="Analytics"
        description="Descriptive measures across the register. Every figure discloses the formula behind it and the number of data points it rests on, because at this sample size some of them move a good deal when one subscription changes."
      />
      <AnalyticsView data={data} />
    </div>
  );
}

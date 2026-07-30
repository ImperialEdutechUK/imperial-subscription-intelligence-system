/**
 * Automatic statistical observations.
 *
 * These are generated from the portfolio rather than written by hand, and each
 * one carries the method used, the sample size it rests on, and a reliability
 * verdict. A portfolio of thirty subscriptions is a small dataset: several of
 * these measures are unstable at that size, and the observation says so instead
 * of presenting a confident-looking number.
 *
 * Nothing here is a recommendation. Each observation states what the data
 * shows; deciding what to do about it is a human judgement that needs context
 * this application does not have.
 */

import { formatMoney, round2 } from '@/lib/money';
import { cagr, gini, hhi, linearTrend, mean, median, outliers, paretoPoint, percentChange, stdev, topNShare, type Reliability } from '@/lib/stats';
import type { Portfolio } from './portfolio';

export interface Observation {
  id: string;
  title: string;
  body: string;
  tone: 'neutral' | 'info' | 'warning' | 'danger' | 'positive';
  metric?: string;
  method: string;
  n: number;
  reliability: Reliability;
}

export function buildObservations(p: Portfolio): Observation[] {
  const out: Observation[] = [];
  const live = p.subscriptions.filter((s) => s.status !== 'CANCELLED' && s.monthlyGbp > 0);
  const values = live.map((s) => s.monthlyGbp);
  const n = values.length;

  if (n === 0) {
    return [
      {
        id: 'empty',
        title: 'No costed subscriptions yet',
        body: 'Add a few subscriptions and these observations will populate automatically. Most of them need at least eight entries before they mean much.',
        tone: 'neutral',
        method: 'n/a',
        n: 0,
        reliability: 'INSUFFICIENT',
      },
    ];
  }

  // ── 1. Concentration ──────────────────────────────────────────────────────
  const h = hhi(values);
  const t3 = topNShare(values, 3);
  if (h.value != null && t3.value != null) {
    const concentrated = h.value >= 2500;
    const moderate = h.value >= 1500 && h.value < 2500;
    out.push({
      id: 'concentration',
      title: concentrated ? 'Spend is concentrated in a few subscriptions' : moderate ? 'Spend is moderately concentrated' : 'Spend is spread across many subscriptions',
      body: `The three largest subscriptions account for ${t3.value.toFixed(1)}% of monthly spend. The concentration index is ${Math.round(h.value).toLocaleString('en-GB')} on a 0–10,000 scale. ${
        concentrated
          ? 'Where spend is this concentrated, a single renegotiation or cancellation moves the total materially — and a single price rise does too.'
          : moderate
            ? 'A handful of subscriptions carry a meaningful share of the total.'
            : 'No individual subscription dominates the total, so savings would have to come from many small changes rather than one large one.'
      }`,
      tone: concentrated ? 'warning' : 'neutral',
      metric: `${t3.value.toFixed(0)}% in top 3`,
      method: h.method,
      n: h.n,
      reliability: h.reliability,
    });
  }

  // ── 2. Outliers ───────────────────────────────────────────────────────────
  const o = outliers(live, (s) => s.monthlyGbp);
  const flagged = o.value.byIqr;
  const agreed = flagged.filter((f) => o.value.byZScore.some((z) => z.item.id === f.item.id));
  if (flagged.length > 0 && o.reliability !== 'INSUFFICIENT') {
    const names = flagged.slice(0, 3).map((f) => `${f.item.name} (${formatMoney(f.value)}/month)`).join(', ');
    out.push({
      id: 'outliers',
      title: `${flagged.length} subscription${flagged.length === 1 ? ' costs' : 's cost'} far more than the rest`,
      body: `${names}${flagged.length > 3 ? ` and ${flagged.length - 3} more` : ''} sit above ${formatMoney(o.value.upperFence ?? 0)}/month, the point at which a value counts as an outlier for this portfolio (Q3 + 1.5 × the interquartile range). ${
        agreed.length > 0
          ? `${agreed.length} of these are also flagged by the standard-deviation test, which is the stronger signal.`
          : 'The standard-deviation test does not agree, which suggests the distribution is skewed rather than that these are anomalies.'
      }`,
      tone: 'info',
      metric: `${flagged.length} above ${formatMoney(o.value.upperFence ?? 0)}`,
      method: o.method,
      n: o.n,
      reliability: o.reliability,
    });
  }

  // ── 3. Twelve-month movement in run-rate ──────────────────────────────────
  const months = p.trend.months;
  if (months.length >= 2) {
    const first = months[0].monthlyGbp;
    const last = months[months.length - 1].monthlyGbp;
    const change = percentChange(first, last);
    const trend = linearTrend(months.map((m, i) => ({ x: i, y: m.monthlyGbp })));
    if (change != null) {
      const rising = change > 1;
      out.push({
        id: 'growth',
        title: rising
          ? `Monthly run-rate is up ${change.toFixed(1)}% over twelve months`
          : change < -1
            ? `Monthly run-rate is down ${Math.abs(change).toFixed(1)}% over twelve months`
            : 'Monthly run-rate is broadly flat over twelve months',
        body: `${formatMoney(first)} in ${months[0].label} against ${formatMoney(last)} in ${months[months.length - 1].label}, a change of ${formatMoney(last - first)} per month, or ${formatMoney((last - first) * 12)} annualised.${
          trend.value ? ` A straight line fitted through the twelve points explains ${(trend.value.r2 * 100).toFixed(0)}% of the variation, moving ${formatMoney(trend.value.slope)} per month.` : ''
        } ${p.trend.coverageNote}`,
        tone: rising && change > 15 ? 'warning' : 'neutral',
        metric: `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`,
        method:
          'Percentage change between the first and last reconstructed month, plus an ordinary least-squares fit across all twelve. Historic months are rebuilt from recorded price changes.',
        n: months.length,
        reliability: p.trend.coverage >= 0.6 ? 'OK' : 'LOW_N',
      });
    }

    const c = cagr(first, last, 1);
    if (c.value != null && Math.abs(c.value) > 5) {
      out.push({
        id: 'projection',
        title: `At the same rate, next year's run-rate would be ${formatMoney(last * (1 + c.value / 100) * 12)}`,
        body: `This extends the last twelve months' growth of ${c.value.toFixed(1)}% forward by another year. It is arithmetic, not a forecast: it assumes the same rate of change continues, which past subscription spend rarely does. Treat it as the answer to "what if nothing changes", not as a prediction.`,
        tone: 'neutral',
        metric: `${c.value >= 0 ? '+' : ''}${c.value.toFixed(1)}% p.a.`,
        method: c.method,
        n: 2,
        reliability: 'LOW_N',
      });
    }
  }

  // ── 4. How much of the total is an estimate ───────────────────────────────
  if (p.totals.estimatedShare > 0) {
    const material = p.totals.estimatedShare >= 15;
    out.push({
      id: 'estimated',
      title: `${p.totals.estimatedShare.toFixed(0)}% of monthly spend is estimated rather than contracted`,
      body: `${formatMoney(p.totals.estimatedMonthlyGbp)} of the ${formatMoney(p.totals.monthlyGbp)} monthly total comes from usage-based or credit top-up subscriptions, where there is no fixed price to quote. ${
        material
          ? 'That is a large enough share that the headline figure should be presented to Finance with the estimate flagged. Recording actual usage each month tightens it.'
          : 'The remainder is contracted and therefore firm.'
      }`,
      tone: material ? 'warning' : 'neutral',
      metric: `${p.totals.estimatedShare.toFixed(0)}% estimated`,
      method: 'Sum of monthly cost for subscriptions on PAY_PER_USE or TOPUP_CREDIT billing, divided by total monthly cost.',
      n: live.length,
      reliability: 'OK',
    });
  }

  // ── 5. Cards that will not cover what is coming ───────────────────────────
  const atRisk = p.cards.filter((c) => c.riskLevel === 'URGENT' || c.riskLevel === 'ACTION');
  if (atRisk.length > 0) {
    const worst = atRisk.reduce((a, b) => ((b.shortfall30 ?? 0) > (a.shortfall30 ?? 0) ? b : a), atRisk[0]);
    const totalShort = round2(atRisk.reduce((a, c) => a + (c.shortfall30 ?? 0), 0));
    out.push({
      id: 'card-risk',
      title: `${atRisk.length} card${atRisk.length === 1 ? '' : 's'} will not cover the next 30 days`,
      body: `${worst.label} (•••• ${worst.last4}) is the most exposed: ${worst.riskReason}${
        atRisk.length > 1 ? ` Across all affected cards the combined shortfall is ${formatMoney(totalShort)}.` : ''
      } A failed payment on an auto-renewing subscription typically means losing access until it is settled.`,
      tone: 'danger',
      metric: formatMoney(totalShort),
      method: 'Charges falling due within 30 days for each card, compared against the recorded balance for prepaid and debit cards.',
      n: p.cards.length,
      reliability: 'OK',
    });
  }

  // ── 6. Renewal clustering ─────────────────────────────────────────────────
  const next90 = p.renewals.filter((r) => r.days >= 0 && r.days <= 90);
  if (next90.length >= 3) {
    const byMonth = new Map<string, { total: number; count: number; label: string }>();
    next90.forEach((r) => {
      const key = `${r.date.getFullYear()}-${r.date.getMonth()}`;
      const cur = byMonth.get(key) ?? { total: 0, count: 0, label: r.date.toLocaleDateString('en-GB', { month: 'long' }) };
      cur.total += r.amountGbp;
      cur.count += 1;
      byMonth.set(key, cur);
    });
    const peak = [...byMonth.values()].sort((a, b) => b.total - a.total)[0];
    const total90 = round2(next90.reduce((a, r) => a + r.amountGbp, 0));
    out.push({
      id: 'renewal-cluster',
      title: `${formatMoney(total90)} falls due in the next 90 days`,
      body: `${next90.length} payments are scheduled, with the heaviest month being ${peak.label} at ${formatMoney(peak.total)} across ${peak.count} payment${peak.count === 1 ? '' : 's'}. Annual renewals cluster, so a month like this is the one to warn Finance about in advance rather than on the day.`,
      tone: 'info',
      metric: formatMoney(total90),
      method: 'Sum of the amount charged per billing period for every subscription whose next charge falls within 90 days.',
      n: next90.length,
      reliability: 'OK',
    });
  }

  // ── 7. Cross-departmental spend ───────────────────────────────────────────
  if (p.totals.sharedCount > 0) {
    const share = p.totals.monthlyGbp > 0 ? (p.totals.sharedMonthlyGbp / p.totals.monthlyGbp) * 100 : 0;
    out.push({
      id: 'shared',
      title: `${p.totals.sharedCount} subscription${p.totals.sharedCount === 1 ? ' is' : 's are'} shared across departments`,
      body: `Those subscriptions carry ${formatMoney(p.totals.sharedMonthlyGbp)} of monthly cost, ${share.toFixed(0)}% of the total. This is the portion of spend that would be invisible to Finance if it were only attributed to whichever department happened to buy it.`,
      tone: 'neutral',
      metric: `${share.toFixed(0)}% shared`,
      method: 'Subscriptions listing more than one department, either through a percentage or seat split, or through a department other than the owner.',
      n: live.length,
      reliability: 'OK',
    });
  }

  // ── 8. Category overlap worth reviewing ───────────────────────────────────
  const overlapping = p.byCategory.filter((c) => c.count >= 3 && c.monthlyGbp > 0).sort((a, b) => b.monthlyGbp - a.monthlyGbp)[0];
  if (overlapping) {
    out.push({
      id: 'overlap',
      title: `${overlapping.count} separate subscriptions sit in ${overlapping.label}`,
      body: `They total ${formatMoney(overlapping.monthlyGbp)} per month, or ${formatMoney(overlapping.annualGbp)} a year. Several tools in one category is not by itself a problem — they may do different jobs — but it is the first place to look for genuine duplication.`,
      tone: 'neutral',
      metric: `${overlapping.count} tools`,
      method: 'Count and total cost of subscriptions grouped by category, where the count is three or more.',
      n: live.length,
      reliability: 'OK',
    });
  }

  // ── 9. Distribution shape ─────────────────────────────────────────────────
  const m = mean(values);
  const med = median(values);
  const sd = stdev(values);
  const g = gini(values);
  const pareto = paretoPoint(values);
  if (m.value != null && med.value != null && sd.value != null && n >= 4) {
    const skewed = m.value > med.value * 1.4;
    out.push({
      id: 'distribution',
      title: skewed ? 'A few large subscriptions pull the average up' : 'Subscription costs are fairly evenly sized',
      body: `The average subscription costs ${formatMoney(m.value)} per month but the median is ${formatMoney(med.value)}, with a standard deviation of ${formatMoney(sd.value)}.${
        skewed ? ' Where the average sits well above the median, the median is the more honest summary of a typical subscription.' : ''
      }${
        pareto.value ? ` ${pareto.value.count} subscription${pareto.value.count === 1 ? '' : 's'} — ${pareto.value.share.toFixed(0)}% of the register — make up 80% of the spend.` : ''
      }${g.value != null ? ` The Gini coefficient of spend is ${g.value.toFixed(2)}.` : ''}`,
      tone: 'neutral',
      metric: `median ${formatMoney(med.value)}`,
      method: 'Mean, median and sample standard deviation of monthly cost, with the Pareto point and Gini coefficient of the same distribution.',
      n,
      reliability: sd.reliability,
    });
  }

  // ── 10. Departmental per-head comparison ──────────────────────────────────
  const withHeadcount = p.byDepartment.filter((d) => d.perHeadMonthly != null && d.perHeadMonthly > 0);
  if (withHeadcount.length >= 2) {
    const sorted = [...withHeadcount].sort((a, b) => (b.perHeadMonthly ?? 0) - (a.perHeadMonthly ?? 0));
    const top = sorted[0];
    const bottom = sorted[sorted.length - 1];
    const ratio = (bottom.perHeadMonthly ?? 1) > 0 ? (top.perHeadMonthly ?? 0) / (bottom.perHeadMonthly ?? 1) : null;
    out.push({
      id: 'per-head',
      title: `${top.name} carries the highest software cost per person`,
      body: `${formatMoney(top.perHeadMonthly ?? 0)} per person per month, against ${formatMoney(bottom.perHeadMonthly ?? 0)} for ${bottom.name}${
        ratio ? `, a ratio of ${ratio.toFixed(1)} to 1` : ''
      }. Roles differ, so a gap is expected — a design-heavy team will always cost more in software than an administrative one. The figure is useful for explaining a budget, not for judging one.`,
      tone: 'neutral',
      metric: formatMoney(top.perHeadMonthly ?? 0),
      method: 'Allocated monthly cost for each department divided by its recorded headcount. Departments without a headcount are excluded.',
      n: withHeadcount.length,
      reliability: withHeadcount.length >= 4 ? 'OK' : 'LOW_N',
    });
  }

  return out;
}

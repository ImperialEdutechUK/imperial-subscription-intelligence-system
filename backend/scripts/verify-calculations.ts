/**
 * Independent verification of the calculation layer.
 *
 * Every expected value below is worked out by hand in the comment beside it,
 * so this file doubles as the audit trail for the arithmetic. Run it with:
 *
 *   npx tsx scripts/verify-calculations.ts
 */

import 'dotenv/config';
import { normaliseCost } from '../src/lib/money';
import { allocate } from '../src/lib/allocation';
import { cagr, gini, hhi, linearTrend, mean, median, outliers, paretoPoint, percentChange, quantile, stdev, topNShare } from '../src/lib/stats';
import { getPortfolio } from '../src/services/portfolio';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function near(actual: number | null | undefined, expected: number, tolerance = 0.005): boolean {
  if (actual == null) return false;
  return Math.abs(actual - expected) <= tolerance;
}

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    failures.push(label);
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title: string) {
  console.log(`\n${title}\n${'─'.repeat(title.length)}`);
}

const FX = { USD: 0.78, EUR: 0.85 };

// ═══════════════════════════════════════════════ 1. Cost normalisation ══
section('1. Cost normalisation');

{
  // £29.99 per month → 29.99/month, 359.88/year.
  const r = normaliseCost({ billingModel: 'MONTHLY', currency: 'GBP', unitAmount: 29.99, seats: 1, perSeat: false }, FX);
  check('Monthly £29.99 → £29.99/month', near(r.monthlyGbp, 29.99));
  check('Monthly £29.99 → £359.88/year', near(r.annualRunRateGbp, 359.88), `got ${r.annualRunRateGbp}`);
  check('Monthly is marked CONTRACTED', r.confidence === 'CONTRACTED');
}

{
  // £600 per year → 600/12 = £50.00/month exactly.
  const r = normaliseCost({ billingModel: 'ANNUAL', currency: 'GBP', unitAmount: 600, seats: 1, perSeat: false }, FX);
  check('Annual £600 → £50.00/month', near(r.monthlyGbp, 50));
  check('Annual £600 → £600.00/year', near(r.annualRunRateGbp, 600));
}

{
  // £300 per quarter → 300 × 4 ÷ 12 = £100.00/month.
  const r = normaliseCost({ billingModel: 'QUARTERLY', currency: 'GBP', unitAmount: 300, seats: 1, perSeat: false }, FX);
  check('Quarterly £300 → £100.00/month', near(r.monthlyGbp, 100));
}

{
  // £900 every six months → 900 × 2 ÷ 12 = £150.00/month.
  const r = normaliseCost({ billingModel: 'BIANNUAL', currency: 'GBP', unitAmount: 900, seats: 1, perSeat: false }, FX);
  check('Six-monthly £900 → £150.00/month', near(r.monthlyGbp, 150));
}

{
  // £10 per week → 10 × 52 ÷ 12 = £43.3333…/month, rounded to £43.33.
  const r = normaliseCost({ billingModel: 'WEEKLY', currency: 'GBP', unitAmount: 10, seats: 1, perSeat: false }, FX);
  check('Weekly £10 → £43.33/month', near(r.monthlyGbp, 43.33), `got ${r.monthlyGbp}`);
}

{
  // Per-seat: $25 × 12 seats = $300/month; $300 × 0.78 = £234.00/month.
  const r = normaliseCost({ billingModel: 'MONTHLY', currency: 'USD', unitAmount: 25, seats: 12, perSeat: true }, FX);
  check('Per-seat $25 × 12 seats → $300 per charge', near(r.amountPerCharge, 300));
  check('USD $300 at 0.78 → £234.00/month', near(r.monthlyGbp, 234), `got ${r.monthlyGbp}`);
  check('Exchange rate recorded on the result', r.fxRateUsed === 0.78);
}

{
  // Unknown currency must NOT silently vanish from the totals.
  const r = normaliseCost({ billingModel: 'MONTHLY', currency: 'JPY', unitAmount: 100, seats: 1, perSeat: false }, FX);
  check('Unknown currency falls back to 1:1', near(r.monthlyGbp, 100));
  check('Unknown currency raises a caveat', !!r.caveat && r.caveat.includes('JPY'), r.caveat ?? 'no caveat');
}

{
  // One-off £1,200: no recurring run-rate, but it is real cash this year.
  const r = normaliseCost({ billingModel: 'ONE_OFF', currency: 'GBP', unitAmount: 1200, seats: 1, perSeat: false }, FX);
  check('One-off contributes £0 to the run-rate', near(r.monthlyGbp, 0));
  check('One-off contributes £1,200 to 12-month cash', near(r.annualCashGbp, 1200));
}

{
  const r = normaliseCost({ billingModel: 'FREE', currency: 'GBP', unitAmount: 0, seats: 1, perSeat: false }, FX);
  check('Free costs nothing and is marked NONE', near(r.monthlyGbp, 0) && r.confidence === 'NONE');
}

{
  const r = normaliseCost({ billingModel: 'ANNUAL', currency: 'GBP', unitAmount: 1200, seats: 1, perSeat: false, status: 'CANCELLED' }, FX);
  check('Cancelled subscriptions are excluded from forward spend', near(r.monthlyGbp, 0) && near(r.annualCashGbp, 0));
}

{
  // Usage forecast: 5,000 units × £0.02 = £100.00/month, flagged as an estimate.
  const r = normaliseCost(
    { billingModel: 'PAY_PER_USE', currency: 'GBP', unitAmount: 0, seats: 1, perSeat: false, usageRatePerUnit: 0.02, estimatedMonthlyUnits: 5000 },
    FX,
  );
  check('Usage forecast 5,000 × £0.02 → £100.00/month', near(r.monthlyGbp, 100), `got ${r.monthlyGbp}`);
  check('Usage-based spend is marked ESTIMATED', r.confidence === 'ESTIMATED');
  check('Usage forecast without history carries a caveat', !!r.caveat);
}

{
  // Observed usage must override the forecast. Three months, ~2 months apart
  // end to end: 120 + 80 + 100 = 300 spread over the observed span.
  const now = Date.now();
  const r = normaliseCost(
    {
      billingModel: 'PAY_PER_USE',
      currency: 'GBP',
      unitAmount: 0,
      seats: 1,
      perSeat: false,
      usageRatePerUnit: 0.02,
      estimatedMonthlyUnits: 5000,
      observations: [
        { amount: 120, periodEnd: new Date(now - 5 * 86400000) },
        { amount: 80, periodEnd: new Date(now - 35 * 86400000) },
        { amount: 100, periodEnd: new Date(now - 65 * 86400000) },
      ],
    },
    FX,
  );
  // Span is 60 days ≈ 1.97 months, so 300 ÷ 1.97 ≈ 152. It must at least
  // differ from the 100 forecast, proving observations take precedence.
  check('Recorded usage overrides the forecast', !near(r.monthlyGbp, 100, 1), `got ${r.monthlyGbp}`);
  check('Observed usage basis mentions recorded periods', r.basis.includes('recorded'), r.basis);
}

// ═════════════════════════════════════════════════ 2. Cost allocation ══
section('2. Departmental allocation');

{
  const r = allocate(100, 'OWNER_PAYS', [], 'dept-a');
  check('Owner pays assigns 100% to the owner', r.rows.length === 1 && r.rows[0].departmentId === 'dept-a' && near(r.rows[0].amount, 100));
}

{
  const r = allocate(100, 'OWNER_PAYS', [], null);
  check('No owner falls back to Unassigned with a warning', r.rows[0].departmentId === '__unassigned__' && !!r.warning);
}

{
  // 60/40 of £250 = £150.00 and £100.00.
  const r = allocate(250, 'PERCENTAGE', [
    { departmentId: 'a', percentage: 60 },
    { departmentId: 'b', percentage: 40 },
  ], 'a');
  check('60/40 of £250 → £150.00 and £100.00', near(r.rows[0].amount, 150) && near(r.rows[1].amount, 100));
  check('A correct percentage split raises no warning', !r.warning);
}

{
  // Percentages summing to 95 must still reconcile to the full amount.
  const r = allocate(200, 'PERCENTAGE', [
    { departmentId: 'a', percentage: 60 },
    { departmentId: 'b', percentage: 35 },
  ], 'a');
  const total = r.rows.reduce((x, y) => x + y.amount, 0);
  check('95% split still totals the full £200', near(total, 200), `got ${total}`);
  check('95% split is flagged to the user', !!r.warning && r.warning.includes('95'), r.warning ?? 'no warning');
}

{
  // Thirds of £100: 33.33 + 33.33 + 33.34 must equal exactly 100.00.
  const r = allocate(100, 'PERCENTAGE', [
    { departmentId: 'a', percentage: 33.333 },
    { departmentId: 'b', percentage: 33.333 },
    { departmentId: 'c', percentage: 33.333 },
  ], 'a');
  const total = r.rows.reduce((x, y) => x + y.amount, 0);
  check('Three-way split reconciles to the penny', near(total, 100, 0.001), `got ${total}`);
}

{
  // Seats 8 / 2 of £500 → £400.00 and £100.00.
  const r = allocate(500, 'SEATS', [
    { departmentId: 'a', seats: 8 },
    { departmentId: 'b', seats: 2 },
  ], 'a');
  check('Seat split 8:2 of £500 → £400.00 and £100.00', near(r.rows[0].amount, 400) && near(r.rows[1].amount, 100));
}

{
  const r = allocate(500, 'SEATS', [{ departmentId: 'a', seats: 0 }], 'owner');
  check('Zero seats falls back to the owner with a warning', r.rows[0].departmentId === 'owner' && !!r.warning);
}

// ═══════════════════════════════════════════════════════ 3. Statistics ══
section('3. Statistics');

{
  const xs = [10, 20, 30, 40, 50];
  check('Mean of 10..50 is 30', near(mean(xs).value, 30));
  check('Median of 10..50 is 30', near(median(xs).value, 30));
  // Sample SD: deviations ±20, ±10, 0 → (400+100+0+100+400)/4 = 250 → √250 = 15.8114
  check('Sample standard deviation is 15.8114', near(stdev(xs).value, 15.8114, 0.001), `got ${stdev(xs).value}`);
  check('Standard deviation uses n−1, not n', !near(stdev(xs).value, 14.1421, 0.001));
}

{
  check('Median of an even-length list averages the middle two', near(median([10, 20, 30, 40]).value, 25));
  check('Quantile matches Excel PERCENTILE.INC at Q1', near(quantile([1, 2, 3, 4, 5], 0.25), 2));
}

{
  // Four equal values: each 25% share → 4 × 625 = 2500.
  check('HHI of four equal shares is 2,500', near(hhi([25, 25, 25, 25]).value, 2500, 0.01));
  // One value: 100% share → 10,000.
  check('HHI of a single item is 10,000', near(hhi([80]).value, 10000, 0.01));
}

{
  check('Top-3 share of five equal values is 60%', near(topNShare([10, 10, 10, 10, 10], 3).value, 60, 0.01));
}

{
  check('Gini of a perfectly even distribution is 0', near(gini([5, 5, 5, 5]).value, 0, 0.0001));
  const g = gini([0, 0, 0, 100]).value;
  check('Gini of a maximally uneven distribution approaches 1', g != null && g > 0.7, `got ${g}`);
}

{
  const p = paretoPoint([50, 30, 10, 5, 5]).value;
  // 50 + 30 = 80 of 100 → exactly 2 items reach 80%.
  check('Pareto point identifies 2 of 5 items', p?.count === 2, `got ${p?.count}`);
}

{
  check('Percent change 100 → 125 is +25%', near(percentChange(100, 125), 25));
  check('Percent change 100 → 75 is −25%', near(percentChange(100, 75), -25));
  check('Percent change from a zero base is reported as unknown, not infinity', percentChange(0, 50) === null);
}

{
  // Perfect straight line y = 10x + 5 → slope 10, R² = 1.
  const t = linearTrend([
    { x: 0, y: 5 },
    { x: 1, y: 15 },
    { x: 2, y: 25 },
    { x: 3, y: 35 },
  ]).value;
  check('Regression recovers a slope of 10', near(t?.slope, 10, 0.0001));
  check('Regression reports R² of 1 for a perfect fit', near(t?.r2, 1, 0.0001));
}

{
  const c = cagr(100, 121, 2).value;
  // (121/100)^(1/2) − 1 = 1.1 − 1 = 10%.
  check('CAGR 100 → 121 over 2 years is 10%', near(c, 10, 0.001), `got ${c}`);
}

{
  // 10,10,10,10,10,10,10,10,10,10,10,500 — the 500 is unambiguously an outlier.
  const items = [...Array(11).fill(10), 500].map((v, i) => ({ id: String(i), v }));
  const o = outliers(items, (x) => x.v);
  check('Tukey fence flags the obvious outlier', o.value.byIqr.length === 1 && o.value.byIqr[0].item.v === 500);
  check('Outlier detection reports reliability honestly at n = 12', o.reliability === 'OK' || o.reliability === 'LOW_N');
}

{
  const small = outliers([{ v: 1 }, { v: 2 }], (x) => x.v);
  check('Outlier detection refuses to conclude at n = 2', small.reliability === 'INSUFFICIENT');
}

// ══════════════════════════════════════════ 4. Live data reconciliation ══
async function liveChecks() {
section('4. Live data reconciliation');

const p = await getPortfolio();

{
  const deptSum = p.byDepartment.reduce((a, d) => a + d.monthlyGbp, 0);
  check(
    'Departmental allocations reconcile to the portfolio total',
    Math.abs(deptSum - p.totals.monthlyGbp) < 0.05,
    `departments ${deptSum.toFixed(2)} vs total ${p.totals.monthlyGbp.toFixed(2)}`,
  );
}

{
  const catSum = p.byCategory.reduce((a, c) => a + c.monthlyGbp, 0);
  check(
    'Category totals reconcile to the portfolio total',
    Math.abs(catSum - p.totals.monthlyGbp) < 0.05,
    `categories ${catSum.toFixed(2)} vs total ${p.totals.monthlyGbp.toFixed(2)}`,
  );
}

{
  const modelSum = p.byBillingModel.reduce((a, b) => a + b.monthlyGbp, 0);
  check('Billing-model totals reconcile to the portfolio total', Math.abs(modelSum - p.totals.monthlyGbp) < 0.05);
}

{
  const split = p.totals.contractedMonthlyGbp + p.totals.estimatedMonthlyGbp;
  check(
    'Contracted plus estimated equals the monthly total',
    Math.abs(split - p.totals.monthlyGbp) < 0.05,
    `${split.toFixed(2)} vs ${p.totals.monthlyGbp.toFixed(2)}`,
  );
}

{
  check('Annual run-rate is twelve times the monthly figure', Math.abs(p.totals.annualRunRateGbp - p.totals.monthlyGbp * 12) < 0.05);
}

{
  const perSubOk = p.subscriptions.every((s) => {
    if (s.status === 'CANCELLED') return true;
    const sum = s.allocations.reduce((a, x) => a + x.monthlyGbp, 0);
    return Math.abs(sum - s.monthlyGbp) < 0.02;
  });
  check('Every subscription’s split reconciles to its own cost', perSubOk);
}

{
  const negatives = p.subscriptions.filter((s) => s.monthlyGbp < 0);
  check('No subscription has a negative cost', negatives.length === 0, negatives.map((s) => s.name).join(', '));
}

{
  const trend = p.trend.months;
  check('Trend series covers exactly twelve months', trend.length === 12, `got ${trend.length}`);
  check('Trend coverage is reported as a fraction between 0 and 1', p.trend.coverage >= 0 && p.trend.coverage <= 1);
}

{
  const badRenewals = p.renewals.filter((r) => r.days < -400);
  check('No renewal is stuck absurdly far in the past', badRenewals.length === 0);
}

{
  const shortfallCards = p.cards.filter((c) => c.shortfall30 != null && c.shortfall30 > 0);
  const consistent = shortfallCards.every((c) => c.riskLevel === 'ACTION' || c.riskLevel === 'URGENT');
  check('Every card with a shortfall is flagged for action', consistent);
}

{
  const nonBalanceCards = p.cards.filter((c) => c.type === 'CORPORATE_CREDIT' || c.type === 'INVOICE' || c.type === 'DIRECT_DEBIT');
  check('Cards without a float are never asked to be topped up', nonBalanceCards.every((c) => c.shortfall30 == null));
}

}

liveChecks().then(() => {
// ═══════════════════════════════════════════════════════════ summary ══
console.log(`\n${'═'.repeat(60)}`);
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('\n  Failures:');
  failures.forEach((f) => console.log(`    · ${f}`));
}
console.log(`${'═'.repeat(60)}\n`);

process.exit(failed > 0 ? 1 : 0);
});

/**
 * Descriptive statistics for the analytics layer.
 *
 * An important honesty constraint runs through this file: a subscription
 * portfolio is a *small* dataset — tens of items, not millions. Several
 * statistics that are routine on large samples (outlier detection, growth
 * extrapolation, inequality measures) are unreliable at n < 8–12. Rather than
 * hide that, every function returns a `reliability` verdict that the UI renders
 * next to the number, and each result carries the formula used so the working
 * can be checked by hand.
 */

export type Reliability = 'OK' | 'LOW_N' | 'INSUFFICIENT';

export interface StatResult<T> {
  value: T;
  n: number;
  reliability: Reliability;
  /** Plain-English statement of the formula applied. */
  method: string;
  note?: string;
}

function reliabilityFor(n: number, minGood: number, minAny: number): Reliability {
  if (n < minAny) return 'INSUFFICIENT';
  if (n < minGood) return 'LOW_N';
  return 'OK';
}

export const RELIABILITY_LABEL: Record<Reliability, string> = {
  OK: 'Sample size adequate',
  LOW_N: 'Small sample — treat as indicative',
  INSUFFICIENT: 'Not enough data to calculate reliably',
};

// ───────────────────────────────────────────────────────── central tendency ──

export function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

export function mean(xs: number[]): StatResult<number | null> {
  const n = xs.length;
  return {
    value: n ? sum(xs) / n : null,
    n,
    reliability: reliabilityFor(n, 5, 1),
    method: 'Arithmetic mean: total ÷ count.',
  };
}

/** Quantile by linear interpolation (the "type 7" definition used by R and Excel's PERCENTILE.INC). */
export function quantile(sorted: number[], p: number): number | null {
  const n = sorted.length;
  if (n === 0) return null;
  if (n === 1) return sorted[0];
  const pos = (n - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (pos - lo) * (sorted[hi] - sorted[lo]);
}

export function median(xs: number[]): StatResult<number | null> {
  const sorted = [...xs].sort((a, b) => a - b);
  return {
    value: quantile(sorted, 0.5),
    n: xs.length,
    reliability: reliabilityFor(xs.length, 5, 1),
    method: 'Middle value of the sorted list (mean of the middle two when the count is even).',
  };
}

/** Sample standard deviation (Bessel-corrected, divides by n−1). */
export function stdev(xs: number[]): StatResult<number | null> {
  const n = xs.length;
  if (n < 2) {
    return { value: null, n, reliability: 'INSUFFICIENT', method: 'Sample standard deviation requires at least two values.' };
  }
  const m = sum(xs) / n;
  const variance = sum(xs.map((x) => (x - m) ** 2)) / (n - 1);
  return {
    value: Math.sqrt(variance),
    n,
    reliability: reliabilityFor(n, 8, 2),
    method: 'Sample standard deviation: √( Σ(x − mean)² ÷ (n − 1) ).',
    note: n < 8 ? 'With fewer than 8 subscriptions the spread estimate is volatile.' : undefined,
  };
}

export function coefficientOfVariation(xs: number[]): StatResult<number | null> {
  const m = mean(xs).value;
  const s = stdev(xs).value;
  if (m == null || s == null || m === 0) {
    return { value: null, n: xs.length, reliability: 'INSUFFICIENT', method: 'Standard deviation ÷ mean.' };
  }
  return {
    value: (s / m) * 100,
    n: xs.length,
    reliability: reliabilityFor(xs.length, 8, 2),
    method: 'Coefficient of variation: standard deviation ÷ mean, as a percentage. Higher means costs are more uneven.',
  };
}

// ───────────────────────────────────────────────────────────────── outliers ──

export interface OutlierReport<T> {
  byIqr: { item: T; value: number; bound: number }[];
  byZScore: { item: T; value: number; z: number }[];
  q1: number | null;
  q3: number | null;
  iqr: number | null;
  upperFence: number | null;
}

/**
 * Two independent methods, reported separately rather than blended.
 * Tukey's fence (Q3 + 1.5×IQR) is robust to the skew typical of spend data;
 * the z-score test assumes rough normality, which spend data usually violates.
 * Agreement between the two is the signal worth acting on.
 */
export function outliers<T>(items: T[], accessor: (t: T) => number): StatResult<OutlierReport<T>> {
  const values = items.map(accessor).filter((v) => Number.isFinite(v));
  const n = values.length;
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const iqr = q1 != null && q3 != null ? q3 - q1 : null;
  const upperFence = q3 != null && iqr != null ? q3 + 1.5 * iqr : null;

  const m = n ? sum(values) / n : 0;
  const s = stdev(values).value;

  const byIqr =
    upperFence == null
      ? []
      : items
          .filter((t) => accessor(t) > upperFence)
          .map((t) => ({ item: t, value: accessor(t), bound: upperFence }))
          .sort((a, b) => b.value - a.value);

  const byZScore =
    s == null || s === 0
      ? []
      : items
          .map((t) => ({ item: t, value: accessor(t), z: (accessor(t) - m) / s }))
          .filter((r) => Math.abs(r.z) >= 2)
          .sort((a, b) => Math.abs(b.z) - Math.abs(a.z));

  return {
    value: { byIqr, byZScore, q1, q3, iqr, upperFence },
    n,
    reliability: reliabilityFor(n, 12, 4),
    method:
      "Tukey's fence flags anything above Q3 + 1.5 × IQR. The z-score test flags anything more than 2 standard deviations from the mean.",
    note:
      n < 12
        ? 'Outlier detection is unreliable below about 12 data points — these are pointers for review, not conclusions.'
        : undefined,
  };
}

// ────────────────────────────────────────────────────────────── concentration ──

/** Herfindahl–Hirschman Index on a 0–10,000 scale. */
export function hhi(values: number[]): StatResult<number | null> {
  const total = sum(values);
  const n = values.length;
  if (total <= 0 || n === 0) {
    return { value: null, n, reliability: 'INSUFFICIENT', method: 'Sum of squared percentage shares.' };
  }
  const index = sum(values.map((v) => ((v / total) * 100) ** 2));
  return {
    value: index,
    n,
    reliability: reliabilityFor(n, 4, 1),
    method:
      'Herfindahl–Hirschman Index: each item’s share of total spend as a percentage, squared, then summed. Ranges from near 0 (evenly spread) to 10,000 (one item is everything).',
    note: 'Conventional reading, borrowed from competition economics: below 1,500 is dispersed, 1,500–2,500 is moderately concentrated, above 2,500 is concentrated.',
  };
}

export function topNShare(values: number[], topN: number): StatResult<number | null> {
  const total = sum(values);
  const n = values.length;
  if (total <= 0 || n === 0) {
    return { value: null, n, reliability: 'INSUFFICIENT', method: `Share of total held by the largest ${topN}.` };
  }
  const sorted = [...values].sort((a, b) => b - a).slice(0, topN);
  return {
    value: (sum(sorted) / total) * 100,
    n,
    reliability: reliabilityFor(n, topN + 2, 1),
    method: `Spend of the largest ${topN} items ÷ total spend, as a percentage.`,
  };
}

/** Gini coefficient, 0 (perfectly even) to 1 (all spend on one item). */
export function gini(values: number[]): StatResult<number | null> {
  const xs = values.filter((v) => v >= 0).sort((a, b) => a - b);
  const n = xs.length;
  const total = sum(xs);
  if (n < 2 || total <= 0) {
    return { value: null, n, reliability: 'INSUFFICIENT', method: 'Gini coefficient of spend distribution.' };
  }
  let cumulative = 0;
  for (let i = 0; i < n; i++) cumulative += (2 * (i + 1) - n - 1) * xs[i];
  return {
    value: cumulative / (n * total),
    n,
    reliability: reliabilityFor(n, 10, 2),
    method: 'Gini coefficient: Σ (2i − n − 1)·xᵢ ÷ (n · Σx) over spend sorted ascending. 0 means every subscription costs the same; 1 means one subscription is the entire spend.',
  };
}

/** How few items make up 80% of spend — the practical Pareto point. */
export function paretoPoint(values: number[], threshold = 0.8): StatResult<{ count: number; share: number } | null> {
  const total = sum(values);
  const n = values.length;
  if (total <= 0 || n === 0) {
    return { value: null, n, reliability: 'INSUFFICIENT', method: 'Count of largest items reaching the threshold share.' };
  }
  const sorted = [...values].sort((a, b) => b - a);
  let running = 0;
  let count = 0;
  for (const v of sorted) {
    running += v;
    count++;
    if (running / total >= threshold) break;
  }
  return {
    value: { count, share: (count / n) * 100 },
    n,
    reliability: reliabilityFor(n, 6, 2),
    method: `Number of subscriptions, largest first, whose combined cost reaches ${Math.round(threshold * 100)}% of total spend.`,
  };
}

// ─────────────────────────────────────────────────────────────────── growth ──

export function percentChange(from: number, to: number): number | null {
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  if (from === 0) return to === 0 ? 0 : null; // undefined growth from a zero base — say so rather than print ∞
  return ((to - from) / Math.abs(from)) * 100;
}

/** Compound annual growth rate from a first and last observation. */
export function cagr(first: number, last: number, years: number): StatResult<number | null> {
  if (first <= 0 || years <= 0 || !Number.isFinite(last)) {
    return { value: null, n: 2, reliability: 'INSUFFICIENT', method: 'CAGR requires a positive starting value and a positive time span.' };
  }
  return {
    value: ((last / first) ** (1 / years) - 1) * 100,
    n: 2,
    reliability: years >= 1 ? 'LOW_N' : 'INSUFFICIENT',
    method: 'Compound annual growth rate: (end ÷ start)^(1 ÷ years) − 1.',
    note: 'Derived from two endpoints only; it does not describe the path between them.',
  };
}

/** Ordinary least squares fit of y on x. Returns slope, intercept and R². */
export function linearTrend(points: { x: number; y: number }[]): StatResult<{ slope: number; intercept: number; r2: number } | null> {
  const n = points.length;
  if (n < 3) {
    return { value: null, n, reliability: 'INSUFFICIENT', method: 'Least-squares linear regression requires at least three points.' };
  }
  const mx = sum(points.map((p) => p.x)) / n;
  const my = sum(points.map((p) => p.y)) / n;
  const sxx = sum(points.map((p) => (p.x - mx) ** 2));
  const sxy = sum(points.map((p) => (p.x - mx) * (p.y - my)));
  if (sxx === 0) {
    return { value: null, n, reliability: 'INSUFFICIENT', method: 'All x values identical — no trend can be fitted.' };
  }
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const ssTot = sum(points.map((p) => (p.y - my) ** 2));
  const ssRes = sum(points.map((p) => (p.y - (slope * p.x + intercept)) ** 2));
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;
  return {
    value: { slope, intercept, r2 },
    n,
    reliability: reliabilityFor(n, 6, 3),
    method: 'Ordinary least-squares regression of monthly spend on month index. R² is the share of variation the straight line explains.',
    note: n < 6 ? 'Fewer than six months of history — the fitted trend is provisional.' : undefined,
  };
}

export function formatReliability(r: Reliability): { label: string; tone: 'positive' | 'warning' | 'danger' } {
  if (r === 'OK') return { label: RELIABILITY_LABEL.OK, tone: 'positive' };
  if (r === 'LOW_N') return { label: RELIABILITY_LABEL.LOW_N, tone: 'warning' };
  return { label: RELIABILITY_LABEL.INSUFFICIENT, tone: 'danger' };
}

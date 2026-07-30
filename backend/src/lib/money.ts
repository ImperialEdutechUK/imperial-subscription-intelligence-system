/**
 * Cost normalisation.
 *
 * Subscriptions arrive in nine different billing shapes and several currencies.
 * Every dashboard number in this application flows through `normaliseCost`,
 * which converts a subscription into a comparable monthly and annual figure and
 * — critically — records *how* it got there so the UI can show its working and
 * label estimates as estimates.
 *
 * Two annual figures are produced deliberately, because they answer different
 * questions and Finance needs both:
 *
 *   annualRunRate — recurring commitment only. "If nothing changes, what do we
 *                   spend per year?" One-off purchases are excluded.
 *   annualCash    — money actually leaving the account over the next 12 months,
 *                   including one-off purchases falling in that window.
 */

import { BILLING_MODEL_META, type BillingModel, CURRENCY_SYMBOL } from './domain';

export type FxTable = Record<string, number>; // currency code -> value of 1 unit in GBP

export type Confidence = 'CONTRACTED' | 'ESTIMATED' | 'NONE';

export interface CostInput {
  billingModel: string;
  currency: string;
  unitAmount: number;
  seats: number;
  perSeat: boolean;
  status?: string;
  startDate?: Date | string | null;
  renewalDate?: Date | string | null;
  usageRatePerUnit?: number | null;
  estimatedMonthlyUnits?: number | null;
  topUpAmount?: number | null;
  /** Observed spend used to replace an estimate, newest first. */
  observations?: { amount: number; periodEnd: Date | string }[];
}

export interface NormalisedCost {
  /** Amount charged each time the vendor bills, in the subscription's currency. */
  amountPerCharge: number;
  currency: string;
  monthlyNative: number;
  annualRunRateNative: number;
  monthlyGbp: number;
  annualRunRateGbp: number;
  /** One-off spend attributable to the next 12 months, in GBP. */
  oneOffGbp: number;
  /** Recurring + one-off cash over the next 12 months, in GBP. */
  annualCashGbp: number;
  confidence: Confidence;
  /** Human-readable derivation, shown in the UI under "show working". */
  basis: string;
  /** Set when the figure rests on an assumption the user should know about. */
  caveat?: string;
  fxRateUsed: number;
}

const DAYS_PER_MONTH = 365.25 / 12; // 30.4375

export function fxToGbp(currency: string, fx: FxTable): number {
  if (!currency || currency === 'GBP') return 1;
  const rate = fx[currency];
  if (typeof rate === 'number' && rate > 0) return rate;
  return 1; // unknown currency: treat 1:1 and flag via caveat rather than silently dropping the cost
}

function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Trailing mean of observed spend. Used for usage-based and credit top-up
 * subscriptions, where the contracted price is not a meaningful number.
 */
function trailingMonthlyFromObservations(
  observations: CostInput['observations'],
  monthsWindow = 6,
): { value: number; count: number } | null {
  if (!observations || observations.length === 0) return null;
  const cutoff = Date.now() - monthsWindow * DAYS_PER_MONTH * 86_400_000;
  const inWindow = observations.filter((o) => {
    const d = toDate(o.periodEnd);
    return d != null && d.getTime() >= cutoff;
  });
  const use = inWindow.length > 0 ? inWindow : observations.slice(0, monthsWindow);
  if (use.length === 0) return null;

  // Spread total observed spend across the span it covers, so three top-ups in
  // six months reads as a six-month average and not a three-month one.
  const total = use.reduce((a, o) => a + o.amount, 0);
  const dates = use.map((o) => toDate(o.periodEnd)!.getTime()).sort((a, b) => a - b);
  const spanMs = dates[dates.length - 1] - dates[0];
  const spanMonths = Math.max(1, spanMs / (DAYS_PER_MONTH * 86_400_000));
  const monthsCovered = use.length === 1 ? 1 : Math.max(spanMonths, 1);
  return { value: total / monthsCovered, count: use.length };
}

export function normaliseCost(input: CostInput, fx: FxTable = {}): NormalisedCost {
  const model = (input.billingModel || 'MONTHLY') as BillingModel;
  const meta = BILLING_MODEL_META[model] ?? BILLING_MODEL_META.MONTHLY;
  const currency = input.currency || 'GBP';
  const rate = fxToGbp(currency, fx);
  const sym = CURRENCY_SYMBOL[currency] ?? `${currency} `;

  const seats = Math.max(1, Number(input.seats) || 1);
  const unit = Number(input.unitAmount) || 0;
  const amountPerCharge = input.perSeat ? unit * seats : unit;

  const seatNote = input.perSeat ? ` (${sym}${fmt(unit)} × ${seats} seats)` : '';

  let monthlyNative = 0;
  let oneOffNative = 0;
  let confidence: Confidence = 'CONTRACTED';
  let basis = '';
  let caveat: string | undefined;

  // A cancelled subscription contributes nothing to forward-looking spend.
  if (input.status === 'CANCELLED') {
    return {
      amountPerCharge,
      currency,
      monthlyNative: 0,
      annualRunRateNative: 0,
      monthlyGbp: 0,
      annualRunRateGbp: 0,
      oneOffGbp: 0,
      annualCashGbp: 0,
      confidence: 'NONE',
      basis: 'Cancelled — excluded from forward-looking spend.',
      fxRateUsed: rate,
    };
  }

  switch (model) {
    case 'FREE': {
      confidence = 'NONE';
      basis = 'Free of charge — no cost contribution.';
      break;
    }

    case 'ONE_OFF': {
      oneOffNative = amountPerCharge;
      confidence = 'CONTRACTED';
      basis = `One-off purchase of ${sym}${fmt(amountPerCharge)}${seatNote}. Excluded from the recurring run-rate; included in 12-month cash.`;
      break;
    }

    case 'PAY_PER_USE': {
      confidence = 'ESTIMATED';
      const observed = trailingMonthlyFromObservations(input.observations);
      if (observed) {
        monthlyNative = observed.value;
        basis = `Mean of ${observed.count} recorded usage period${observed.count === 1 ? '' : 's'} = ${sym}${fmt(monthlyNative)}/month.`;
        if (observed.count < 3) caveat = `Based on only ${observed.count} recorded period${observed.count === 1 ? '' : 's'}. Add more usage records to improve the estimate.`;
      } else if (input.estimatedMonthlyUnits && input.usageRatePerUnit) {
        monthlyNative = input.estimatedMonthlyUnits * input.usageRatePerUnit;
        basis = `${fmt(input.estimatedMonthlyUnits)} units/month × ${sym}${fmt(input.usageRatePerUnit)} per unit = ${sym}${fmt(monthlyNative)}/month.`;
        caveat = 'Forecast from your unit estimate, not from recorded usage.';
      } else {
        monthlyNative = amountPerCharge;
        basis = `Your estimated monthly spend of ${sym}${fmt(monthlyNative)}${seatNote}.`;
        caveat = 'No usage history recorded — this is your own estimate.';
      }
      break;
    }

    case 'TOPUP_CREDIT': {
      confidence = 'ESTIMATED';
      const observed = trailingMonthlyFromObservations(input.observations);
      if (observed) {
        monthlyNative = observed.value;
        basis = `Actual top-ups over the trailing period, averaged: ${observed.count} top-up${observed.count === 1 ? '' : 's'} → ${sym}${fmt(monthlyNative)}/month.`;
        if (observed.count < 2) caveat = 'Only one top-up recorded — the monthly average is not yet reliable.';
      } else if (input.topUpAmount && input.topUpAmount > 0) {
        monthlyNative = amountPerCharge > 0 ? amountPerCharge : input.topUpAmount;
        basis = `Assumed one top-up of ${sym}${fmt(monthlyNative)} per month.`;
        caveat = 'No top-up history recorded — assumes monthly top-ups at the stated amount.';
      } else {
        monthlyNative = amountPerCharge;
        basis = `Your estimated monthly credit spend of ${sym}${fmt(monthlyNative)}.`;
        caveat = 'No top-up history recorded — this is your own estimate.';
      }
      break;
    }

    default: {
      // Fixed recurring: WEEKLY / MONTHLY / QUARTERLY / BIANNUAL / ANNUAL
      const perYear = meta.periodsPerYear || 12;
      monthlyNative = (amountPerCharge * perYear) / 12;
      const per = meta.label.toLowerCase();
      basis =
        perYear === 12
          ? `${sym}${fmt(amountPerCharge)}${seatNote} per month.`
          : `${sym}${fmt(amountPerCharge)}${seatNote} ${per} × ${perYear} per year ÷ 12 = ${sym}${fmt(monthlyNative)}/month.`;
      break;
    }
  }

  if (currency !== 'GBP' && !fx[currency]) {
    caveat = [caveat, `No exchange rate set for ${currency}; treated as 1:1 with GBP. Set a rate in Settings.`]
      .filter(Boolean)
      .join(' ');
  }

  const annualRunRateNative = monthlyNative * 12;
  const oneOffGbp = round2(oneOffNative * rate);
  const monthlyGbp = round2(monthlyNative * rate);
  const annualRunRateGbp = round2(annualRunRateNative * rate);

  return {
    amountPerCharge: round2(amountPerCharge),
    currency,
    monthlyNative: round2(monthlyNative),
    annualRunRateNative: round2(annualRunRateNative),
    monthlyGbp,
    annualRunRateGbp,
    oneOffGbp,
    annualCashGbp: round2(annualRunRateGbp + oneOffGbp),
    confidence,
    basis,
    caveat,
    fxRateUsed: rate,
  };
}

// ───────────────────────────────────────────────────────────── formatting ──

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function fmt(n: number): string {
  return new Intl.NumberFormat('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
}

export function formatMoney(
  amount: number | null | undefined,
  currency = 'GBP',
  opts: { decimals?: number; compact?: boolean } = {},
): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  const { decimals, compact } = opts;

  if (compact && Math.abs(n) >= 1000) {
    // Deliberately hand-rolled rather than using Intl's `notation: 'compact'`.
    // Node and Chrome disagree on the output for the same input — Node renders
    // "£2.0k" where Chrome renders "£2K" — which produces a React hydration
    // mismatch on every axis label. Doing the arithmetic here guarantees the
    // server and the browser print the same string.
    const sym = CURRENCY_SYMBOL[currency] ?? `${currency} `;
    const abs = Math.abs(n);
    const sign = n < 0 ? '−' : '';
    const [scaled, suffix] =
      abs >= 1_000_000_000 ? [abs / 1_000_000_000, 'B'] : abs >= 1_000_000 ? [abs / 1_000_000, 'M'] : [abs / 1000, 'K'];
    const digits = scaled >= 100 ? scaled.toFixed(0) : scaled.toFixed(1).replace(/\.0$/, '');
    return `${sign}${sym}${digits}${suffix}`;
  }

  const dp = decimals ?? (Math.abs(n) < 100 && n % 1 !== 0 ? 2 : Math.abs(n) >= 1000 ? 0 : 2);
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  }).format(n);
}

export function formatPercent(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return '—';
  return `${value >= 0 ? '' : ''}${value.toFixed(decimals)}%`;
}

/** Next occurrence of a recurring charge on/after `from`, stepping by the billing period. */
export function nextChargeDate(renewalDate: Date | null, billingModel: string, from = new Date()): Date | null {
  if (!renewalDate) return null;
  const meta = BILLING_MODEL_META[billingModel as BillingModel];
  if (!meta || !meta.recurring) return renewalDate >= from ? renewalDate : null;

  const d = new Date(renewalDate);
  if (d >= from) return d;

  const stepMonths =
    billingModel === 'ANNUAL' ? 12 : billingModel === 'BIANNUAL' ? 6 : billingModel === 'QUARTERLY' ? 3 : billingModel === 'MONTHLY' ? 1 : 0;

  if (stepMonths > 0) {
    let guard = 0;
    while (d < from && guard++ < 600) d.setMonth(d.getMonth() + stepMonths);
    return d;
  }
  if (billingModel === 'WEEKLY') {
    let guard = 0;
    while (d < from && guard++ < 600) d.setDate(d.getDate() + 7);
    return d;
  }
  // Usage / credit models bill continuously — treat the stored date as the review date.
  let guard = 0;
  while (d < from && guard++ < 600) d.setMonth(d.getMonth() + 1);
  return d;
}

export function daysUntil(date: Date | string | null | undefined, from = new Date()): number | null {
  const d = toDate(date);
  if (!d) return null;
  const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const b = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  return Math.round((a - b) / 86_400_000);
}

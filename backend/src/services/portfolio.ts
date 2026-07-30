/**
 * The portfolio model.
 *
 * Every page in the application reads from this module rather than querying
 * Prisma directly, so there is exactly one definition of "what a subscription
 * costs" and "who pays for it". Dashboards, exports, the reminder engine and
 * the API all agree by construction.
 */

import { prisma } from '@/lib/db';
import { allocate, UNASSIGNED, UNASSIGNED_LABEL, isShared } from '@/lib/allocation';
import { daysUntil, formatMoney, fxToGbp, nextChargeDate, normaliseCost, round2, type FxTable, type NormalisedCost } from '@/lib/money';
import { BILLING_MODEL_META, CATEGORY_META, type BillingModel, type Category } from '@/lib/domain';
import { hasSecret } from '@/lib/crypto';
import { hashColor } from '@/lib/utils';

export interface DepartmentLite {
  id: string;
  name: string;
  code: string;
  color: string;
  headcount: number | null;
  costCentre: string | null;
  headName: string | null;
  headEmail: string | null;
}

export interface AllocationView {
  departmentId: string;
  departmentName: string;
  departmentCode: string;
  color: string;
  share: number;
  monthlyGbp: number;
  annualGbp: number;
}

export interface SubscriptionView {
  id: string;
  name: string;
  vendor: string | null;
  url: string | null;
  category: string;
  categoryLabel: string;
  status: string;
  criticality: string;
  description: string | null;
  notes: string | null;
  tags: string[];

  accountEmail: string | null;
  username: string | null;
  hasPassword: boolean;
  credentialLocation: string | null;

  billingModel: string;
  billingLabel: string;
  currency: string;
  unitAmount: number;
  seats: number;
  perSeat: boolean;

  cost: NormalisedCost;
  monthlyGbp: number;
  annualGbp: number;

  renewalDate: Date | null;
  nextCharge: Date | null;
  daysToRenewal: number | null;
  autoRenew: boolean;
  noticePeriodDays: number;
  contractEndDate: Date | null;
  startDate: Date | null;

  allocationMethod: string;
  allocations: AllocationView[];
  allocationWarning?: string;
  shared: boolean;
  ownerDepartmentId: string | null;
  ownerDepartmentName: string | null;
  ownerName: string | null;
  ownerEmail: string | null;

  cardId: string | null;
  cardLabel: string | null;
  cardLast4: string | null;
  cardType: string | null;

  creditBalance: number | null;
  topUpThreshold: number | null;
  creditRunwayMonths: number | null;

  costChangeCount: number;
  lastChange: { effectiveDate: Date; previousAmount: number | null; newAmount: number; percent: number | null } | null;
}

export interface CardView {
  id: string;
  label: string;
  last4: string;
  provider: string | null;
  type: string;
  currency: string;
  currentBalance: number | null;
  /** The same balance converted to GBP, which is the unit `due30`/`due60` use. */
  currentBalanceGbp: number | null;
  holderName: string | null;
  expiryMonth: number | null;
  expiryYear: number | null;
  notes: string | null;
  balanceUpdatedAt: Date | null;
  lowBalanceThreshold: number;
  active: boolean;
  subscriptionCount: number;
  monthlyGbp: number;
  /** Charges falling due in the next 30 / 60 days, in GBP. */
  due30: number;
  due60: number;
  shortfall30: number | null;
  riskLevel: 'NONE' | 'WATCH' | 'ACTION' | 'URGENT';
  riskReason: string;
  nextChargeDate: Date | null;
}

export interface RenewalItem {
  subscriptionId: string;
  name: string;
  vendor: string | null;
  date: Date;
  days: number;
  amountGbp: number;
  currency: string;
  amountNative: number;
  cardLabel: string | null;
  cardLast4: string | null;
  cardType: string | null;
  cardNeedsTopUp: boolean;
  autoRenew: boolean;
  urgency: 'OVERDUE' | 'CRITICAL' | 'SOON' | 'UPCOMING' | 'DISTANT';
  departments: string[];
  estimated: boolean;
}

export interface Portfolio {
  subscriptions: SubscriptionView[];
  departments: DepartmentLite[];
  departmentIndex: Map<string, DepartmentLite>;
  cards: CardView[];
  fx: FxTable;
  totals: {
    count: number;
    activeCount: number;
    monthlyGbp: number;
    annualRunRateGbp: number;
    annualCashGbp: number;
    contractedMonthlyGbp: number;
    estimatedMonthlyGbp: number;
    estimatedShare: number;
    sharedCount: number;
    sharedMonthlyGbp: number;
  };
  byDepartment: {
    id: string;
    name: string;
    code: string;
    color: string;
    monthlyGbp: number;
    annualGbp: number;
    subscriptionCount: number;
    sharedCount: number;
    perHeadMonthly: number | null;
  }[];
  byCategory: { key: string; label: string; monthlyGbp: number; annualGbp: number; count: number }[];
  byBillingModel: { key: string; label: string; monthlyGbp: number; count: number }[];
  renewals: RenewalItem[];
  trend: {
    months: { month: string; label: string; monthlyGbp: number; count: number }[];
    coverage: number;
    coverageNote: string;
  };
  movers: {
    subscriptionId: string;
    name: string;
    effectiveDate: Date;
    previousAmount: number | null;
    newAmount: number;
    currency: string;
    deltaGbp: number;
    percent: number | null;
    reason: string | null;
  }[];
}

async function loadFx(): Promise<FxTable> {
  const rows = await prisma.fxRate.findMany();
  const table: FxTable = {};
  rows.forEach((r) => {
    table[r.code] = r.rateToGbp;
  });
  return table;
}

const MONTH_MS = (365.25 / 12) * 86_400_000;

export async function getPortfolio(opts: { includeArchived?: boolean } = {}): Promise<Portfolio> {
  const [fx, departments, rawSubs, rawCards] = await Promise.all([
    loadFx(),
    prisma.department.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    prisma.subscription.findMany({
      where: opts.includeArchived ? {} : { archived: false },
      include: {
        allocations: true,
        card: true,
        ownerDepartment: true,
        costChanges: { orderBy: { effectiveDate: 'desc' } },
        usageRecords: { orderBy: { periodEnd: 'desc' }, take: 12 },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.card.findMany({ include: { topUps: { orderBy: { occurredAt: 'desc' }, take: 12 } } }),
  ]);

  const deptIndex = new Map<string, DepartmentLite>();
  const deptList: DepartmentLite[] = departments.map((d) => ({
    id: d.id,
    name: d.name,
    code: d.code,
    color: d.colorHex || hashColor(d.name),
    headcount: d.headcount,
    costCentre: d.costCentre,
    headName: d.headName,
    headEmail: d.headEmail,
  }));
  deptList.forEach((d) => deptIndex.set(d.id, d));
  deptIndex.set(UNASSIGNED, {
    id: UNASSIGNED,
    name: UNASSIGNED_LABEL,
    code: 'N/A',
    color: 'var(--chart-other)',
    headcount: null,
    costCentre: null,
    headName: null,
    headEmail: null,
  });

  const now = new Date();

  const subscriptions: SubscriptionView[] = rawSubs.map((s) => {
    // Usage records and card top-ups both act as "observations" for the
    // estimate-based billing models.
    const observations = s.usageRecords.map((u) => ({ amount: u.amount, periodEnd: u.periodEnd }));

    const cost = normaliseCost(
      {
        billingModel: s.billingModel,
        currency: s.currency,
        unitAmount: s.unitAmount,
        seats: s.seats,
        perSeat: s.perSeat,
        status: s.status,
        startDate: s.startDate,
        renewalDate: s.renewalDate,
        usageRatePerUnit: s.usageRatePerUnit,
        estimatedMonthlyUnits: s.estimatedMonthlyUnits,
        topUpAmount: s.topUpAmount,
        observations,
      },
      fx,
    );

    const alloc = allocate(
      cost.monthlyGbp,
      s.allocationMethod,
      s.allocations.map((a) => ({ departmentId: a.departmentId, percentage: a.percentage, seats: a.seats })),
      s.ownerDepartmentId,
    );

    const allocations: AllocationView[] = alloc.rows.map((r) => {
      const d = deptIndex.get(r.departmentId) ?? deptIndex.get(UNASSIGNED)!;
      return {
        departmentId: r.departmentId,
        departmentName: d.name,
        departmentCode: d.code,
        color: d.color,
        share: r.share,
        monthlyGbp: r.amount,
        annualGbp: round2(r.amount * 12),
      };
    });

    const next = nextChargeDate(s.renewalDate, s.billingModel, now);
    const lastChangeRow = s.costChanges[0];
    const monthlyBurn = cost.monthlyNative;

    return {
      id: s.id,
      name: s.name,
      vendor: s.vendor,
      url: s.url,
      category: s.category,
      categoryLabel: CATEGORY_META[s.category as Category]?.label ?? s.category,
      status: s.status,
      criticality: s.criticality,
      description: s.description,
      notes: s.notes,
      tags: s.tags ? s.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],

      accountEmail: s.accountEmail,
      username: s.username,
      hasPassword: hasSecret(s.passwordCipher),
      credentialLocation: s.credentialLocation,

      billingModel: s.billingModel,
      billingLabel: BILLING_MODEL_META[s.billingModel as BillingModel]?.label ?? s.billingModel,
      currency: s.currency,
      unitAmount: s.unitAmount,
      seats: s.seats,
      perSeat: s.perSeat,

      cost,
      monthlyGbp: cost.monthlyGbp,
      annualGbp: cost.annualRunRateGbp,

      renewalDate: s.renewalDate,
      nextCharge: next,
      daysToRenewal: daysUntil(next, now),
      autoRenew: s.autoRenew,
      noticePeriodDays: s.noticePeriodDays,
      contractEndDate: s.contractEndDate,
      startDate: s.startDate,

      allocationMethod: s.allocationMethod,
      allocations,
      allocationWarning: alloc.warning,
      shared: isShared(s.allocationMethod, s.allocations, s.ownerDepartmentId),
      ownerDepartmentId: s.ownerDepartmentId,
      ownerDepartmentName: s.ownerDepartment?.name ?? null,
      ownerName: s.ownerName,
      ownerEmail: s.ownerEmail,

      cardId: s.cardId,
      cardLabel: s.card?.label ?? null,
      cardLast4: s.card?.last4 ?? null,
      cardType: s.card?.type ?? null,

      creditBalance: s.creditBalance,
      topUpThreshold: s.topUpThreshold,
      creditRunwayMonths: s.creditBalance != null && monthlyBurn > 0 ? round2(s.creditBalance / monthlyBurn) : null,

      costChangeCount: s.costChanges.length,
      lastChange: lastChangeRow
        ? {
            effectiveDate: lastChangeRow.effectiveDate,
            previousAmount: lastChangeRow.previousAmount,
            newAmount: lastChangeRow.newAmount,
            percent:
              lastChangeRow.previousAmount && lastChangeRow.previousAmount !== 0
                ? ((lastChangeRow.newAmount - lastChangeRow.previousAmount) / Math.abs(lastChangeRow.previousAmount)) * 100
                : null,
          }
        : null,
    };
  });

  const live = subscriptions.filter((s) => s.status !== 'CANCELLED');

  // ── Totals ────────────────────────────────────────────────────────────────
  const monthlyGbp = round2(live.reduce((a, s) => a + s.monthlyGbp, 0));
  const contractedMonthlyGbp = round2(live.filter((s) => s.cost.confidence === 'CONTRACTED').reduce((a, s) => a + s.monthlyGbp, 0));
  const estimatedMonthlyGbp = round2(live.filter((s) => s.cost.confidence === 'ESTIMATED').reduce((a, s) => a + s.monthlyGbp, 0));
  const oneOffGbp = round2(live.reduce((a, s) => a + s.cost.oneOffGbp, 0));
  const sharedSubs = live.filter((s) => s.shared);

  // ── Department roll-up ────────────────────────────────────────────────────
  const deptTotals = new Map<string, { monthly: number; count: number; shared: number }>();
  live.forEach((s) => {
    s.allocations.forEach((a) => {
      const cur = deptTotals.get(a.departmentId) ?? { monthly: 0, count: 0, shared: 0 };
      cur.monthly += a.monthlyGbp;
      cur.count += 1;
      if (s.shared) cur.shared += 1;
      deptTotals.set(a.departmentId, cur);
    });
  });

  // Departments with no subscriptions are seeded at zero rather than omitted.
  // A department that does not appear cannot be edited or removed, and its
  // absence reads as "we have six departments" when the organisation has nine.
  deptList.forEach((d) => {
    if (!deptTotals.has(d.id)) deptTotals.set(d.id, { monthly: 0, count: 0, shared: 0 });
  });

  const byDepartment = [...deptTotals.entries()]
    .map(([id, v]) => {
      const d = deptIndex.get(id) ?? deptIndex.get(UNASSIGNED)!;
      return {
        id,
        name: d.name,
        code: d.code,
        color: d.color,
        monthlyGbp: round2(v.monthly),
        annualGbp: round2(v.monthly * 12),
        subscriptionCount: v.count,
        sharedCount: v.shared,
        perHeadMonthly: d.headcount && d.headcount > 0 ? round2(v.monthly / d.headcount) : null,
      };
    })
    .sort((a, b) => b.monthlyGbp - a.monthlyGbp);

  // ── Category and billing-model roll-ups ───────────────────────────────────
  const catTotals = new Map<string, { monthly: number; count: number }>();
  live.forEach((s) => {
    const cur = catTotals.get(s.category) ?? { monthly: 0, count: 0 };
    cur.monthly += s.monthlyGbp;
    cur.count += 1;
    catTotals.set(s.category, cur);
  });
  const byCategory = [...catTotals.entries()]
    .map(([key, v]) => ({
      key,
      label: CATEGORY_META[key as Category]?.label ?? key,
      monthlyGbp: round2(v.monthly),
      annualGbp: round2(v.monthly * 12),
      count: v.count,
    }))
    .sort((a, b) => b.monthlyGbp - a.monthlyGbp);

  const modelTotals = new Map<string, { monthly: number; count: number }>();
  live.forEach((s) => {
    const cur = modelTotals.get(s.billingModel) ?? { monthly: 0, count: 0 };
    cur.monthly += s.monthlyGbp;
    cur.count += 1;
    modelTotals.set(s.billingModel, cur);
  });
  const byBillingModel = [...modelTotals.entries()]
    .map(([key, v]) => ({
      key,
      label: BILLING_MODEL_META[key as BillingModel]?.label ?? key,
      monthlyGbp: round2(v.monthly),
      count: v.count,
    }))
    .sort((a, b) => b.monthlyGbp - a.monthlyGbp);

  // ── Cards and top-up risk ─────────────────────────────────────────────────
  const cards: CardView[] = rawCards.map((c) => {
    const subs = live.filter((s) => s.cardId === c.id);
    const monthly = round2(subs.reduce((a, s) => a + s.monthlyGbp, 0));

    const dueWithin = (days: number) =>
      round2(
        subs
          .filter((s) => s.daysToRenewal != null && s.daysToRenewal >= 0 && s.daysToRenewal <= days)
          .reduce((a, s) => a + s.cost.amountPerCharge * s.cost.fxRateUsed, 0),
      );

    const due30 = dueWithin(30);
    const due60 = dueWithin(60);
    const needsBalance = c.type === 'PREPAID' || c.type === 'DEBIT';
    // The card's balance is held in the card's own currency while `dueWithin`
    // returns GBP. Both sides must be in the same unit before they are compared,
    // or a dollar-denominated float would look larger than it is.
    const cardRate = fxToGbp(c.currency, fx);
    const balance = c.currentBalance != null ? round2(c.currentBalance * cardRate) : null;
    const shortfall30 = needsBalance && balance != null ? round2(Math.max(0, due30 - balance)) : null;

    const nextDates = subs.map((s) => s.nextCharge).filter((d): d is Date => d != null).sort((a, b) => a.getTime() - b.getTime());
    const soonestDays = nextDates.length ? daysUntil(nextDates[0], now) : null;

    let riskLevel: CardView['riskLevel'] = 'NONE';
    let riskReason = 'No action needed.';

    if (needsBalance) {
      if (balance == null) {
        riskLevel = due30 > 0 ? 'ACTION' : 'WATCH';
        riskReason = `Balance has never been recorded, so a shortfall cannot be detected. ${formatMoney(due30)} is due in the next 30 days.`;
      } else if (shortfall30 && shortfall30 > 0) {
        riskLevel = soonestDays != null && soonestDays <= 7 ? 'URGENT' : 'ACTION';
        riskReason = `${formatMoney(due30)} falls due within 30 days against a balance of ${formatMoney(balance)} — short by ${formatMoney(shortfall30)}.`;
      } else if (due60 > balance) {
        riskLevel = 'WATCH';
        riskReason = `Covered for 30 days, but ${formatMoney(due60)} falls due within 60 days against a balance of ${formatMoney(balance)}.`;
      } else if (balance <= c.lowBalanceThreshold) {
        riskLevel = 'WATCH';
        riskReason = `Balance of ${formatMoney(balance)} is at or below the ${formatMoney(c.lowBalanceThreshold)} threshold you set.`;
      } else {
        riskReason = `Balance of ${formatMoney(balance)} covers ${formatMoney(due60)} due in the next 60 days.`;
      }
    } else {
      riskReason = `${c.type === 'INVOICE' ? 'Billed on invoice' : 'No stored float'} — no top-up required.`;
    }

    return {
      id: c.id,
      label: c.label,
      last4: c.last4,
      provider: c.provider,
      type: c.type,
      currency: c.currency,
      currentBalance: c.currentBalance,
      currentBalanceGbp: balance,
      holderName: c.holderName,
      expiryMonth: c.expiryMonth,
      expiryYear: c.expiryYear,
      notes: c.notes,
      balanceUpdatedAt: c.balanceUpdatedAt,
      lowBalanceThreshold: c.lowBalanceThreshold,
      active: c.active,
      subscriptionCount: subs.length,
      monthlyGbp: monthly,
      due30,
      due60,
      shortfall30,
      riskLevel,
      riskReason,
      nextChargeDate: nextDates[0] ?? null,
    };
  });

  const cardIndex = new Map(cards.map((c) => [c.id, c]));

  // ── Renewal timeline ──────────────────────────────────────────────────────
  const renewals: RenewalItem[] = live
    .filter((s) => s.nextCharge != null && s.status !== 'CANCELLED')
    .map((s) => {
      const days = s.daysToRenewal ?? 0;
      const card = s.cardId ? cardIndex.get(s.cardId) : undefined;
      const urgency: RenewalItem['urgency'] =
        days < 0 ? 'OVERDUE' : days <= 7 ? 'CRITICAL' : days <= 21 ? 'SOON' : days <= 60 ? 'UPCOMING' : 'DISTANT';
      return {
        subscriptionId: s.id,
        name: s.name,
        vendor: s.vendor,
        date: s.nextCharge!,
        days,
        amountGbp: round2(s.cost.amountPerCharge * s.cost.fxRateUsed),
        currency: s.currency,
        amountNative: s.cost.amountPerCharge,
        cardLabel: s.cardLabel,
        cardLast4: s.cardLast4,
        cardType: s.cardType,
        cardNeedsTopUp: !!card && (card.riskLevel === 'ACTION' || card.riskLevel === 'URGENT'),
        autoRenew: s.autoRenew,
        urgency,
        departments: s.allocations.map((a) => a.departmentCode),
        estimated: s.cost.confidence === 'ESTIMATED',
      };
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  // ── 12-month run-rate reconstruction ──────────────────────────────────────
  // For each month we ask: what was the recurring monthly cost of the portfolio
  // as it stood at the end of that month? Price history supplies the answer
  // where it exists; where it does not, the current price is assumed to have
  // applied throughout, which is stated openly via `coverage`.
  const changesBySub = new Map<string, { effectiveDate: Date; previousAmount: number | null; newAmount: number }[]>();
  rawSubs.forEach((s) => {
    if (s.costChanges.length) {
      changesBySub.set(
        s.id,
        s.costChanges.map((c) => ({ effectiveDate: c.effectiveDate, previousAmount: c.previousAmount, newAmount: c.newAmount })),
      );
    }
  });

  const months: Portfolio['trend']['months'] = [];
  for (let i = 11; i >= 0; i--) {
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
    let total = 0;
    let count = 0;
    rawSubs.forEach((s) => {
      if (s.status === 'CANCELLED') return;
      if (s.startDate && s.startDate > end) return;
      if (s.contractEndDate && s.contractEndDate < end) return;

      const hist = changesBySub.get(s.id);
      let amount = s.unitAmount;
      if (hist && hist.length) {
        const applied = hist.filter((c) => c.effectiveDate <= end).sort((a, b) => b.effectiveDate.getTime() - a.effectiveDate.getTime())[0];
        if (applied) {
          amount = applied.newAmount;
        } else {
          const earliest = [...hist].sort((a, b) => a.effectiveDate.getTime() - b.effectiveDate.getTime())[0];
          amount = earliest.previousAmount ?? s.unitAmount;
        }
      }
      const point = normaliseCost(
        {
          billingModel: s.billingModel,
          currency: s.currency,
          unitAmount: amount,
          seats: s.seats,
          perSeat: s.perSeat,
          status: s.status,
          usageRatePerUnit: s.usageRatePerUnit,
          estimatedMonthlyUnits: s.estimatedMonthlyUnits,
          topUpAmount: s.topUpAmount,
          observations: s.usageRecords.filter((u) => u.periodEnd <= end).map((u) => ({ amount: u.amount, periodEnd: u.periodEnd })),
        },
        fx,
      );
      total += point.monthlyGbp;
      count += 1;
    });
    months.push({
      month: `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}`,
      label: end.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
      monthlyGbp: round2(total),
      count,
    });
  }

  const withHistory = rawSubs.filter((s) => s.costChanges.length > 0).length;
  const coverage = rawSubs.length ? withHistory / rawSubs.length : 0;

  // ── Biggest movers in the last 12 months ──────────────────────────────────
  const cutoff = new Date(now.getTime() - 365 * 86_400_000);
  const movers = rawSubs
    .flatMap((s) =>
      s.costChanges
        .filter((c) => c.effectiveDate >= cutoff)
        .map((c) => {
          const rate = fx[c.currency] ?? (c.currency === 'GBP' ? 1 : 1);
          const prev = c.previousAmount ?? 0;
          const periods = BILLING_MODEL_META[(s.billingModel as BillingModel) ?? 'MONTHLY']?.periodsPerYear || 12;
          const monthlyDelta = ((c.newAmount - prev) * periods) / 12;
          return {
            subscriptionId: s.id,
            name: s.name,
            effectiveDate: c.effectiveDate,
            previousAmount: c.previousAmount,
            newAmount: c.newAmount,
            currency: c.currency,
            deltaGbp: round2(monthlyDelta * rate),
            percent: prev !== 0 ? ((c.newAmount - prev) / Math.abs(prev)) * 100 : null,
            reason: c.reason,
          };
        }),
    )
    .sort((a, b) => Math.abs(b.deltaGbp) - Math.abs(a.deltaGbp));

  return {
    subscriptions,
    departments: deptList,
    departmentIndex: deptIndex,
    cards,
    fx,
    totals: {
      count: subscriptions.length,
      activeCount: live.filter((s) => s.status === 'ACTIVE').length,
      monthlyGbp,
      annualRunRateGbp: round2(monthlyGbp * 12),
      annualCashGbp: round2(monthlyGbp * 12 + oneOffGbp),
      contractedMonthlyGbp,
      estimatedMonthlyGbp,
      estimatedShare: monthlyGbp > 0 ? (estimatedMonthlyGbp / monthlyGbp) * 100 : 0,
      sharedCount: sharedSubs.length,
      sharedMonthlyGbp: round2(sharedSubs.reduce((a, s) => a + s.monthlyGbp, 0)),
    },
    byDepartment,
    byCategory,
    byBillingModel,
    renewals,
    trend: {
      months,
      coverage,
      coverageNote:
        coverage >= 0.999
          ? 'Every subscription has recorded price history, so this line is reconstructed from actual changes.'
          : `${Math.round(coverage * 100)}% of subscriptions have recorded price history. For the remainder the current price is assumed to have applied throughout, so historic months are flat rather than wrong — the line understates real change until more history is entered.`,
    },
    movers,
  };
}

/** Convenience: the same shape the reminder engine and the API need. */
export async function getUpcomingRenewals(withinDays = 45) {
  const p = await getPortfolio();
  return {
    renewals: p.renewals.filter((r) => r.days <= withinDays),
    cards: p.cards.filter((c) => c.riskLevel === 'ACTION' || c.riskLevel === 'URGENT' || c.riskLevel === 'WATCH'),
  };
}

export { MONTH_MS };

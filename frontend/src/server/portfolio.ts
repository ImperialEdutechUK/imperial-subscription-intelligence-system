import 'server-only';
import { api } from '@/lib/api';
import type { FxTable, NormalisedCost } from '@/lib/money';

/**
 * The read model, as this service sees it.
 *
 * The shapes below are the contract with the API service, which computes all of
 * it — allocation, currency normalisation, renewal windows, trend. Nothing here
 * touches a database; `getPortfolio` is a single HTTP call.
 *
 * These declarations are duplicated from `backend/src/services/portfolio.ts`
 * rather than shared through a workspace package. Two independently deployed
 * services on two different platforms cannot reach a common parent directory at
 * build time without fragile "include files outside the root" configuration, so
 * the duplication is deliberate. If you change a shape on one side, change it
 * on the other.
 */

import type { Observation } from './observations';

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

/**
 * What the API actually sends. `departmentIndex` is a Map, which JSON cannot
 * represent, so it crosses the wire as an entry list — see the note in
 * `backend/src/app/api/portfolio/route.ts`.
 */
type PortfolioWire = Omit<Portfolio, 'departmentIndex'> & {
  departmentIndexEntries: [string, DepartmentLite][];
};

function hydrate(wire: PortfolioWire): Portfolio {
  const { departmentIndexEntries, ...rest } = wire;
  return { ...rest, departmentIndex: new Map(departmentIndexEntries) };
}

export async function getPortfolio(): Promise<Portfolio> {
  return hydrate(await api<PortfolioWire>('/api/portfolio'));
}

/** The dashboard and analytics pages need the computed commentary alongside it. */
export async function getPortfolioWithObservations(): Promise<Portfolio & { observations: Observation[] }> {
  const wire = await api<PortfolioWire & { observations: Observation[] }>('/api/portfolio?observations=1');
  return { ...hydrate(wire), observations: wire.observations };
}

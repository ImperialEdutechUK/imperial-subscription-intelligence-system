'use server';

import { revalidatePath } from 'next/cache';
import { api, apiResult } from '@/lib/api';

/**
 * Every write the interface can perform.
 *
 * These keep the exact signatures the form components were already written
 * against, so nothing in `src/components` had to change when the database moved
 * behind an HTTP boundary. What changed is underneath: each one is now a call to
 * the API service rather than a Prisma query.
 *
 * Authorisation is not decided here. The API service re-checks the caller's role
 * on every one of these endpoints — a Server Action is reachable by direct POST,
 * so a check on this side would only be a hint.
 */

/** Server Actions do not revalidate automatically; the read model has changed after every write. */
function refresh() {
  revalidatePath('/', 'layout');
}

type Result<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

async function mutate<T extends object = object>(
  path: string,
  opts: { method?: 'POST' | 'DELETE'; body?: unknown } = {},
): Promise<Result<T>> {
  const res = await apiResult<Result<T>>(path, { method: opts.method ?? 'POST', body: opts.body });
  if ('ok' in res && res.ok) refresh();
  return res as Result<T>;
}

// ───────────────────────────────────────────────────────────── Subscriptions ──

/**
 * Mirrors the API service's `subscriptionSchema` input. It is intentionally
 * loose here — the authoritative validation is Zod on the other side, and
 * duplicating it would mean two places to keep correct.
 */
export interface SubscriptionInput {
  id?: string;
  name: string;
  vendor?: string | null;
  url?: string | null;
  category?: string;
  description?: string | null;
  status?: string;
  criticality?: string;
  accountEmail?: string | null;
  username?: string | null;
  password?: string | null;
  clearPassword?: boolean;
  credentialLocation?: string | null;
  mfaNotes?: string | null;
  cardId?: string | null;
  billingModel?: string;
  currency?: string;
  unitAmount?: number;
  seats?: number;
  perSeat?: boolean;
  usageUnitLabel?: string | null;
  usageRatePerUnit?: number | null;
  estimatedMonthlyUnits?: number | null;
  topUpAmount?: number | null;
  topUpThreshold?: number | null;
  creditBalance?: number | null;
  startDate?: string | null;
  renewalDate?: string | null;
  contractEndDate?: string | null;
  autoRenew?: boolean;
  noticePeriodDays?: number;
  cancellationUrl?: string | null;
  allocationMethod?: string;
  ownerDepartmentId?: string | null;
  ownerName?: string | null;
  ownerEmail?: string | null;
  allocations?: { departmentId: string; percentage?: number | null; seats?: number | null }[];
  notes?: string | null;
  tags?: string | null;
  changeReason?: string | null;
}

export async function saveSubscription(input: SubscriptionInput) {
  return mutate<{ id: string }>('/api/subscriptions', { body: input });
}

export async function deleteSubscription(id: string) {
  return mutate(`/api/subscriptions/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function archiveSubscription(id: string, archived: boolean) {
  return mutate(`/api/subscriptions/${encodeURIComponent(id)}/archive`, { body: { archived } });
}

export async function duplicateSubscription(id: string) {
  return mutate<{ id: string }>(`/api/subscriptions/${encodeURIComponent(id)}/duplicate`);
}

/** Admin-only, and logged on the API side every time it succeeds. */
export async function revealPassword(id: string) {
  return apiResult<{ ok: true; password: string } | { ok: false; error: string }>(
    `/api/subscriptions/${encodeURIComponent(id)}/reveal`,
    { method: 'POST' },
  );
}

export async function recordCostChange(input: {
  subscriptionId: string;
  effectiveDate: string;
  previousAmount: number | null;
  newAmount: number;
  reason?: string;
  applyToSubscription?: boolean;
}) {
  const { subscriptionId, ...rest } = input;
  return mutate(`/api/subscriptions/${encodeURIComponent(subscriptionId)}/cost-change`, { body: rest });
}

export async function deleteCostChange(id: string) {
  return mutate(`/api/cost-changes/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function recordUsage(input: {
  subscriptionId: string;
  periodStart: string;
  periodEnd: string;
  amount: number;
  units?: number | null;
  note?: string;
}) {
  const { subscriptionId, ...rest } = input;
  return mutate(`/api/subscriptions/${encodeURIComponent(subscriptionId)}/usage`, { body: rest });
}

export async function setCreditBalance(subscriptionId: string, balance: number) {
  return mutate(`/api/subscriptions/${encodeURIComponent(subscriptionId)}/credit-balance`, { body: { balance } });
}

// ─────────────────────────────────────────────────────────────── Bulk import ──

export interface ImportRow {
  name: string;
  vendor?: string;
  url?: string;
  category?: string;
  accountEmail?: string;
  username?: string;
  password?: string;
  cardLast4?: string;
  billingModel?: string;
  currency?: string;
  unitAmount?: number;
  seats?: number;
  perSeat?: boolean;
  renewalDate?: string;
  status?: string;
  ownerDepartmentCode?: string;
  allocationMethod?: string;
  notes?: string;
  tags?: string;
}

/**
 * Throws rather than returning a failure union: `ImportWorkbench` wraps the call
 * in try/catch and reads `created` / `updated` straight off the result, which is
 * the contract it was written against.
 */
export async function bulkImport(rows: ImportRow[]) {
  const res = await api<{
    ok: true;
    created: number;
    updated: number;
    errors: { row: number; message: string }[];
  }>('/api/import', { method: 'POST', body: { rows } });
  refresh();
  return res;
}

// ────────────────────────────────────────────────────────────── Departments ──

export async function saveDepartment(input: {
  id?: string;
  name: string;
  code: string;
  colorHex: string;
  costCentre?: string | null;
  headName?: string | null;
  headEmail?: string | null;
  headcount?: number | null;
  active?: boolean;
}) {
  return mutate('/api/departments', { body: input });
}

export async function deleteDepartment(id: string) {
  return mutate(`/api/departments/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// ─────────────────────────────────────────────────────────────────── Cards ──

export async function saveCard(input: {
  id?: string;
  label: string;
  last4: string;
  provider?: string | null;
  type?: string;
  holderName?: string | null;
  currency?: string;
  currentBalance?: number | null;
  lowBalanceThreshold?: number;
  expiryMonth?: number | null;
  expiryYear?: number | null;
  notes?: string | null;
  active?: boolean;
}) {
  return mutate('/api/cards', { body: input });
}

export async function deleteCard(id: string) {
  return mutate(`/api/cards/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function recordTopUp(cardId: string, amount: number, note?: string) {
  return mutate(`/api/cards/${encodeURIComponent(cardId)}/topup`, { body: { amount, note } });
}

export async function setCardBalance(cardId: string, balance: number) {
  return mutate(`/api/cards/${encodeURIComponent(cardId)}/balance`, { body: { balance } });
}

// ──────────────────────────────────────────────────────────────── Settings ──

export async function updateSettings(entries: Record<string, string>) {
  return mutate('/api/settings', { body: { entries } });
}

export async function upsertFxRate(code: string, rateToGbp: number, source?: string) {
  return mutate('/api/fx', { body: { code, rateToGbp, source } });
}

export async function deleteFxRate(code: string) {
  return mutate(`/api/fx/${encodeURIComponent(code)}`, { method: 'DELETE' });
}

/** Used by the "send a test reminder" control in Settings. */
export async function sendTestDigest() {
  return apiResult<{ sent: boolean; reason?: string; error?: string; summary?: string }>(
    '/api/alerts/dispatch?force=1',
    { method: 'POST' },
  );
}

/**
 * Departmental cost allocation.
 *
 * A subscription can be paid for by one department, split by an agreed
 * percentage, or split in proportion to seats. All three are supported per
 * subscription, because in practice an organisation uses all three at once.
 *
 * The allocator is deliberately defensive: bad data (percentages that don't sum
 * to 100, seat counts of zero) produces a *flagged* result rather than a wrong
 * number silently entering Finance's report.
 */

import type { AllocationMethod } from './domain';
import { round2 } from './money';

export const UNASSIGNED = '__unassigned__';
export const UNASSIGNED_LABEL = 'Unassigned';

export interface AllocationRow {
  departmentId: string;
  percentage?: number | null;
  seats?: number | null;
}

export interface AllocationResult {
  departmentId: string;
  share: number; // 0..1
  amount: number; // share × amount passed in
}

export interface AllocationOutcome {
  rows: AllocationResult[];
  warning?: string;
  /** True when the split had to be inferred rather than taken as entered. */
  adjusted: boolean;
}

export function allocate(
  amount: number,
  method: string,
  rows: AllocationRow[],
  ownerDepartmentId: string | null | undefined,
): AllocationOutcome {
  const owner = ownerDepartmentId || UNASSIGNED;
  const m = method as AllocationMethod;
  const valueOf = (n: number) => round2(amount * n);

  const soleOwner = (warning?: string, adjusted = false): AllocationOutcome => ({
    rows: [{ departmentId: owner, share: 1, amount: round2(amount) }],
    warning,
    adjusted,
  });

  if (m === 'PERCENTAGE') {
    const usable = rows.filter((r) => typeof r.percentage === 'number' && (r.percentage as number) > 0);
    if (usable.length === 0) {
      return soleOwner('No percentage split entered — the full cost is assigned to the owning department.', true);
    }
    const total = usable.reduce((a, r) => a + (r.percentage as number), 0);
    const adjusted = Math.abs(total - 100) > 0.01;
    const out = usable.map((r) => {
      const share = (r.percentage as number) / total; // normalise so shares always sum to exactly 1
      return { departmentId: r.departmentId, share, amount: valueOf(share) };
    });
    return {
      rows: reconcile(out, amount),
      adjusted,
      warning: adjusted
        ? `Percentages entered sum to ${round2(total)}%, not 100%. Costs have been scaled proportionally so the total still reconciles.`
        : undefined,
    };
  }

  if (m === 'SEATS') {
    const usable = rows.filter((r) => typeof r.seats === 'number' && (r.seats as number) > 0);
    const totalSeats = usable.reduce((a, r) => a + (r.seats as number), 0);
    if (totalSeats <= 0) {
      return soleOwner('No seat counts entered — the full cost is assigned to the owning department.', true);
    }
    const out = usable.map((r) => {
      const share = (r.seats as number) / totalSeats;
      return { departmentId: r.departmentId, share, amount: valueOf(share) };
    });
    return { rows: reconcile(out, amount), adjusted: false };
  }

  // OWNER_PAYS
  return soleOwner(ownerDepartmentId ? undefined : 'No owning department set — cost shown as unassigned.', !ownerDepartmentId);
}

/**
 * Penny-reconciliation: rounding each share independently can leave the parts
 * off the whole by a penny or two. Push any residual onto the largest share so
 * departmental totals always add back to the subscription total exactly.
 */
function reconcile(rows: AllocationResult[], amount: number): AllocationResult[] {
  if (rows.length === 0) return rows;
  const sum = rows.reduce((a, r) => a + r.amount, 0);
  const residual = round2(round2(amount) - round2(sum));
  if (Math.abs(residual) < 0.005) return rows;
  const largest = rows.reduce((a, b) => (b.amount > a.amount ? b : a), rows[0]);
  largest.amount = round2(largest.amount + residual);
  return rows;
}

/** Departments listed against a subscription, whether or not they carry cost. */
export function usingDepartmentIds(
  method: string,
  rows: AllocationRow[],
  ownerDepartmentId: string | null | undefined,
): string[] {
  const set = new Set<string>();
  if (ownerDepartmentId) set.add(ownerDepartmentId);
  rows.forEach((r) => set.add(r.departmentId));
  return [...set];
}

export function isShared(method: string, rows: AllocationRow[], ownerDepartmentId: string | null | undefined): boolean {
  return usingDepartmentIds(method, rows, ownerDepartmentId).length > 1;
}

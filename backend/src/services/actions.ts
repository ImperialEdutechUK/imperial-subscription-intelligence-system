import { z } from 'zod';
import { prisma } from '@/lib/db';
import { encryptSecret, decryptSecret } from '@/lib/crypto';
import type { SessionUser } from '@/lib/auth';
import { setSetting } from '@/services/settings';
import { ALLOCATION_METHODS, BILLING_MODELS, CARD_TYPES, CATEGORIES, CRITICALITIES, SUB_STATUSES } from '@/lib/domain';


async function audit(actor: string | null, action: string, entity: string, entityId?: string, summary?: string) {
  try {
    await prisma.auditLog.create({ data: { actor, action, entity, entityId, summary } });
  } catch {
    // Auditing must never block the operation it is recording.
  }
}

// ───────────────────────────────────────────────────────────── Subscriptions ──

const allocationSchema = z.object({
  departmentId: z.string().min(1),
  percentage: z.number().nullable().optional(),
  seats: z.number().int().nullable().optional(),
});

const subscriptionSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'A name is required.').max(120),
  vendor: z.string().max(120).nullable().optional(),
  url: z.string().max(400).nullable().optional(),
  category: z.enum(CATEGORIES).default('OTHER'),
  description: z.string().max(2000).nullable().optional(),
  status: z.enum(SUB_STATUSES).default('ACTIVE'),
  criticality: z.enum(CRITICALITIES).default('MEDIUM'),

  accountEmail: z.string().max(200).nullable().optional(),
  username: z.string().max(200).nullable().optional(),
  password: z.string().max(400).nullable().optional(),
  clearPassword: z.boolean().optional(),
  credentialLocation: z.string().max(300).nullable().optional(),
  mfaNotes: z.string().max(500).nullable().optional(),

  cardId: z.string().nullable().optional(),

  billingModel: z.enum(BILLING_MODELS).default('MONTHLY'),
  currency: z.string().length(3).default('GBP'),
  unitAmount: z.number().min(0).default(0),
  seats: z.number().int().min(1).default(1),
  perSeat: z.boolean().default(false),

  usageUnitLabel: z.string().max(60).nullable().optional(),
  usageRatePerUnit: z.number().min(0).nullable().optional(),
  estimatedMonthlyUnits: z.number().min(0).nullable().optional(),
  topUpAmount: z.number().min(0).nullable().optional(),
  topUpThreshold: z.number().min(0).nullable().optional(),
  creditBalance: z.number().nullable().optional(),

  startDate: z.string().nullable().optional(),
  renewalDate: z.string().nullable().optional(),
  contractEndDate: z.string().nullable().optional(),
  autoRenew: z.boolean().default(true),
  noticePeriodDays: z.number().int().min(0).default(0),
  cancellationUrl: z.string().max(400).nullable().optional(),

  allocationMethod: z.enum(ALLOCATION_METHODS).default('OWNER_PAYS'),
  ownerDepartmentId: z.string().nullable().optional(),
  ownerName: z.string().max(120).nullable().optional(),
  ownerEmail: z.string().max(200).nullable().optional(),
  allocations: z.array(allocationSchema).default([]),

  notes: z.string().max(4000).nullable().optional(),
  tags: z.string().max(400).nullable().optional(),
  /** Optional reason recorded against an automatic price-change entry. */
  changeReason: z.string().max(300).nullable().optional(),
});

export type SubscriptionInput = z.input<typeof subscriptionSchema>;

const toDate = (v?: string | null) => (v ? new Date(v) : null);
const clean = (v?: string | null) => {
  const t = v?.trim();
  return t ? t : null;
};

export async function saveSubscription(user: SessionUser, input: SubscriptionInput) {
  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'That entry could not be saved.' };
  }
  const d = parsed.data;

  const base = {
    name: d.name.trim(),
    vendor: clean(d.vendor),
    url: clean(d.url),
    category: d.category,
    description: clean(d.description),
    status: d.status,
    criticality: d.criticality,
    accountEmail: clean(d.accountEmail),
    username: clean(d.username),
    credentialLocation: clean(d.credentialLocation),
    mfaNotes: clean(d.mfaNotes),
    cardId: clean(d.cardId),
    billingModel: d.billingModel,
    currency: d.currency.toUpperCase(),
    unitAmount: d.unitAmount,
    seats: d.seats,
    perSeat: d.perSeat,
    usageUnitLabel: clean(d.usageUnitLabel),
    usageRatePerUnit: d.usageRatePerUnit ?? null,
    estimatedMonthlyUnits: d.estimatedMonthlyUnits ?? null,
    topUpAmount: d.topUpAmount ?? null,
    topUpThreshold: d.topUpThreshold ?? null,
    creditBalance: d.creditBalance ?? null,
    startDate: toDate(d.startDate),
    renewalDate: toDate(d.renewalDate),
    contractEndDate: toDate(d.contractEndDate),
    autoRenew: d.autoRenew,
    noticePeriodDays: d.noticePeriodDays,
    cancellationUrl: clean(d.cancellationUrl),
    allocationMethod: d.allocationMethod,
    ownerDepartmentId: clean(d.ownerDepartmentId),
    ownerName: clean(d.ownerName),
    ownerEmail: clean(d.ownerEmail),
    notes: clean(d.notes),
    tags: clean(d.tags),
  };

  try {
    if (d.id) {
      const existing = await prisma.subscription.findUnique({ where: { id: d.id } });
      if (!existing) return { ok: false as const, error: 'That subscription no longer exists.' };

      // A price change is recorded automatically, so the trend and the audit
      // trail stay correct without anyone having to remember to log it.
      const priceMoved = existing.unitAmount !== d.unitAmount || existing.billingModel !== d.billingModel;
      if (priceMoved) {
        await prisma.costChange.create({
          data: {
            subscriptionId: d.id,
            effectiveDate: new Date(),
            previousAmount: existing.unitAmount,
            newAmount: d.unitAmount,
            previousModel: existing.billingModel,
            newModel: d.billingModel,
            currency: base.currency,
            reason: clean(d.changeReason) ?? 'Updated in the register',
            recordedBy: user.name,
          },
        });
      }

      const data: Record<string, unknown> = { ...base };
      if (d.clearPassword) {
        data.passwordCipher = null;
        data.passwordUpdatedAt = null;
      } else if (d.password && d.password.length > 0) {
        data.passwordCipher = encryptSecret(d.password);
        data.passwordUpdatedAt = new Date();
      }

      await prisma.subscription.update({ where: { id: d.id }, data });
      await prisma.allocation.deleteMany({ where: { subscriptionId: d.id } });
      if (d.allocations.length) {
        await prisma.allocation.createMany({
          data: d.allocations.map((a) => ({
            subscriptionId: d.id!,
            departmentId: a.departmentId,
            percentage: a.percentage ?? null,
            seats: a.seats ?? null,
          })),
        });
      }
      await audit(user.name, 'UPDATE', 'Subscription', d.id, `${d.name}${priceMoved ? ' (price changed)' : ''}`);
      return { ok: true as const, id: d.id };
    }

    const created = await prisma.subscription.create({
      data: {
        ...base,
        passwordCipher: d.password ? encryptSecret(d.password) : null,
        passwordUpdatedAt: d.password ? new Date() : null,
        allocations: d.allocations.length
          ? {
              create: d.allocations.map((a) => ({
                departmentId: a.departmentId,
                percentage: a.percentage ?? null,
                seats: a.seats ?? null,
              })),
            }
          : undefined,
      },
    });
    await audit(user.name, 'CREATE', 'Subscription', created.id, d.name);
    return { ok: true as const, id: created.id };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : 'Could not save that subscription.' };
  }
}

export async function deleteSubscription(user: SessionUser, id: string) {
  const sub = await prisma.subscription.findUnique({ where: { id } });
  await prisma.subscription.delete({ where: { id } });
  await audit(user.name, 'DELETE', 'Subscription', id, sub?.name);
  return { ok: true as const };
}

export async function archiveSubscription(user: SessionUser, id: string, archived: boolean) {
  await prisma.subscription.update({ where: { id }, data: { archived } });
  await audit(user.name, archived ? 'ARCHIVE' : 'RESTORE', 'Subscription', id);
  return { ok: true as const };
}

export async function duplicateSubscription(user: SessionUser, id: string) {
  const src = await prisma.subscription.findUnique({ where: { id }, include: { allocations: true } });
  if (!src) return { ok: false as const, error: 'That subscription no longer exists.' };
  const { id: _id, createdAt: _created, updatedAt: _updated, allocations, ...rest } = src;
  void _id;
  void _created;
  void _updated;
  const created = await prisma.subscription.create({
    data: {
      ...rest,
      name: `${src.name} (copy)`,
      passwordCipher: null,
      passwordUpdatedAt: null,
      allocations: {
        create: allocations.map((a) => ({ departmentId: a.departmentId, percentage: a.percentage, seats: a.seats })),
      },
    },
  });
  return { ok: true as const, id: created.id };
}

/** Admin-only. Returns the plaintext for a single subscription, and logs that it happened. */
export async function revealPassword(user: SessionUser, id: string) {
  const sub = await prisma.subscription.findUnique({ where: { id }, select: { name: true, passwordCipher: true } });
  if (!sub?.passwordCipher) return { ok: false as const, error: 'No password is stored for this subscription.' };
  const plain = decryptSecret(sub.passwordCipher);
  if (plain == null) {
    return {
      ok: false as const,
      error: 'The stored password could not be decrypted. This normally means APP_SECRET has changed since it was saved.',
    };
  }
  await audit(user.name, 'REVEAL_SECRET', 'Subscription', id, sub.name);
  return { ok: true as const, password: plain };
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

export async function bulkImport(user: SessionUser, rows: ImportRow[]) {
  const [departments, cards] = await Promise.all([prisma.department.findMany(), prisma.card.findMany()]);
  const deptByCode = new Map(departments.map((d) => [d.code.toUpperCase(), d.id]));
  const deptByName = new Map(departments.map((d) => [d.name.toLowerCase(), d.id]));
  const cardByLast4 = new Map(cards.map((c) => [c.last4, c.id]));

  let created = 0;
  let updated = 0;
  const errors: { row: number; message: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      if (!r.name?.trim()) {
        errors.push({ row: i + 1, message: 'Missing a name — row skipped.' });
        continue;
      }
      const ownerDepartmentId =
        (r.ownerDepartmentCode && (deptByCode.get(r.ownerDepartmentCode.toUpperCase()) ?? deptByName.get(r.ownerDepartmentCode.toLowerCase()))) ||
        null;

      const data = {
        name: r.name.trim(),
        vendor: clean(r.vendor),
        url: clean(r.url),
        category: (CATEGORIES as readonly string[]).includes(r.category ?? '') ? r.category! : 'OTHER',
        accountEmail: clean(r.accountEmail),
        username: clean(r.username),
        cardId: r.cardLast4 ? (cardByLast4.get(r.cardLast4.trim()) ?? null) : null,
        billingModel: (BILLING_MODELS as readonly string[]).includes(r.billingModel ?? '') ? r.billingModel! : 'MONTHLY',
        currency: (r.currency || 'GBP').toUpperCase().slice(0, 3),
        unitAmount: Number.isFinite(r.unitAmount) ? Number(r.unitAmount) : 0,
        seats: r.seats && r.seats > 0 ? Math.round(r.seats) : 1,
        perSeat: !!r.perSeat,
        renewalDate: r.renewalDate ? new Date(r.renewalDate) : null,
        status: (SUB_STATUSES as readonly string[]).includes(r.status ?? '') ? r.status! : 'ACTIVE',
        allocationMethod: (ALLOCATION_METHODS as readonly string[]).includes(r.allocationMethod ?? '')
          ? r.allocationMethod!
          : 'OWNER_PAYS',
        ownerDepartmentId,
        notes: clean(r.notes),
        tags: clean(r.tags),
        ...(r.password ? { passwordCipher: encryptSecret(r.password), passwordUpdatedAt: new Date() } : {}),
      };

      if (data.renewalDate && Number.isNaN(data.renewalDate.getTime())) data.renewalDate = null;

      // Match on name to make re-importing an updated sheet safe rather than duplicating.
      const existing = await prisma.subscription.findFirst({ where: { name: data.name } });
      if (existing) {
        await prisma.subscription.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await prisma.subscription.create({ data });
        created++;
      }
    } catch (e) {
      errors.push({ row: i + 1, message: e instanceof Error ? e.message : 'Could not import this row.' });
    }
  }

  await audit(user.name, 'IMPORT', 'Subscription', undefined, `${created} created, ${updated} updated, ${errors.length} failed`);
  return { ok: true as const, created, updated, errors };
}

// ────────────────────────────────────────────────────────────── Departments ──

const departmentSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(80),
  code: z.string().min(1).max(16),
  colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a six-digit hex colour, e.g. #2F6FED.'),
  costCentre: z.string().max(40).nullable().optional(),
  headName: z.string().max(80).nullable().optional(),
  headEmail: z.string().max(160).nullable().optional(),
  headcount: z.number().int().min(0).nullable().optional(),
  active: z.boolean().default(true),
});

export async function saveDepartment(user: SessionUser, input: z.input<typeof departmentSchema>) {
  const parsed = departmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Invalid department.' };
  const d = parsed.data;
  const data = {
    name: d.name.trim(),
    code: d.code.trim().toUpperCase(),
    colorHex: d.colorHex.toUpperCase(),
    costCentre: clean(d.costCentre),
    headName: clean(d.headName),
    headEmail: clean(d.headEmail),
    headcount: d.headcount ?? null,
    active: d.active,
  };
  try {
    if (d.id) await prisma.department.update({ where: { id: d.id }, data });
    else await prisma.department.create({ data });
    await audit(user.name, d.id ? 'UPDATE' : 'CREATE', 'Department', d.id, data.name);
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: 'A department with that name or code already exists.' };
  }
}

export async function deleteDepartment(user: SessionUser, id: string) {
  const inUse = await prisma.subscription.count({ where: { ownerDepartmentId: id } });
  const allocated = await prisma.allocation.count({ where: { departmentId: id } });
  if (inUse + allocated > 0) {
    return {
      ok: false as const,
      error: `That department is still attached to ${inUse + allocated} subscription record${inUse + allocated === 1 ? '' : 's'}. Reassign those first.`,
    };
  }
  await prisma.department.delete({ where: { id } });
  return { ok: true as const };
}

// ─────────────────────────────────────────────────────────────────── Cards ──

const cardSchema = z.object({
  id: z.string().optional(),
  label: z.string().min(1).max(80),
  last4: z.string().regex(/^\d{4}$/, 'Enter exactly four digits.'),
  provider: z.string().max(40).nullable().optional(),
  type: z.enum(CARD_TYPES).default('CORPORATE_CREDIT'),
  holderName: z.string().max(80).nullable().optional(),
  currency: z.string().length(3).default('GBP'),
  currentBalance: z.number().nullable().optional(),
  lowBalanceThreshold: z.number().min(0).default(0),
  expiryMonth: z.number().int().min(1).max(12).nullable().optional(),
  expiryYear: z.number().int().min(2000).max(2100).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  active: z.boolean().default(true),
});

export async function saveCard(user: SessionUser, input: z.input<typeof cardSchema>) {
  const parsed = cardSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Invalid card.' };
  const d = parsed.data;
  const data = {
    label: d.label.trim(),
    last4: d.last4,
    provider: clean(d.provider),
    type: d.type,
    holderName: clean(d.holderName),
    currency: d.currency.toUpperCase(),
    currentBalance: d.currentBalance ?? null,
    balanceUpdatedAt: d.currentBalance != null ? new Date() : null,
    lowBalanceThreshold: d.lowBalanceThreshold,
    expiryMonth: d.expiryMonth ?? null,
    expiryYear: d.expiryYear ?? null,
    notes: clean(d.notes),
    active: d.active,
  };
  if (d.id) await prisma.card.update({ where: { id: d.id }, data });
  else await prisma.card.create({ data });
  await audit(user.name, d.id ? 'UPDATE' : 'CREATE', 'Card', d.id, data.label);
  return { ok: true as const };
}

export async function recordTopUp(user: SessionUser, cardId: string, amount: number, note?: string) {
  if (!(amount > 0)) return { ok: false as const, error: 'Enter a top-up amount greater than zero.' };
  const card = await prisma.card.findUnique({ where: { id: cardId } });
  if (!card) return { ok: false as const, error: 'That card no longer exists.' };

  await prisma.$transaction([
    prisma.cardTopUp.create({
      data: { cardId, amount, currency: card.currency, occurredAt: new Date(), requestedBy: user.name, note: note ?? null },
    }),
    prisma.card.update({
      where: { id: cardId },
      data: { currentBalance: (card.currentBalance ?? 0) + amount, balanceUpdatedAt: new Date() },
    }),
  ]);
  await audit(user.name, 'TOPUP', 'Card', cardId, `${card.label} +${amount}`);
  return { ok: true as const };
}

export async function setCardBalance(user: SessionUser, cardId: string, balance: number) {
  await prisma.card.update({ where: { id: cardId }, data: { currentBalance: balance, balanceUpdatedAt: new Date() } });
  await audit(user.name, 'BALANCE', 'Card', cardId, String(balance));
  return { ok: true as const };
}

export async function deleteCard(user: SessionUser, id: string) {
  const attached = await prisma.subscription.count({ where: { cardId: id } });
  if (attached > 0) {
    return { ok: false as const, error: `That card is attached to ${attached} subscription${attached === 1 ? '' : 's'}. Reassign them first.` };
  }
  await prisma.card.delete({ where: { id } });
  return { ok: true as const };
}

// ───────────────────────────────────────────────────── Cost history & usage ──

export async function recordCostChange(user: SessionUser, input: {
  subscriptionId: string;
  effectiveDate: string;
  previousAmount: number | null;
  newAmount: number;
  reason?: string;
  applyToSubscription?: boolean;
}) {
  const sub = await prisma.subscription.findUnique({ where: { id: input.subscriptionId } });
  if (!sub) return { ok: false as const, error: 'That subscription no longer exists.' };

  await prisma.costChange.create({
    data: {
      subscriptionId: input.subscriptionId,
      effectiveDate: new Date(input.effectiveDate),
      previousAmount: input.previousAmount,
      newAmount: input.newAmount,
      currency: sub.currency,
      reason: input.reason ?? null,
      recordedBy: user.name,
    },
  });
  if (input.applyToSubscription) {
    await prisma.subscription.update({ where: { id: input.subscriptionId }, data: { unitAmount: input.newAmount } });
  }
  return { ok: true as const };
}

export async function deleteCostChange(user: SessionUser, id: string) {
  await prisma.costChange.delete({ where: { id } });
  return { ok: true as const };
}

export async function recordUsage(user: SessionUser, input: {
  subscriptionId: string;
  periodStart: string;
  periodEnd: string;
  amount: number;
  units?: number | null;
  note?: string;
}) {
  const sub = await prisma.subscription.findUnique({ where: { id: input.subscriptionId } });
  if (!sub) return { ok: false as const, error: 'That subscription no longer exists.' };
  await prisma.usageRecord.create({
    data: {
      subscriptionId: input.subscriptionId,
      periodStart: new Date(input.periodStart),
      periodEnd: new Date(input.periodEnd),
      amount: input.amount,
      units: input.units ?? null,
      currency: sub.currency,
      note: input.note ?? null,
    },
  });
  return { ok: true as const };
}

export async function setCreditBalance(user: SessionUser, subscriptionId: string, balance: number) {
  await prisma.subscription.update({
    where: { id: subscriptionId },
    data: { creditBalance: balance, creditBalanceUpdatedAt: new Date() },
  });
  return { ok: true as const };
}

// ──────────────────────────────────────────────────────────────── Settings ──

export async function updateSettings(user: SessionUser, entries: Record<string, string>) {
  for (const [key, value] of Object.entries(entries)) {
    await setSetting(key, value);
  }
  return { ok: true as const };
}

export async function upsertFxRate(user: SessionUser, code: string, rateToGbp: number, source?: string) {
  const c = code.toUpperCase().slice(0, 3);
  if (!(rateToGbp > 0)) return { ok: false as const, error: 'Enter a rate greater than zero.' };
  await prisma.fxRate.upsert({
    where: { code: c },
    create: { code: c, rateToGbp, source: source ?? 'Entered manually' },
    update: { rateToGbp, source: source ?? 'Entered manually' },
  });
  return { ok: true as const };
}

export async function deleteFxRate(user: SessionUser, code: string) {
  await prisma.fxRate.delete({ where: { code: code.toUpperCase() } });
  return { ok: true as const };
}

'use client';

import { useMemo, useState, useTransition } from 'react';
import { AlertTriangle, ChevronDown, Eye, EyeOff, Info, Link2 } from 'lucide-react';
import { Button, Field, Input, Select, Textarea, Toggle, InfoTip, Segmented } from '@/components/ui/controls';
import { Badge, Chip } from '@/components/ui/kit';
import {
  ALLOCATION_METHODS,
  ALLOCATION_METHOD_META,
  BILLING_MODELS,
  BILLING_MODEL_META,
  CATEGORIES,
  CATEGORY_META,
  CRITICALITIES,
  CURRENCIES,
  CURRENCY_SYMBOL,
  SUB_STATUSES,
  STATUS_META,
} from '@/lib/domain';
import { formatMoney, normaliseCost, type FxTable } from '@/lib/money';
import { allocate } from '@/lib/allocation';
import { saveSubscription, type SubscriptionInput } from '@/server/actions';
import { cn, hostnameOf } from '@/lib/utils';

export interface FormDepartment {
  id: string;
  name: string;
  code: string;
  color: string;
}
export interface FormCard {
  id: string;
  label: string;
  last4: string;
  type: string;
}

export interface SubscriptionFormValues extends Omit<SubscriptionInput, 'allocations'> {
  allocations: { departmentId: string; percentage: number | null; seats: number | null }[];
}

/** How the amount field is described, phrased for each billing shape. */
const AMOUNT_LABEL = {
  WEEKLY: 'Amount per week',
  MONTHLY: 'Amount per month',
  QUARTERLY: 'Amount per quarter',
  BIANNUAL: 'Amount every 6 months',
  ANNUAL: 'Amount per year',
  ONE_OFF: 'One-off amount',
  PAY_PER_USE: 'Estimated monthly spend',
  TOPUP_CREDIT: 'Typical monthly credit spend',
  FREE: 'Amount',
} as const;

const EMPTY: SubscriptionFormValues = {
  name: '',
  vendor: '',
  url: '',
  category: 'AI_TOOLS',
  status: 'ACTIVE',
  criticality: 'MEDIUM',
  billingModel: 'MONTHLY',
  currency: 'GBP',
  unitAmount: 0,
  seats: 1,
  perSeat: false,
  autoRenew: true,
  noticePeriodDays: 0,
  allocationMethod: 'OWNER_PAYS',
  allocations: [],
};

function Section({
  title,
  description,
  children,
  defaultOpen = true,
  badge,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-[var(--radius-md)] border" style={{ borderColor: 'var(--border-subtle)' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full cursor-pointer items-center gap-2 px-3 py-2.5 text-left"
        aria-expanded={open}
      >
        <ChevronDown
          size={14}
          className="shrink-0 transition-transform duration-200"
          style={{ color: 'var(--text-tertiary)', transform: open ? 'none' : 'rotate(-90deg)' }}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
            {title}
          </span>
          {description ? (
            <span className="block text-[0.6875rem]" style={{ color: 'var(--text-tertiary)' }}>
              {description}
            </span>
          ) : null}
        </span>
        {badge}
      </button>
      {open ? <div className="space-y-3 px-3 pt-1 pb-3">{children}</div> : null}
    </section>
  );
}

export function SubscriptionForm({
  initial,
  departments,
  cards,
  fxRates,
  defaultDepartmentId,
  onSaved,
  onCancel,
}: {
  initial?: Partial<SubscriptionFormValues>;
  departments: FormDepartment[];
  cards: FormCard[];
  /**
   * The exchange rates the server uses. Without these the preview would show an
   * unconverted figure while every report showed the converted one — the form
   * would be quietly lying about what it is about to save.
   */
  fxRates: FxTable;
  defaultDepartmentId?: string | null;
  onSaved: (id: string) => void;
  onCancel?: () => void;
}) {
  const [v, setV] = useState<SubscriptionFormValues>({
    ...EMPTY,
    ownerDepartmentId: defaultDepartmentId ?? departments[0]?.id ?? null,
    ...initial,
    allocations: initial?.allocations ?? [],
  });
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof SubscriptionFormValues>(key: K, value: SubscriptionFormValues[K]) =>
    setV((prev) => ({ ...prev, [key]: value }));

  const sym = CURRENCY_SYMBOL[v.currency ?? 'GBP'] ?? '';
  const usesUsage = v.billingModel === 'PAY_PER_USE';
  const usesCredit = v.billingModel === 'TOPUP_CREDIT';
  const isFree = v.billingModel === 'FREE';

  // Live cost preview. Recomputed from exactly the same function the dashboards
  // use, so what the form promises is what the reports will show.
  const preview = useMemo(
    () =>
      normaliseCost({
        billingModel: v.billingModel ?? 'MONTHLY',
        currency: v.currency ?? 'GBP',
        unitAmount: Number(v.unitAmount) || 0,
        seats: Number(v.seats) || 1,
        perSeat: !!v.perSeat,
        status: v.status,
        usageRatePerUnit: v.usageRatePerUnit ?? null,
        estimatedMonthlyUnits: v.estimatedMonthlyUnits ?? null,
        topUpAmount: v.topUpAmount ?? null,
      }, fxRates),
    [v.billingModel, v.currency, v.unitAmount, v.seats, v.perSeat, v.status, v.usageRatePerUnit, v.estimatedMonthlyUnits, v.topUpAmount, fxRates],
  );

  const allocationOutcome = useMemo(
    () => allocate(preview.monthlyGbp, v.allocationMethod ?? 'OWNER_PAYS', v.allocations, v.ownerDepartmentId ?? null),
    [preview.monthlyGbp, v.allocationMethod, v.allocations, v.ownerDepartmentId],
  );

  const deptName = (id: string) => departments.find((d) => d.id === id)?.name ?? 'Unassigned';

  /**
   * Pasting a URL fills in the name if it is still blank, so the common case is
   * a single paste. Done in the change handler rather than an effect: it is a
   * response to an event, not a synchronisation with external state.
   */
  const handleUrlChange = (url: string) => {
    setV((prev) => {
      if (prev.name) return { ...prev, url };
      const host = hostnameOf(url);
      if (!host) return { ...prev, url };
      const guess = host.split('.')[0];
      return { ...prev, url, name: guess.charAt(0).toUpperCase() + guess.slice(1) };
    });
  };

  const toggleDepartment = (id: string) => {
    setV((prev) => {
      const exists = prev.allocations.some((a) => a.departmentId === id);
      if (exists) return { ...prev, allocations: prev.allocations.filter((a) => a.departmentId !== id) };
      const isPct = prev.allocationMethod === 'PERCENTAGE';
      const nextCount = prev.allocations.length + 1;
      const even = Math.round((100 / nextCount) * 10) / 10;
      const rebalanced = isPct
        ? [...prev.allocations.map((a) => ({ ...a, percentage: even })), { departmentId: id, percentage: even, seats: null }]
        : [...prev.allocations, { departmentId: id, percentage: null, seats: 1 }];
      return { ...prev, allocations: rebalanced };
    });
  };

  const updateAllocation = (id: string, patch: { percentage?: number | null; seats?: number | null }) =>
    setV((prev) => ({
      ...prev,
      allocations: prev.allocations.map((a) => (a.departmentId === id ? { ...a, ...patch } : a)),
    }));

  const distributeEvenly = () =>
    setV((prev) => {
      if (!prev.allocations.length) return prev;
      const each = Math.floor((100 / prev.allocations.length) * 10) / 10;
      const alloc = prev.allocations.map((a) => ({ ...a, percentage: each }));
      // Give the rounding remainder to the first row so the total is exactly 100.
      const drift = Math.round((100 - each * alloc.length) * 10) / 10;
      if (alloc[0] && drift !== 0) alloc[0] = { ...alloc[0], percentage: Math.round((each + drift) * 10) / 10 };
      return { ...prev, allocations: alloc };
    });

  const submit = () => {
    setError(null);
    if (!v.name?.trim()) {
      setError('Give the subscription a name — everything else can wait.');
      return;
    }
    startTransition(async () => {
      const res = await saveSubscription({ ...v, allocations: v.allocations });
      if (res.ok) onSaved(res.id);
      else setError(res.error);
    });
  };

  const pctTotal = v.allocations.reduce((a, x) => a + (x.percentage ?? 0), 0);

  return (
    <div className="space-y-3">
      {/* ── The four fields that matter, above everything else ─────────── */}
      <section
        className="space-y-3 rounded-[var(--radius-md)] border p-3"
        style={{ borderColor: 'var(--border-brand)', background: 'var(--brand-50)' }}
      >
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Field label="Software name" required htmlFor="sub-name">
            <Input
              id="sub-name"
              value={v.name ?? ''}
              onChange={(e) => set('name', e.target.value)}
              placeholder="e.g. Adobe Creative Cloud"
              autoFocus
            />
          </Field>
          <Field label="Status">
            <Select value={v.status} onChange={(e) => set('status', e.target.value as typeof v.status)}>
              {SUB_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_META[s].label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Website" hint="Paste the login URL — the name fills itself in if it is blank">
            <div className="relative">
              <Link2 size={13} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} aria-hidden />
              <Input value={v.url ?? ''} onChange={(e) => handleUrlChange(e.target.value)} placeholder="adobe.com" className="pl-7" />
            </div>
          </Field>
          <Field label="Category">
            <Select value={v.category} onChange={(e) => set('category', e.target.value as typeof v.category)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_META[c].label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {/* ── Cost, with a live normalisation preview ─────────────────── */}
        <div className="grid gap-3" style={{ gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,1fr) 84px' }}>
          <Field label="How is it billed?">
            <Select value={v.billingModel} onChange={(e) => set('billingModel', e.target.value as typeof v.billingModel)}>
              {BILLING_MODELS.map((b) => (
                <option key={b} value={b}>
                  {BILLING_MODEL_META[b].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={
              usesCredit
                ? 'Typical monthly credit spend'
                : usesUsage
                  ? 'Estimated monthly spend'
                  : AMOUNT_LABEL[v.billingModel as keyof typeof AMOUNT_LABEL] ?? 'Amount'
            }
          >
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm" style={{ color: 'var(--text-tertiary)' }}>
                {sym}
              </span>
              <Input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                disabled={isFree}
                value={v.unitAmount ?? 0}
                onChange={(e) => set('unitAmount', Number(e.target.value))}
                className="pl-6"
              />
            </div>
          </Field>
          <Field label="Currency">
            <Select value={v.currency} onChange={(e) => set('currency', e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {!isFree ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-sm)] px-2.5 py-2" style={{ background: 'var(--surface-raised)' }}>
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                Works out at
              </span>
              <span className="tabular text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {formatMoney(preview.monthlyGbp)}/month
              </span>
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                ·
              </span>
              <span className="tabular text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {formatMoney(preview.annualRunRateGbp)}/year
              </span>
              <InfoTip>
                <strong style={{ color: 'var(--text-primary)' }}>How this is worked out</strong>
                <p className="mt-1">{preview.basis}</p>
                {preview.caveat ? (
                  <p className="mt-1.5" style={{ color: 'var(--warning)' }}>
                    {preview.caveat}
                  </p>
                ) : null}
                {v.currency !== 'GBP' ? (
                  <p className="mt-1.5" style={{ color: 'var(--text-tertiary)' }}>
                    Converted at {preview.fxRateUsed} GBP per {v.currency}. Rates are set in Settings.
                  </p>
                ) : null}
              </InfoTip>
            </div>
            {preview.confidence === 'ESTIMATED' ? (
              <Badge tone="warning" size="xs">
                Estimated
              </Badge>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-4">
          <Toggle
            checked={!!v.perSeat}
            onChange={(b) => set('perSeat', b)}
            label="Priced per seat"
            description="Tick if the amount above is per licence rather than the total"
          />
          {v.perSeat ? (
            <Field label="Seats" inline>
              <Input
                type="number"
                min="1"
                value={v.seats ?? 1}
                onChange={(e) => set('seats', Math.max(1, Number(e.target.value)))}
                className="w-20"
              />
            </Field>
          ) : null}
        </div>
      </section>

      {/* ── Usage-based extras, shown only when relevant ───────────────── */}
      {usesUsage || usesCredit ? (
        <Section
          title={usesCredit ? 'Credit balance' : 'Usage rates'}
          description={
            usesCredit
              ? 'Tracking the balance lets the app warn you before the credit runs out'
              : 'Optional — improves the estimate before you have usage history'
          }
        >
          {usesUsage ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Unit name" hint="e.g. credits, minutes">
                <Input value={v.usageUnitLabel ?? ''} onChange={(e) => set('usageUnitLabel', e.target.value)} placeholder="credits" />
              </Field>
              <Field label="Price per unit">
                <Input
                  type="number"
                  step="0.0001"
                  value={v.usageRatePerUnit ?? ''}
                  onChange={(e) => set('usageRatePerUnit', e.target.value === '' ? null : Number(e.target.value))}
                />
              </Field>
              <Field label="Units per month">
                <Input
                  type="number"
                  value={v.estimatedMonthlyUnits ?? ''}
                  onChange={(e) => set('estimatedMonthlyUnits', e.target.value === '' ? null : Number(e.target.value))}
                />
              </Field>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Balance remaining">
                <Input
                  type="number"
                  step="0.01"
                  value={v.creditBalance ?? ''}
                  onChange={(e) => set('creditBalance', e.target.value === '' ? null : Number(e.target.value))}
                />
              </Field>
              <Field label="Warn below" hint="Alert when the balance drops here">
                <Input
                  type="number"
                  step="0.01"
                  value={v.topUpThreshold ?? ''}
                  onChange={(e) => set('topUpThreshold', e.target.value === '' ? null : Number(e.target.value))}
                />
              </Field>
              <Field label="Usual top-up">
                <Input
                  type="number"
                  step="0.01"
                  value={v.topUpAmount ?? ''}
                  onChange={(e) => set('topUpAmount', e.target.value === '' ? null : Number(e.target.value))}
                />
              </Field>
            </div>
          )}
        </Section>
      ) : null}

      {/* ── Who pays ───────────────────────────────────────────────────── */}
      <Section
        title="Who pays for it"
        description="Set the split here and it flows through every report Finance sees"
        badge={
          v.allocationMethod === 'PERCENTAGE' && v.allocations.length > 0 ? (
            <Badge tone={Math.abs(pctTotal - 100) < 0.01 ? 'positive' : 'warning'} size="xs">
              {pctTotal.toFixed(1)}%
            </Badge>
          ) : null
        }
      >
        <Field label="Method">
          <Segmented
            fullWidth
            value={v.allocationMethod as (typeof ALLOCATION_METHODS)[number]}
            onChange={(m) => {
              set('allocationMethod', m);
              if (m !== 'OWNER_PAYS' && v.allocations.length === 0 && v.ownerDepartmentId) {
                setV((prev) => ({
                  ...prev,
                  allocationMethod: m,
                  allocations: [{ departmentId: prev.ownerDepartmentId!, percentage: m === 'PERCENTAGE' ? 100 : null, seats: m === 'SEATS' ? 1 : null }],
                }));
              }
            }}
            options={ALLOCATION_METHODS.map((m) => ({ value: m, label: ALLOCATION_METHOD_META[m].label, title: ALLOCATION_METHOD_META[m].hint }))}
          />
        </Field>
        <p className="text-[0.6875rem] leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
          {ALLOCATION_METHOD_META[(v.allocationMethod ?? 'OWNER_PAYS') as (typeof ALLOCATION_METHODS)[number]].hint}
        </p>

        <Field label="Owning department" hint="The team responsible for the subscription, whoever ends up paying">
          <Select value={v.ownerDepartmentId ?? ''} onChange={(e) => set('ownerDepartmentId', e.target.value || null)}>
            <option value="">Not assigned</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>

        {v.allocationMethod !== 'OWNER_PAYS' ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                Departments sharing this
              </span>
              {v.allocationMethod === 'PERCENTAGE' && v.allocations.length > 1 ? (
                <Button size="xs" variant="ghost" onClick={distributeEvenly}>
                  Split evenly
                </Button>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {departments.map((d) => {
                const on = v.allocations.some((a) => a.departmentId === d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => toggleDepartment(d.id)}
                    className={cn('cursor-pointer rounded-full border px-2 py-0.5 text-[0.6875rem] transition-colors')}
                    style={
                      on
                        ? { background: d.color, borderColor: d.color, color: '#fff' }
                        : { background: 'var(--surface-raised)', borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }
                    }
                  >
                    {d.code}
                  </button>
                );
              })}
            </div>

            {v.allocations.length > 0 ? (
              <ul className="space-y-1.5">
                {v.allocations.map((a) => (
                  <li key={a.departmentId} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs" style={{ color: 'var(--text-primary)' }}>
                      {deptName(a.departmentId)}
                    </span>
                    {v.allocationMethod === 'PERCENTAGE' ? (
                      <div className="relative w-24">
                        <Input
                          type="number"
                          step="0.1"
                          min="0"
                          max="100"
                          aria-label={`${deptName(a.departmentId)} percentage share`}
                          value={a.percentage ?? ''}
                          onChange={(e) => updateAllocation(a.departmentId, { percentage: e.target.value === '' ? null : Number(e.target.value) })}
                          className="h-8 pr-6 text-right"
                        />
                        <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[0.6875rem]" style={{ color: 'var(--text-tertiary)' }}>
                          %
                        </span>
                      </div>
                    ) : (
                      <div className="relative w-24">
                        <Input
                          type="number"
                          min="0"
                          aria-label={`${deptName(a.departmentId)} seat count`}
                          value={a.seats ?? ''}
                          onChange={(e) => updateAllocation(a.departmentId, { seats: e.target.value === '' ? null : Number(e.target.value) })}
                          className="h-8 pr-12 text-right"
                        />
                        <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[0.6875rem]" style={{ color: 'var(--text-tertiary)' }}>
                          seats
                        </span>
                      </div>
                    )}
                    <span className="tabular w-16 shrink-0 text-right text-[0.6875rem]" style={{ color: 'var(--text-tertiary)' }}>
                      {formatMoney(allocationOutcome.rows.find((r) => r.departmentId === a.departmentId)?.amount ?? 0)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}

            {allocationOutcome.warning ? (
              <p className="flex items-start gap-1.5 text-[0.6875rem] leading-relaxed" style={{ color: 'var(--warning)' }}>
                <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden />
                {allocationOutcome.warning}
              </p>
            ) : null}
          </div>
        ) : null}
      </Section>

      {/* ── Payment & dates ────────────────────────────────────────────── */}
      <Section title="Payment and renewal" description="What it is paid with, and when it next goes out">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Paid with">
            <Select value={v.cardId ?? ''} onChange={(e) => set('cardId', e.target.value || null)}>
              <option value="">Not recorded</option>
              {cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} — •••• {c.last4}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Next renewal / charge date" hint="Drives the reminders and the payment runway">
            <Input type="date" value={(v.renewalDate as string) ?? ''} onChange={(e) => set('renewalDate', e.target.value || null)} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Started on">
            <Input type="date" value={(v.startDate as string) ?? ''} onChange={(e) => set('startDate', e.target.value || null)} />
          </Field>
          <Field label="Contract ends">
            <Input type="date" value={(v.contractEndDate as string) ?? ''} onChange={(e) => set('contractEndDate', e.target.value || null)} />
          </Field>
          <Field label="Notice period" hint="Days">
            <Input type="number" min="0" value={v.noticePeriodDays ?? 0} onChange={(e) => set('noticePeriodDays', Number(e.target.value))} />
          </Field>
        </div>
        <Toggle checked={!!v.autoRenew} onChange={(b) => set('autoRenew', b)} label="Renews automatically" description="If off, someone has to act for it to continue" />
      </Section>

      {/* ── Access ─────────────────────────────────────────────────────── */}
      <Section
        title="Access details"
        description="Who logs in, and where the credential lives"
        defaultOpen={false}
        badge={v.password || initial?.id ? <Chip>Optional</Chip> : undefined}
      >
        <div
          className="flex items-start gap-2 rounded-[var(--radius-sm)] p-2.5 text-[0.6875rem] leading-relaxed"
          style={{ background: 'var(--info-bg)', color: 'var(--text-secondary)', border: '1px solid var(--info-border)' }}
        >
          <Info size={13} className="mt-0.5 shrink-0" style={{ color: 'var(--info)' }} aria-hidden />
          <span>
            Passwords are encrypted before they are stored and are hidden from anyone with the Viewer role, including Finance.
            That protects against casual exposure, but it is not a password manager — for anything sensitive, keep the real
            credential in your organisation&apos;s vault and just note where it lives.
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Account email">
            <Input type="email" value={v.accountEmail ?? ''} onChange={(e) => set('accountEmail', e.target.value)} placeholder="coursedev@imperialedutech.co.uk" />
          </Field>
          <Field label="Username" hint="If it differs from the email">
            <Input value={v.username ?? ''} onChange={(e) => set('username', e.target.value)} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Password" hint={initial?.id ? 'Leave blank to keep the stored password unchanged' : undefined}>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                value={v.password ?? ''}
                onChange={(e) => set('password', e.target.value)}
                autoComplete="new-password"
                className="pr-9"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer"
                style={{ color: 'var(--text-tertiary)' }}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </Field>
          <Field label="Where the credential lives" hint="Preferred over storing the password here">
            <Input value={v.credentialLocation ?? ''} onChange={(e) => set('credentialLocation', e.target.value)} placeholder="1Password — Course Dev vault" />
          </Field>
        </div>
      </Section>

      <Section title="Context" description="Owner, notes and tags" defaultOpen={false}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Internal owner">
            <Input value={v.ownerName ?? ''} onChange={(e) => set('ownerName', e.target.value)} />
          </Field>
          <Field label="Owner email">
            <Input type="email" value={v.ownerEmail ?? ''} onChange={(e) => set('ownerEmail', e.target.value)} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Importance" hint="How disruptive would losing it be?">
            <Select value={v.criticality} onChange={(e) => set('criticality', e.target.value as typeof v.criticality)}>
              {CRITICALITIES.map((c) => (
                <option key={c} value={c}>
                  {c.charAt(0) + c.slice(1).toLowerCase()}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tags" hint="Comma separated">
            <Input value={v.tags ?? ''} onChange={(e) => set('tags', e.target.value)} placeholder="video, accessibility" />
          </Field>
        </div>
        <Field label="Notes">
          <Textarea value={v.notes ?? ''} onChange={(e) => set('notes', e.target.value)} rows={3} />
        </Field>
        {initial?.id ? (
          <Field label="Reason for a price change" hint="Recorded against the price history if the amount has changed">
            <Input value={v.changeReason ?? ''} onChange={(e) => set('changeReason', e.target.value)} placeholder="Vendor increased list price" />
          </Field>
        ) : null}
      </Section>

      {error ? (
        <p className="flex items-start gap-1.5 rounded-[var(--radius-sm)] p-2.5 text-xs" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }} role="alert">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2 pt-1">
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        ) : null}
        <Button variant="primary" onClick={submit} loading={pending}>
          {initial?.id ? 'Save changes' : 'Add subscription'}
        </Button>
      </div>
    </div>
  );
}

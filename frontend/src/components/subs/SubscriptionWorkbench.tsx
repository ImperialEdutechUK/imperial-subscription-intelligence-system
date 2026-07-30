'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowDownUp,
  Copy,
  Download,
  ExternalLink,
  KeyRound,
  Pencil,
  Plus,
  Search,
  Share2,
  Trash2,
  X,
} from 'lucide-react';
import { Badge, Chip, EmptyState, KeyValue, Tone } from '@/components/ui/kit';
import { Button, IconButton, Input, LinkButton, Modal, Select, Sheet } from '@/components/ui/controls';
import { SubscriptionForm, type FormCard, type FormDepartment, type SubscriptionFormValues } from './SubscriptionForm';
import { deleteSubscription, duplicateSubscription, revealPassword } from '@/server/actions';
import { formatMoney } from '@/lib/money';
import { formatDate, relativeDays, cn } from '@/lib/utils';
import { BILLING_MODEL_META, CATEGORIES, CATEGORY_META, STATUS_META, SUB_STATUSES, BILLING_MODELS } from '@/lib/domain';

export interface Row {
  id: string;
  name: string;
  vendor: string | null;
  url: string | null;
  category: string;
  categoryLabel: string;
  status: string;
  criticality: string;
  billingModel: string;
  billingLabel: string;
  currency: string;
  unitAmount: number;
  seats: number;
  perSeat: boolean;
  monthlyGbp: number;
  annualGbp: number;
  oneOffGbp: number;
  amountPerCharge: number;
  confidence: string;
  basis: string;
  caveat?: string;
  renewalDate: string | null;
  nextCharge: string | null;
  daysToRenewal: number | null;
  autoRenew: boolean;
  allocationMethod: string;
  allocationWarning?: string;
  allocations: { departmentId: string; departmentName: string; departmentCode: string; color: string; share: number; monthlyGbp: number }[];
  shared: boolean;
  ownerDepartmentId: string | null;
  ownerName: string | null;
  accountEmail: string | null;
  username: string | null;
  hasPassword: boolean;
  credentialLocation: string | null;
  cardId: string | null;
  cardLabel: string | null;
  cardLast4: string | null;
  notes: string | null;
  tags: string[];
  startDate: string | null;
  contractEndDate: string | null;
  noticePeriodDays: number;
  creditBalance: number | null;
  creditRunwayMonths: number | null;
  costChangeCount: number;
}

type SortKey = 'name' | 'monthlyGbp' | 'annualGbp' | 'renewal' | 'category' | 'department';

const STATUS_TONE: Record<string, Tone> = {
  ACTIVE: 'positive',
  TRIAL: 'info',
  PAUSED: 'warning',
  CANCELLED: 'neutral',
  PENDING: 'info',
};

export function SubscriptionWorkbench({
  rows,
  departments,
  cards,
  fxRates,
  canEdit,
  canReveal,
  openNew,
  focusId,
}: {
  rows: Row[];
  departments: FormDepartment[];
  cards: FormCard[];
  fxRates: Record<string, number>;
  canEdit: boolean;
  canReveal: boolean;
  openNew?: boolean;
  /** Set by ?focus=<id>, e.g. from a command-palette result. */
  focusId?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  const [query, setQuery] = useState('');
  const [dept, setDept] = useState(params.get('dept') ?? '');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [model, setModel] = useState('');
  const [sharedOnly, setSharedOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>('monthlyGbp');
  const [asc, setAsc] = useState(false);

  const [editing, setEditing] = useState<Row | null>(null);
  const [creating, setCreating] = useState(!!openNew);
  const [inspect, setInspect] = useState<Row | null>(() => (focusId ? (rows.find((r) => r.id === focusId) ?? null) : null));
  const [confirmDelete, setConfirmDelete] = useState<Row | null>(null);
  const [secret, setSecret] = useState<{ name: string; value: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (q) {
        const hay = [r.name, r.vendor, r.categoryLabel, r.accountEmail, r.ownerName, r.cardLabel, ...r.tags].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (dept && !r.allocations.some((a) => a.departmentId === dept)) return false;
      if (category && r.category !== category) return false;
      if (status && r.status !== status) return false;
      if (model && r.billingModel !== model) return false;
      if (sharedOnly && !r.shared) return false;
      return true;
    });

    const dir = asc ? 1 : -1;
    return out.sort((a, b) => {
      switch (sort) {
        case 'name':
          return a.name.localeCompare(b.name) * dir;
        case 'annualGbp':
          return (a.annualGbp - b.annualGbp) * dir;
        case 'category':
          return a.categoryLabel.localeCompare(b.categoryLabel) * dir;
        case 'department':
          return (a.allocations[0]?.departmentName ?? '').localeCompare(b.allocations[0]?.departmentName ?? '') * dir;
        case 'renewal': {
          const av = a.daysToRenewal ?? 99999;
          const bv = b.daysToRenewal ?? 99999;
          return (av - bv) * dir;
        }
        default:
          return (a.monthlyGbp - b.monthlyGbp) * dir;
      }
    });
  }, [rows, query, dept, category, status, model, sharedOnly, sort, asc]);

  const totals = useMemo(
    () => ({
      monthly: filtered.reduce((a, r) => a + r.monthlyGbp, 0),
      annual: filtered.reduce((a, r) => a + r.annualGbp, 0),
    }),
    [filtered],
  );

  const activeFilters = [dept, category, status, model].filter(Boolean).length + (sharedOnly ? 1 : 0) + (query ? 1 : 0);

  const clearFilters = () => {
    setQuery('');
    setDept('');
    setCategory('');
    setStatus('');
    setModel('');
    setSharedOnly(false);
  };

  const toInitial = (r: Row): Partial<SubscriptionFormValues> => ({
    id: r.id,
    name: r.name,
    vendor: r.vendor ?? '',
    url: r.url ?? '',
    category: r.category as SubscriptionFormValues['category'],
    status: r.status as SubscriptionFormValues['status'],
    criticality: r.criticality as SubscriptionFormValues['criticality'],
    billingModel: r.billingModel as SubscriptionFormValues['billingModel'],
    currency: r.currency,
    unitAmount: r.unitAmount,
    seats: r.seats,
    perSeat: r.perSeat,
    accountEmail: r.accountEmail ?? '',
    username: r.username ?? '',
    credentialLocation: r.credentialLocation ?? '',
    cardId: r.cardId,
    renewalDate: r.renewalDate,
    startDate: r.startDate,
    contractEndDate: r.contractEndDate,
    autoRenew: r.autoRenew,
    noticePeriodDays: r.noticePeriodDays,
    allocationMethod: r.allocationMethod as SubscriptionFormValues['allocationMethod'],
    ownerDepartmentId: r.ownerDepartmentId,
    ownerName: r.ownerName ?? '',
    notes: r.notes ?? '',
    tags: r.tags.join(', '),
    creditBalance: r.creditBalance,
    allocations: r.allocations.map((a) => ({
      departmentId: a.departmentId,
      percentage: r.allocationMethod === 'PERCENTAGE' ? Math.round(a.share * 1000) / 10 : null,
      seats: r.allocationMethod === 'SEATS' ? Math.max(1, Math.round(a.share * r.seats)) : null,
    })),
  });

  const sortButton = (key: SortKey, label: string, className?: string) => (
    <button
      onClick={() => {
        if (sort === key) setAsc((a) => !a);
        else {
          setSort(key);
          setAsc(key === 'name' || key === 'category' || key === 'renewal');
        }
      }}
      className={cn('flex cursor-pointer items-center gap-1 font-medium transition-colors', className)}
      style={{ color: sort === key ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
    >
      {label}
      {sort === key ? <ArrowDownUp size={10} aria-hidden /> : null}
    </button>
  );

  return (
    <div className="space-y-3">
      {/* ── One filter row above everything it scopes ─────────────────── */}
      <div
        className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border p-2"
        style={{ background: 'var(--surface-raised)', borderColor: 'var(--border-subtle)' }}
      >
        <div className="relative min-w-[190px] flex-1">
          <Search size={13} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} aria-hidden />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, vendor, owner, email, tag…" className="h-8 pl-7" aria-label="Search subscriptions" />
        </div>

        <Select value={dept} onChange={(e) => setDept(e.target.value)} className="h-8 w-auto min-w-[130px]" aria-label="Filter by department">
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>

        <Select value={category} onChange={(e) => setCategory(e.target.value)} className="h-8 w-auto min-w-[125px]" aria-label="Filter by category">
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_META[c].label}
            </option>
          ))}
        </Select>

        <Select value={model} onChange={(e) => setModel(e.target.value)} className="h-8 w-auto min-w-[110px]" aria-label="Filter by billing model">
          <option value="">All billing</option>
          {BILLING_MODELS.map((b) => (
            <option key={b} value={b}>
              {BILLING_MODEL_META[b].label}
            </option>
          ))}
        </Select>

        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="h-8 w-auto min-w-[100px]" aria-label="Filter by status">
          <option value="">All statuses</option>
          {SUB_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_META[s].label}
            </option>
          ))}
        </Select>

        <Button size="xs" variant={sharedOnly ? 'primary' : 'secondary'} icon={Share2} onClick={() => setSharedOnly((s) => !s)}>
          Shared only
        </Button>

        {activeFilters > 0 ? (
          <Button size="xs" variant="ghost" icon={X} onClick={clearFilters}>
            Clear
          </Button>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          <LinkButton href="/api/export?format=csv" download size="xs" icon={Download}>
            Export
          </LinkButton>
          {canEdit ? (
            <Button size="xs" variant="primary" icon={Plus} onClick={() => setCreating(true)}>
              Add
            </Button>
          ) : null}
        </div>
      </div>

      {/* ── Result summary ───────────────────────────────────────────── */}
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
        <span>
          <strong style={{ color: 'var(--text-primary)' }}>{filtered.length}</strong> of {rows.length} subscriptions
        </span>
        <span>
          <strong className="tabular" style={{ color: 'var(--text-primary)' }}>
            {formatMoney(totals.monthly)}
          </strong>{' '}
          per month
        </span>
        <span>
          <strong className="tabular" style={{ color: 'var(--text-primary)' }}>
            {formatMoney(totals.annual)}
          </strong>{' '}
          per year
        </span>
      </div>

      {/* ── Register ─────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border" style={{ background: 'var(--surface-raised)', borderColor: 'var(--border-subtle)' }}>
          <EmptyState
            icon={Search}
            title={rows.length === 0 ? 'The register is empty' : 'Nothing matches those filters'}
            description={rows.length === 0 ? 'Add a subscription, or paste a block of rows from your spreadsheet on the Import page.' : undefined}
            action={rows.length > 0 ? <Button size="sm" onClick={clearFilters}>Clear filters</Button> : undefined}
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-lg)] border" style={{ background: 'var(--surface-raised)', borderColor: 'var(--border-subtle)' }}>
          <div className="overflow-x-auto">
            <table className="w-full" style={{ fontSize: 'var(--density-font)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <th className="px-3 py-2 text-left text-[0.6875rem]">{sortButton('name', 'Software')}</th>
                  <th className="hidden px-3 py-2 text-left text-[0.6875rem] lg:table-cell">{sortButton('category', 'Category')}</th>
                  <th className="px-3 py-2 text-left text-[0.6875rem]">{sortButton('department', 'Departments')}</th>
                  <th className="hidden px-3 py-2 text-left text-[0.6875rem] md:table-cell">Billing</th>
                  <th className="px-3 py-2 text-right text-[0.6875rem]">{sortButton('monthlyGbp', 'Monthly', 'ml-auto')}</th>
                  <th className="hidden px-3 py-2 text-right text-[0.6875rem] sm:table-cell">{sortButton('annualGbp', 'Annual', 'ml-auto')}</th>
                  <th className="px-3 py-2 text-left text-[0.6875rem]">{sortButton('renewal', 'Renews')}</th>
                  <th className="px-3 py-2 text-right text-[0.6875rem]" style={{ color: 'var(--text-tertiary)' }}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const urgent = r.daysToRenewal != null && r.daysToRenewal >= 0 && r.daysToRenewal <= 7;
                  return (
                    <tr
                      key={r.id}
                      className="group cursor-pointer transition-colors hover:bg-[var(--surface-hover)]"
                      style={{ borderBottom: '1px solid var(--border-subtle)', height: 'var(--density-row)' }}
                      onClick={() => setInspect(r)}
                    >
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-2">
                          <span className="min-w-0">
                            <span className="flex items-center gap-1.5">
                              <span className="truncate font-medium" style={{ color: 'var(--text-primary)' }}>
                                {r.name}
                              </span>
                              {r.status !== 'ACTIVE' ? (
                                <Badge tone={STATUS_TONE[r.status] ?? 'neutral'} size="xs">
                                  {STATUS_META[r.status as keyof typeof STATUS_META]?.label ?? r.status}
                                </Badge>
                              ) : null}
                              {r.shared ? <Share2 size={11} style={{ color: 'var(--text-tertiary)' }} aria-label="Shared across departments" /> : null}
                              {r.hasPassword ? <KeyRound size={11} style={{ color: 'var(--text-tertiary)' }} aria-label="Password stored" /> : null}
                            </span>
                            {r.vendor ? (
                              <span className="block truncate text-[0.6875rem]" style={{ color: 'var(--text-tertiary)' }}>
                                {r.vendor}
                              </span>
                            ) : null}
                          </span>
                        </div>
                      </td>
                      <td className="hidden px-3 py-1.5 lg:table-cell">
                        <span className="text-[0.6875rem]" style={{ color: 'var(--text-secondary)' }}>
                          {r.categoryLabel}
                        </span>
                      </td>
                      <td className="px-3 py-1.5">
                        <span className="flex flex-wrap gap-1">
                          {r.allocations.slice(0, 3).map((a) => (
                            <span
                              key={a.departmentId}
                              className="rounded-full px-1.5 py-0.5 text-[0.625rem] font-medium"
                              style={{ background: `color-mix(in srgb, ${a.color} 14%, transparent)`, color: a.color }}
                              title={`${a.departmentName} — ${formatMoney(a.monthlyGbp)}/month (${(a.share * 100).toFixed(0)}%)`}
                            >
                              {a.departmentCode}
                              {r.shared ? ` ${(a.share * 100).toFixed(0)}%` : ''}
                            </span>
                          ))}
                          {r.allocations.length > 3 ? (
                            <span className="text-[0.625rem]" style={{ color: 'var(--text-tertiary)' }}>
                              +{r.allocations.length - 3}
                            </span>
                          ) : null}
                        </span>
                      </td>
                      <td className="hidden px-3 py-1.5 md:table-cell">
                        <span className="text-[0.6875rem]" style={{ color: 'var(--text-secondary)' }}>
                          {r.billingLabel}
                          {r.perSeat ? ` · ${r.seats} seats` : ''}
                        </span>
                      </td>
                      <td className="tabular px-3 py-1.5 text-right">
                        <span className="flex items-center justify-end gap-1">
                          {r.oneOffGbp > 0 ? (
                            <span title="A one-off purchase has no recurring monthly cost" style={{ color: 'var(--text-tertiary)' }}>
                              —
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-primary)' }}>{formatMoney(r.monthlyGbp)}</span>
                          )}
                          {r.confidence === 'ESTIMATED' ? (
                            <span title="Estimated — this subscription bills on usage or credit" style={{ color: 'var(--warning)' }}>
                              ~
                            </span>
                          ) : null}
                        </span>
                      </td>
                      <td className="tabular hidden px-3 py-1.5 text-right sm:table-cell" style={{ color: 'var(--text-secondary)' }}>
                        {r.oneOffGbp > 0 ? (
                          <span title="Paid once, not recurring. Counted in twelve-month cash but not in the run-rate.">
                            {formatMoney(r.oneOffGbp)}{' '}
                            <span className="text-[0.625rem]" style={{ color: 'var(--text-tertiary)' }}>
                              once
                            </span>
                          </span>
                        ) : (
                          formatMoney(r.annualGbp)
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        {r.status === 'CANCELLED' || r.daysToRenewal == null ? (
                          <span className="text-[0.6875rem]" style={{ color: 'var(--text-tertiary)' }}>
                            —
                          </span>
                        ) : (
                          <span className="text-[0.6875rem]" style={{ color: urgent ? 'var(--danger)' : 'var(--text-secondary)', fontWeight: urgent ? 600 : 400 }}>
                            {relativeDays(r.daysToRenewal)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <span className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                          {r.url ? (
                            <LinkButton
                              href={r.url.startsWith('http') ? r.url : `https://${r.url}`}
                              external
                              size="xs"
                              variant="ghost"
                              icon={ExternalLink}
                              className="size-7 px-0"
                              ariaLabel={`Open ${r.name} in a new tab`}
                              title={`Open ${r.name} in a new tab`}
                            />
                          ) : null}
                          {canEdit ? <IconButton icon={Pencil} label={`Edit ${r.name}`} size="xs" onClick={() => setEditing(r)} /> : null}
                          {canEdit ? (
                            <IconButton
                              icon={Copy}
                              label={`Duplicate ${r.name}`}
                              size="xs"
                              onClick={() => startTransition(async () => { await duplicateSubscription(r.id); router.refresh(); })}
                            />
                          ) : null}
                          {canEdit ? <IconButton icon={Trash2} label={`Delete ${r.name}`} size="xs" onClick={() => setConfirmDelete(r)} /> : null}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Inspector ────────────────────────────────────────────────── */}
      <Sheet
        open={!!inspect}
        onClose={() => setInspect(null)}
        title={inspect?.name ?? ''}
        subtitle={[inspect?.vendor, inspect?.categoryLabel].filter(Boolean).join(' · ')}
        footer={
          inspect && canEdit ? (
            <div className="flex justify-end gap-2">
              <Button
                onClick={() => {
                  const r = inspect;
                  setInspect(null);
                  setEditing(r);
                }}
                icon={Pencil}
              >
                Edit
              </Button>
            </div>
          ) : undefined
        }
      >
        {inspect ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[var(--radius-md)] border p-3" style={{ borderColor: 'var(--border-subtle)' }}>
                <p className="text-[0.6875rem]" style={{ color: 'var(--text-tertiary)' }}>
                  Monthly
                </p>
                <p className="tabular mt-0.5 text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {formatMoney(inspect.monthlyGbp)}
                </p>
              </div>
              <div className="rounded-[var(--radius-md)] border p-3" style={{ borderColor: 'var(--border-subtle)' }}>
                <p className="text-[0.6875rem]" style={{ color: 'var(--text-tertiary)' }}>
                  Annual
                </p>
                <p className="tabular mt-0.5 text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {formatMoney(inspect.annualGbp)}
                </p>
              </div>
            </div>

            <div className="rounded-[var(--radius-md)] border p-3 text-xs leading-relaxed" style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-sunken)', color: 'var(--text-secondary)' }}>
              <p className="mb-1 font-semibold" style={{ color: 'var(--text-primary)' }}>
                How that figure is reached
              </p>
              <p>{inspect.basis}</p>
              {inspect.caveat ? (
                <p className="mt-1.5" style={{ color: 'var(--warning)' }}>
                  {inspect.caveat}
                </p>
              ) : null}
            </div>

            {inspect.allocationWarning ? (
              <p className="rounded-[var(--radius-sm)] p-2.5 text-xs" style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}>
                {inspect.allocationWarning}
              </p>
            ) : null}

            <div>
              <p className="mb-1.5 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                Cost split
              </p>
              <ul className="space-y-1.5">
                {inspect.allocations.map((a) => (
                  <li key={a.departmentId} className="flex items-center gap-2">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: a.color }} aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {a.departmentName}
                    </span>
                    <span className="tabular text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      {(a.share * 100).toFixed(1)}%
                    </span>
                    <span className="tabular w-20 text-right text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                      {formatMoney(a.monthlyGbp)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <dl>
              <KeyValue label="Billing">
                {inspect.billingLabel} — {formatMoney(inspect.amountPerCharge, inspect.currency)} per charge
                {inspect.perSeat ? ` (${inspect.seats} seats)` : ''}
              </KeyValue>
              <KeyValue label="Next charge">
                {inspect.nextCharge ? `${formatDate(inspect.nextCharge)} (${relativeDays(inspect.daysToRenewal)})` : 'Not set'}
              </KeyValue>
              <KeyValue label="Auto-renews">{inspect.autoRenew ? 'Yes' : 'No — needs a manual decision'}</KeyValue>
              {inspect.noticePeriodDays > 0 ? <KeyValue label="Notice period">{inspect.noticePeriodDays} days</KeyValue> : null}
              <KeyValue label="Paid with">{inspect.cardLabel ? `${inspect.cardLabel} ···· ${inspect.cardLast4}` : 'Not recorded'}</KeyValue>
              <KeyValue label="Account">{inspect.accountEmail ?? inspect.username ?? 'Not recorded'}</KeyValue>
              <KeyValue label="Password">
                {inspect.hasPassword ? (
                  canReveal ? (
                    <button
                      className="cursor-pointer underline decoration-dotted underline-offset-2"
                      style={{ color: 'var(--brand-700)' }}
                      onClick={() =>
                        startTransition(async () => {
                          const res = await revealPassword(inspect.id);
                          if (res.ok) setSecret({ name: inspect.name, value: res.password });
                          else setSecret({ name: inspect.name, value: `Could not reveal: ${res.error}` });
                        })
                      }
                    >
                      Stored — reveal
                    </button>
                  ) : (
                    'Stored — administrators only'
                  )
                ) : (
                  (inspect.credentialLocation ?? 'Not stored')
                )}
              </KeyValue>
              {inspect.creditBalance != null ? (
                <KeyValue label="Credit balance">
                  {formatMoney(inspect.creditBalance, inspect.currency)}
                  {inspect.creditRunwayMonths != null ? ` — about ${inspect.creditRunwayMonths.toFixed(1)} months at current burn` : ''}
                </KeyValue>
              ) : null}
              <KeyValue label="Owner">{inspect.ownerName ?? 'Not recorded'}</KeyValue>
              <KeyValue label="Price changes logged">{inspect.costChangeCount}</KeyValue>
            </dl>

            {inspect.tags.length ? (
              <div className="flex flex-wrap gap-1.5">
                {inspect.tags.map((t) => (
                  <Chip key={t}>{t}</Chip>
                ))}
              </div>
            ) : null}

            {inspect.notes ? (
              <div>
                <p className="mb-1 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Notes
                </p>
                <p className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>
                  {inspect.notes}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </Sheet>

      {/* ── Create / edit ────────────────────────────────────────────── */}
      <Sheet
        open={creating || !!editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        width={720}
        title={editing ? `Edit ${editing.name}` : 'Add a subscription'}
        subtitle={editing ? undefined : 'Only the name is required — fill in the rest whenever you have it'}
      >
        <SubscriptionForm
          key={editing?.id ?? 'new'}
          initial={editing ? toInitial(editing) : undefined}
          departments={departments}
          cards={cards}
          fxRates={fxRates}
          defaultDepartmentId={departments[0]?.id}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            router.refresh();
          }}
          onCancel={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      </Sheet>

      {/* ── Destructive confirmation ─────────────────────────────────── */}
      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete this subscription?"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  if (confirmDelete) await deleteSubscription(confirmDelete.id);
                  setConfirmDelete(null);
                  router.refresh();
                })
              }
            >
              Delete permanently
            </Button>
          </div>
        }
      >
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          <strong style={{ color: 'var(--text-primary)' }}>{confirmDelete?.name}</strong> will be removed along with its price
          history, usage records and departmental split. This cannot be undone. If you only want it out of the way, edit it and
          set the status to Cancelled instead — that keeps the history for reporting.
        </p>
      </Modal>

      <Modal open={!!secret} onClose={() => setSecret(null)} title={`Password for ${secret?.name ?? ''}`} width={420}>
        <p className="mb-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
          This reveal has been recorded in the audit log.
        </p>
        <code
          className="block rounded-[var(--radius-sm)] border p-3 font-mono text-sm break-all"
          style={{ background: 'var(--surface-sunken)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
        >
          {secret?.value}
        </code>
      </Modal>
    </div>
  );
}

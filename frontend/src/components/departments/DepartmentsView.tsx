'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Pencil, Plus, Share2, Trash2, Users } from 'lucide-react';
import { BentoTile, TileHeader, TileBody, Badge, Stat, EmptyState, KeyValue, Chip } from '@/components/ui/kit';
import { Button, Field, Input, IconButton, Modal, Sheet, Toggle, InfoTip } from '@/components/ui/controls';
import { ChartFrame, MiniTable } from '@/components/charts/ChartFrame';
import { RankedBars } from '@/components/charts/primitives';
import { SharedCostFlow, type FlowLink } from '@/components/charts/RenewalTimeline';
import { saveDepartment, deleteDepartment } from '@/server/actions';
import { formatMoney } from '@/lib/money';

export interface DeptRow {
  id: string;
  name: string;
  code: string;
  color: string;
  costCentre: string | null;
  headName: string | null;
  headEmail: string | null;
  headcount: number | null;
  monthlyGbp: number;
  annualGbp: number;
  subscriptionCount: number;
  sharedCount: number;
  perHeadMonthly: number | null;
  soleCostGbp: number;
  sharedCostGbp: number;
  topSubscriptions: { id: string; name: string; monthlyGbp: number; share: number; shared: boolean }[];
}

const BLANK = {
  name: '',
  code: '',
  colorHex: '#2F6FED',
  costCentre: '',
  headName: '',
  headEmail: '',
  headcount: null as number | null,
  active: true,
};

export function DepartmentsView({
  rows,
  flowLinks,
  totalMonthly,
  canEdit,
}: {
  rows: DeptRow[];
  flowLinks: FlowLink[];
  totalMonthly: number;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<(typeof BLANK & { id?: string }) | null>(null);
  const [detail, setDetail] = useState<DeptRow | null>(null);
  const [confirm, setConfirm] = useState<DeptRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const ranked = useMemo(() => [...rows].sort((a, b) => b.monthlyGbp - a.monthlyGbp), [rows]);
  const withHeadcount = ranked.filter((r) => r.perHeadMonthly != null);
  const totalShared = rows.reduce((a, r) => a + r.sharedCostGbp, 0);

  const save = (values: typeof BLANK & { id?: string }) =>
    startTransition(async () => {
      setError(null);
      const res = await saveDepartment(values);
      if (res.ok) {
        setEditing(null);
        router.refresh();
      } else setError(res.error);
    });

  return (
    <div className="space-y-4">
      <div className="bento">
        <BentoTile col={3} row={2} accent>
          <TileBody className="pt-4">
            <Stat
              label="Departments tracked"
              value={rows.length}
              hint={`${formatMoney(totalMonthly)} of monthly spend allocated across them.`}
            />
          </TileBody>
        </BentoTile>

        <BentoTile col={3} row={2}>
          <TileBody className="pt-4">
            <Stat
              label="Cost that is shared"
              value={formatMoney(totalShared, 'GBP', { decimals: 0 })}
              hint="Monthly spend on subscriptions used by more than one department, split by the method set on each."
            />
          </TileBody>
        </BentoTile>

        <BentoTile col={6} row={2}>
          <TileHeader
            title="Monthly cost by department"
            subtitle="Each department's own colour, set below"
            icon={Building2}
            action={
              canEdit ? (
                <Button size="xs" variant="primary" icon={Plus} onClick={() => setEditing({ ...BLANK })}>
                  Add
                </Button>
              ) : null
            }
          />
          <TileBody>
            {ranked.length === 0 ? (
              <EmptyState icon={Building2} title="No departments yet" compact />
            ) : (
              <ChartFrame
                dense
                caption="Shared subscriptions contribute only their allocated share to each department, so these figures add up to the portfolio total exactly."
                table={
                  <MiniTable
                    head={['Department', 'Monthly', 'Annual', 'Subs']}
                    rows={ranked.map((r) => [r.name, formatMoney(r.monthlyGbp), formatMoney(r.annualGbp), r.subscriptionCount])}
                  />
                }
              >
                <RankedBars
                  data={ranked.map((r) => ({
                    key: r.id,
                    label: r.name,
                    value: r.monthlyGbp,
                    color: r.color,
                    sublabel: `${r.subscriptionCount} subscriptions · ${formatMoney(r.annualGbp)} a year`,
                  }))}
                  onSelect={(id) => setDetail(rows.find((r) => r.id === id) ?? null)}
                  labelWidth={120}
                />
              </ChartFrame>
            )}
          </TileBody>
        </BentoTile>
      </div>

      {/* ── Department cards ─────────────────────────────────────────── */}
      <div className="bento">
        {ranked.map((d) => {
          const sharePct = totalMonthly > 0 ? (d.monthlyGbp / totalMonthly) * 100 : 0;
          return (
            <BentoTile key={d.id} col={4} row={3} interactive>
              <div className="h-1 w-full shrink-0" style={{ background: d.color }} aria-hidden />
              <TileHeader
                title={
                  <span className="flex items-center gap-2">
                    {d.name}
                    <Chip color={d.color}>{d.code}</Chip>
                  </span>
                }
                subtitle={d.costCentre ? `Cost centre ${d.costCentre}` : undefined}
                action={
                  canEdit ? (
                    <span className="flex gap-0.5">
                      <IconButton
                        icon={Pencil}
                        label={`Edit ${d.name}`}
                        size="xs"
                        onClick={() =>
                          setEditing({
                            id: d.id,
                            name: d.name,
                            code: d.code,
                            colorHex: d.color.startsWith('#') ? d.color : '#2F6FED',
                            costCentre: d.costCentre ?? '',
                            headName: d.headName ?? '',
                            headEmail: d.headEmail ?? '',
                            headcount: d.headcount,
                            active: true,
                          })
                        }
                      />
                      <IconButton icon={Trash2} label={`Delete ${d.name}`} size="xs" onClick={() => setConfirm(d)} />
                    </span>
                  ) : null
                }
              />
              <TileBody className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-meta" style={{ color: 'var(--text-tertiary)' }}>
                      Monthly
                    </p>
                    <p className="tabular text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {formatMoney(d.monthlyGbp)}
                    </p>
                  </div>
                  <div>
                    <p className="text-meta" style={{ color: 'var(--text-tertiary)' }}>
                      Annual
                    </p>
                    <p className="tabular text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {formatMoney(d.annualGbp)}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <Badge tone="neutral" size="xs" showIcon={false}>
                    {sharePct.toFixed(1)}% of total
                  </Badge>
                  <Badge tone="neutral" size="xs" showIcon={false}>
                    {d.subscriptionCount} subscriptions
                  </Badge>
                  {d.sharedCount > 0 ? (
                    <Badge tone="info" size="xs" icon={Share2}>
                      {d.sharedCount} shared
                    </Badge>
                  ) : null}
                  {d.headcount ? (
                    <Badge tone="neutral" size="xs" icon={Users}>
                      {formatMoney(d.perHeadMonthly ?? 0)} per person
                    </Badge>
                  ) : null}
                </div>

                {d.topSubscriptions.length ? (
                  <ul className="mt-auto space-y-1">
                    {d.topSubscriptions.slice(0, 4).map((s) => (
                      <li key={s.id} className="flex items-center justify-between gap-2 text-meta">
                        <span className="min-w-0 truncate" style={{ color: 'var(--text-secondary)' }}>
                          {s.name}
                          {s.shared ? (
                            <span style={{ color: 'var(--text-tertiary)' }}> · {(s.share * 100).toFixed(0)}%</span>
                          ) : null}
                        </span>
                        <span className="tabular shrink-0" style={{ color: 'var(--text-tertiary)' }}>
                          {formatMoney(s.monthlyGbp)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-auto text-meta" style={{ color: 'var(--text-tertiary)' }}>
                    No subscriptions attached yet.
                  </p>
                )}

                <Button size="xs" variant="ghost" onClick={() => setDetail(d)} full>
                  See everything charged here
                </Button>
              </TileBody>
            </BentoTile>
          );
        })}
      </div>

      {/* ── Cost-per-head comparison ─────────────────────────────────── */}
      {withHeadcount.length >= 2 ? (
        <div className="bento">
          <BentoTile col={6} row={3}>
            <TileHeader
              title="Software cost per person"
              subtitle="Allocated monthly cost divided by recorded headcount"
              icon={Users}
              action={
                <InfoTip>
                  <strong style={{ color: 'var(--text-primary)' }}>Reading this fairly</strong>
                  <p className="mt-1">
                    Roles differ. A team doing video production and design will always cost more in software than one doing
                    administration, and a higher figure is not by itself evidence of waste.
                  </p>
                  <p className="mt-1.5">
                    Departments without a recorded headcount are left out of this chart rather than shown as zero.
                  </p>
                </InfoTip>
              }
            />
            <TileBody>
              <ChartFrame
                dense
                caption="Only departments with a headcount recorded appear here."
                table={
                  <MiniTable
                    head={['Department', 'Headcount', 'Per person / month', 'Total / month']}
                    rows={withHeadcount.map((r) => [r.name, r.headcount ?? '—', formatMoney(r.perHeadMonthly ?? 0), formatMoney(r.monthlyGbp)])}
                  />
                }
              >
                <RankedBars
                  data={withHeadcount
                    .slice()
                    .sort((a, b) => (b.perHeadMonthly ?? 0) - (a.perHeadMonthly ?? 0))
                    .map((r) => ({
                      key: r.id,
                      label: r.name,
                      value: r.perHeadMonthly ?? 0,
                      color: r.color,
                      sublabel: `${r.headcount} people · ${formatMoney(r.monthlyGbp)} total`,
                    }))}
                  labelWidth={120}
                />
              </ChartFrame>
            </TileBody>
          </BentoTile>

          <BentoTile col={6} row={3}>
            <TileHeader title="Shared subscriptions" subtitle="Which departments carry the cost of jointly used tools" icon={Share2} />
            <TileBody>
              {flowLinks.length === 0 ? (
                <EmptyState
                  icon={Share2}
                  title="Nothing is shared yet"
                  description="Set a subscription's split method to percentage or seats to record joint ownership."
                  compact
                />
              ) : (
                <ChartFrame
                  dense
                  height={210}
                  caption="Ribbon thickness is the monthly amount allocated. This is the spend most likely to be missed when each team buys its own tools."
                  table={
                    <MiniTable
                      head={['Subscription', 'Department', 'Share', 'Monthly']}
                      rows={flowLinks.map((l) => [l.subscriptionName, l.departmentName, `${(l.share * 100).toFixed(1)}%`, formatMoney(l.amount)])}
                    />
                  }
                >
                  <SharedCostFlow links={flowLinks} height={210} />
                </ChartFrame>
              )}
            </TileBody>
          </BentoTile>
        </div>
      ) : null}

      {/* ── Detail sheet ─────────────────────────────────────────────── */}
      <Sheet
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.name ?? ''}
        subtitle={detail ? `${detail.code}${detail.costCentre ? ` · Cost centre ${detail.costCentre}` : ''}` : undefined}
      >
        {detail ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[var(--radius-md)] border p-3" style={{ borderColor: 'var(--border-subtle)' }}>
                <p className="text-meta" style={{ color: 'var(--text-tertiary)' }}>
                  Monthly
                </p>
                <p className="tabular mt-0.5 text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {formatMoney(detail.monthlyGbp)}
                </p>
              </div>
              <div className="rounded-[var(--radius-md)] border p-3" style={{ borderColor: 'var(--border-subtle)' }}>
                <p className="text-meta" style={{ color: 'var(--text-tertiary)' }}>
                  Annual
                </p>
                <p className="tabular mt-0.5 text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {formatMoney(detail.annualGbp)}
                </p>
              </div>
            </div>

            <dl>
              <KeyValue label="Sole-use cost">{formatMoney(detail.soleCostGbp)} / month</KeyValue>
              <KeyValue label="Share of shared subscriptions">{formatMoney(detail.sharedCostGbp)} / month</KeyValue>
              <KeyValue label="Headcount">{detail.headcount ?? 'Not recorded'}</KeyValue>
              <KeyValue label="Per person">{detail.perHeadMonthly != null ? `${formatMoney(detail.perHeadMonthly)} / month` : 'Needs a headcount'}</KeyValue>
              <KeyValue label="Department head">{detail.headName ?? 'Not recorded'}</KeyValue>
              <KeyValue label="Contact">{detail.headEmail ?? '—'}</KeyValue>
            </dl>

            <div>
              <p className="mb-1.5 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                Everything charged here
              </p>
              <ul className="space-y-1">
                {detail.topSubscriptions.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-2 py-1.5 text-xs"
                    style={{ borderBottom: '1px solid var(--border-subtle)' }}
                  >
                    <span className="min-w-0 truncate" style={{ color: 'var(--text-primary)' }}>
                      {s.name}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {s.shared ? (
                        <Badge tone="info" size="xs" icon={Share2}>
                          {(s.share * 100).toFixed(0)}%
                        </Badge>
                      ) : null}
                      <span className="tabular" style={{ color: 'var(--text-secondary)' }}>
                        {formatMoney(s.monthlyGbp)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </Sheet>

      {/* ── Editor ───────────────────────────────────────────────────── */}
      <Sheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? `Edit ${editing.name}` : 'Add a department'}
        width={480}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button variant="primary" loading={pending} onClick={() => editing && save(editing)}>
              Save
            </Button>
          </div>
        }
      >
        {editing ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name" required>
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </Field>
              <Field label="Short code" hint="Shown as a chip on every subscription" required>
                <Input
                  value={editing.code}
                  onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })}
                  maxLength={16}
                />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Colour" hint="Used consistently in every chart">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={editing.colorHex}
                    onChange={(e) => setEditing({ ...editing, colorHex: e.target.value.toUpperCase() })}
                    className="h-9 w-12 cursor-pointer rounded border"
                    style={{ borderColor: 'var(--border-default)', background: 'var(--surface-raised)' }}
                    aria-label="Department colour"
                  />
                  <Input value={editing.colorHex} onChange={(e) => setEditing({ ...editing, colorHex: e.target.value.toUpperCase() })} />
                </div>
              </Field>
              <Field label="Cost centre">
                <Input value={editing.costCentre ?? ''} onChange={(e) => setEditing({ ...editing, costCentre: e.target.value })} placeholder="CC-4100" />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Department head">
                <Input value={editing.headName ?? ''} onChange={(e) => setEditing({ ...editing, headName: e.target.value })} />
              </Field>
              <Field label="Head's email">
                <Input type="email" value={editing.headEmail ?? ''} onChange={(e) => setEditing({ ...editing, headEmail: e.target.value })} />
              </Field>
            </div>
            <Field label="Headcount" hint="Enables the cost-per-person comparison. Leave blank to opt out of it.">
              <Input
                type="number"
                min="0"
                value={editing.headcount ?? ''}
                onChange={(e) => setEditing({ ...editing, headcount: e.target.value === '' ? null : Number(e.target.value) })}
              />
            </Field>
            <Toggle checked={editing.active} onChange={(b) => setEditing({ ...editing, active: b })} label="Active" />
            {error ? (
              <p className="text-xs" style={{ color: 'var(--danger)' }} role="alert">
                {error}
              </p>
            ) : null}
          </div>
        ) : null}
      </Sheet>

      <Modal
        open={!!confirm}
        onClose={() => {
          setConfirm(null);
          setError(null);
        }}
        title="Delete this department?"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  if (!confirm) return;
                  const res = await deleteDepartment(confirm.id);
                  if (res.ok) {
                    setConfirm(null);
                    setError(null);
                    router.refresh();
                  } else setError(res.error);
                })
              }
            >
              Delete
            </Button>
          </div>
        }
      >
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          <strong style={{ color: 'var(--text-primary)' }}>{confirm?.name}</strong> will be removed. Any subscription still
          attached to it must be reassigned first — the deletion will be refused otherwise rather than silently orphaning cost.
        </p>
        {error ? (
          <p className="mt-2 rounded-[var(--radius-sm)] p-2.5 text-xs" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }} role="alert">
            {error}
          </p>
        ) : null}
      </Modal>
    </div>
  );
}

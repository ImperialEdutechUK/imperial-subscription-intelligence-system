'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Boxes,
  CalendarClock,
  CreditCard,
  Layers,
  LineChart,
  Share2,
  Sigma,
  TrendingUp,
} from 'lucide-react';
import { BentoTile, TileHeader, TileBody, Badge, Stat, Meter, EmptyState, ReliabilityTag, colorForIndex } from '@/components/ui/kit';
import { LinkButton, InfoTip, Segmented } from '@/components/ui/controls';
import { ChartFrame, MiniTable } from '@/components/charts/ChartFrame';
import { DivergingBars } from '@/components/charts/primitives';
import { TrendChart } from '@/components/charts/TrendChart';
import { Treemap } from '@/components/charts/Treemap';
import { SharedCostFlow, type FlowLink, type TimelineItem } from '@/components/charts/RenewalTimeline';
import { formatMoney } from '@/lib/money';
import { formatDate, relativeDays } from '@/lib/utils';
import type { Observation } from '@/server/observations';

// ───────────────────────────────────────────────────────────── Spend trend ──

export function SpendTrendTile({
  months,
  coverageNote,
  coverage,
}: {
  months: { label: string; monthlyGbp: number; count: number }[];
  coverageNote: string;
  coverage: number;
}) {
  const [mode, setMode] = useState<'monthly' | 'annualised'>('monthly');
  const scale = mode === 'monthly' ? 1 : 12;

  return (
    <BentoTile col={8} row={4} accent>
      <TileHeader
        title="Cost over time"
        subtitle="Recurring run-rate of the whole portfolio, rebuilt month by month from recorded price changes"
        icon={LineChart}
        action={
          <Segmented
            size="xs"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'monthly', label: 'Monthly' },
              { value: 'annualised', label: 'Annualised' },
            ]}
          />
        }
      />
      <TileBody>
        <ChartFrame
          height={196}
          caption={
            <>
              {coverageNote}
              {coverage < 0.6 ? ' Recording price changes as they happen is what makes this line trustworthy.' : ''}
            </>
          }
          table={
            <MiniTable
              head={['Month', mode === 'monthly' ? 'Run-rate / month' : 'Annualised', 'Subscriptions']}
              rows={months.map((m) => [m.label, formatMoney(m.monthlyGbp * scale), m.count])}
            />
          }
        >
          <TrendChart points={months.map((m) => ({ label: m.label, value: m.monthlyGbp * scale, meta: `${m.count} subscriptions` }))} height={196} />
        </ChartFrame>
      </TileBody>
    </BentoTile>
  );
}

// ────────────────────────────────────────────────────────── Department split ──

export function DepartmentTile({
  data,
}: {
  data: { id: string; name: string; code: string; color: string; monthlyGbp: number; subscriptionCount: number; sharedCount: number; perHeadMonthly: number | null }[];
}) {
  return (
    <BentoTile col={4} row={4}>
      <TileHeader
        title="Cost per department"
        subtitle="Shared subscriptions are split by the method set on each one"
        icon={Layers}
        action={
          <LinkButton href="/departments" size="xs" variant="ghost" iconRight={ArrowUpRight}>
            Detail
          </LinkButton>
        }
      />
      <TileBody>
        {data.length === 0 ? (
          <EmptyState icon={Layers} title="No departments yet" description="Add departments, then attach subscriptions to them." compact />
        ) : (
          <ChartFrame
            tableOnly
            caption="Shared subscriptions are split by the method set on each one, so these figures reconcile to the portfolio total exactly."
            // Decimals are fixed per column rather than left to the default,
            // which picks them per value and printed "£3,083" directly above
            // "£906.45" in the same column. Whole pounds for the spend columns;
            // per-head keeps its pence, where a pound is a lot.
            table={
              <MiniTable
                head={['Department', 'Monthly', 'Annual', 'Subs', 'Per head']}
                rows={data.map((d) => [
                  d.name,
                  formatMoney(d.monthlyGbp, 'GBP', { decimals: 0 }),
                  formatMoney(d.monthlyGbp * 12, 'GBP', { decimals: 0 }),
                  d.subscriptionCount,
                  d.perHeadMonthly != null ? formatMoney(d.perHeadMonthly, 'GBP', { decimals: 2 }) : '—',
                ])}
              />
            }
          >
            {null}
          </ChartFrame>
        )}
      </TileBody>
    </BentoTile>
  );
}

// ─────────────────────────────────────────────────────────────── Where money ──

export function SpendMapTile({
  data,
}: {
  data: { key: string; label: string; value: number; group: string; categoryIndex: number }[];
}) {
  const [limit, setLimit] = useState<'12' | 'all'>('12');
  const shown = useMemo(() => {
    const sorted = [...data].sort((a, b) => b.value - a.value);
    return limit === '12' ? sorted.slice(0, 12) : sorted;
  }, [data, limit]);

  const legend = useMemo(() => {
    const seen = new Map<string, { label: string; color: string; value: number }>();
    shown.forEach((d) => {
      const cur = seen.get(d.group) ?? { label: d.group, color: colorForIndex(d.categoryIndex), value: 0 };
      cur.value += d.value;
      seen.set(d.group, cur);
    });
    return [...seen.values()]
      .sort((a, b) => b.value - a.value)
      .slice(0, 6)
      .map((l) => ({ label: l.label, color: l.color, value: formatMoney(l.value, 'GBP', { compact: true }) }));
  }, [shown]);

  return (
    <BentoTile col={7} row={4}>
      <TileHeader
        title="Where the money goes"
        subtitle="Area is monthly cost; colour is category"
        icon={Boxes}
        action={
          <Segmented
            size="xs"
            value={limit}
            onChange={setLimit}
            options={[
              { value: '12', label: 'Top 12' },
              { value: 'all', label: 'All' },
            ]}
          />
        }
      />
      <TileBody>
        {shown.length === 0 ? (
          <EmptyState icon={Boxes} title="Nothing to map yet" compact />
        ) : (
          <ChartFrame
            legend={legend}
            height={230}
            caption="Each rectangle is one subscription, sized by monthly cost. Hover for the annual figure and its share of the total."
            table={
              <MiniTable
                head={['Subscription', 'Category', 'Monthly', 'Annual']}
                rows={shown.map((d) => [d.label, d.group, formatMoney(d.value), formatMoney(d.value * 12)])}
              />
            }
          >
            <Treemap
              height={230}
              data={shown.map((d) => ({ key: d.key, label: d.label, value: d.value, group: d.group, color: colorForIndex(d.categoryIndex) }))}
            />
          </ChartFrame>
        )}
      </TileBody>
    </BentoTile>
  );
}

// ──────────────────────────────────────────────────────────── Renewal runway ──

export function RenewalRunwayTile({ items, total90 }: { items: TimelineItem[]; total90: number }) {
  return (
    <BentoTile col={5} row={4}>
      <TileHeader
        title="Payment runway"
        subtitle={`${formatMoney(total90)} due over the next 13 weeks`}
        icon={CalendarClock}
        action={
          <LinkButton href="/renewals" size="xs" variant="ghost" iconRight={ArrowUpRight}>
            All renewals
          </LinkButton>
        }
      />
      <TileBody>
        {items.length === 0 ? (
          <EmptyState icon={CalendarClock} title="No renewals scheduled" description="Add renewal dates to subscriptions to populate this." compact />
        ) : (
          <ChartFrame
            tableOnly
            height={160}
            caption={`Every payment falling due over the next 13 weeks, earliest first.${items.length > 40 ? ` Showing the first 40 of ${items.length}.` : ''}`}
            table={<MiniTable head={['Subscription', 'Due in', 'Amount']} rows={items.slice(0, 40).map((i) => [i.name, relativeDays(i.days), formatMoney(i.amountGbp)])} />}
          >
            {null}
          </ChartFrame>
        )}
      </TileBody>
    </BentoTile>
  );
}

// ───────────────────────────────────────────────────────────────── Card risk ──

export function CardRiskTile({
  cards,
}: {
  cards: { id: string; label: string; last4: string; type: string; currentBalance: number | null; due30: number; shortfall30: number | null; riskLevel: string; riskReason: string; nextChargeDate: Date | null }[];
}) {
  const ranked = [...cards].sort((a, b) => {
    const order = { URGENT: 0, ACTION: 1, WATCH: 2, NONE: 3 } as Record<string, number>;
    return (order[a.riskLevel] ?? 4) - (order[b.riskLevel] ?? 4);
  });
  const worst = ranked[0];
  const needsAction = ranked.filter((c) => c.riskLevel === 'URGENT' || c.riskLevel === 'ACTION');

  return (
    <BentoTile col={4} row={4} className={needsAction.length ? 'pulse-urgent' : undefined}>
      <TileHeader
        title="Card top-up watch"
        subtitle="The thing you currently have to chase people about"
        icon={CreditCard}
        action={
          <LinkButton href="/cards" size="xs" variant="ghost" iconRight={ArrowUpRight}>
            Cards
          </LinkButton>
        }
      />
      <TileBody className="space-y-2.5">
        {!worst ? (
          <EmptyState icon={CreditCard} title="No cards recorded" description="Add the cards you pay subscriptions with to enable shortfall detection." compact />
        ) : (
          <>
            {needsAction.length > 0 ? (
              <div
                className="rounded-[var(--radius-md)] border p-3"
                style={{ background: 'var(--danger-bg)', borderColor: 'var(--danger-border)' }}
              >
                <p className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--danger)' }}>
                  <AlertTriangle size={13} strokeWidth={2.4} aria-hidden />
                  {needsAction.length} card{needsAction.length === 1 ? '' : 's'} need funding
                </p>
                <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {worst.riskReason}
                </p>
              </div>
            ) : null}

            <ul className="space-y-2.5">
              {ranked.slice(0, 5).map((c) => {
                const tone = c.riskLevel === 'URGENT' || c.riskLevel === 'ACTION' ? 'danger' : c.riskLevel === 'WATCH' ? 'warning' : 'positive';
                const cover = c.currentBalance != null && c.due30 > 0 ? Math.min(100, (c.currentBalance / c.due30) * 100) : null;
                return (
                  <li key={c.id}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                        {c.label} <span style={{ color: 'var(--text-tertiary)' }}>•••• {c.last4}</span>
                      </span>
                      <Badge tone={tone} size="xs">
                        {c.riskLevel === 'NONE' ? 'Funded' : c.riskLevel === 'WATCH' ? 'Watch' : c.riskLevel === 'ACTION' ? 'Top up' : 'Urgent'}
                      </Badge>
                    </div>
                    {cover != null ? (
                      <div className="mt-1.5">
                        <Meter value={cover} max={100} tone={tone === 'positive' ? 'positive' : tone} height={5} />
                        <p className="mt-1 text-meta" style={{ color: 'var(--text-tertiary)' }}>
                          {formatMoney(c.currentBalance ?? 0)} balance against {formatMoney(c.due30)} due in 30 days
                        </p>
                      </div>
                    ) : (
                      <p className="mt-1 text-meta" style={{ color: 'var(--text-tertiary)' }}>
                        {c.riskReason}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </TileBody>
    </BentoTile>
  );
}

// ──────────────────────────────────────────────────────────────────  Movers ──

export function MoversTile({
  movers,
}: {
  movers: { subscriptionId: string; name: string; effectiveDate: Date; deltaGbp: number; percent: number | null; reason: string | null }[];
}) {
  const top = movers.slice(0, 8);
  return (
    <BentoTile col={6} row={3}>
      <TileHeader title="Biggest cost changes" subtitle="Recorded price changes in the last twelve months, by monthly impact" icon={TrendingUp} />
      <TileBody>
        {top.length === 0 ? (
          <EmptyState
            icon={TrendingUp}
            title="No price changes recorded yet"
            description="When you change a price in the register, the previous value is kept automatically and appears here."
            compact
          />
        ) : (
          <ChartFrame
            caption="Bars show the effect on monthly cost. Increases sit to the right of the axis, decreases to the left."
            table={
              <MiniTable
                head={['Subscription', 'Effective', 'Monthly change', 'Percent']}
                rows={top.map((m) => [m.name, formatDate(m.effectiveDate), formatMoney(m.deltaGbp), m.percent != null ? `${m.percent >= 0 ? '+' : ''}${m.percent.toFixed(1)}%` : '—'])}
              />
            }
          >
            <DivergingBars
              data={top.map((m) => ({
                key: `${m.subscriptionId}-${m.effectiveDate.toISOString()}`,
                label: m.name,
                value: m.deltaGbp,
                sublabel: `${formatDate(m.effectiveDate)}${m.reason ? ` — ${m.reason}` : ''}`,
              }))}
            />
          </ChartFrame>
        )}
      </TileBody>
    </BentoTile>
  );
}

// ────────────────────────────────────────────────────────────── Observations ──

export function ObservationsTile({ observations }: { observations: Observation[] }) {
  const [expanded, setExpanded] = useState<string | null>(observations[0]?.id ?? null);

  return (
    <BentoTile col={6} row={3}>
      <TileHeader
        title="Statistical observations"
        subtitle="Generated from the register — each states its method and sample size"
        icon={Sigma}
      />
      <TileBody>
        <ul className="space-y-1.5">
          {observations.slice(0, 6).map((o) => {
            const open = expanded === o.id;
            return (
              <li key={o.id} className="rounded-[var(--radius-md)] border" style={{ borderColor: 'var(--border-subtle)' }}>
                <button
                  onClick={() => setExpanded(open ? null : o.id)}
                  className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left"
                  aria-expanded={open}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                      {o.title}
                    </span>
                  </span>
                  {o.metric ? (
                    <Badge tone={o.tone === 'neutral' ? 'neutral' : o.tone} size="xs" showIcon={o.tone !== 'neutral'}>
                      {o.metric}
                    </Badge>
                  ) : null}
                </button>
                {open ? (
                  <div className="px-3 pb-2.5">
                    {/* Observations are the longest prose in the interface and
                        sit in a full-width tile, so they need the cap the other
                        prose roles already carry. */}
                    <p className="max-w-[58ch] text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                      {o.body}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <ReliabilityTag reliability={o.reliability} n={o.n} />
                      <InfoTip label="Method">
                        <strong style={{ color: 'var(--text-primary)' }}>How this is calculated</strong>
                        <p className="mt-1">{o.method}</p>
                        <p className="mt-1.5" style={{ color: 'var(--text-tertiary)' }}>
                          Based on {o.n} data point{o.n === 1 ? '' : 's'}.
                        </p>
                      </InfoTip>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </TileBody>
    </BentoTile>
  );
}

// ───────────────────────────────────────────────────────────── Shared costs ──

export function SharedFlowTile({ links }: { links: FlowLink[] }) {
  if (!links.length) return null;
  const height = Math.max(260, Math.min(620, links.length * 34));
  return (
    <BentoTile col={12} row={Math.ceil((height + 100) / 84)}>
      <TileHeader
        title="Shared subscriptions and who carries the cost"
        subtitle="Ribbon thickness is the monthly amount allocated to each department"
        icon={Share2}
        action={
          <LinkButton href="/departments" size="xs" variant="ghost" iconRight={ArrowUpRight}>
            Department detail
          </LinkButton>
        }
      />
      <TileBody>
        <ChartFrame
          height={height}
          caption="Only subscriptions used by more than one department appear here — the spend that is easy to lose track of when each team buys its own tools. Bands too small to label are named in the tooltip and the table view."
          table={
            <MiniTable
              head={['Subscription', 'Department', 'Share', 'Monthly']}
              rows={links.map((l) => [l.subscriptionName, l.departmentName, `${(l.share * 100).toFixed(1)}%`, formatMoney(l.amount)])}
            />
          }
        >
          <SharedCostFlow links={links} height={height} />
        </ChartFrame>
      </TileBody>
    </BentoTile>
  );
}

// ───────────────────────────────────────────────────────────────── Stat tiles ──

export function HeadlineTiles({
  annualRunRate,
  annualCash,
  monthly,
  twelveMonthChange,
  activeCount,
  totalCount,
  estimatedShare,
  estimatedAmount,
  sharedCount,
  sharedMonthly,
  dueNext30,
  renewalsNext30,
}: {
  annualRunRate: number;
  annualCash: number;
  monthly: number;
  twelveMonthChange: number | null;
  activeCount: number;
  totalCount: number;
  estimatedShare: number;
  estimatedAmount: number;
  sharedCount: number;
  sharedMonthly: number;
  dueNext30: number;
  renewalsNext30: number;
}) {
  return (
    <>
      <BentoTile col={4} row={2} accent>
        <TileBody className="pt-4">
          <Stat
            size="lg"
            label="Annual run-rate"
            value={formatMoney(annualRunRate, 'GBP', { decimals: 0 })}
            delta={twelveMonthChange}
            deltaLabel="over 12 months"
            hint={
              <>
                Recurring commitment if nothing changes. Cash out over the next twelve months, including one-off purchases, is{' '}
                <strong style={{ color: 'var(--text-secondary)' }}>{formatMoney(annualCash, 'GBP', { decimals: 0 })}</strong>.
              </>
            }
          />
        </TileBody>
      </BentoTile>

      <BentoTile col={2} row={2}>
        <TileBody className="pt-4">
          <Stat label="Monthly" value={formatMoney(monthly, 'GBP', { decimals: 0 })} hint="All billing models normalised to a monthly equivalent." />
        </TileBody>
      </BentoTile>

      <BentoTile col={2} row={2}>
        <TileBody className="pt-4">
          <Stat
            label="Subscriptions"
            value={activeCount}
            unit={`of ${totalCount}`}
            hint={`${totalCount - activeCount} are on trial, paused or cancelled.`}
          />
        </TileBody>
      </BentoTile>

      <BentoTile col={2} row={2}>
        <TileBody className="pt-4">
          <Stat
            label="Shared cost"
            value={formatMoney(sharedMonthly, 'GBP', { decimals: 0 })}
            hint={`${sharedCount} subscription${sharedCount === 1 ? '' : 's'} split across departments.`}
          />
        </TileBody>
      </BentoTile>

      <BentoTile col={2} row={2}>
        <TileBody className="pt-4">
          <Stat
            label="Due in 30 days"
            value={formatMoney(dueNext30, 'GBP', { decimals: 0 })}
            tone={dueNext30 > 0 ? undefined : undefined}
            hint={`${renewalsNext30} payment${renewalsNext30 === 1 ? '' : 's'} scheduled.`}
          />
        </TileBody>
      </BentoTile>

      <BentoTile col={12} row={1}>
        {/* Stacks below `sm`. Held as one row, the label and meter were
            squeezed to nothing while the fixed-width legend kept its space and
            printed straight over them. */}
        <TileBody className="flex flex-col items-stretch gap-3 pt-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                Confidence in the headline figure
              </p>
              <InfoTip>
                <strong style={{ color: 'var(--text-primary)' }}>Contracted against estimated</strong>
                <p className="mt-1">
                  Fixed recurring subscriptions have a contracted price, so their contribution is exact. Usage-based and credit
                  top-up subscriptions do not, so their contribution is estimated from recorded usage where available, and from
                  your own forecast where it is not.
                </p>
                <p className="mt-1.5">
                  Recording actual usage each month moves spend from the estimated bar into the contracted one.
                </p>
              </InfoTip>
            </div>
            <div className="mt-2">
              <Meter value={monthly - estimatedAmount} max={monthly || 1} tone="positive" height={7} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:shrink-0">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: 'var(--positive)' }} aria-hidden />
              <span style={{ color: 'var(--text-secondary)' }}>
                {formatMoney(monthly - estimatedAmount)} contracted
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border-strong)' }} aria-hidden />
              <span style={{ color: 'var(--text-secondary)' }}>
                {formatMoney(estimatedAmount)} estimated ({estimatedShare.toFixed(0)}%)
              </span>
            </span>
          </div>
        </TileBody>
      </BentoTile>
    </>
  );
}

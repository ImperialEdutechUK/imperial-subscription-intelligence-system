'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CalendarClock, CalendarDays, Check, Copy, Hand, RefreshCw, Search, X } from 'lucide-react';
import { Badge, BentoTile, Chip, EmptyState, Stat, TileBody, TileHeader } from '@/components/ui/kit';
import { Button, Input, Modal, Segmented, Select, Textarea, LinkButton } from '@/components/ui/controls';
import { ChartFrame, MiniTable } from '@/components/charts/ChartFrame';
import { formatMoney } from '@/lib/money';
import { formatDate, relativeDays } from '@/lib/utils';

export interface RenewalRow {
  subscriptionId: string;
  name: string;
  vendor: string | null;
  /** ISO date, already normalised to the day the charge falls. */
  date: string;
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

export interface RenewalDepartment {
  code: string;
  name: string;
  color: string;
}

type Horizon = '30' | '60' | '90' | '180';

const HORIZONS: { value: Horizon; label: string; title: string }[] = [
  { value: '30', label: '30 days', title: 'Payments falling due in the next 30 days' },
  { value: '60', label: '60 days', title: 'Payments falling due in the next 60 days' },
  { value: '90', label: '90 days', title: 'Payments falling due in the next 90 days' },
  { value: '180', label: '180 days', title: 'Payments falling due in the next 180 days' },
];

/**
 * The bands come straight from the portfolio model rather than being recomputed
 * here, so the wording on this page and the urgency used everywhere else cannot
 * drift apart.
 */
const BANDS: { key: RenewalRow['urgency']; label: string }[] = [
  { key: 'OVERDUE', label: 'Overdue' },
  { key: 'CRITICAL', label: 'Next 7 days' },
  { key: 'SOON', label: '8–21 days' },
  { key: 'UPCOMING', label: '22–60 days' },
  { key: 'DISTANT', label: 'Beyond 60 days' },
];

const cardLine = (r: RenewalRow) => (r.cardLabel ? `${r.cardLabel} •••• ${r.cardLast4 ?? '????'}` : 'No card recorded');

export function RenewalsView({
  rows,
  departments,
  compiledBy,
}: {
  rows: RenewalRow[];
  departments: RenewalDepartment[];
  compiledBy: string | null;
}) {
  const [horizon, setHorizon] = useState<Horizon>('30');
  const [query, setQuery] = useState('');
  const [dept, setDept] = useState('');
  const [topUpOnly, setTopUpOnly] = useState(false);
  const [copied, setCopied] = useState(false);
  const [fallbackText, setFallbackText] = useState<string | null>(null);

  const days = Number(horizon);
  const deptColor = useMemo(() => new Map(departments.map((d) => [d.code, d])), [departments]);

  // Everything falling inside the horizon, filters aside. Overdue payments are
  // always included: they are the most urgent thing on the page.
  const inHorizon = useMemo(() => rows.filter((r) => r.days <= days), [rows, days]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inHorizon.filter((r) => {
      if (q) {
        const hay = [r.name, r.vendor, r.cardLabel, ...r.departments].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (dept && !r.departments.includes(dept)) return false;
      if (topUpOnly && !r.cardNeedsTopUp) return false;
      return true;
    });
  }, [inHorizon, query, dept, topUpOnly]);

  const totals = useMemo(
    () => ({
      due: filtered.reduce((a, r) => a + r.amountGbp, 0),
      atRisk: filtered.filter((r) => r.cardNeedsTopUp).reduce((a, r) => a + r.amountGbp, 0),
      atRiskCount: filtered.filter((r) => r.cardNeedsTopUp).length,
    }),
    [filtered],
  );

  const mostUrgent = filtered[0] ?? null;
  const activeFilters = (query ? 1 : 0) + (dept ? 1 : 0) + (topUpOnly ? 1 : 0);
  const needTopUp = useMemo(() => inHorizon.filter((r) => r.cardNeedsTopUp), [inHorizon]);

  const clearFilters = () => {
    setQuery('');
    setDept('');
    setTopUpOnly(false);
  };

  const grouped = useMemo(
    () =>
      BANDS.map((b) => {
        const items = filtered.filter((r) => r.urgency === b.key);
        return { ...b, items, total: items.reduce((a, r) => a + r.amountGbp, 0) };
      }).filter((g) => g.items.length > 0),
    [filtered],
  );

  /**
   * The message that replaces the manual chase. It is grouped by card because
   * that is the unit somebody in Finance actually acts on — one transfer per
   * card, not one per subscription.
   */
  const buildReminder = () => {
    const today = formatDate(new Date(), 'long');
    const heading = `Card top-ups needed before renewals — next ${days} days`;

    if (needTopUp.length === 0) {
      return `${heading}\n\nNothing needs a card top-up in this period. Every payment falling due is either on a card that covers it or on a card that holds no float.`;
    }

    const byCard = new Map<string, RenewalRow[]>();
    needTopUp.forEach((r) => {
      const key = cardLine(r);
      byCard.set(key, [...(byCard.get(key) ?? []), r]);
    });

    const lines: string[] = [
      heading,
      '',
      `The payments below fall due in the next ${days} days on cards that will not cover them at the balance we currently have on record. If a card is not topped up before the date shown, the payment fails and the software stops working until it is put right.`,
      '',
    ];

    [...byCard.entries()].forEach(([card, items]) => {
      const total = items.reduce((a, r) => a + r.amountGbp, 0);
      lines.push(`${card} — ${formatMoney(total)} across ${items.length} payment${items.length === 1 ? '' : 's'}`);
      items.forEach((r) => {
        lines.push(`  - ${formatDate(r.date)} — ${r.name} — ${formatMoney(r.amountGbp)}${r.estimated ? ' (estimated)' : ''}`);
      });
      lines.push('');
    });

    const grand = needTopUp.reduce((a, r) => a + r.amountGbp, 0);
    lines.push(
      `Total across every card listed: ${formatMoney(grand)}.`,
      '',
      `Compiled from the subscription register${compiledBy ? ` by ${compiledBy}` : ''} on ${today}. Amounts marked as estimated are usage-based or credit-based and may settle a little higher or lower. Balances are as last recorded in the register, so please check the card itself before transferring.`,
    );

    return lines.join('\n');
  };

  const copyReminder = async () => {
    const text = buildReminder();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard access is refused outside a secure context, so the text is
      // offered for manual copying rather than silently failing.
      setFallbackText(text);
    }
  };

  return (
    <div className="space-y-4">
      {/* ── One filter row above everything it scopes ─────────────────── */}
      <div
        className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border p-2"
        style={{ background: 'var(--surface-raised)', borderColor: 'var(--border-subtle)' }}
      >
        <Segmented size="sm" value={horizon} onChange={setHorizon} options={HORIZONS} />

        <div className="relative min-w-[180px] flex-1">
          <Search size={13} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} aria-hidden />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, vendor, card, department…"
            className="h-8 pl-7"
            aria-label="Search renewals"
          />
        </div>

        <Select value={dept} onChange={(e) => setDept(e.target.value)} className="h-8 w-auto min-w-[130px]" aria-label="Filter by department">
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.code} value={d.code}>
              {d.name}
            </option>
          ))}
        </Select>

        <Button size="xs" variant={topUpOnly ? 'primary' : 'secondary'} icon={AlertTriangle} onClick={() => setTopUpOnly((v) => !v)}>
          Needs card top-up only
        </Button>

        {activeFilters > 0 ? (
          <Button size="xs" variant="ghost" icon={X} onClick={clearFilters}>
            Clear
          </Button>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          <LinkButton href="/api/calendar.ics" download size="xs" icon={CalendarDays}>
            Download calendar file
          </LinkButton>
          <Button
            size="xs"
            icon={copied ? Check : Copy}
            onClick={copyReminder}
            title={`Copies a plain-text summary of every payment in the next ${days} days that sits on a card needing a top-up, whatever the other filters are set to. Paste it straight into Teams.`}
          >
            {copied ? 'Copied' : 'Copy reminder text'}
          </Button>
        </div>
      </div>

      <span className="sr-only" role="status">
        {copied ? 'The reminder text has been copied to the clipboard.' : ''}
      </span>

      {/* ── Headline figures and the runway ───────────────────────────── */}
      <div className="bento">
        <BentoTile col={3} row={2} accent>
          <TileBody className="pt-4">
            <Stat
              label={`Due in ${days} days`}
              value={formatMoney(totals.due, 'GBP', { decimals: 0 })}
              hint="Money leaving the account over this period, converted to GBP. Overdue payments are included."
            />
          </TileBody>
        </BentoTile>

        <BentoTile col={3} row={2}>
          <TileBody className="pt-4">
            <Stat
              label="Payments"
              value={filtered.length}
              hint={filtered.length === inHorizon.length ? 'Every payment falling due in this period.' : `Filtered from ${inHorizon.length} in this period.`}
            />
          </TileBody>
        </BentoTile>

        <BentoTile col={3} row={2}>
          <TileBody className="pt-4">
            <Stat
              label="On a card that will not cover it"
              value={formatMoney(totals.atRisk, 'GBP', { decimals: 0 })}
              tone={totals.atRisk > 0 ? 'danger' : undefined}
              hint={
                totals.atRisk > 0
                  ? `${totals.atRiskCount} payment${totals.atRiskCount === 1 ? '' : 's'} charged to a card whose recorded balance falls short. These are the ones to chase.`
                  : 'Every payment in this period sits on a card that covers it, or on one that holds no float.'
              }
            />
          </TileBody>
        </BentoTile>

        <BentoTile col={3} row={2}>
          <TileBody className="pt-4">
            {/* The figure is the time left, because that is what decides
                whether this needs acting on today. The item itself is named
                underneath, where a long name has room to wrap. */}
            <Stat
              label="Most urgent"
              value={mostUrgent ? relativeDays(mostUrgent.days) : 'Nothing due'}
              tone={mostUrgent && mostUrgent.days <= 7 ? 'danger' : undefined}
              hint={
                mostUrgent
                  ? `${mostUrgent.name} — ${formatMoney(mostUrgent.amountGbp)} on ${formatDate(mostUrgent.date)}, charged to ${cardLine(mostUrgent)}.`
                  : 'No payments fall due in this period.'
              }
            />
          </TileBody>
        </BentoTile>

        <BentoTile col={12} row={3}>
          <TileHeader
            title="Payment runway"
            subtitle={`${formatMoney(totals.due)} due over the next ${days} days, bucketed by week`}
            icon={CalendarClock}
          />
          <TileBody>
            {filtered.length === 0 ? (
              <EmptyState
                icon={CalendarClock}
                title="Nothing due in this period"
                description={
                  activeFilters > 0
                    ? 'No payments match the current filters. Clear them to see everything falling due.'
                    : `No payments fall due in the next ${days} days. Try a longer horizon to see what is coming after that.`
                }
                compact
              />
            ) : (
              <ChartFrame
                tableOnly
                height={150}
                caption={`Every payment falling due in the next ${days} days, earliest first.${filtered.length > 60 ? ` Showing the first 60 of ${filtered.length}.` : ''}`}
                table={
                  <MiniTable
                    head={['Subscription', 'Due', 'Amount', 'Card']}
                    rows={filtered
                      .slice(0, 60)
                      .map((r) => [r.name, `${formatDate(r.date)} · ${relativeDays(r.days)}`, formatMoney(r.amountGbp), cardLine(r)])}
                  />
                }
              >
                {null}
              </ChartFrame>
            )}
          </TileBody>
        </BentoTile>
      </div>

      {/* ── The list, grouped by how soon it lands ─────────────────────── */}
      {grouped.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border" style={{ background: 'var(--surface-raised)', borderColor: 'var(--border-subtle)' }}>
          <EmptyState
            icon={CalendarClock}
            title={rows.length === 0 ? 'No renewal dates recorded' : activeFilters > 0 ? 'Nothing matches those filters' : `Nothing falls due in the next ${days} days`}
            description={
              rows.length === 0
                ? 'Renewal dates are set on each subscription in the register. Without them nothing can be scheduled or chased.'
                : activeFilters > 0
                  ? undefined
                  : 'Try a longer horizon to see what is coming after this period.'
            }
            action={
              rows.length === 0 ? (
                <LinkButton href="/subscriptions" size="sm">
                  Open the register
                </LinkButton>
              ) : activeFilters > 0 ? (
                <Button size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-lg)] border" style={{ background: 'var(--surface-raised)', borderColor: 'var(--border-subtle)' }}>
          {grouped.map((g) => (
            <section key={g.key} aria-labelledby={`renewal-band-${g.key}`}>
              <header
                className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2"
                style={{ background: 'var(--surface-sunken)', borderBottom: '1px solid var(--border-subtle)' }}
              >
                <h3 id={`renewal-band-${g.key}`} className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {g.label}
                  <span className="ml-2 font-normal" style={{ color: 'var(--text-tertiary)' }}>
                    {g.items.length} payment{g.items.length === 1 ? '' : 's'}
                  </span>
                </h3>
                <span className="tabular text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {formatMoney(g.total)}
                </span>
              </header>

              <ul>
                {g.items.map((r) => (
                  <li key={`${r.subscriptionId}-${r.date}`}>
                    <Link
                      href="/subscriptions"
                      className="flex flex-wrap items-start gap-x-3 gap-y-1 px-3 py-2.5 transition-colors hover:bg-[var(--surface-hover)]"
                      style={{ borderBottom: '1px solid var(--border-subtle)' }}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            {r.name}
                          </span>
                          {r.estimated ? (
                            <Badge tone="warning" size="xs">
                              Estimated
                            </Badge>
                          ) : null}
                          {r.cardNeedsTopUp ? (
                            <Badge tone="danger" size="xs">
                              Card needs topping up
                            </Badge>
                          ) : null}
                        </span>

                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-meta" style={{ color: 'var(--text-tertiary)' }}>
                          {r.vendor ? <span className="truncate">{r.vendor}</span> : null}
                          <span>
                            {formatDate(r.date)} · {relativeDays(r.days)}
                          </span>
                          <span className="truncate">{cardLine(r)}</span>
                          <span className="inline-flex items-center gap-1">
                            {r.autoRenew ? <RefreshCw size={10} strokeWidth={2.2} aria-hidden /> : <Hand size={10} strokeWidth={2.2} aria-hidden />}
                            {r.autoRenew ? 'Renews automatically' : 'Manual — somebody has to act'}
                          </span>
                        </span>

                        {r.departments.length ? (
                          <span className="mt-1 flex flex-wrap gap-1">
                            {r.departments.map((code) => {
                              const d = deptColor.get(code);
                              return (
                                <Chip key={code} color={d?.color} title={d?.name ?? 'Not allocated to a department'}>
                                  {code}
                                </Chip>
                              );
                            })}
                          </span>
                        ) : null}
                      </span>

                      <span className="tabular shrink-0 text-right">
                        <span className="block text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {formatMoney(r.amountGbp)}
                        </span>
                        {r.currency !== 'GBP' ? (
                          <span className="block text-meta" style={{ color: 'var(--text-tertiary)' }}>
                            {formatMoney(r.amountNative, r.currency)} {r.currency}
                          </span>
                        ) : null}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {/* ── Clipboard fallback ─────────────────────────────────────────── */}
      <Modal
        open={!!fallbackText}
        onClose={() => setFallbackText(null)}
        title="Copy the reminder text"
        width={620}
        footer={
          <div className="flex justify-end">
            <Button onClick={() => setFallbackText(null)}>Close</Button>
          </div>
        }
      >
        <p className="mb-2 text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          The browser would not let the page write to the clipboard, which usually means the site is not being served over
          HTTPS. Select the text below and copy it manually.
        </p>
        <Textarea readOnly rows={16} value={fallbackText ?? ''} aria-label="Reminder text" />
      </Modal>
    </div>
  );
}

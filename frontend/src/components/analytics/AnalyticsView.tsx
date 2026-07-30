'use client';

import { useMemo, useState } from 'react';
import { BarChart3, Layers, PieChart, Sigma, TrendingUp } from 'lucide-react';
import { BentoTile, TileHeader, TileBody, Badge, EmptyState, ReliabilityTag, colorForIndex, StatFootnote } from '@/components/ui/kit';
import { InfoTip, Segmented } from '@/components/ui/controls';
import { ChartFrame, MiniTable } from '@/components/charts/ChartFrame';
import { RankedBars, niceTicks, barPath, useHoverTooltip, TooltipTitle, TooltipRow, smoothPath } from '@/components/charts/primitives';
import { TrendChart } from '@/components/charts/TrendChart';
import { formatMoney } from '@/lib/money';
import type { Observation } from '@/server/observations';

export interface AnalyticsData {
  months: { label: string; monthlyGbp: number; count: number }[];
  coverageNote: string;
  byCategory: { key: string; label: string; monthlyGbp: number; annualGbp: number; count: number; index: number }[];
  byBillingModel: { key: string; label: string; monthlyGbp: number; count: number }[];
  values: number[];
  names: string[];
  stats: {
    n: number;
    total: number;
    mean: number | null;
    median: number | null;
    stdev: number | null;
    cv: number | null;
    q1: number | null;
    q3: number | null;
    min: number;
    max: number;
    hhi: number | null;
    top3Share: number | null;
    top5Share: number | null;
    gini: number | null;
    pareto: { count: number; share: number } | null;
    methods: Record<string, string>;
    reliability: Record<string, 'OK' | 'LOW_N' | 'INSUFFICIENT'>;
  };
  observations: Observation[];
}

// ─────────────────────────────────────────────────────────────── histogram ──

function Histogram({ values, bins = 8 }: { values: number[]; bins?: number }) {
  const { ref, show, hide, node } = useHoverTooltip();
  const W = 600;
  const H = 190;
  const PAD = { top: 12, right: 10, bottom: 28, left: 40 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const { buckets, maxCount } = useMemo(() => {
    if (!values.length) return { buckets: [], maxCount: 1 };
    const min = Math.min(...values);
    const max = Math.max(...values);
    const width = (max - min) / bins || 1;
    const b = Array.from({ length: bins }, (_, i) => ({
      from: min + i * width,
      to: min + (i + 1) * width,
      count: 0,
    }));
    values.forEach((v) => {
      const idx = Math.min(bins - 1, Math.max(0, Math.floor((v - min) / width)));
      b[idx].count += 1;
    });
    return { buckets: b, maxCount: Math.max(...b.map((x) => x.count), 1) };
  }, [values, bins]);

  if (!buckets.length) return null;
  const bandW = plotW / buckets.length;
  const barW = Math.max(4, bandW - 3);

  return (
    <div ref={ref} className="relative h-full w-full">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full" style={{ minHeight: H }} role="img" aria-label="Distribution of monthly subscription costs">
        {niceTicks(maxCount, 3).map((t) => {
          const y = PAD.top + plotH - (t / maxCount) * plotH;
          return (
            <g key={t}>
              <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="var(--chart-grid)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              <text x={PAD.left - 6} y={y + 3} textAnchor="end" fontSize={9} fill="var(--chart-axis)">
                {t}
              </text>
            </g>
          );
        })}
        {buckets.map((b, i) => {
          const h = (b.count / maxCount) * plotH;
          const x = PAD.left + i * bandW + (bandW - barW) / 2;
          const y = PAD.top + plotH - h;
          return (
            <g
              key={i}
              onMouseMove={(e) =>
                show(
                  e.clientX,
                  e.clientY,
                  <>
                    <TooltipTitle>
                      {formatMoney(b.from, 'GBP', { compact: true })} – {formatMoney(b.to, 'GBP', { compact: true })}
                    </TooltipTitle>
                    <TooltipRow label="Subscriptions" value={String(b.count)} color="var(--chart-1)" />
                  </>,
                )
              }
              onMouseLeave={hide}
            >
              <rect x={PAD.left + i * bandW} y={PAD.top} width={bandW} height={plotH} fill="transparent" />
              {b.count > 0 ? <path d={barPath(x, y, barW, h, 4, 'up')} fill="var(--chart-1)" opacity={0.85} /> : null}
            </g>
          );
        })}
        {buckets.map((b, i) =>
          i % 2 === 0 ? (
            <text key={i} x={PAD.left + i * bandW + bandW / 2} y={H - 8} textAnchor="middle" fontSize={8.5} fill="var(--chart-axis)">
              {formatMoney(b.from, 'GBP', { compact: true })}
            </text>
          ) : null,
        )}
      </svg>
      {node}
    </div>
  );
}

// ───────────────────────────────────────────────────────────── Lorenz curve ──

function LorenzCurve({ values }: { values: number[] }) {
  const W = 600;
  const H = 230;
  const PAD = 30;
  const size = Math.min(W, H) - PAD * 2;

  const points = useMemo(() => {
    const sorted = [...values].sort((a, b) => a - b);
    const total = sorted.reduce((a, b) => a + b, 0) || 1;
    let running = 0;
    const pts = [{ x: 0, y: 0 }];
    sorted.forEach((v, i) => {
      running += v;
      pts.push({ x: (i + 1) / sorted.length, y: running / total });
    });
    return pts;
  }, [values]);

  const scaled = points.map((p) => ({ x: PAD + p.x * size, y: PAD + size - p.y * size }));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" style={{ minHeight: H }} role="img" aria-label="Lorenz curve of subscription spend concentration">
      <rect x={PAD} y={PAD} width={size} height={size} fill="none" stroke="var(--chart-grid)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      {/* Line of perfect evenness — every subscription costing the same */}
      <line x1={PAD} y1={PAD + size} x2={PAD + size} y2={PAD} stroke="var(--chart-axis)" strokeWidth={1} vectorEffect="non-scaling-stroke" opacity={0.55} />
      <path d={`${smoothPath(scaled, 0.12)} L${PAD + size},${PAD + size} L${PAD},${PAD + size} Z`} fill="var(--chart-1)" opacity={0.1} />
      <path d={smoothPath(scaled, 0.12)} fill="none" stroke="var(--chart-1)" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
      <text x={PAD} y={PAD + size + 16} fontSize={9} fill="var(--chart-axis)">
        Cheapest
      </text>
      <text x={PAD + size} y={PAD + size + 16} fontSize={9} fill="var(--chart-axis)" textAnchor="end">
        Most expensive
      </text>
      <text x={PAD + size + 6} y={PAD + 4} fontSize={9} fill="var(--chart-axis)">
        100% of spend
      </text>
    </svg>
  );
}

// ────────────────────────────────────────────────────────────────── the view ──

export function AnalyticsView({ data }: { data: AnalyticsData }) {
  const [trendMode, setTrendMode] = useState<'monthly' | 'annualised'>('monthly');
  const s = data.stats;

  if (s.n === 0) {
    return <EmptyState icon={Sigma} title="Nothing to analyse yet" description="Add some subscriptions and these measures will populate." />;
  }

  const statRows: { label: string; value: string; key: string }[] = [
    { key: 'total', label: 'Total monthly spend', value: formatMoney(s.total) },
    { key: 'mean', label: 'Mean subscription cost', value: s.mean != null ? formatMoney(s.mean) : '—' },
    { key: 'median', label: 'Median subscription cost', value: s.median != null ? formatMoney(s.median) : '—' },
    { key: 'stdev', label: 'Standard deviation', value: s.stdev != null ? formatMoney(s.stdev) : '—' },
    { key: 'cv', label: 'Coefficient of variation', value: s.cv != null ? `${s.cv.toFixed(0)}%` : '—' },
    { key: 'quartiles', label: 'Interquartile range', value: s.q1 != null && s.q3 != null ? `${formatMoney(s.q1)} – ${formatMoney(s.q3)}` : '—' },
    { key: 'range', label: 'Range', value: `${formatMoney(s.min)} – ${formatMoney(s.max)}` },
    { key: 'hhi', label: 'Concentration index (HHI)', value: s.hhi != null ? Math.round(s.hhi).toLocaleString('en-GB') : '—' },
    { key: 'top3', label: 'Share held by largest 3', value: s.top3Share != null ? `${s.top3Share.toFixed(1)}%` : '—' },
    { key: 'top5', label: 'Share held by largest 5', value: s.top5Share != null ? `${s.top5Share.toFixed(1)}%` : '—' },
    { key: 'gini', label: 'Gini coefficient', value: s.gini != null ? s.gini.toFixed(3) : '—' },
    { key: 'pareto', label: 'Subscriptions making up 80% of spend', value: s.pareto ? `${s.pareto.count} of ${s.n} (${s.pareto.share.toFixed(0)}%)` : '—' },
  ];

  return (
    <div className="bento">
      {/* ── Descriptive statistics ─────────────────────────────────────── */}
      <BentoTile col={5} row={5} accent>
        <TileHeader
          title="Descriptive statistics"
          subtitle="Monthly cost across every live subscription"
          icon={Sigma}
          action={<Badge tone="neutral" size="xs" showIcon={false}>n = {s.n}</Badge>}
        />
        <TileBody>
          <dl className="text-xs">
            {statRows.map((row) => (
              <div key={row.key} className="flex items-center justify-between gap-3 py-1.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <dt className="flex min-w-0 items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                  <span className="truncate">{row.label}</span>
                  {s.methods[row.key] ? (
                    <InfoTip>
                      <strong style={{ color: 'var(--text-primary)' }}>Method</strong>
                      <p className="mt-1">{s.methods[row.key]}</p>
                      {s.reliability[row.key] && s.reliability[row.key] !== 'OK' ? (
                        <p className="mt-1.5" style={{ color: 'var(--warning)' }}>
                          {s.reliability[row.key] === 'LOW_N'
                            ? 'Small sample — treat this as indicative rather than settled.'
                            : 'There is not enough data for this to be meaningful.'}
                        </p>
                      ) : null}
                    </InfoTip>
                  ) : null}
                </dt>
                <dd className="tabular shrink-0 font-medium" style={{ color: 'var(--text-primary)' }}>
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
          <StatFootnote>
            A subscription portfolio is a small dataset. Measures of spread and concentration are shown because they are useful
            for comparison over time, but at this sample size they move noticeably when a single subscription is added or
            removed. Each one discloses its method above.
          </StatFootnote>
        </TileBody>
      </BentoTile>

      {/* ── Distribution ──────────────────────────────────────────────── */}
      <BentoTile col={7} row={3}>
        <TileHeader title="How subscription costs are distributed" subtitle="Count of subscriptions in each monthly cost band" icon={BarChart3} />
        <TileBody>
          <ChartFrame
            defaultView="table"
            height={190}
            caption={`Bars count subscriptions, not pounds. A long right tail means a few expensive tools alongside many cheap ones — which is the usual shape, and why the median (${s.median != null ? formatMoney(s.median) : '—'}) describes a typical subscription better than the mean (${s.mean != null ? formatMoney(s.mean) : '—'}).`}
            table={<MiniTable head={['Subscription', 'Monthly']} rows={data.names.map((nm, i) => [nm, formatMoney(data.values[i])]).sort((a, b) => String(b[1]).localeCompare(String(a[1])))} />}
          >
            <Histogram values={data.values} />
          </ChartFrame>
        </TileBody>
      </BentoTile>

      {/* ── Concentration ─────────────────────────────────────────────── */}
      <BentoTile col={7} row={4}>
        <TileHeader
          title="Concentration of spend"
          subtitle="How evenly cost is spread across the register"
          icon={PieChart}
          action={
            <InfoTip width={340}>
              <strong style={{ color: 'var(--text-primary)' }}>Reading a Lorenz curve</strong>
              <p className="mt-1">
                Subscriptions are ordered cheapest to most expensive along the bottom. The curve shows the cumulative share of
                spend they account for.
              </p>
              <p className="mt-1.5">
                The straight diagonal is what perfect evenness would look like — every subscription costing the same. The
                further the curve bows away from it, the more the total is driven by a handful of subscriptions. The Gini
                coefficient is twice the area between the two.
              </p>
            </InfoTip>
          }
        />
        <TileBody>
          <ChartFrame
            defaultView="table"
            height={230}
            caption={
              s.pareto
                ? `${s.pareto.count} of ${s.n} subscriptions account for 80% of monthly spend. Gini coefficient ${s.gini?.toFixed(3) ?? '—'}.`
                : undefined
            }
            table={
              <MiniTable
                head={['Measure', 'Value']}
                rows={[
                  ['Largest 3 share', s.top3Share != null ? `${s.top3Share.toFixed(1)}%` : '—'],
                  ['Largest 5 share', s.top5Share != null ? `${s.top5Share.toFixed(1)}%` : '—'],
                  ['HHI', s.hhi != null ? Math.round(s.hhi).toLocaleString('en-GB') : '—'],
                  ['Gini', s.gini != null ? s.gini.toFixed(3) : '—'],
                ]}
              />
            }
          >
            <LorenzCurve values={data.values} />
          </ChartFrame>
        </TileBody>
      </BentoTile>

      {/* ── Trend ─────────────────────────────────────────────────────── */}
      <BentoTile col={5} row={3}>
        <TileHeader
          title="Run-rate over twelve months"
          icon={TrendingUp}
          action={
            <Segmented
              size="xs"
              value={trendMode}
              onChange={setTrendMode}
              options={[
                { value: 'monthly', label: 'Monthly' },
                { value: 'annualised', label: 'Annual' },
              ]}
            />
          }
        />
        <TileBody>
          <ChartFrame
            defaultView="table"
            height={170}
            caption={data.coverageNote}
            table={<MiniTable head={['Month', 'Run-rate']} rows={data.months.map((m) => [m.label, formatMoney(m.monthlyGbp * (trendMode === 'monthly' ? 1 : 12))])} />}
          >
            <TrendChart height={170} points={data.months.map((m) => ({ label: m.label, value: m.monthlyGbp * (trendMode === 'monthly' ? 1 : 12), meta: `${m.count} subscriptions` }))} />
          </ChartFrame>
        </TileBody>
      </BentoTile>

      {/* ── Category ──────────────────────────────────────────────────── */}
      <BentoTile col={6} row={3}>
        <TileHeader title="Spend by category" subtitle="Where consolidation would have the most effect" icon={Layers} />
        <TileBody>
          <ChartFrame
            defaultView="table"
            caption="Several tools in one category is not automatically duplication — but it is the first place to look for it."
            table={<MiniTable head={['Category', 'Monthly', 'Annual', 'Tools']} rows={data.byCategory.map((c) => [c.label, formatMoney(c.monthlyGbp), formatMoney(c.annualGbp), c.count])} />}
          >
            <RankedBars
              data={data.byCategory.map((c) => ({
                key: c.key,
                label: c.label,
                value: c.monthlyGbp,
                color: colorForIndex(c.index),
                sublabel: `${c.count} subscription${c.count === 1 ? '' : 's'} · ${formatMoney(c.annualGbp)} a year`,
              }))}
              labelWidth={148}
            />
          </ChartFrame>
        </TileBody>
      </BentoTile>

      {/* ── Billing model mix ─────────────────────────────────────────── */}
      <BentoTile col={6} row={3}>
        <TileHeader title="How that spend is billed" subtitle="Fixed commitments against variable ones" icon={BarChart3} />
        <TileBody>
          <ChartFrame
            defaultView="table"
            caption="Usage-based and credit top-up spend is estimated rather than contracted. A large share of variable spend makes the annual figure less predictable, which matters more to Finance than the total."
            table={<MiniTable head={['Billing', 'Monthly', 'Count']} rows={data.byBillingModel.map((b) => [b.label, formatMoney(b.monthlyGbp), b.count])} />}
          >
            <RankedBars
              data={data.byBillingModel.map((b) => ({
                key: b.key,
                label: b.label,
                value: b.monthlyGbp,
                sublabel: `${b.count} subscription${b.count === 1 ? '' : 's'}`,
              }))}
              labelWidth={124}
            />
          </ChartFrame>
        </TileBody>
      </BentoTile>

      {/* ── Every observation ─────────────────────────────────────────── */}
      <BentoTile col={12}>
        <TileHeader
          title="All observations"
          subtitle="Everything the data supports saying, with the method and sample size behind each"
          icon={Sigma}
        />
        <TileBody>
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {data.observations.map((o) => (
              <article
                key={o.id}
                className="rounded-[var(--radius-md)] border p-3"
                style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-raised)' }}
              >
                <div className="mb-1.5 flex items-start justify-between gap-2">
                  <h4 className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {o.title}
                  </h4>
                  {o.metric ? (
                    <Badge tone={o.tone === 'neutral' ? 'neutral' : o.tone} size="xs" showIcon={o.tone !== 'neutral'}>
                      {o.metric}
                    </Badge>
                  ) : null}
                </div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {o.body}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <ReliabilityTag reliability={o.reliability} n={o.n} />
                  <InfoTip label="Method">
                    <strong style={{ color: 'var(--text-primary)' }}>How this is calculated</strong>
                    <p className="mt-1">{o.method}</p>
                  </InfoTip>
                </div>
              </article>
            ))}
          </div>
        </TileBody>
      </BentoTile>
    </div>
  );
}

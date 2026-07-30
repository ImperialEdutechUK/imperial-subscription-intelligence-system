'use client';

import { useMemo } from 'react';
import { formatMoney } from '@/lib/money';
import { barPath, useHoverTooltip, TooltipTitle, TooltipRow } from './primitives';

export interface TimelineItem {
  id: string;
  name: string;
  days: number;
  amountGbp: number;
  cardNeedsTopUp: boolean;
}

const SEQ = ['var(--seq-1)', 'var(--seq-2)', 'var(--seq-3)', 'var(--seq-4)', 'var(--seq-5)'];

/**
 * Payment runway. Weekly buckets over the next quarter, shaded on a single-hue
 * sequential ramp because the encoded quantity is magnitude. Weeks containing a
 * charge against an under-funded card are marked with a hatch as well as a
 * colour, so the warning survives greyscale printing and colour-vision
 * deficiency.
 */
export function RenewalTimeline({
  items,
  weeks = 13,
  height = 150,
}: {
  items: TimelineItem[];
  weeks?: number;
  height?: number;
}) {
  const W = 600;
  const H = height;
  const PAD = { top: 12, right: 8, bottom: 26, left: 44 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const { ref, show, hide, node } = useHoverTooltip();

  const buckets = useMemo(() => {
    const out = Array.from({ length: weeks }, (_, i) => ({
      index: i,
      label: i === 0 ? 'This wk' : `wk ${i + 1}`,
      total: 0,
      count: 0,
      risky: false,
      names: [] as string[],
    }));
    items.forEach((it) => {
      const w = Math.floor(Math.max(0, it.days) / 7);
      if (w >= weeks) return;
      out[w].total += it.amountGbp;
      out[w].count += 1;
      out[w].names.push(it.name);
      if (it.cardNeedsTopUp) out[w].risky = true;
    });
    return out;
  }, [items, weeks]);

  const max = Math.max(...buckets.map((b) => b.total), 1);
  const bandW = plotW / weeks;
  const barW = Math.max(6, bandW - 6);

  const shadeFor = (v: number) => {
    if (v <= 0) return 'var(--surface-sunken)';
    const idx = Math.min(SEQ.length - 1, Math.floor((v / max) * SEQ.length));
    return SEQ[idx];
  };

  return (
    <div ref={ref} className="relative h-full w-full">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full" style={{ minHeight: height }} role="img" aria-label={`Payments due by week over the next ${weeks} weeks`}>
        <defs>
          <pattern id="risk-hatch" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--danger)" strokeWidth="2.5" />
          </pattern>
        </defs>

        {[0, 0.5, 1].map((f) => {
          const y = PAD.top + plotH - f * plotH;
          return (
            <g key={f}>
              <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="var(--chart-grid)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              <text x={PAD.left - 6} y={y + 3} textAnchor="end" fontSize={9} fill="var(--chart-axis)">
                {formatMoney(max * f, 'GBP', { compact: true })}
              </text>
            </g>
          );
        })}

        {buckets.map((b) => {
          const h = (b.total / max) * plotH;
          const x = PAD.left + b.index * bandW + (bandW - barW) / 2;
          const y = PAD.top + plotH - h;
          return (
            <g
              key={b.index}
              onMouseMove={(e) =>
                show(
                  e.clientX,
                  e.clientY,
                  <>
                    <TooltipTitle>{b.index === 0 ? 'This week' : `Week ${b.index + 1}`}</TooltipTitle>
                    <TooltipRow label="Due" value={formatMoney(b.total)} />
                    <TooltipRow label="Payments" value={String(b.count)} />
                    {b.names.length ? (
                      <p className="mt-1 leading-snug" style={{ color: 'var(--text-tertiary)' }}>
                        {b.names.slice(0, 4).join(', ')}
                        {b.names.length > 4 ? ` +${b.names.length - 4} more` : ''}
                      </p>
                    ) : null}
                    {b.risky ? (
                      <p className="mt-1 font-medium" style={{ color: 'var(--danger)' }}>
                        Includes a charge against an under-funded card.
                      </p>
                    ) : null}
                  </>,
                )
              }
              onMouseLeave={hide}
            >
              {/* Full-height hit target so the bar does not have to be aimed at */}
              <rect x={PAD.left + b.index * bandW} y={PAD.top} width={bandW} height={plotH} fill="transparent" />
              {b.total > 0 ? (
                <>
                  <path d={barPath(x, y, barW, h, 4, 'up')} fill={shadeFor(b.total)} />
                  {b.risky ? <path d={barPath(x, y, barW, h, 4, 'up')} fill="url(#risk-hatch)" opacity={0.55} /> : null}
                </>
              ) : (
                <rect x={x} y={PAD.top + plotH - 2} width={barW} height={2} rx={1} fill="var(--border-default)" />
              )}
            </g>
          );
        })}

        {buckets.map((b) =>
          b.index % 2 === 0 ? (
            <text key={b.index} x={PAD.left + b.index * bandW + bandW / 2} y={H - 8} textAnchor="middle" fontSize={8.5} fill="var(--chart-axis)">
              {b.label}
            </text>
          ) : null,
        )}
      </svg>
      {node}
    </div>
  );
}

// ────────────────────────────────────────────────── shared-cost flow diagram ──

export interface FlowLink {
  subscriptionId: string;
  subscriptionName: string;
  departmentId: string;
  departmentName: string;
  departmentColor: string;
  amount: number;
  share: number;
}

/**
 * A bipartite flow of shared subscriptions into the departments that carry
 * their cost. Ribbon thickness is the allocated amount, so the picture answers
 * "who is actually paying for this?" without reading a table.
 */
export function SharedCostFlow({ links, height = 300 }: { links: FlowLink[]; height?: number }) {
  const { ref, show, hide, node } = useHoverTooltip();

  const { subs, depts, W, H, ribbons } = useMemo(() => {
    const W = 600;
    const H = height;
    const PAD = 14;
    const colW = 150;

    const subMap = new Map<string, { id: string; name: string; total: number }>();
    const deptMap = new Map<string, { id: string; name: string; color: string; total: number }>();
    links.forEach((l) => {
      const s = subMap.get(l.subscriptionId) ?? { id: l.subscriptionId, name: l.subscriptionName, total: 0 };
      s.total += l.amount;
      subMap.set(l.subscriptionId, s);
      const d = deptMap.get(l.departmentId) ?? { id: l.departmentId, name: l.departmentName, color: l.departmentColor, total: 0 };
      d.total += l.amount;
      deptMap.set(l.departmentId, d);
    });

    const subs = [...subMap.values()].sort((a, b) => b.total - a.total);
    const depts = [...deptMap.values()].sort((a, b) => b.total - a.total);
    const grand = subs.reduce((a, s) => a + s.total, 0) || 1;

    const usableH = H - PAD * 2;
    const gapS = subs.length > 1 ? Math.min(6, (usableH * 0.25) / (subs.length - 1)) : 0;
    const gapD = depts.length > 1 ? Math.min(6, (usableH * 0.25) / (depts.length - 1)) : 0;
    const scaleS = (usableH - gapS * (subs.length - 1)) / grand;
    const scaleD = (usableH - gapD * (depts.length - 1)) / grand;

    const subPos = new Map<string, { y: number; h: number; cursor: number }>();
    let y = PAD;
    subs.forEach((s) => {
      const h = Math.max(3, s.total * scaleS);
      subPos.set(s.id, { y, h, cursor: y });
      y += h + gapS;
    });

    const deptPos = new Map<string, { y: number; h: number; cursor: number }>();
    y = PAD;
    depts.forEach((d) => {
      const h = Math.max(3, d.total * scaleD);
      deptPos.set(d.id, { y, h, cursor: y });
      y += h + gapD;
    });

    const x0 = colW;
    const x1 = W - colW;

    const ribbons = [...links]
      .sort((a, b) => b.amount - a.amount)
      .map((l) => {
        const sp = subPos.get(l.subscriptionId)!;
        const dp = deptPos.get(l.departmentId)!;
        const hs = Math.max(2, l.amount * scaleS);
        const hd = Math.max(2, l.amount * scaleD);
        const y0 = sp.cursor;
        const y1 = dp.cursor;
        sp.cursor += hs;
        dp.cursor += hd;
        const cx = (x0 + x1) / 2;
        const path = `M${x0},${y0} C${cx},${y0} ${cx},${y1} ${x1},${y1} L${x1},${y1 + hd} C${cx},${y1 + hd} ${cx},${y0 + hs} ${x0},${y0 + hs} Z`;
        return { ...l, path, color: l.departmentColor };
      });

    return {
      subs: subs.map((s) => ({ ...s, ...subPos.get(s.id)! })),
      depts: depts.map((d) => ({ ...d, ...deptPos.get(d.id)! })),
      W,
      H,
      ribbons,
      x0,
      x1,
    };
  }, [links, height]);

  if (!links.length) return null;

  return (
    <div ref={ref} className="relative h-full w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" style={{ minHeight: height }} role="img" aria-label="Flow of shared subscription cost into departments">
        {ribbons.map((r, i) => (
          <path
            key={`${r.subscriptionId}-${r.departmentId}-${i}`}
            d={r.path}
            fill={r.color}
            opacity={0.28}
            onMouseMove={(e) =>
              show(
                e.clientX,
                e.clientY,
                <>
                  <TooltipTitle>{r.subscriptionName}</TooltipTitle>
                  <TooltipRow label={r.departmentName} value={formatMoney(r.amount)} color={r.color} />
                  <TooltipRow label="Share" value={`${(r.share * 100).toFixed(1)}%`} />
                </>,
              )
            }
            onMouseLeave={hide}
            style={{ cursor: 'default' }}
          />
        ))}

        {subs.map((s) => (
          <g key={s.id}>
            <rect x={146} y={s.y} width={4} height={s.h} rx={2} fill="var(--text-tertiary)" />
            {/* Only label a band tall enough to hold the text without colliding
                with its neighbours. Anything smaller stays reachable through the
                tooltip and the table view rather than being printed on top of
                the row below it. */}
            {s.h >= 11 ? (
              <text x={140} y={s.y + s.h / 2 + 3} textAnchor="end" fontSize={9.5} fill="var(--text-secondary)">
                {s.name.length > 24 ? `${s.name.slice(0, 23)}…` : s.name}
              </text>
            ) : null}
          </g>
        ))}

        {depts.map((d) => (
          <g key={d.id}>
            <rect x={W - 150} y={d.y} width={4} height={d.h} rx={2} fill={d.color} />
            {d.h >= 11 ? (
              <text x={W - 140} y={d.y + d.h / 2 + 3} fontSize={9.5} fill="var(--text-secondary)">
                {d.name.length > 22 ? `${d.name.slice(0, 21)}…` : d.name}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
      {node}
    </div>
  );
}

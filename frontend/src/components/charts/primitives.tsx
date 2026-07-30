'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { formatMoney } from '@/lib/money';

// ─────────────────────────────────────────────────────────────── utilities ──

/**
 * Axis ticks from 0 up to at least `max`.
 *
 * The last tick MUST be >= max. Callers use it as the scale maximum, so a top
 * tick below the data means every value divides to more than 1 and renders
 * above the plot area — the line then draws outside the card entirely. The
 * previous implementation walked `v <= max` and stopped at the largest multiple
 * of `step` below it, which understated the scale by up to 1.7x.
 */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;

  // Round the top up to the next whole step so the range always covers `max`.
  // The epsilon stops a value already sitting exactly on a step from adding a
  // redundant empty band above it.
  const top = Math.ceil((max - step * 1e-9) / step) * step;

  const ticks: number[] = [];
  for (let i = 0; i * step <= top + step * 1e-9; i++) ticks.push(i * step);
  return ticks;
}

/** Rounded only at the data end — the baseline end stays square and anchored. */
export function barPath(x: number, y: number, w: number, h: number, r: number, dir: 'up' | 'right'): string {
  const rad = Math.max(0, Math.min(r, dir === 'up' ? h : w, dir === 'up' ? w / 2 : h / 2));
  if (dir === 'up') {
    return `M${x},${y + h} L${x},${y + rad} Q${x},${y} ${x + rad},${y} L${x + w - rad},${y} Q${x + w},${y} ${x + w},${y + rad} L${x + w},${y + h} Z`;
  }
  return `M${x},${y} L${x + w - rad},${y} Q${x + w},${y} ${x + w},${y + rad} L${x + w},${y + h - rad} Q${x + w},${y + h} ${x + w - rad},${y + h} L${x},${y + h} Z`;
}

export function smoothPath(points: { x: number; y: number }[], tension = 0.28): string {
  if (points.length === 0) return '';
  if (points.length < 3) return points.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ');
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + ((p2.x - p0.x) / 6) * tension * 3;
    const c1y = p1.y + ((p2.y - p0.y) / 6) * tension * 3;
    const c2x = p2.x - ((p3.x - p1.x) / 6) * tension * 3;
    const c2y = p2.y - ((p3.y - p1.y) / 6) * tension * 3;
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
  }
  return d;
}

// ────────────────────────────────────────────────────────────────── tooltip ──

export function useHoverTooltip() {
  // The container width is captured at the moment the tooltip is shown rather
  // than read from the ref while rendering — reading a ref during render is
  // unsafe under concurrent rendering, and the width cannot change between the
  // pointer event and the paint that follows it.
  const [tip, setTip] = useState<{ x: number; y: number; width: number; content: React.ReactNode } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const show = useCallback((clientX: number, clientY: number, content: React.ReactNode) => {
    const el = ref.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    setTip({ x: clientX - box.left, y: clientY - box.top, width: el.clientWidth, content });
  }, []);

  const hide = useCallback(() => setTip(null), []);

  const node = tip ? (
    <div
      className="pointer-events-none absolute z-20 rounded-[var(--radius-sm)] border px-2.5 py-1.5 text-meta leading-relaxed shadow-[var(--shadow-md)]"
      style={{
        left: Math.max(4, Math.min(tip.x + 12, tip.width - 190)),
        top: Math.max(4, tip.y - 10),
        minWidth: 130,
        maxWidth: 220,
        background: 'var(--surface-raised)',
        borderColor: 'var(--border-default)',
        color: 'var(--text-secondary)',
      }}
      role="status"
    >
      {tip.content}
    </div>
  ) : null;

  return { ref, show, hide, node, active: tip != null };
}

export function TooltipTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-0.5 font-semibold" style={{ color: 'var(--text-primary)' }}>
      {children}
    </p>
  );
}

export function TooltipRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <p className="flex items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-1.5">
        {color ? <span className="size-1.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden /> : null}
        <span className="truncate">{label}</span>
      </span>
      <span className="tabular shrink-0 font-medium" style={{ color: 'var(--text-primary)' }}>
        {value}
      </span>
    </p>
  );
}

// ────────────────────────────────────────────────────────── ranked bar chart ──

export interface RankedDatum {
  key: string;
  label: string;
  value: number;
  color?: string;
  sublabel?: string;
  href?: string;
}

/**
 * Horizontal bars for comparing named things. A single-series chart uses one
 * colour for every bar — shading bars by their own length would double-encode
 * magnitude and burn the only free channel. Where a colour is supplied it is
 * the entity's own identity colour (a department), not a rank.
 */
export function RankedBars({
  data,
  max,
  formatValue = (v: number) => formatMoney(v),
  barHeight = 22,
  showValues = true,
  onSelect,
  labelWidth = 132,
}: {
  data: RankedDatum[];
  max?: number;
  formatValue?: (v: number) => string;
  barHeight?: number;
  showValues?: boolean;
  onSelect?: (key: string) => void;
  labelWidth?: number;
}) {
  const { ref, show, hide, node } = useHoverTooltip();
  const total = useMemo(() => data.reduce((a, d) => a + d.value, 0), [data]);
  const scaleMax = max ?? Math.max(...data.map((d) => d.value), 1);

  return (
    <div ref={ref} className="relative h-full overflow-y-auto">
      <ul className="space-y-1.5">
        {data.map((d) => {
          const pct = scaleMax > 0 ? (d.value / scaleMax) * 100 : 0;
          const shareOfTotal = total > 0 ? (d.value / total) * 100 : 0;
          return (
            <li key={d.key}>
              <button
                type="button"
                disabled={!onSelect}
                onClick={() => onSelect?.(d.key)}
                onMouseMove={(e) =>
                  show(
                    e.clientX,
                    e.clientY,
                    <>
                      <TooltipTitle>{d.label}</TooltipTitle>
                      <TooltipRow label="Amount" value={formatValue(d.value)} color={d.color ?? 'var(--chart-1)'} />
                      <TooltipRow label="Share of total" value={`${shareOfTotal.toFixed(1)}%`} />
                      {d.sublabel ? <p className="mt-1" style={{ color: 'var(--text-tertiary)' }}>{d.sublabel}</p> : null}
                    </>,
                  )
                }
                onMouseLeave={hide}
                className="flex w-full items-center gap-2.5 rounded-[var(--radius-xs)] py-0.5 text-left disabled:cursor-default"
                style={{ minHeight: 24 }}
              >
                <span
                  className="shrink-0 truncate text-meta"
                  style={{ width: labelWidth, color: 'var(--text-secondary)' }}
                  title={d.label}
                >
                  {d.label}
                </span>
                <span className="relative min-w-0 flex-1" style={{ height: barHeight }}>
                  <svg width="100%" height={barHeight} className="overflow-visible" role="presentation">
                    <rect x={0} y={barHeight / 2 - 5} width="100%" height={10} rx={5} fill="var(--surface-sunken)" />
                    <rect
                      x={0}
                      y={barHeight / 2 - 5}
                      width={`${Math.max(pct, d.value > 0 ? 1.5 : 0)}%`}
                      height={10}
                      rx={5}
                      fill={d.color ?? 'var(--chart-1)'}
                    />
                  </svg>
                </span>
                {showValues ? (
                  <span className="tabular shrink-0 text-meta font-medium" style={{ color: 'var(--text-primary)', minWidth: 62, textAlign: 'right' }}>
                    {formatValue(d.value)}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      {node}
    </div>
  );
}

// ──────────────────────────────────────────────────────────── diverging bars ──

/**
 * Cost movements. This is the one place a diverging scale is correct — the
 * measure has a true zero and the sign carries meaning. Increases take the warm
 * pole, decreases the cool one; nothing sits at the midpoint but the axis.
 */
export function DivergingBars({
  data,
  formatValue = (v: number) => formatMoney(v),
}: {
  data: { key: string; label: string; value: number; sublabel?: string }[];
  formatValue?: (v: number) => string;
}) {
  const { ref, show, hide, node } = useHoverTooltip();
  const maxAbs = Math.max(...data.map((d) => Math.abs(d.value)), 1);

  return (
    <div ref={ref} className="relative h-full overflow-y-auto">
      <ul className="space-y-1">
        {data.map((d) => {
          const pct = (Math.abs(d.value) / maxAbs) * 50;
          const positive = d.value >= 0;
          return (
            <li
              key={d.key}
              className="grid items-center gap-2"
              style={{ gridTemplateColumns: '118px 1fr 74px', minHeight: 22 }}
              onMouseMove={(e) =>
                show(
                  e.clientX,
                  e.clientY,
                  <>
                    <TooltipTitle>{d.label}</TooltipTitle>
                    <TooltipRow
                      label={positive ? 'Increase' : 'Decrease'}
                      value={formatValue(d.value)}
                      color={positive ? 'var(--div-pos-2)' : 'var(--div-neg-2)'}
                    />
                    {d.sublabel ? <p className="mt-1" style={{ color: 'var(--text-tertiary)' }}>{d.sublabel}</p> : null}
                  </>,
                )
              }
              onMouseLeave={hide}
            >
              <span className="truncate text-meta" style={{ color: 'var(--text-secondary)' }} title={d.label}>
                {d.label}
              </span>
              <span className="relative block h-[18px]">
                <svg width="100%" height="18" className="overflow-visible" role="presentation">
                  <line x1="50%" y1={0} x2="50%" y2={18} stroke="var(--border-default)" strokeWidth={1} />
                  <rect
                    x={positive ? '50%' : `${50 - pct}%`}
                    y={4}
                    width={`${Math.max(pct, 0.6)}%`}
                    height={10}
                    rx={4}
                    fill={positive ? 'var(--div-pos-2)' : 'var(--div-neg-2)'}
                  />
                </svg>
              </span>
              <span
                className="tabular text-right text-meta font-medium"
                style={{ color: positive ? 'var(--danger)' : 'var(--positive)' }}
              >
                {positive ? '+' : ''}
                {formatValue(d.value)}
              </span>
            </li>
          );
        })}
      </ul>
      {node}
    </div>
  );
}

'use client';

import { useMemo, useRef, useState } from 'react';
import { formatMoney } from '@/lib/money';
import { niceTicks, smoothPath } from './primitives';

export interface TrendPoint {
  label: string;
  value: number;
  meta?: string;
}

/**
 * Monthly run-rate over time. One series, so there is no legend box — the tile
 * title names it. The endpoint is direct-labelled; every other value is
 * reachable through the crosshair or the table view, rather than printing a
 * number on all twelve points.
 */
export function TrendChart({
  points,
  height = 190,
  showArea = true,
  color = 'var(--chart-1)',
  formatValue = (v: number) => formatMoney(v, 'GBP', { compact: true }),
  annotate,
}: {
  points: TrendPoint[];
  height?: number;
  showArea?: boolean;
  color?: string;
  formatValue?: (v: number) => string;
  annotate?: { index: number; label: string }[];
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const PAD = { top: 14, right: 12, bottom: 22, left: 46 };
  const VW = 600;
  const VH = height;
  const plotW = VW - PAD.left - PAD.right;
  const plotH = VH - PAD.top - PAD.bottom;

  const { maxV, ticks, coords } = useMemo(() => {
    const vals = points.map((p) => p.value);
    const rawMax = Math.max(...vals, 1);
    const t = niceTicks(rawMax * 1.08, 4);
    const m = t[t.length - 1] || rawMax;
    const c = points.map((p, i) => ({
      x: PAD.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW),
      y: PAD.top + plotH - (p.value / m) * plotH,
      ...p,
    }));
    return { maxV: m, ticks: t, coords: c };
  }, [points, plotH, plotW, PAD.left, PAD.top]);

  const line = smoothPath(coords);
  const area = coords.length ? `${line} L${coords[coords.length - 1].x},${PAD.top + plotH} L${coords[0].x},${PAD.top + plotH} Z` : '';

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = ((e.clientX - rect.left) / rect.width) * VW;
    let best = 0;
    let bestD = Infinity;
    coords.forEach((c, i) => {
      const d = Math.abs(c.x - rel);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setHover(best);
  };

  const last = coords[coords.length - 1];
  const hoverPoint = hover != null ? coords[hover] : null;

  return (
    <div ref={wrapRef} className="relative h-full w-full">
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        preserveAspectRatio="none"
        className="h-full w-full"
        style={{ minHeight: height }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label={`Monthly run-rate over ${points.length} months, ending at ${formatValue(points[points.length - 1]?.value ?? 0)}`}
      >
        <defs>
          <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.16" />
            <stop offset="100%" stopColor={color} stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* Grid: solid hairlines one shade off the surface, never dashed. */}
        {ticks.map((t) => {
          const y = PAD.top + plotH - (t / maxV) * plotH;
          return (
            <g key={t}>
              <line x1={PAD.left} y1={y} x2={VW - PAD.right} y2={y} stroke="var(--chart-grid)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              <text x={PAD.left - 7} y={y + 3} textAnchor="end" fontSize={9} fill="var(--chart-axis)" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatValue(t)}
              </text>
            </g>
          );
        })}

        {showArea && area ? <path d={area} fill="url(#trend-fill)" /> : null}
        <path d={line} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />

        {annotate?.map((a) => {
          const c = coords[a.index];
          if (!c) return null;
          return (
            <g key={a.index}>
              <line x1={c.x} y1={PAD.top} x2={c.x} y2={PAD.top + plotH} stroke="var(--border-strong)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            </g>
          );
        })}

        {hoverPoint ? (
          <g>
            <line
              x1={hoverPoint.x}
              y1={PAD.top}
              x2={hoverPoint.x}
              y2={PAD.top + plotH}
              stroke="var(--border-strong)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            {/* 2px surface ring so the marker reads clearly over the line */}
            <circle cx={hoverPoint.x} cy={hoverPoint.y} r={5} fill="var(--surface-raised)" />
            <circle cx={hoverPoint.x} cy={hoverPoint.y} r={3.5} fill={color} />
          </g>
        ) : null}

        {last && hover == null ? (
          <>
            <circle cx={last.x} cy={last.y} r={5} fill="var(--surface-raised)" />
            <circle cx={last.x} cy={last.y} r={3.5} fill={color} />
          </>
        ) : null}

        {coords.map((c, i) => {
          const step = Math.max(1, Math.ceil(points.length / 6));
          if (i % step !== 0 && i !== points.length - 1) return null;
          return (
            <text key={c.label} x={c.x} y={VH - 6} textAnchor="middle" fontSize={9} fill="var(--chart-axis)">
              {c.label}
            </text>
          );
        })}
      </svg>

      {hoverPoint ? (
        <div
          className="pointer-events-none absolute z-20 rounded-[var(--radius-sm)] border px-2.5 py-1.5 text-[0.6875rem] shadow-[var(--shadow-md)]"
          style={{
            left: `min(calc(${(hoverPoint.x / VW) * 100}% + 10px), calc(100% - 150px))`,
            top: 4,
            background: 'var(--surface-raised)',
            borderColor: 'var(--border-default)',
            color: 'var(--text-secondary)',
            minWidth: 128,
          }}
        >
          <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
            {hoverPoint.label}
          </p>
          <p className="tabular mt-0.5" style={{ color: 'var(--text-primary)' }}>
            {formatMoney(hoverPoint.value)} <span style={{ color: 'var(--text-tertiary)' }}>/month</span>
          </p>
          {hoverPoint.meta ? <p style={{ color: 'var(--text-tertiary)' }}>{hoverPoint.meta}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

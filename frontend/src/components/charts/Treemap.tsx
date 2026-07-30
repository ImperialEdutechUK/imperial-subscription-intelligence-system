'use client';

import { useMemo } from 'react';
import { formatMoney } from '@/lib/money';
import { useHoverTooltip, TooltipTitle, TooltipRow } from './primitives';

export interface TreemapDatum {
  key: string;
  label: string;
  value: number;
  group: string;
  color: string;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  datum: TreemapDatum;
}

/**
 * Squarified treemap (Bruls, Huizing & van Wijk). Area encodes cost; colour
 * encodes category, which is identity rather than magnitude — so the colour is
 * doing work the area is not already doing.
 */
function squarify(data: TreemapDatum[], x: number, y: number, w: number, h: number): Rect[] {
  const total = data.reduce((a, d) => a + d.value, 0);
  if (total <= 0 || data.length === 0) return [];
  const scale = (w * h) / total;
  const items = data.map((d) => ({ datum: d, area: d.value * scale }));
  const out: Rect[] = [];

  const worst = (row: typeof items, side: number) => {
    const sum = row.reduce((a, r) => a + r.area, 0);
    const max = Math.max(...row.map((r) => r.area));
    const min = Math.min(...row.map((r) => r.area));
    const s2 = sum * sum;
    const w2 = side * side;
    return Math.max((w2 * max) / s2, s2 / (w2 * min));
  };

  const rest = [...items];
  let cx = x;
  let cy = y;
  let cw = w;
  let ch = h;

  while (rest.length) {
    const vertical = cw >= ch;
    const side = vertical ? ch : cw;
    const row: typeof items = [];

    while (rest.length) {
      const candidate = [...row, rest[0]];
      if (row.length && worst(row, side) < worst(candidate, side)) break;
      row.push(rest.shift()!);
    }

    const rowSum = row.reduce((a, r) => a + r.area, 0);
    const thickness = side > 0 ? rowSum / side : 0;
    let offset = 0;

    row.forEach((r) => {
      const len = thickness > 0 ? r.area / thickness : 0;
      if (vertical) {
        out.push({ x: cx, y: cy + offset, w: thickness, h: len, datum: r.datum });
      } else {
        out.push({ x: cx + offset, y: cy, w: len, h: thickness, datum: r.datum });
      }
      offset += len;
    });

    if (vertical) {
      cx += thickness;
      cw -= thickness;
    } else {
      cy += thickness;
      ch -= thickness;
    }
    if (cw < 0.5 || ch < 0.5) break;
  }

  return out;
}

export function Treemap({
  data,
  height = 250,
  onSelect,
}: {
  data: TreemapDatum[];
  height?: number;
  onSelect?: (key: string) => void;
}) {
  const W = 600;
  const H = height;
  const GAP = 2; // the 2px surface gap between fills, not a border on each mark

  const total = useMemo(() => data.reduce((a, d) => a + d.value, 0), [data]);
  const rects = useMemo(() => squarify([...data].sort((a, b) => b.value - a.value), 0, 0, W, H), [data, H]);
  const { ref, show, hide, node } = useHoverTooltip();

  if (!data.length) return null;

  return (
    <div ref={ref} className="relative h-full w-full">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full" style={{ minHeight: height }} role="img" aria-label="Spend by subscription, area proportional to monthly cost">
        {rects.map((r) => {
          const iw = Math.max(0, r.w - GAP);
          const ih = Math.max(0, r.h - GAP);
          const showLabel = iw > 62 && ih > 26;
          const showValue = iw > 62 && ih > 40;
          return (
            <g
              key={r.datum.key}
              onMouseMove={(e) =>
                show(
                  e.clientX,
                  e.clientY,
                  <>
                    <TooltipTitle>{r.datum.label}</TooltipTitle>
                    <TooltipRow label="Monthly" value={formatMoney(r.datum.value)} color={r.datum.color} />
                    <TooltipRow label="Annual" value={formatMoney(r.datum.value * 12)} />
                    <TooltipRow label="Share" value={`${total > 0 ? ((r.datum.value / total) * 100).toFixed(1) : '0'}%`} />
                    <p className="mt-1" style={{ color: 'var(--text-tertiary)' }}>{r.datum.group}</p>
                  </>,
                )
              }
              onMouseLeave={hide}
              onClick={() => onSelect?.(r.datum.key)}
              style={{ cursor: onSelect ? 'pointer' : 'default' }}
            >
              <rect x={r.x} y={r.y} width={iw} height={ih} rx={4} fill={r.datum.color} opacity={0.9} />
              {showLabel ? (
                <text
                  x={r.x + 7}
                  y={r.y + 15}
                  fontSize={10}
                  fontWeight={600}
                  fill="#fff"
                  style={{ pointerEvents: 'none' }}
                >
                  {r.datum.label.length > Math.floor((iw - 14) / 5.9) ? `${r.datum.label.slice(0, Math.max(1, Math.floor((iw - 14) / 5.9) - 1))}…` : r.datum.label}
                </text>
              ) : null}
              {showValue ? (
                <text x={r.x + 7} y={r.y + 29} fontSize={9} fill="#fff" opacity={0.82} style={{ pointerEvents: 'none' }}>
                  {formatMoney(r.datum.value, 'GBP', { compact: true })}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      {node}
    </div>
  );
}

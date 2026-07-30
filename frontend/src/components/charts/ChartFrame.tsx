'use client';

import { useState, type ReactNode } from 'react';
import { BarChart3, Table2 } from 'lucide-react';
import { Segmented } from '@/components/ui/controls';
import { cn } from '@/lib/utils';

export interface LegendItem {
  label: string;
  color: string;
  value?: string;
}

/**
 * Every chart in the application is wrapped in this frame, which guarantees the
 * three things that make a chart accessible rather than merely attractive:
 * a legend whenever more than one series is present, an equivalent table view,
 * and a caption stating what the numbers are and where they came from.
 */
export function ChartFrame({
  legend,
  table,
  caption,
  children,
  height,
  dense,
  toolbar,
}: {
  legend?: LegendItem[];
  table: ReactNode;
  caption?: ReactNode;
  children: ReactNode;
  height?: number;
  dense?: boolean;
  toolbar?: ReactNode;
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart');

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={cn('mb-2 flex flex-wrap items-center justify-between gap-2', dense && 'mb-1.5')}>
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          {legend && legend.length > 1
            ? legend.map((l) => (
                <span key={l.label} className="flex items-center gap-1.5 text-[0.6875rem]" style={{ color: 'var(--text-secondary)' }}>
                  <span className="size-2 shrink-0 rounded-[2px]" style={{ background: l.color }} aria-hidden />
                  <span className="truncate">{l.label}</span>
                  {l.value ? (
                    <span className="tabular" style={{ color: 'var(--text-tertiary)' }}>
                      {l.value}
                    </span>
                  ) : null}
                </span>
              ))
            : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {toolbar}
          <Segmented
            size="xs"
            value={view}
            onChange={setView}
            options={[
              { value: 'chart', label: <BarChart3 size={11} aria-label="Chart view" />, title: 'Chart view' },
              { value: 'table', label: <Table2 size={11} aria-label="Table view" />, title: 'Table view — the same numbers, readable by screen readers' },
            ]}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1" style={height ? { minHeight: height } : undefined}>
        {view === 'chart' ? children : <div className="h-full overflow-auto">{table}</div>}
      </div>

      {caption ? (
        <p className="mt-2 text-[0.6875rem] leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
          {caption}
        </p>
      ) : null}
    </div>
  );
}

export function MiniTable({
  head,
  rows,
}: {
  head: string[];
  rows: (string | number | ReactNode)[][];
}) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr>
          {head.map((h, i) => (
            <th
              key={h}
              className={cn('sticky top-0 py-1.5 pr-3 text-left font-medium', i > 0 && 'text-right')}
              style={{ color: 'var(--text-tertiary)', background: 'var(--surface-raised)', borderBottom: '1px solid var(--border-subtle)' }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              <td
                key={j}
                className={cn('py-1.5 pr-3 align-top', j > 0 && 'tabular text-right')}
                style={{ color: j === 0 ? 'var(--text-primary)' : 'var(--text-secondary)', borderBottom: '1px solid var(--border-subtle)' }}
              >
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Presentational primitives.
 *
 * These are deliberately unopinionated about data and carry no hooks, so they
 * render on the server and can be composed into client components without
 * dragging interactivity into the bundle. Anything that needs an event handler
 * lives in `controls.tsx` instead.
 */

import type { ReactNode, CSSProperties } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  MinusCircle,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ────────────────────────────────────────────────────────────── Bento tile ──

export type Span = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 12;

export interface BentoTileProps {
  children: ReactNode;
  /** Columns out of 12 on wide screens. Collapses responsively below. */
  col?: Span;
  /** Grid rows to occupy. One row is 84px minimum. */
  row?: number;
  className?: string;
  accent?: boolean;
  interactive?: boolean;
  style?: CSSProperties;
  id?: string;
}

/**
 * Tiles declare their own footprint. The `--col`/`--row` custom properties feed
 * grid-column/grid-row so the responsive collapse can be expressed once in CSS
 * rather than repeated in every consumer.
 */
export function BentoTile({ children, col = 4, row, className, accent, interactive, style, id }: BentoTileProps) {
  return (
    <section
      id={id}
      className={cn('bento-tile', className)}
      data-accent={accent ? 'true' : undefined}
      data-interactive={interactive ? 'true' : undefined}
      // Exposed so the breakpoint rules in globals.css can re-tier the span;
      // the inline grid-column below is unreachable from a stylesheet.
      data-col={col}
      style={{
        gridColumn: `span ${col} / span ${col}`,
        gridRow: row ? `span ${row} / span ${row}` : undefined,
        ...style,
      }}
    >
      {children}
    </section>
  );
}

export function TileHeader({
  title,
  subtitle,
  icon: Icon,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('flex items-start justify-between gap-3 px-3.5 pt-3 pb-1.5', className)}>
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 text-title font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          {Icon ? <Icon size={14} strokeWidth={2.2} style={{ color: 'var(--text-tertiary)' }} aria-hidden /> : null}
          <span className="truncate">{title}</span>
        </h3>
        {subtitle ? (
          <p className="mt-0.5 max-w-[58ch] text-xs leading-snug" style={{ color: 'var(--text-tertiary)' }}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function TileBody({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={cn('min-h-0 flex-1 px-3.5 pb-3.5', className)} style={style}>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────── Badge ──

export type Tone = 'positive' | 'warning' | 'danger' | 'info' | 'neutral' | 'brand';

const TONE_STYLE: Record<Tone, CSSProperties> = {
  positive: { background: 'var(--positive-bg)', color: 'var(--positive)', borderColor: 'var(--positive-border)' },
  warning: { background: 'var(--warning-bg)', color: 'var(--warning)', borderColor: 'var(--warning-border)' },
  danger: { background: 'var(--danger-bg)', color: 'var(--danger)', borderColor: 'var(--danger-border)' },
  info: { background: 'var(--info-bg)', color: 'var(--info)', borderColor: 'var(--info-border)' },
  neutral: { background: 'var(--neutral-bg)', color: 'var(--text-secondary)', borderColor: 'var(--neutral-border)' },
  brand: { background: 'var(--brand-50)', color: 'var(--brand-700)', borderColor: 'var(--brand-200)' },
};

const TONE_ICON: Record<Tone, LucideIcon> = {
  positive: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
  info: Info,
  neutral: MinusCircle,
  brand: Info,
};

/**
 * Status is never carried by colour alone: every badge renders an icon plus a
 * text label. That matters here more than usual, because the Imperial brand
 * colour is itself a red and therefore sits close to the "danger" hue.
 */
export function Badge({
  children,
  tone = 'neutral',
  icon,
  showIcon = true,
  size = 'sm',
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  icon?: LucideIcon;
  showIcon?: boolean;
  size?: 'xs' | 'sm';
  className?: string;
}) {
  const Icon = icon ?? TONE_ICON[tone];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border font-medium whitespace-nowrap',
        size === 'xs' ? 'px-1.5 py-0.5 text-meta' : 'px-2 py-0.5 text-xs',
        className,
      )}
      style={TONE_STYLE[tone]}
    >
      {showIcon ? <Icon size={size === 'xs' ? 10 : 12} strokeWidth={2.4} aria-hidden /> : null}
      {children}
    </span>
  );
}

export function Chip({
  children,
  color,
  className,
  title,
}: {
  children: ReactNode;
  color?: string;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs whitespace-nowrap',
        className,
      )}
      style={{ borderColor: 'var(--border-default)', color: 'var(--text-secondary)', background: 'var(--surface-raised)' }}
    >
      {color ? <span className="size-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden /> : null}
      {children}
    </span>
  );
}

// ──────────────────────────────────────────────────────────────── Stat tile ──

/**
 * A single number is a chart with one mark — a stat tile says it better than a
 * one-bar bar chart would. Hero figures use proportional (not tabular) numerals
 * because equal-width digits look loose at display sizes.
 */
export function Stat({
  label,
  value,
  unit,
  delta,
  deltaLabel,
  hint,
  tone,
  size = 'md',
  footer,
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: string;
  delta?: number | null;
  deltaLabel?: string;
  hint?: ReactNode;
  tone?: Tone;
  size?: 'sm' | 'md' | 'lg';
  footer?: ReactNode;
}) {
  // Figures state the number rather than perform it. 2.6rem read as a landing
  // page; these sit in the register's own voice.
  const sizeClass = size === 'lg' ? 'text-[2.25rem] leading-[1.08]' : size === 'sm' ? 'text-xl leading-tight' : 'text-[1.625rem] leading-tight';
  const deltaTone: Tone | undefined =
    delta == null ? undefined : delta > 0.05 ? 'danger' : delta < -0.05 ? 'positive' : 'neutral';

  return (
    <div className="flex h-full flex-col justify-between gap-2">
      <div>
        <p className="text-meta font-medium" style={{ color: 'var(--text-tertiary)' }}>
          {label}
        </p>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span
            className={cn('font-semibold tracking-tight', sizeClass)}
            style={{ color: tone ? TONE_STYLE[tone].color : 'var(--text-primary)', fontVariantNumeric: 'proportional-nums' }}
          >
            {value}
          </span>
          {unit ? (
            <span className="text-sm font-medium" style={{ color: 'var(--text-tertiary)' }}>
              {unit}
            </span>
          ) : null}
        </div>
        {delta != null && Number.isFinite(delta) ? (
          <div className="mt-2">
            <Badge tone={deltaTone ?? 'neutral'} size="xs">
              {delta > 0 ? '+' : ''}
              {delta.toFixed(1)}% {deltaLabel ?? ''}
            </Badge>
          </div>
        ) : null}
      </div>
      {hint ? (
        <p className="text-xs leading-snug" style={{ color: 'var(--text-tertiary)' }}>
          {hint}
        </p>
      ) : null}
      {footer}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────── Meter ──

export function Meter({
  value,
  max,
  tone = 'brand',
  label,
  showValue,
  height = 8,
}: {
  value: number;
  max: number;
  tone?: Tone;
  label?: string;
  showValue?: boolean;
  height?: number;
}) {
  const safeMax = max > 0 ? max : 1;
  const pct = Math.max(0, Math.min(100, (value / safeMax) * 100));
  const fill = tone === 'brand' ? 'var(--brand-500)' : (TONE_STYLE[tone].color as string);
  return (
    <div>
      {label || showValue ? (
        <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
          {label ? <span style={{ color: 'var(--text-secondary)' }}>{label}</span> : <span />}
          {showValue ? (
            <span className="tabular font-medium" style={{ color: 'var(--text-tertiary)' }}>
              {pct.toFixed(0)}%
            </span>
          ) : null}
        </div>
      ) : null}
      <div
        className="w-full overflow-hidden rounded-full"
        style={{ background: 'var(--surface-sunken)', height }}
        role="meter"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? 'Progress'}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${pct}%`, background: fill }}
        />
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────── Empty state ──

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'gap-1.5 py-6' : 'gap-2 py-12')}>
      {Icon ? (
        <div
          className="mb-1 grid size-10 place-items-center rounded-full"
          style={{ background: 'var(--surface-sunken)', color: 'var(--text-tertiary)' }}
        >
          <Icon size={18} strokeWidth={1.8} aria-hidden />
        </div>
      ) : null}
      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
        {title}
      </p>
      {description ? (
        <p className="max-w-sm text-xs leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

// ───────────────────────────────────────────────────────────── Misc layout ──

export function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  // A page header, not a page introduction. The title sits at 15px with the
  // actions on the same optical line and a hairline closing the band — the
  // pattern every dense tool uses. The standfirst paragraph it replaced ran at
  // body size and pushed the actual content a third of the way down the page.
  return (
    <div
      className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pb-3"
      style={{ borderBottom: '1px solid var(--border-subtle)' }}
    >
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-[-0.011em]" style={{ color: 'var(--text-primary)' }}>
          {title}
        </h2>
        {description ? (
          <p className="mt-1 max-w-[58ch] text-sm leading-snug" style={{ color: 'var(--text-secondary)' }}>
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function KeyValue({ label, children, mono }: { label: ReactNode; children: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <dt className="shrink-0 text-xs" style={{ color: 'var(--text-tertiary)' }}>
        {label}
      </dt>
      <dd className={cn('min-w-0 text-right text-sm', mono && 'font-mono text-title')} style={{ color: 'var(--text-primary)' }}>
        {children}
      </dd>
    </div>
  );
}

/** Small caption used under statistics to disclose sample size and method. */
export function StatFootnote({ children }: { children: ReactNode }) {
  return (
    <p className="mt-2 text-meta leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
      {children}
    </p>
  );
}

export function ReliabilityTag({ reliability, n }: { reliability: 'OK' | 'LOW_N' | 'INSUFFICIENT'; n: number }) {
  if (reliability === 'OK') {
    return (
      <Badge tone="neutral" size="xs" showIcon={false}>
        n = {n}
      </Badge>
    );
  }
  return (
    <Badge tone={reliability === 'LOW_N' ? 'warning' : 'danger'} size="xs">
      {reliability === 'LOW_N' ? `Small sample (n = ${n})` : `Insufficient data (n = ${n})`}
    </Badge>
  );
}

export const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
  'var(--chart-7)',
  'var(--chart-8)',
];

/** Colour follows the entity, not its rank — index by a stable key, never by row order. */
export function colorForIndex(i: number): string {
  return i < CHART_COLORS.length ? CHART_COLORS[i] : 'var(--chart-other)';
}

'use client';

import {
  cloneElement,
  forwardRef,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { HelpCircle, Loader2, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsClient } from '@/lib/use-client-only';

// ────────────────────────────────────────────────────────────────── Button ──

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type Size = 'xs' | 'sm' | 'md';

const VARIANT: Record<Variant, string> = {
  primary: 'text-white shadow-[var(--shadow-xs)] hover:brightness-[1.06] active:brightness-95',
  secondary: 'border hover:bg-[var(--surface-hover)] active:bg-[var(--surface-active)]',
  ghost: 'hover:bg-[var(--surface-hover)] active:bg-[var(--surface-active)]',
  danger: 'text-white hover:brightness-[1.06] active:brightness-95',
  subtle: 'hover:bg-[var(--surface-hover)]',
};

const SIZE: Record<Size, string> = {
  xs: 'h-7 px-2 text-xs gap-1 rounded-[var(--radius-xs)]',
  sm: 'h-8 px-3 text-title gap-1.5 rounded-[var(--radius-sm)]',
  md: 'h-10 px-4 text-sm gap-2 rounded-[var(--radius-sm)]',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  loading?: boolean;
  full?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'sm', icon: Icon, iconRight: IconRight, loading, full, className, children, disabled, style, ...rest },
  ref,
) {
  const bg =
    variant === 'primary'
      ? { background: 'var(--brand-500)' }
      : variant === 'danger'
        ? { background: 'var(--danger)' }
        : variant === 'secondary'
          ? { background: 'var(--surface-raised)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }
          : { color: 'var(--text-secondary)' };

  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 cursor-pointer items-center justify-center font-medium whitespace-nowrap transition-all duration-150',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANT[variant],
        SIZE[size],
        full && 'w-full',
        className,
      )}
      style={{ ...bg, ...style }}
      {...rest}
    >
      {loading ? <Loader2 size={size === 'xs' ? 12 : 14} className="animate-spin" aria-hidden /> : Icon ? <Icon size={size === 'xs' ? 12 : 14} strokeWidth={2.2} aria-hidden /> : null}
      {children}
      {IconRight && !loading ? <IconRight size={size === 'xs' ? 12 : 14} strokeWidth={2.2} aria-hidden /> : null}
    </button>
  );
});

/**
 * A link that looks like a button.
 *
 * This exists because `<a><button>…</button></a>` is invalid HTML: the nesting
 * is not allowed, browsers recover from it inconsistently, and in several of
 * them the inner button swallows the click so the link never navigates. Every
 * place that needs "a button that goes somewhere" uses this instead, so the
 * anchor is the interactive element and keyboard, middle-click, and
 * open-in-new-tab all behave as a user expects.
 */
export function LinkButton({
  href,
  children,
  variant = 'secondary',
  size = 'sm',
  icon: Icon,
  iconRight: IconRight,
  external,
  download,
  full,
  className,
  ariaLabel,
  title,
}: {
  href: string;
  children?: ReactNode;
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  external?: boolean;
  download?: boolean;
  full?: boolean;
  className?: string;
  ariaLabel?: string;
  title?: string;
}) {
  const bg =
    variant === 'primary'
      ? { background: 'var(--brand-500)' }
      : variant === 'danger'
        ? { background: 'var(--danger)' }
        : variant === 'secondary'
          ? { background: 'var(--surface-raised)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }
          : { color: 'var(--text-secondary)' };

  const content = (
    <>
      {Icon ? <Icon size={size === 'xs' ? 12 : 14} strokeWidth={2.2} aria-hidden /> : null}
      {children}
      {IconRight ? <IconRight size={size === 'xs' ? 12 : 14} strokeWidth={2.2} aria-hidden /> : null}
    </>
  );

  const cls = cn(
    'inline-flex shrink-0 cursor-pointer items-center justify-center font-medium whitespace-nowrap no-underline transition-all duration-150',
    VARIANT[variant],
    SIZE[size],
    full && 'w-full',
    className,
  );

  // A download or an off-site destination is a plain anchor; the client-side
  // router would either intercept the download or fail on the external origin.
  if (external || download) {
    return (
      <a
        href={href}
        className={cls}
        style={bg}
        aria-label={ariaLabel}
        title={title}
        {...(download ? { download: '' } : {})}
        {...(external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
      >
        {content}
      </a>
    );
  }

  return (
    <Link href={href} className={cls} style={bg} aria-label={ariaLabel} title={title}>
      {content}
    </Link>
  );
}

export function IconButton({
  icon: Icon,
  label,
  size = 'sm',
  variant = 'ghost',
  className,
  ...rest
}: Omit<ButtonProps, 'icon' | 'children'> & { icon: LucideIcon; label: string }) {
  const dim = size === 'xs' ? 'size-7' : size === 'sm' ? 'size-8' : 'size-10';
  return (
    <Button
      variant={variant}
      size={size}
      aria-label={label}
      title={label}
      className={cn(dim, 'px-0', className)}
      {...rest}
    >
      <Icon size={size === 'xs' ? 13 : 15} strokeWidth={2.1} aria-hidden />
    </Button>
  );
}

// ──────────────────────────────────────────────────────────── Form controls ──

const fieldBase =
  'w-full rounded-[var(--radius-sm)] border bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] ' +
  'placeholder:text-[var(--text-tertiary)] transition-[border-color,box-shadow] duration-150 ' +
  'focus:border-[var(--brand-400)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-200)] ' +
  'disabled:opacity-60 disabled:cursor-not-allowed';

/**
 * A labelled form control.
 *
 * The label is bound to its control programmatically. Where the caller has not
 * supplied an id, one is generated and injected into the child, so the
 * association exists in the accessibility tree rather than only visually — a
 * screen reader announces "Value in GBP, edit text" instead of "edit text".
 * The hint and any error message are wired up through aria-describedby for the
 * same reason.
 */
export function Field({
  label,
  hint,
  error,
  required,
  children,
  htmlFor,
  className,
  inline,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  htmlFor?: string;
  className?: string;
  inline?: boolean;
}) {
  const generated = useId();
  const controlId = htmlFor ?? `field-${generated}`;
  const hintId = hint || error ? `${controlId}-desc` : undefined;
  const wrapRef = useRef<HTMLDivElement>(null);

  // The common case: the child is the control itself, so the id can be applied
  // during render and the association exists in the server-rendered HTML.
  const child =
    isValidElement(children) && typeof children.type === 'object'
      ? cloneElement(children as ReactElement<Record<string, unknown>>, {
          id: (children.props as { id?: string }).id ?? controlId,
          'aria-describedby': (children.props as { ['aria-describedby']?: string })['aria-describedby'] ?? hintId,
          ...(error ? { 'aria-invalid': true } : {}),
        })
      : children;

  /**
   * The awkward case: the control is wrapped — a currency symbol in front of an
   * amount, an icon in front of a URL, a reveal button after a password. The id
   * would land on the wrapper, which is not a labelable element, and the label
   * would point at nothing. Finding the real control after mount covers every
   * shape of wrapper without each caller having to remember to pass an id.
   */
  useEffect(() => {
    const control = wrapRef.current?.querySelector<HTMLElement>(
      'input:not([type="hidden"]), select, textarea',
    );
    if (!control) return;
    if (!control.id) control.id = controlId;
    if (hintId && !control.getAttribute('aria-describedby')) control.setAttribute('aria-describedby', hintId);
  }, [controlId, hintId, children]);

  return (
    <div className={cn('min-w-0', inline ? 'flex items-center gap-3' : 'space-y-1.5', className)}>
      {label ? (
        <label htmlFor={controlId} className="block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
          {label}
          {required ? <span style={{ color: 'var(--danger)' }}> *</span> : null}
        </label>
      ) : null}
      <div ref={wrapRef} className="min-w-0 flex-1">
        {child}
      </div>
      {error ? (
        <p id={hintId} className="text-xs" style={{ color: 'var(--danger)' }} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-meta leading-snug" style={{ color: 'var(--text-tertiary)' }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={cn(fieldBase, 'h-9', className)}
        style={{ borderColor: invalid ? 'var(--danger)' : 'var(--border-default)' }}
        aria-invalid={invalid || undefined}
        {...rest}
      />
    );
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={cn(fieldBase, 'min-h-[76px] py-2 leading-relaxed', className)}
      style={{ borderColor: 'var(--border-default)' }}
      {...rest}
    />
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cn(fieldBase, 'h-9 cursor-pointer appearance-none bg-no-repeat pr-8', className)}
      style={{
        borderColor: 'var(--border-default)',
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='3' stroke-linecap='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
        backgroundPosition: 'right 10px center',
        backgroundSize: '11px',
      }}
      {...rest}
    >
      {children}
    </select>
  );
});

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="relative mt-0.5 h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 disabled:opacity-50"
        style={{ background: checked ? 'var(--brand-500)' : 'var(--border-strong)' }}
      >
        <span
          className="absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow-sm transition-transform duration-200"
          style={{ transform: checked ? 'translateX(16px)' : 'translateX(0)' }}
        />
      </button>
      {label ? (
        <label htmlFor={id} className="cursor-pointer select-none">
          <span className="block text-sm" style={{ color: 'var(--text-primary)' }}>
            {label}
          </span>
          {description ? (
            <span className="mt-0.5 block text-xs leading-snug" style={{ color: 'var(--text-tertiary)' }}>
              {description}
            </span>
          ) : null}
        </label>
      ) : null}
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'sm',
  fullWidth,
}: {
  options: { value: T; label: ReactNode; title?: string }[];
  value: T;
  onChange: (v: T) => void;
  size?: 'xs' | 'sm';
  fullWidth?: boolean;
}) {
  return (
    <div
      role="tablist"
      className={cn('inline-flex rounded-[var(--radius-sm)] p-0.5', fullWidth && 'w-full')}
      style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border-subtle)' }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cn(
              'cursor-pointer rounded-[calc(var(--radius-sm)-2px)] font-medium whitespace-nowrap transition-all duration-150',
              size === 'xs' ? 'px-2 py-1 text-meta' : 'px-2.5 py-1 text-xs',
              fullWidth && 'flex-1',
            )}
            style={
              active
                ? { background: 'var(--surface-raised)', color: 'var(--text-primary)', boxShadow: 'var(--shadow-xs)' }
                : { color: 'var(--text-tertiary)' }
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────── Contextual layer: info tip ──

/**
 * "Show working" affordance. Every derived figure in this application can
 * explain itself — the tip carries the formula and the caveats rather than
 * asking the reader to trust the number.
 */
/**
 * Only one explanation is ever open at a time.
 *
 * Without this, opening a second tip left the first one on screen, where its
 * floating panel could sit on top of neighbouring controls and swallow their
 * clicks. Broadcasting on open lets every other instance stand down.
 */
const TIP_OPENED = 'imperial-subs:infotip-opened';

export function InfoTip({ children, label = 'How this is calculated', width = 320 }: { children: ReactNode; label?: string; width?: number }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLButtonElement>(null);
  const mounted = useIsClient();
  const instanceId = useId();

  useEffect(() => {
    const standDown = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== instanceId) setOpen(false);
    };
    document.addEventListener(TIP_OPENED, standDown);
    return () => document.removeEventListener(TIP_OPENED, standDown);
  }, [instanceId]);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      setOpen(false);
    };
    document.addEventListener('keydown', close);
    document.addEventListener('click', close);
    // Closing on scroll as well, because the panel is positioned absolutely
    // against the viewport and would otherwise drift away from its button.
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('keydown', close);
      document.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const r = ref.current?.getBoundingClientRect();
    if (r) {
      const left = Math.min(Math.max(8, r.left + r.width / 2 - width / 2), window.innerWidth - width - 8);
      // Flip above the button when there is not enough room below it, so the
      // panel is never pushed off the bottom of the window.
      const wantsAbove = r.bottom + 8 + 180 > window.innerHeight && r.top > 200;
      setCoords({ top: wantsAbove ? Math.max(8, r.top - 8 - 180) : r.bottom + 8, left });
    }
    setOpen((v) => {
      const next = !v;
      if (next) document.dispatchEvent(new CustomEvent(TIP_OPENED, { detail: instanceId }));
      return next;
    });
  };

  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={toggle}
        aria-label={label}
        aria-expanded={open}
        // A 24px target with the icon centred inside it. The previous 16px
        // button was genuinely difficult to hit, and fell below the WCAG 2.2
        // minimum target size.
        className="relative inline-grid size-6 shrink-0 cursor-pointer place-items-center rounded-full align-middle transition-colors hover:bg-[var(--surface-hover)]"
        style={{ color: open ? 'var(--brand-600)' : 'var(--text-tertiary)' }}
      >
        <HelpCircle size={13} strokeWidth={2.2} aria-hidden />
      </button>
      {mounted && open && coords
        ? createPortal(
            <div
              role="tooltip"
              onClick={(e) => e.stopPropagation()}
              className="fixed z-[80] rounded-[var(--radius-md)] border p-3 text-xs leading-relaxed shadow-[var(--shadow-lg)]"
              style={{
                top: coords.top,
                left: coords.left,
                width,
                background: 'var(--surface-raised)',
                borderColor: 'var(--border-default)',
                color: 'var(--text-secondary)',
              }}
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

// ────────────────────────────────────── Contextual layer: slide-over sheet ──

export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  const mounted = useIsClient();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <>
      <div className="layer-scrim" onClick={onClose} aria-hidden />
      <aside className="layer-inspector" role="dialog" aria-modal="true" style={width ? { width: `min(${width}px, 100vw)` } : undefined}>
        <header
          className="flex items-start justify-between gap-4 px-5 py-4"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}
        >
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-0.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {subtitle}
              </p>
            ) : null}
          </div>
          <IconButton icon={X} label="Close" onClick={onClose} />
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <footer className="px-5 py-3" style={{ borderTop: '1px solid var(--border-subtle)', background: 'var(--surface-sunken)' }}>
            {footer}
          </footer>
        ) : null}
      </aside>
    </>,
    document.body,
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 560,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  const mounted = useIsClient();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <>
      <div className="layer-scrim" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        className="fixed top-1/2 left-1/2 z-[62] max-h-[85vh] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[var(--radius-xl)] border shadow-[var(--shadow-lg)]"
        style={{ width: `min(${width}px, calc(100vw - 2rem))`, background: 'var(--surface-raised)', borderColor: 'var(--border-default)' }}
      >
        <header className="flex items-center justify-between gap-4 px-5 py-3.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {title}
          </h2>
          <IconButton icon={X} label="Close" onClick={onClose} size="xs" />
        </header>
        <div className="max-h-[60vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <footer className="px-5 py-3" style={{ borderTop: '1px solid var(--border-subtle)', background: 'var(--surface-sunken)' }}>
            {footer}
          </footer>
        ) : null}
      </div>
    </>,
    document.body,
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd
      className="inline-flex h-5 min-w-5 items-center justify-center rounded border px-1 font-mono text-micro"
      style={{ background: 'var(--surface-sunken)', borderColor: 'var(--border-default)', color: 'var(--text-tertiary)' }}
    >
      {children}
    </kbd>
  );
}

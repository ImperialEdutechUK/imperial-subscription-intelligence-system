'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { ArrowRight, CornerDownLeft, Search } from 'lucide-react';
import { Kbd } from '@/components/ui/controls';
import { formatMoney } from '@/lib/money';
import { useIsClient } from '@/lib/use-client-only';

interface NavEntry {
  href: string;
  label: string;
  hint: string;
}

type PaletteRow =
  | { kind: 'sub'; key: string; item: SearchHit }
  | { kind: 'nav'; key: string; item: NavEntry };

/**
 * A subscription result opens the register with that row's inspector already
 * open. There is deliberately no per-subscription route: one register with one
 * inspector means there is no second page that can drift out of step, and no
 * URL that can 404 if a subscription is deleted.
 */
function targetFor(row: PaletteRow): string {
  return row.kind === 'sub' ? `/subscriptions?focus=${encodeURIComponent(row.item.id)}` : row.item.href;
}

interface SearchHit {
  id: string;
  name: string;
  vendor: string | null;
  monthlyGbp: number;
  category: string;
  departments: string[];
}

/**
 * Command palette — the keyboard route into everything. It searches the
 * subscription register live and falls back to navigation entries, so ⌘K is a
 * single entry point rather than one more thing to learn.
 */
export function CommandPalette({ open, onClose, nav }: { open: boolean; onClose: () => void; nav: NavEntry[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [cursor, setCursor] = useState(0);
  const mounted = useIsClient();
  const inputRef = useRef<HTMLInputElement>(null);

  // Resetting on open is state derived from a prop change, so it belongs in
  // render rather than an effect — this is React's documented "adjust state
  // when a prop changes" pattern and avoids a wasted second render.
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setQuery('');
      setCursor(0);
    }
  }

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const searching = open && query.trim().length >= 2;

  useEffect(() => {
    if (!searching) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : { results: [] }))
        .then((d) => setHits(d.results ?? []))
          .catch(() => {});
    }, 140);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, searching]);

  const navMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return nav;
    return nav.filter((n) => n.label.toLowerCase().includes(q) || n.hint.toLowerCase().includes(q));
  }, [query, nav]);

  // Results are gated on the current query rather than cleared in an effect, so
  // a stale response from an earlier keystroke can never render.
  const rows: PaletteRow[] = useMemo(
    () => [
      ...(searching ? hits.map((h) => ({ kind: 'sub' as const, key: h.id, item: h })) : []),
      ...navMatches.map((n) => ({ kind: 'nav' as const, key: n.href, item: n })),
    ],
    [hits, navMatches, searching],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose();
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCursor((c) => Math.min(c + 1, rows.length - 1));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCursor((c) => Math.max(c - 1, 0));
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const row = rows[cursor];
        if (!row) return;
        onClose();
        router.push(targetFor(row));
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, rows, cursor, onClose, router]);

  if (!mounted || !open) return null;

  return createPortal(
    <>
      <div className="layer-scrim" style={{ zIndex: 70 }} onClick={onClose} aria-hidden />
      <div className="layer-palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="flex items-center gap-2.5 px-4 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <Search size={16} strokeWidth={2.2} style={{ color: 'var(--text-tertiary)' }} aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            placeholder="Search subscriptions, or jump to a page…"
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: 'var(--text-primary)' }}
            aria-label="Search"
          />
          <Kbd>esc</Kbd>
        </div>

        <div className="max-h-[52vh] overflow-y-auto py-1.5">
          {rows.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {query.trim().length < 2 ? 'Type at least two characters to search the register.' : 'Nothing matched that search.'}
            </p>
          ) : null}

          {rows.map((row, i) => {
            const selected = i === cursor;
            return (
              <button
                key={`${row.kind}-${row.key}`}
                onMouseEnter={() => setCursor(i)}
                onClick={() => {
                  onClose();
                  router.push(targetFor(row));
                }}
                className="flex w-full cursor-pointer items-center gap-3 px-4 py-2 text-left transition-colors"
                style={{ background: selected ? 'var(--surface-hover)' : 'transparent' }}
              >
                {row.kind === 'sub' ? (
                  <>
                    <span
                      className="grid size-7 shrink-0 place-items-center rounded-[var(--radius-xs)] text-[0.625rem] font-semibold"
                      style={{ background: 'var(--brand-50)', color: 'var(--brand-700)' }}
                      aria-hidden
                    >
                      {row.item.name.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm" style={{ color: 'var(--text-primary)' }}>
                        {row.item.name}
                      </span>
                      <span className="block truncate text-[0.6875rem]" style={{ color: 'var(--text-tertiary)' }}>
                        {[row.item.vendor, row.item.departments.join(', ')].filter(Boolean).join(' · ') || 'Subscription'}
                      </span>
                    </span>
                    <span className="tabular shrink-0 text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {formatMoney(row.item.monthlyGbp)}/mo
                    </span>
                  </>
                ) : (
                  <>
                    <span
                      className="grid size-7 shrink-0 place-items-center rounded-[var(--radius-xs)]"
                      style={{ background: 'var(--surface-sunken)', color: 'var(--text-tertiary)' }}
                      aria-hidden
                    >
                      <ArrowRight size={13} strokeWidth={2.2} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm" style={{ color: 'var(--text-primary)' }}>
                        {row.item.label}
                      </span>
                      <span className="block truncate text-[0.6875rem]" style={{ color: 'var(--text-tertiary)' }}>
                        {row.item.hint}
                      </span>
                    </span>
                  </>
                )}
                {selected ? <CornerDownLeft size={12} style={{ color: 'var(--text-tertiary)' }} aria-hidden /> : null}
              </button>
            );
          })}
        </div>
      </div>
    </>,
    document.body,
  );
}

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  Building2,
  CreditCard,
  LayoutDashboard,
  ListTree,
  Search,
  Upload,
  CalendarClock,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { Kbd } from '@/components/ui/controls';
import { CommandPalette } from './CommandPalette';
import { signOut } from '@/server/auth-actions';

const NAV = [
  { href: '/', label: 'Overview', icon: LayoutDashboard, hint: 'Spend, renewals and risk at a glance' },
  { href: '/subscriptions', label: 'Subscriptions', icon: ListTree, hint: 'The full register — add and edit here' },
  { href: '/renewals', label: 'Renewals & alerts', icon: CalendarClock, hint: 'What is due, and which card needs topping up' },
  { href: '/cards', label: 'Cards & top-ups', icon: CreditCard, hint: 'Card balances and shortfall detection' },
  { href: '/departments', label: 'Departments', icon: Building2, hint: 'Cost per department, including shared splits' },
  { href: '/analytics', label: 'Analytics', icon: BarChart3, hint: 'Trends, concentration and statistical observations' },
  { href: '/import', label: 'Import & export', icon: Upload, hint: 'Paste from Excel, upload CSV, export for Finance' },
] as const;

export function AppShell({
  children,
  orgName,
  user,
}: {
  children: React.ReactNode;
  orgName: string;
  /** Null on the sign-in page, where there is nobody to sign out. */
  user: { name: string; email: string; role: string } | null;
}) {
  const pathname = usePathname();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Closing on click covers the ordinary case; this also catches back/forward,
  // which would otherwise leave the panel open over the page it navigated to.
  // Adjusting during render rather than in an effect: React re-runs this pass
  // before painting, so the panel never flashes on the new route.
  const [navPathname, setNavPathname] = useState(pathname);
  if (navPathname !== pathname) {
    setNavPathname(pathname);
    setNavOpen(false);
  }

  const active = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <div className="flex min-h-screen flex-col">
      {/* ── Top bar ──────────────────────────────────────────────────────
          One thin, quiet band across the full width: brand, destinations,
          then the tools. Replacing the sidebar returns roughly 228px of
          horizontal space to the tables, which is what this product is
          mostly made of. The page title is not repeated here — every page
          already opens with its own header. */}
      <header
        className="no-print sticky top-0 z-40"
        style={{ background: 'var(--surface-raised)', borderBottom: '1px solid var(--border-default)' }}
      >
        <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center gap-1.5 px-4 md:px-6">
          <button
            onClick={() => setNavOpen((v) => !v)}
            aria-label={navOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={navOpen}
            aria-controls="mobile-nav"
            className="-ml-1 grid size-9 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-sm)] transition-colors hover:bg-[var(--surface-hover)] md:hidden"
            style={{ color: 'var(--text-secondary)' }}
          >
            {navOpen ? <X size={18} strokeWidth={2} aria-hidden /> : <Menu size={18} strokeWidth={2} aria-hidden />}
          </button>

          <Link href="/" className="mr-3 flex shrink-0 items-center gap-2" aria-label={`${orgName} home`}>
            <span
              className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-sm)] text-meta font-bold text-white"
              style={{ background: 'var(--brand-500)' }}
              aria-hidden
            >
              IE
            </span>
            <span className="hidden truncate text-base font-semibold sm:inline" style={{ color: 'var(--text-primary)' }}>
              {orgName}
            </span>
          </Link>

          {/* Destinations. Evenly spaced, low contrast until they are the
              current one — the bar should recede once you have arrived. */}
          <nav className="hidden min-w-0 items-center gap-0.5 md:flex" aria-label="Primary">
            {NAV.map((item) => {
              const isActive = active(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.hint}
                  aria-current={isActive ? 'page' : undefined}
                  className="rounded-[var(--radius-sm)] px-3 py-2 text-[0.9375rem] font-medium whitespace-nowrap transition-colors hover:bg-[var(--surface-hover)]"
                  style={
                    isActive
                      ? { color: 'var(--brand-700)', background: 'var(--brand-50)' }
                      : { color: 'var(--text-secondary)' }
                  }
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <button
              onClick={() => setPaletteOpen(true)}
              className="flex h-8 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border px-2.5 text-xs transition-colors hover:bg-[var(--surface-hover)]"
              style={{ borderColor: 'var(--border-default)', color: 'var(--text-tertiary)', background: 'var(--surface-raised)' }}
            >
              <Search size={13} strokeWidth={2.2} aria-hidden />
              <span className="hidden lg:inline">Search or jump to…</span>
              <span className="hidden items-center gap-0.5 lg:flex">
                <Kbd>⌘</Kbd>
                <Kbd>K</Kbd>
              </span>
            </button>

            {user ? (
              <form action={signOut} className="flex items-center">
                <button
                  type="submit"
                  title={`Sign out ${user.email}`}
                  aria-label={`Sign out ${user.email}`}
                  className="grid size-8 cursor-pointer place-items-center rounded-[var(--radius-sm)] transition-colors hover:bg-[var(--surface-hover)]"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  <LogOut size={14} strokeWidth={2} aria-hidden />
                </button>
              </form>
            ) : null}
          </div>
        </div>
      </header>

      {/* Mobile destinations. A panel under the bar rather than an overlay
          drawer: no focus trap, no scroll lock, nobody stranded behind a scrim. */}
      {navOpen ? (
        <nav
          id="mobile-nav"
          aria-label="Primary"
          className="no-print sticky top-16 z-30 md:hidden"
          style={{ background: 'var(--surface-raised)', borderBottom: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-md)' }}
        >
          <ul className="space-y-0.5 p-2">
            {NAV.map((item) => {
              const isActive = active(item.href);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setNavOpen(false)}
                    aria-current={isActive ? 'page' : undefined}
                    className="flex items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 text-sm font-medium transition-colors"
                    style={isActive ? { background: 'var(--brand-50)', color: 'var(--brand-700)' } : { color: 'var(--text-secondary)' }}
                  >
                    <Icon size={17} strokeWidth={2} aria-hidden className="shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {user ? (
            <div className="px-5 py-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <span className="truncate text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {user.name} · {user.role.charAt(0) + user.role.slice(1).toLowerCase()}
              </span>
            </div>
          ) : null}
        </nav>
      ) : null}

      <div className="mx-auto flex w-full max-w-[1600px] min-w-0 flex-1 flex-col">
        <main className="min-w-0 flex-1 px-4 py-5 md:px-6 md:py-6">{children}</main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} nav={NAV.map((n) => ({ href: n.href, label: n.label, hint: n.hint }))} />
    </div>
  );
}

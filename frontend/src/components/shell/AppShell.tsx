'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  Building2,
  CreditCard,
  LayoutDashboard,
  ListTree,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Rows3,
  Rows4,
  Search,
  Settings as SettingsIcon,
  Sun,
  Upload,
  CalendarClock,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { IconButton, Kbd } from '@/components/ui/controls';
import { CommandPalette } from './CommandPalette';
import { signOut } from '@/server/auth-actions';

const NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, hint: 'Bento overview of spend, renewals and risk' },
  { href: '/subscriptions', label: 'Subscriptions', icon: ListTree, hint: 'The full register — add and edit here' },
  { href: '/renewals', label: 'Renewals & alerts', icon: CalendarClock, hint: 'What is due, and which card needs topping up' },
  { href: '/cards', label: 'Cards & top-ups', icon: CreditCard, hint: 'Card balances and shortfall detection' },
  { href: '/departments', label: 'Departments', icon: Building2, hint: 'Cost per department, including shared splits' },
  { href: '/analytics', label: 'Analytics', icon: BarChart3, hint: 'Trends, concentration and statistical observations' },
  { href: '/import', label: 'Import & export', icon: Upload, hint: 'Paste from Excel, upload CSV, export for Finance' },
  { href: '/settings', label: 'Settings', icon: SettingsIcon, hint: 'Brand, currencies, alert thresholds, users' },
] as const;

type Theme = 'light' | 'dark';
type Density = 'comfortable' | 'compact';

export function AppShell({
  children,
  orgName,
  initialTheme,
  initialDensity,
  initialCollapsed,
  themeChosen,
  user,
}: {
  children: React.ReactNode;
  orgName: string;
  initialTheme: Theme;
  initialDensity: Density;
  initialCollapsed: boolean;
  /** False until the user has explicitly picked a theme; light is used until then. */
  themeChosen: boolean;
  /** Null on the sign-in page, where there is nobody to sign out. */
  user: { name: string; email: string; role: string } | null;
}) {
  const pathname = usePathname();
  const [chosenTheme, setChosenTheme] = useState<Theme | null>(themeChosen ? initialTheme : null);
  const [density, setDensity] = useState<Density>(initialDensity);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  // Light unless the person has explicitly asked for dark. The operating
  // system's preference is deliberately not consulted: this is a shared
  // internal tool that is printed and screen-shared, and it should look the
  // same on every machine rather than changing with whoever's laptop is set to
  // dark mode. The toggle below still switches, and that choice persists.
  const theme: Theme = chosenTheme ?? 'light';

  // Preferences live in cookies rather than localStorage so the server can
  // render the correct theme in the first byte of HTML — no flash, and nothing
  // for hydration to disagree about. A year is long enough that the preference
  // effectively sticks, and the cookie carries no personal data.
  const persist = (key: string, value: string) => {
    document.cookie = `${key}=${value}; path=/; max-age=31536000; samesite=lax`;
  };

  // Keeps the document attribute in step with the resolved theme. Mutating the
  // DOM is what an effect is for; no state is set here.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const applyTheme = useCallback((t: Theme) => {
    setChosenTheme(t);
    document.documentElement.setAttribute('data-theme', t);
    persist('ie-theme', t);
  }, []);

  const applyDensity = useCallback((d: Density) => {
    setDensity(d);
    document.documentElement.setAttribute('data-density', d);
    persist('ie-density', d);
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      persist('ie-nav', c ? '0' : '1');
      return !c;
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleCollapsed();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [toggleCollapsed]);

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
  const current = NAV.find((n) => active(n.href));

  return (
    <div className="flex min-h-screen">
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <nav
        className={cn(
          'no-print sticky top-0 hidden h-screen shrink-0 flex-col transition-[width] duration-200 md:flex',
          collapsed ? 'w-[60px]' : 'w-[228px]',
        )}
        style={{ background: 'var(--surface-raised)', borderRight: '1px solid var(--border-subtle)' }}
        aria-label="Primary"
      >
        <div className={cn('flex h-14 items-center gap-2.5 px-3.5', collapsed && 'justify-center px-0')}>
          <div
            className="grid size-8 shrink-0 place-items-center rounded-[10px] text-title font-bold text-white"
            style={{ background: 'var(--brand-600)', boxShadow: 'var(--shadow-brand)' }}
            aria-hidden
          >
            IE
          </div>
          {!collapsed ? (
            <div className="min-w-0 leading-tight">
              <p className="truncate text-title font-semibold" style={{ color: 'var(--text-primary)' }}>
                {orgName}
              </p>
              <p className="truncate text-meta" style={{ color: 'var(--text-tertiary)' }}>
                Subscription Intelligence
              </p>
            </div>
          ) : null}
        </div>

        <div className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
          {NAV.map((item) => {
            const isActive = active(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : item.hint}
                className={cn(
                  'group relative flex items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-title font-medium transition-colors duration-150',
                  collapsed && 'justify-center px-0',
                )}
                style={
                  isActive
                    ? { background: 'var(--brand-50)', color: 'var(--brand-700)' }
                    : { color: 'var(--text-secondary)' }
                }
              >
                {isActive ? (
                  <span
                    className="absolute top-1/2 left-0 h-4 w-[3px] -translate-y-1/2 rounded-r-full"
                    style={{ background: 'var(--brand-600)' }}
                    aria-hidden
                  />
                ) : null}
                <Icon size={16} strokeWidth={2} aria-hidden className="shrink-0" />
                {!collapsed ? <span className="truncate">{item.label}</span> : null}
              </Link>
            );
          })}
        </div>

        <div className="space-y-2 px-2 pb-3" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '0.75rem' }}>
          {/* Who is signed in, and the way out. A shared workstation is the norm
              here, so leaving no way to end a session would mean the next person
              inherits an administrator's view of stored credentials. */}
          {user ? (
            <form action={signOut} className={cn('flex items-center gap-2', collapsed ? 'justify-center' : 'px-1')}>
              {!collapsed ? (
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                    {user.name}
                  </p>
                  <p className="truncate text-meta" style={{ color: 'var(--text-tertiary)' }} title={user.email}>
                    {user.role.charAt(0) + user.role.slice(1).toLowerCase()}
                  </p>
                </div>
              ) : null}
              <button
                type="submit"
                title={`Sign out ${user.email}`}
                aria-label={`Sign out ${user.email}`}
                className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-sm)] transition-colors hover:bg-[var(--surface-hover)]"
                style={{ color: 'var(--text-tertiary)' }}
              >
                <LogOut size={14} strokeWidth={2} aria-hidden />
              </button>
            </form>
          ) : null}

          <div className={cn('flex items-center gap-1', collapsed ? 'flex-col' : 'justify-between px-1')}>
            <IconButton
              icon={theme === 'dark' ? Sun : Moon}
              label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              size="xs"
              onClick={() => applyTheme(theme === 'dark' ? 'light' : 'dark')}
            />
            <IconButton
              icon={density === 'compact' ? Rows3 : Rows4}
              label={density === 'compact' ? 'Comfortable spacing' : 'Compact spacing'}
              size="xs"
              onClick={() => applyDensity(density === 'compact' ? 'comfortable' : 'compact')}
            />
            <IconButton
              icon={collapsed ? PanelLeftOpen : PanelLeftClose}
              label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              size="xs"
              onClick={toggleCollapsed}
            />
          </div>
        </div>
      </nav>

      {/* ── Main column ─────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="no-print sticky top-0 z-40 flex h-14 items-center gap-3 px-4 backdrop-blur-md md:px-6"
          style={{ background: 'color-mix(in srgb, var(--surface-canvas) 88%, transparent)', borderBottom: '1px solid var(--border-subtle)' }}
        >
          {/* The sidebar is hidden below `md`. Without this the only reachable
              page on a phone is the one already open. */}
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

          <h1 className="truncate text-sm font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            {current?.label ?? 'Subscription Intelligence'}
          </h1>
          <span className="hidden text-xs md:inline" style={{ color: 'var(--text-tertiary)' }}>
            {current?.hint}
          </span>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setPaletteOpen(true)}
              className="flex h-8 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border px-2.5 text-xs transition-colors hover:bg-[var(--surface-hover)]"
              style={{ borderColor: 'var(--border-default)', color: 'var(--text-tertiary)', background: 'var(--surface-raised)' }}
            >
              <Search size={13} strokeWidth={2.2} aria-hidden />
              <span className="hidden sm:inline">Search or jump to…</span>
              <span className="hidden sm:flex items-center gap-0.5">
                <Kbd>⌘</Kbd>
                <Kbd>K</Kbd>
              </span>
            </button>

            {/* The sidebar is hidden below `md`, and nothing replaces it, so the
                sign-out control there is unreachable on a phone. This one covers
                that case and is hidden once the sidebar is visible. */}
            {user ? (
              <form action={signOut} className="md:hidden">
                <button
                  type="submit"
                  title={`Sign out ${user.email}`}
                  aria-label={`Sign out ${user.email}`}
                  className="grid size-8 cursor-pointer place-items-center rounded-[var(--radius-sm)] border transition-colors hover:bg-[var(--surface-hover)]"
                  style={{ borderColor: 'var(--border-default)', color: 'var(--text-tertiary)', background: 'var(--surface-raised)' }}
                >
                  <LogOut size={14} strokeWidth={2} aria-hidden />
                </button>
              </form>
            ) : null}
          </div>
        </header>

        {/* Mobile navigation. A panel under the header rather than an overlay
            drawer: it needs no focus trap, no scroll lock and no backdrop, and
            it cannot strand someone behind a scrim on a small screen. */}
        {navOpen ? (
          <nav
            id="mobile-nav"
            aria-label="Primary"
            className="no-print sticky top-14 z-30 md:hidden"
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
                      style={
                        isActive
                          ? { background: 'var(--brand-50)', color: 'var(--brand-700)' }
                          : { color: 'var(--text-secondary)' }
                      }
                    >
                      <Icon size={17} strokeWidth={2} aria-hidden className="shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            {user ? (
              <div
                className="flex items-center justify-between gap-3 px-5 py-3"
                style={{ borderTop: '1px solid var(--border-subtle)' }}
              >
                <span className="min-w-0 truncate text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  {user.name} · {user.role.charAt(0) + user.role.slice(1).toLowerCase()}
                </span>
              </div>
            ) : null}
          </nav>
        ) : null}

        <main className="min-w-0 flex-1 px-4 py-5 md:px-6 md:py-6">{children}</main>

        <footer className="no-print px-6 pb-6 text-meta" style={{ color: 'var(--text-tertiary)' }}>
          All monetary figures are normalised to GBP using the exchange rates recorded in Settings. Figures derived from
          usage or credit top-ups are labelled as estimates wherever they appear.
        </footer>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} nav={NAV.map((n) => ({ href: n.href, label: n.label, hint: n.hint }))} />
    </div>
  );
}

import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { Inter } from 'next/font/google';
import './globals.css';
import { AppShell } from '@/components/shell/AppShell';
import { getBrandSettings } from '@/server/settings';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: {
    default: 'Subscription Intelligence — Imperial Edutech',
    template: '%s · Imperial Edutech',
  },
  description:
    'Departmental subscription, cost allocation and renewal tracking for Imperial Edutech. Built for Course Development and shared with Finance.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#231b1a' },
  ],
  width: 'device-width',
  initialScale: 1,
};

/**
 * Theme and density are resolved on the server from cookies the shell writes.
 *
 * The usual approach — an inline script that reads localStorage before first
 * paint — works, but React 19 objects to a <script> rendered inside a
 * component, and any value the script computes is a hydration mismatch waiting
 * to happen. Reading a cookie server-side gives the correct theme in the very
 * first byte of HTML, with no flash and nothing for the client to disagree with.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [brand, jar] = await Promise.all([getBrandSettings(), cookies()]);
  const themeCookie = jar.get('ie-theme')?.value;
  const themeChosen = themeCookie === 'dark' || themeCookie === 'light';
  const theme = themeCookie === 'dark' ? 'dark' : 'light';
  const density = jar.get('ie-density')?.value === 'compact' ? 'compact' : 'comfortable';
  const collapsed = jar.get('ie-nav')?.value === '1';

  return (
    <html
      lang="en-GB"
      data-theme={theme}
      data-density={density}
      data-scroll-behavior="smooth"
      className={inter.variable}
      suppressHydrationWarning
    >
      <head>
        {/* The brand seed is injected server-side so the palette is correct on
            the very first paint rather than after hydration. */}
        <style
          dangerouslySetInnerHTML={{
            __html: `:root{--brand-h:${brand.h};--brand-s:${brand.s}%;--brand-l:${brand.l}%;}`,
          }}
        />
      </head>
      <body className="antialiased">
        <AppShell
          orgName={brand.orgName}
          initialTheme={theme}
          initialDensity={density}
          initialCollapsed={collapsed}
          themeChosen={themeChosen}
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}

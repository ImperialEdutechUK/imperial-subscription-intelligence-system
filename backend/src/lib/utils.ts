/**
 * Server-side helpers.
 *
 * The frontend keeps its own copy of this file that also exports `cn`, the
 * Tailwind class merger. That one is deliberately absent here: it would drag
 * clsx and tailwind-merge into a service that renders no markup.
 */

export function initials(name: string): string {
  return name
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

export function formatDate(d: Date | string | null | undefined, style: 'short' | 'medium' | 'long' = 'medium'): string {
  if (!d) return '—';
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return '—';
  const opts: Intl.DateTimeFormatOptions =
    style === 'short'
      ? { day: '2-digit', month: 'short' }
      : style === 'long'
        ? { day: 'numeric', month: 'long', year: 'numeric' }
        : { day: '2-digit', month: 'short', year: 'numeric' };
  return new Intl.DateTimeFormat('en-GB', opts).format(date);
}

export function relativeDays(days: number | null): string {
  if (days == null) return 'No date set';
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  if (days < 0) return `${Math.abs(days)} days ago`;
  if (days < 31) return `in ${days} days`;
  const months = Math.round(days / 30.44);
  return `in ~${months} month${months === 1 ? '' : 's'}`;
}

export function hostnameOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function parseTags(tags: string | null | undefined): string[] {
  if (!tags) return [];
  return tags.split(',').map((t) => t.trim()).filter(Boolean);
}

/** Deterministic colour from a string — used for department chips without a set colour. */
export function hashColor(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue} 62% 46%)`;
}

import { prisma } from '@/lib/db';

export interface BrandSettings {
  h: number;
  s: number;
  l: number;
  hex: string;
  orgName: string;
}

/** Imperial blue. The -700 step carries small text where the -500 lacks headroom. */
export const DEFAULT_BRAND_HEX = '#1266D3';

export function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const m = hex.trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(m)) return null;
  const r = parseInt(m.slice(0, 2), 16) / 255;
  const g = parseInt(m.slice(2, 4), 16) / 255;
  const b = parseInt(m.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        h = 60 * (((g - b) / d) % 6);
        break;
      case g:
        h = 60 * ((b - r) / d + 2);
        break;
      default:
        h = 60 * ((r - g) / d + 4);
    }
  }
  if (h < 0) h += 360;
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100;
  const ln = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number) => ln - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = (x: number) =>
    Math.round(255 * x)
      .toString(16)
      .padStart(2, '0');
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`.toUpperCase();
}

/** WCAG 2.1 relative luminance and contrast ratio — used to report, not to guess. */
export function contrastRatio(hexA: string, hexB: string): number {
  const lum = (hex: string) => {
    const m = hex.replace('#', '');
    const ch = [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16) / 255);
    const lin = ch.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  };
  const a = lum(hexA);
  const b = lum(hexB);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

const cache = new Map<string, { value: string; at: number }>();
const TTL = 5_000;

export async function getSetting(key: string, fallback: string): Promise<string> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  try {
    const row = await prisma.setting.findUnique({ where: { key } });
    const value = row?.value ?? fallback;
    cache.set(key, { value, at: Date.now() });
    return value;
  } catch {
    // The database may not exist yet on a first run — fall back rather than crash.
    return fallback;
  }
}

export async function setSetting(key: string, value: string) {
  await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  cache.delete(key);
}

export async function getBrandSettings(): Promise<BrandSettings> {
  const hex = await getSetting('brand.hex', DEFAULT_BRAND_HEX);
  const orgName = await getSetting('org.name', 'Imperial Edutech');
  const hsl = hexToHsl(hex) ?? hexToHsl(DEFAULT_BRAND_HEX)!;
  return { ...hsl, hex, orgName };
}

export interface AlertSettings {
  criticalDays: number;
  soonDays: number;
  upcomingDays: number;
  teamsWebhookUrl: string;
}

export async function getAlertSettings(): Promise<AlertSettings> {
  const [criticalDays, soonDays, upcomingDays, teamsWebhookUrl] = await Promise.all([
    getSetting('alerts.criticalDays', '7'),
    getSetting('alerts.soonDays', '21'),
    getSetting('alerts.upcomingDays', '60'),
    getSetting('alerts.teamsWebhookUrl', ''),
  ]);
  return {
    criticalDays: Number(criticalDays) || 7,
    soonDays: Number(soonDays) || 21,
    upcomingDays: Number(upcomingDays) || 60,
    teamsWebhookUrl,
  };
}

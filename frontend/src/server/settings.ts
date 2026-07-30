import 'server-only';
import { api } from '@/lib/api';

/**
 * Settings, as far as the interface is concerned.
 *
 * The values live in the database behind the API service. What stays here is
 * the colour maths — converting the brand hex into the HSL triple the
 * stylesheet is seeded with, and measuring its contrast — because that is
 * presentation, computed on values the API has already returned.
 */

export interface BrandSettings {
  h: number;
  s: number;
  l: number;
  hex: string;
  orgName: string;
}

export interface AlertSettings {
  criticalDays: number;
  soonDays: number;
  upcomingDays: number;
  teamsWebhookUrl: string;
}

export interface SettingsPageData {
  brand: BrandSettings;
  alerts: AlertSettings;
  fxRates: { code: string; rateToGbp: number; source: string | null; updatedAt: Date }[];
  users: { id: string; name: string; email: string; role: string; active: boolean; lastLoginAt: Date | null }[];
  alertsKeyConfigured: boolean;
  authDisabled: boolean;
}

/** Imperial red. Contrast against white measures 4.87:1 — WCAG 2.1 AA for normal text. */
export const DEFAULT_BRAND_HEX = '#DA291C';

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

/**
 * The root layout needs this to render the sign-in page, before anyone has a
 * session — so it is fetched anonymously, and falls back to the default brand
 * if the API service is unreachable. A styling detail must never be the reason
 * the whole interface fails to render.
 */
export async function getBrandSettings(): Promise<BrandSettings> {
  try {
    return await api<BrandSettings>('/api/settings/brand', { anonymous: true });
  } catch {
    const hsl = hexToHsl(DEFAULT_BRAND_HEX)!;
    return { ...hsl, hex: DEFAULT_BRAND_HEX, orgName: 'Imperial Edutech' };
  }
}

/** Everything the settings page renders, in one call. */
export async function getSettingsPageData(): Promise<SettingsPageData> {
  return api<SettingsPageData>('/api/settings');
}

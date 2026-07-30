'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Bell, Check, Coins, Palette, Send, ShieldCheck, Users } from 'lucide-react';
import { BentoTile, TileHeader, TileBody, Badge, KeyValue, EmptyState, Chip } from '@/components/ui/kit';
import { Button, Field, Input, Select, InfoTip } from '@/components/ui/controls';
import { updateSettings, upsertFxRate, deleteFxRate } from '@/server/actions';
import { formatDate } from '@/lib/utils';
import { CURRENCIES } from '@/lib/domain';

export interface SettingsData {
  brandHex: string;
  orgName: string;
  criticalDays: number;
  soonDays: number;
  upcomingDays: number;
  teamsWebhookUrl: string;
  fxRates: { code: string; rateToGbp: number; source: string | null; updatedAt: string }[];
  users: { id: string; name: string; email: string; role: string; active: boolean; lastLoginAt: string | null }[];
  authDisabled: boolean;
  alertsKeyConfigured: boolean;
  canAdminister: boolean;
}

/** WCAG 2.1 relative luminance. Kept client-side so the reading updates as the colour changes. */
function contrastVsWhite(hex: string): number | null {
  const m = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(m)) return null;
  const ch = [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16) / 255);
  const lin = ch.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const l = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  return (1.05) / (l + 0.05);
}

function hexToHsl(hex: string) {
  const m = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(m)) return null;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function SettingsView({ data }: { data: SettingsData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [brandHex, setBrandHex] = useState(data.brandHex);
  const [orgName, setOrgName] = useState(data.orgName);
  const [criticalDays, setCriticalDays] = useState(data.criticalDays);
  const [soonDays, setSoonDays] = useState(data.soonDays);
  const [upcomingDays, setUpcomingDays] = useState(data.upcomingDays);
  const [webhook, setWebhook] = useState(data.teamsWebhookUrl);
  const [testResult, setTestResult] = useState<string | null>(null);

  const [fxCode, setFxCode] = useState('USD');
  const [fxRate, setFxRate] = useState('');
  const [fxSource, setFxSource] = useState('');

  const contrast = useMemo(() => contrastVsWhite(brandHex), [brandHex]);
  const hsl = useMemo(() => hexToHsl(brandHex), [brandHex]);

  const flash = (msg: string) => {
    setSaved(msg);
    setTimeout(() => setSaved(null), 2600);
  };

  const save = (entries: Record<string, string>, msg: string) =>
    startTransition(async () => {
      setError(null);
      const res = await updateSettings(entries);
      if (res.ok) {
        flash(msg);
        router.refresh();
      }
    });

  const previewStyle = hsl
    ? ({ ['--brand-h' as string]: String(hsl.h), ['--brand-s' as string]: `${hsl.s}%`, ['--brand-l' as string]: `${hsl.l}%` } as React.CSSProperties)
    : undefined;

  const readOnly = !data.canAdminister;

  return (
    <div className="space-y-4">
      {saved ? (
        <p
          className="flex items-center gap-2 rounded-[var(--radius-md)] px-3 py-2 text-xs"
          style={{ background: 'var(--positive-bg)', color: 'var(--positive)' }}
          role="status"
        >
          <Check size={13} strokeWidth={2.4} aria-hidden />
          {saved}
        </p>
      ) : null}

      {readOnly ? (
        <p className="rounded-[var(--radius-md)] px-3 py-2 text-xs" style={{ background: 'var(--info-bg)', color: 'var(--text-secondary)' }}>
          You are signed in with a role that can view settings but not change them. Ask an administrator to make changes here.
        </p>
      ) : null}

      <div className="bento">
        {/* ── Brand ──────────────────────────────────────────────────── */}
        <BentoTile col={6} row={5} accent>
          <TileHeader
            title="Brand"
            subtitle="One colour drives the entire interface — ramps, charts, focus rings and dark mode all derive from it"
            icon={Palette}
          />
          <TileBody className="space-y-3">
            <Field label="Organisation name">
              <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} disabled={readOnly} />
            </Field>

            <Field
              label="Primary colour"
              hint="Paste your exact brand hex. Everything else re-tunes around it automatically."
            >
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={brandHex}
                  onChange={(e) => setBrandHex(e.target.value.toUpperCase())}
                  disabled={readOnly}
                  className="h-9 w-14 cursor-pointer rounded border"
                  style={{ borderColor: 'var(--border-default)', background: 'var(--surface-raised)' }}
                  aria-label="Primary brand colour"
                />
                {/* Field labels the first control it finds, which is the colour
                    swatch above. This one needs its own name or a screen reader
                    announces an anonymous edit box. */}
                <Input
                  value={brandHex}
                  onChange={(e) => setBrandHex(e.target.value.toUpperCase())}
                  disabled={readOnly}
                  maxLength={7}
                  aria-label="Primary brand colour, hex value"
                  placeholder="#DA291C"
                />
              </div>
            </Field>

            {/* Live preview using the candidate colour, before it is committed */}
            <div className="rounded-[var(--radius-md)] border p-3" style={{ ...previewStyle, borderColor: 'var(--border-subtle)' }}>
              <p className="mb-2 text-[0.6875rem]" style={{ color: 'var(--text-tertiary)' }}>
                Preview
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-medium text-white" style={{ background: 'var(--brand-600)' }}>
                  Primary button
                </span>
                <span
                  className="rounded-full px-2 py-0.5 text-xs"
                  style={{ background: 'var(--brand-50)', color: 'var(--brand-700)', border: '1px solid var(--brand-200)' }}
                >
                  Accent chip
                </span>
                <span className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <span key={i} className="size-4 rounded" style={{ background: `var(--seq-${i})` }} aria-hidden />
                  ))}
                </span>
              </div>
            </div>

            {contrast != null ? (
              <div
                className="flex items-start gap-2 rounded-[var(--radius-sm)] p-2.5 text-[0.6875rem] leading-relaxed"
                style={{
                  background: contrast >= 4.5 ? 'var(--positive-bg)' : contrast >= 3 ? 'var(--warning-bg)' : 'var(--danger-bg)',
                  color: 'var(--text-secondary)',
                }}
              >
                {contrast >= 4.5 ? (
                  <Check size={13} className="mt-0.5 shrink-0" style={{ color: 'var(--positive)' }} aria-hidden />
                ) : (
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" style={{ color: contrast >= 3 ? 'var(--warning)' : 'var(--danger)' }} aria-hidden />
                )}
                <span>
                  Measured contrast against white is <strong>{contrast.toFixed(2)}:1</strong>.{' '}
                  {contrast >= 4.5
                    ? 'That meets WCAG 2.1 AA for normal-size text, so this colour can safely carry small text as well as fills.'
                    : contrast >= 3
                      ? 'That meets AA for large text and for interface components, but not for normal-size text. The interface uses a darkened step of this colour wherever small text is involved, so it will still be readable.'
                      : 'That is below 3:1, which fails WCAG 2.1 AA even for large text and interface borders. Consider a darker shade — the interface will still work, but some elements will be hard to see.'}
                </span>
              </div>
            ) : null}

            {hsl && (hsl.h < 340 && hsl.h > 20) ? (
              <p className="text-[0.6875rem] leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
                Note: the first chart series takes the brand hue. With a brand colour outside the red range it may sit close to
                another series colour — worth a glance at the Analytics page after changing it.
              </p>
            ) : null}

            {!readOnly ? (
              <Button
                variant="primary"
                loading={pending}
                onClick={() => save({ 'brand.hex': brandHex, 'org.name': orgName }, 'Brand updated. Reload to see it applied everywhere.')}
              >
                Save brand
              </Button>
            ) : null}
          </TileBody>
        </BentoTile>

        {/* ── Reminders ──────────────────────────────────────────────── */}
        <BentoTile col={6} row={5}>
          <TileHeader
            title="Reminders"
            subtitle="When something counts as urgent, and where the notification goes"
            icon={Bell}
          />
          <TileBody className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Urgent within" hint="Days">
                <Input type="number" min="1" value={criticalDays} onChange={(e) => setCriticalDays(Number(e.target.value))} disabled={readOnly} />
              </Field>
              <Field label="Soon within" hint="Days">
                <Input type="number" min="1" value={soonDays} onChange={(e) => setSoonDays(Number(e.target.value))} disabled={readOnly} />
              </Field>
              <Field label="Digest horizon" hint="Days">
                <Input type="number" min="1" value={upcomingDays} onChange={(e) => setUpcomingDays(Number(e.target.value))} disabled={readOnly} />
              </Field>
            </div>

            <Field
              label="Power Automate flow URL"
              hint="The HTTP POST URL from a Teams webhook trigger. Treat it as a secret — anyone with it can post to your channel."
            >
              <Input
                value={webhook}
                onChange={(e) => setWebhook(e.target.value)}
                disabled={readOnly}
                placeholder="https://prod-00.uksouth.logic.azure.com:443/workflows/…"
              />
            </Field>

            <div
              className="rounded-[var(--radius-sm)] p-2.5 text-[0.6875rem] leading-relaxed"
              style={{ background: 'var(--info-bg)', color: 'var(--text-secondary)', border: '1px solid var(--info-border)' }}
            >
              Microsoft retired the old Office 365 &ldquo;Incoming Webhook&rdquo; connector for Teams channels, so a connector URL
              will not work. The supported route is a Power Automate flow using the Teams webhook trigger, which does not
              require a premium licence. POWER-AUTOMATE.md in the project folder has the full setup.
            </div>

            {!readOnly ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  loading={pending}
                  onClick={() =>
                    save(
                      {
                        'alerts.criticalDays': String(criticalDays),
                        'alerts.soonDays': String(soonDays),
                        'alerts.upcomingDays': String(upcomingDays),
                        'alerts.teamsWebhookUrl': webhook,
                      },
                      'Reminder settings saved.',
                    )
                  }
                >
                  Save reminders
                </Button>
                <Button
                  icon={Send}
                  disabled={!webhook}
                  onClick={async () => {
                    setTestResult('Sending…');
                    try {
                      const res = await fetch('/api/alerts/dispatch?force=1', { method: 'POST' });
                      const body = await res.json();
                      setTestResult(
                        res.ok && body.sent
                          ? 'Sent. Check the Teams channel the flow posts to.'
                          : `Not sent: ${body.error ?? body.reason ?? 'unknown reason'}`,
                      );
                    } catch (e) {
                      setTestResult(`Could not reach the endpoint: ${e instanceof Error ? e.message : 'unknown error'}`);
                    }
                  }}
                >
                  Send a test message
                </Button>
              </div>
            ) : null}

            {testResult ? (
              <p className="text-[0.6875rem]" style={{ color: 'var(--text-secondary)' }} role="status">
                {testResult}
              </p>
            ) : null}

            <dl className="pt-1">
              <KeyValue label="Digest endpoint" mono>
                /api/alerts/digest
              </KeyValue>
              <KeyValue label="Calendar feed" mono>
                /api/calendar.ics
              </KeyValue>
              <KeyValue label="API key configured">
                {data.alertsKeyConfigured ? (
                  <Badge tone="positive" size="xs">
                    Yes
                  </Badge>
                ) : (
                  <Badge tone="warning" size="xs">
                    Not set — external callers are refused
                  </Badge>
                )}
              </KeyValue>
            </dl>
          </TileBody>
        </BentoTile>

        {/* ── Exchange rates ─────────────────────────────────────────── */}
        <BentoTile col={6} row={4}>
          <TileHeader
            title="Exchange rates"
            subtitle="Used to normalise every subscription to GBP"
            icon={Coins}
            action={
              <InfoTip width={340}>
                <strong style={{ color: 'var(--text-primary)' }}>These rates are entered by you</strong>
                <p className="mt-1">
                  The application does not fetch live rates, and deliberately so: a figure that moves every time the page loads
                  cannot be reconciled against an invoice. Set the rate your finance team uses for the period and update it
                  when they do.
                </p>
                <p className="mt-1.5">
                  A currency with no rate set is treated as 1:1 with GBP and flagged wherever it appears, rather than being
                  quietly dropped from the totals.
                </p>
              </InfoTip>
            }
          />
          <TileBody className="space-y-3">
            {data.fxRates.length === 0 ? (
              <EmptyState icon={Coins} title="No rates set" description="Anything not in GBP is currently treated as 1:1." compact />
            ) : (
              <ul className="space-y-1">
                {data.fxRates.map((r) => (
                  <li key={r.code} className="flex items-center justify-between gap-3 py-1.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <span className="flex min-w-0 items-center gap-2">
                      <Chip>{r.code}</Chip>
                      <span className="min-w-0 truncate text-[0.6875rem]" style={{ color: 'var(--text-tertiary)' }}>
                        {r.source ?? 'Entered manually'} · {formatDate(r.updatedAt)}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="tabular text-xs" style={{ color: 'var(--text-primary)' }}>
                        1 {r.code} = {r.rateToGbp} GBP
                      </span>
                      {!readOnly ? (
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => startTransition(async () => { await deleteFxRate(r.code); router.refresh(); })}
                        >
                          Remove
                        </Button>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {!readOnly ? (
              <div className="grid items-end gap-2" style={{ gridTemplateColumns: '90px 1fr 1fr auto' }}>
                <Field label="Currency">
                  <Select value={fxCode} onChange={(e) => setFxCode(e.target.value)}>
                    {CURRENCIES.filter((c) => c !== 'GBP').map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Value in GBP">
                  <Input type="number" step="0.0001" value={fxRate} onChange={(e) => setFxRate(e.target.value)} placeholder="0.78" />
                </Field>
                <Field label="Source">
                  <Input value={fxSource} onChange={(e) => setFxSource(e.target.value)} placeholder="Finance, July rate" />
                </Field>
                <Button
                  loading={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const res = await upsertFxRate(fxCode, Number(fxRate), fxSource || undefined);
                      if (res.ok) {
                        setFxRate('');
                        setFxSource('');
                        router.refresh();
                      } else setError(res.error);
                    })
                  }
                >
                  Set
                </Button>
              </div>
            ) : null}

            {error ? (
              <p className="text-xs" style={{ color: 'var(--danger)' }} role="alert">
                {error}
              </p>
            ) : null}
          </TileBody>
        </BentoTile>

        {/* ── Access ─────────────────────────────────────────────────── */}
        <BentoTile col={6} row={4}>
          <TileHeader title="Access and security" subtitle="Who can see what, and how credentials are held" icon={ShieldCheck} />
          <TileBody className="space-y-3">
            {data.authDisabled ? (
              <p
                className="flex items-start gap-2 rounded-[var(--radius-sm)] p-2.5 text-[0.6875rem] leading-relaxed"
                style={{ background: 'var(--danger-bg)', color: 'var(--text-secondary)', border: '1px solid var(--danger-border)' }}
              >
                <AlertTriangle size={13} className="mt-0.5 shrink-0" style={{ color: 'var(--danger)' }} aria-hidden />
                <span>
                  <strong style={{ color: 'var(--danger)' }}>Authentication is switched off.</strong> AUTH_DISABLED is set to
                  true, so anyone who can reach this address has full administrator access, including the ability to reveal
                  stored passwords. That is fine on a laptop; it is not fine on anything reachable from a network. Set
                  AUTH_DISABLED to false before deploying.
                </span>
              </p>
            ) : null}

            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                <Users size={13} aria-hidden /> People with access
              </p>
              {data.users.length === 0 ? (
                <p className="text-[0.6875rem]" style={{ color: 'var(--text-tertiary)' }}>
                  No user accounts exist yet. Run the seed script, or create the first administrator as described in the README.
                </p>
              ) : (
                <ul className="space-y-1">
                  {data.users.map((u) => (
                    <li key={u.id} className="flex items-center justify-between gap-3 py-1.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <span className="min-w-0">
                        <span className="block truncate text-xs" style={{ color: 'var(--text-primary)' }}>
                          {u.name}
                        </span>
                        <span className="block truncate text-[0.6875rem]" style={{ color: 'var(--text-tertiary)' }}>
                          {u.email}
                          {u.lastLoginAt ? ` · last signed in ${formatDate(u.lastLoginAt)}` : ' · never signed in'}
                        </span>
                      </span>
                      <Badge tone={u.role === 'ADMIN' ? 'brand' : u.role === 'EDITOR' ? 'info' : 'neutral'} size="xs" showIcon={false}>
                        {u.role === 'ADMIN' ? 'Administrator' : u.role === 'EDITOR' ? 'Editor' : 'Viewer'}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div
              className="rounded-[var(--radius-sm)] p-2.5 text-[0.6875rem] leading-relaxed"
              style={{ background: 'var(--surface-sunken)', color: 'var(--text-secondary)' }}
            >
              <p className="mb-1 font-semibold" style={{ color: 'var(--text-primary)' }}>
                How stored passwords are held
              </p>
              <p>
                Subscription passwords are encrypted with AES-256-GCM using a key derived from APP_SECRET, and only
                administrators can reveal them. Every reveal is written to the audit log.
              </p>
              <p className="mt-1.5">
                This protects against a leaked database file or someone reading over your shoulder. It does not protect against
                someone who has both the database and the server&apos;s environment variables, because the application has to be
                able to decrypt on demand. For anything sensitive, keep the real credential in your password manager and use
                the &ldquo;where the credential lives&rdquo; field instead.
              </p>
              <p className="mt-1.5">
                Changing APP_SECRET makes every previously stored password permanently unreadable.
              </p>
            </div>
          </TileBody>
        </BentoTile>
      </div>
    </div>
  );
}

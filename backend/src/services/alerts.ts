/**
 * The reminder engine.
 *
 * This exists to replace one manual task: chasing Finance to top up a prepaid
 * card before a subscription renews and the payment fails.
 *
 * It produces a single digest object that is consumed three ways — as JSON by
 * an external scheduler, as an Adaptive Card pushed into Microsoft Teams, and
 * as plain text for pasting into a message by hand. All three are generated
 * from the same source so they cannot drift apart.
 *
 * On the Teams integration specifically: Microsoft retired Office 365
 * connectors (the old "Incoming Webhook" in a Teams channel), so posting to a
 * connector URL no longer works. The supported route is a Power Automate flow
 * using the Teams webhook trigger, which this module pushes to.
 * POWER-AUTOMATE.md has the setup and its caveats.
 */

import { getPortfolio, type CardView, type RenewalItem } from './portfolio';
import { getAlertSettings } from './settings';
import { formatMoney, round2 } from '@/lib/money';
import { prisma } from '@/lib/db';

export interface DigestCard {
  label: string;
  last4: string;
  type: string;
  balance: number | null;
  due30: number;
  due60: number;
  shortfall: number;
  riskLevel: string;
  reason: string;
  nextChargeDate: string | null;
  fundBy: string | null;
  subscriptions: { name: string; date: string; amountGbp: number }[];
}

export interface Digest {
  generatedAt: string;
  horizonDays: number;
  needsAttention: boolean;
  summary: {
    renewalCount: number;
    renewalTotalGbp: number;
    cardsNeedingTopUp: number;
    totalShortfallGbp: number;
    urgentCount: number;
  };
  cards: DigestCard[];
  renewals: {
    name: string;
    vendor: string | null;
    date: string;
    days: number;
    amountGbp: number;
    currency: string;
    amountNative: number;
    cardLabel: string | null;
    cardLast4: string | null;
    autoRenew: boolean;
    estimated: boolean;
    departments: string[];
    urgency: string;
    needsTopUp: boolean;
  }[];
  /** Ready to paste into a chat or an email if the automation is not wired up. */
  plainText: string;
}

const dateStr = (d: Date) => d.toISOString().slice(0, 10);
const human = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

export async function buildDigest(horizonDays?: number): Promise<Digest> {
  const [p, alerts] = await Promise.all([getPortfolio(), getAlertSettings()]);
  const horizon = horizonDays ?? alerts.upcomingDays;
  const now = new Date();

  const inHorizon = p.renewals.filter((r) => r.days <= horizon);
  const riskyCards = p.cards.filter((c) => c.riskLevel === 'URGENT' || c.riskLevel === 'ACTION' || c.riskLevel === 'WATCH');

  const cards: DigestCard[] = riskyCards.map((c: CardView) => {
    const subs = inHorizon
      .filter((r) => r.cardLabel === c.label && r.cardLast4 === c.last4 && r.days <= 30)
      .map((r) => ({ name: r.name, date: dateStr(r.date), amountGbp: r.amountGbp }));

    // Fund the card a clear few days before the earliest charge on it, so a bank
    // transfer has time to land.
    const earliest = subs.length ? new Date(Math.min(...subs.map((s) => new Date(s.date).getTime()))) : null;
    const fundBy = earliest ? new Date(earliest.getTime() - Math.max(3, alerts.criticalDays) * 86_400_000) : null;

    return {
      label: c.label,
      last4: c.last4,
      type: c.type,
      balance: c.currentBalance,
      due30: c.due30,
      due60: c.due60,
      shortfall: c.shortfall30 ?? 0,
      riskLevel: c.riskLevel,
      reason: c.riskReason,
      nextChargeDate: c.nextChargeDate ? dateStr(c.nextChargeDate) : null,
      fundBy: fundBy ? dateStr(fundBy) : null,
      subscriptions: subs,
    };
  });

  const needingTopUp = cards.filter((c) => c.riskLevel === 'URGENT' || c.riskLevel === 'ACTION');
  const totalShortfall = round2(needingTopUp.reduce((a, c) => a + c.shortfall, 0));
  const renewalTotal = round2(inHorizon.filter((r) => r.days >= 0).reduce((a, r) => a + r.amountGbp, 0));
  const urgentCount = inHorizon.filter((r) => r.urgency === 'CRITICAL' || r.urgency === 'OVERDUE').length;

  const renewals = inHorizon.map((r: RenewalItem) => ({
    name: r.name,
    vendor: r.vendor,
    date: dateStr(r.date),
    days: r.days,
    amountGbp: r.amountGbp,
    currency: r.currency,
    amountNative: r.amountNative,
    cardLabel: r.cardLabel,
    cardLast4: r.cardLast4,
    autoRenew: r.autoRenew,
    estimated: r.estimated,
    departments: r.departments,
    urgency: r.urgency,
    needsTopUp: r.cardNeedsTopUp,
  }));

  const needsAttention = needingTopUp.length > 0 || urgentCount > 0;

  // ── Plain text, written the way a person would write it ────────────────
  const lines: string[] = [];
  if (needingTopUp.length === 0) {
    lines.push(
      `Subscription card check — ${human(now)}`,
      '',
      `No card needs topping up in the next ${horizon} days. ${renewals.filter((r) => r.days >= 0).length} payments totalling ${formatMoney(renewalTotal)} are due in that window, and every card currently holds enough to cover them.`,
    );
  } else {
    lines.push(
      `Card top-up needed — ${human(now)}`,
      '',
      `${needingTopUp.length} card${needingTopUp.length === 1 ? '' : 's'} will not cover what is due in the next 30 days. Combined shortfall: ${formatMoney(totalShortfall)}.`,
      '',
    );
    needingTopUp.forEach((c) => {
      lines.push(`${c.label} — card ending ${c.last4}`);
      lines.push(
        `  Balance as last recorded: ${c.balance != null ? formatMoney(c.balance) : 'not recorded'}. Due within 30 days: ${formatMoney(c.due30)}. Short by ${formatMoney(c.shortfall)}.`,
      );
      if (c.fundBy) lines.push(`  Please top up by ${human(new Date(c.fundBy))}.`);
      c.subscriptions.slice(0, 6).forEach((s) => {
        lines.push(`    · ${s.name} — ${formatMoney(s.amountGbp)} on ${human(new Date(s.date))}`);
      });
      if (c.subscriptions.length > 6) lines.push(`    · and ${c.subscriptions.length - 6} more`);
      lines.push('');
    });
    lines.push(
      'If a payment fails on an auto-renewing subscription, access is normally suspended until it is settled.',
      'Balances shown are as last entered in the subscription tracker — please confirm against the account before transferring.',
    );
  }

  return {
    generatedAt: now.toISOString(),
    horizonDays: horizon,
    needsAttention,
    summary: {
      renewalCount: renewals.filter((r) => r.days >= 0).length,
      renewalTotalGbp: renewalTotal,
      cardsNeedingTopUp: needingTopUp.length,
      totalShortfallGbp: totalShortfall,
      urgentCount,
    },
    cards,
    renewals,
    plainText: lines.join('\n'),
  };
}

// ─────────────────────────────────────────────────────────── Adaptive Card ──

/**
 * Teams supports Adaptive Cards up to version 1.5, and mobile clients only to
 * 1.2. This card declares 1.5 but deliberately uses only long-established
 * elements, so it renders identically on desktop and on a phone.
 */
export function buildAdaptiveCard(digest: Digest, appUrl?: string) {
  const body: Record<string, unknown>[] = [
    {
      type: 'TextBlock',
      size: 'Large',
      weight: 'Bolder',
      text: digest.needsAttention ? 'Subscription cards need topping up' : 'Subscription card check',
      wrap: true,
    },
    {
      type: 'TextBlock',
      spacing: 'None',
      isSubtle: true,
      wrap: true,
      text: `Imperial Edutech · generated ${new Date(digest.generatedAt).toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' })}`,
    },
    {
      type: 'FactSet',
      facts: [
        { title: 'Payments due', value: `${digest.summary.renewalCount} · ${formatMoney(digest.summary.renewalTotalGbp)}` },
        { title: 'Cards short', value: String(digest.summary.cardsNeedingTopUp) },
        { title: 'Total shortfall', value: formatMoney(digest.summary.totalShortfallGbp) },
        { title: 'Window', value: `Next ${digest.horizonDays} days` },
      ],
    },
  ];

  const needing = digest.cards.filter((c) => c.riskLevel === 'URGENT' || c.riskLevel === 'ACTION');

  if (needing.length === 0) {
    body.push({
      type: 'TextBlock',
      wrap: true,
      text: 'No card needs topping up in this window. Every card currently holds enough to cover what is scheduled.',
    });
  } else {
    needing.forEach((c) => {
      body.push({
        type: 'Container',
        separator: true,
        items: [
          { type: 'TextBlock', weight: 'Bolder', wrap: true, text: `${c.label} — card ending ${c.last4}` },
          {
            type: 'FactSet',
            facts: [
              { title: 'Balance', value: c.balance != null ? formatMoney(c.balance) : 'Not recorded' },
              { title: 'Due within 30 days', value: formatMoney(c.due30) },
              { title: 'Short by', value: formatMoney(c.shortfall) },
              ...(c.fundBy
                ? [{ title: 'Top up by', value: new Date(c.fundBy).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }) }]
                : []),
            ],
          },
          ...(c.subscriptions.length
            ? [
                {
                  type: 'TextBlock',
                  isSubtle: true,
                  wrap: true,
                  spacing: 'Small',
                  text: c.subscriptions
                    .slice(0, 5)
                    .map((s) => `${s.name} — ${formatMoney(s.amountGbp)} on ${new Date(s.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`)
                    .join('\n\n'),
                },
              ]
            : []),
        ],
      });
    });

    body.push({
      type: 'TextBlock',
      wrap: true,
      isSubtle: true,
      spacing: 'Medium',
      text: 'If a payment fails on an auto-renewing subscription, access is normally suspended until it is settled. Balances are as last entered in the tracker — please confirm against the account before transferring.',
    });
  }

  const card: Record<string, unknown> = {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: '1.5',
    body,
  };

  if (appUrl) {
    card.actions = [{ type: 'Action.OpenUrl', title: 'Open the subscription tracker', url: appUrl }];
  }

  return {
    type: 'message',
    attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', content: card }],
  };
}

export async function dispatchToTeams(digest: Digest, webhookUrl: string, appUrl?: string) {
  const payload = buildAdaptiveCard(digest, appUrl);
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const ok = res.ok;
  const detail = ok ? '' : `${res.status} ${res.statusText}`;

  try {
    await prisma.reminderLog.create({
      data: {
        channel: 'TEAMS',
        subject: digest.needsAttention
          ? `${digest.summary.cardsNeedingTopUp} card(s) short by ${formatMoney(digest.summary.totalShortfallGbp)}`
          : 'No action needed',
        status: ok ? 'SENT' : `FAILED ${detail}`,
        payload: JSON.stringify(payload).slice(0, 8000),
      },
    });
  } catch {
    // Logging the reminder must not stop the reminder being sent.
  }

  return { ok, detail };
}

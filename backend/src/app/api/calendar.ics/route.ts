import { getPortfolio } from '@/services/portfolio';
import { sessionFromRequest } from '@/lib/auth';
import { getAlertSettings } from '@/services/settings';
import { formatMoney } from '@/lib/money';

/**
 * A subscribable calendar of renewals.
 *
 * Two events are produced per renewal: the charge itself, and — where the
 * subscription sits on a card that has to be funded in advance — a separate
 * "top up the card" event several days earlier. That earlier event is the whole
 * point: it is the reminder that currently has to be issued by hand.
 *
 * Access is by API key so the file can be subscribed to from Outlook, which
 * cannot present a session cookie. Anyone holding the key can read renewal
 * dates, amounts and card labels, so treat the URL as confidential.
 */

function fold(line: string): string {
  // RFC 5545 limits lines to 75 octets; longer ones continue with a leading space.
  if (line.length <= 73) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 73));
  rest = rest.slice(73);
  while (rest.length > 72) {
    parts.push(` ${rest.slice(0, 72)}`);
    rest = rest.slice(72);
  }
  if (rest.length) parts.push(` ${rest}`);
  return parts.join('\r\n');
}

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function dateOnly(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

function stamp(d: Date): string {
  return `${dateOnly(d)}T${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}${String(d.getUTCSeconds()).padStart(2, '0')}Z`;
}

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get('key');
  const expected = process.env.ALERTS_API_KEY;

  const user = await sessionFromRequest(request);
  const authorised = !!user || (!!expected && key === expected);
  if (!authorised) {
    return Response.json(
      { error: 'Sign in, or append ?key=<ALERTS_API_KEY> to subscribe from a calendar client.' },
      { status: 401 },
    );
  }

  const [p, alerts] = await Promise.all([getPortfolio(), getAlertSettings()]);
  const now = new Date();
  const horizon = Number(url.searchParams.get('days') ?? 400);

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Imperial Edutech//Subscription Intelligence//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Subscription renewals — Imperial Edutech',
    'X-WR-TIMEZONE:Europe/London',
    'X-PUBLISHED-TTL:PT6H',
  ];

  const cardById = new Map(p.cards.map((c) => [c.label + c.last4, c]));

  p.renewals
    .filter((r) => r.days >= -30 && r.days <= horizon)
    .forEach((r) => {
      const sub = p.subscriptions.find((s) => s.id === r.subscriptionId);
      const card = r.cardLabel ? cardById.get(r.cardLabel + (r.cardLast4 ?? '')) : undefined;
      const end = new Date(r.date);
      end.setDate(end.getDate() + 1);

      const description = [
        `${r.estimated ? 'Estimated charge' : 'Charge'}: ${formatMoney(r.amountGbp)}${r.currency !== 'GBP' ? ` (${r.amountNative} ${r.currency})` : ''}`,
        r.cardLabel ? `Card: ${r.cardLabel} ending ${r.cardLast4}` : 'No card recorded',
        `Departments: ${r.departments.join(', ') || 'Unassigned'}`,
        r.autoRenew ? 'Renews automatically.' : 'Does not auto-renew — someone has to act for it to continue.',
        sub?.noticePeriodDays ? `Notice period: ${sub.noticePeriodDays} days.` : '',
        r.estimated ? 'This amount is an estimate because the subscription bills on usage or credit.' : '',
      ]
        .filter(Boolean)
        .join('\n');

      lines.push(
        'BEGIN:VEVENT',
        fold(`UID:renewal-${r.subscriptionId}-${dateOnly(r.date)}@imperial-subs`),
        `DTSTAMP:${stamp(now)}`,
        `DTSTART;VALUE=DATE:${dateOnly(r.date)}`,
        `DTEND;VALUE=DATE:${dateOnly(end)}`,
        fold(`SUMMARY:${esc(`${r.name} renews — ${formatMoney(r.amountGbp)}`)}`),
        fold(`DESCRIPTION:${esc(description)}`),
        'TRANSP:TRANSPARENT',
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `TRIGGER:-P${alerts.criticalDays}D`,
        fold(`DESCRIPTION:${esc(`${r.name} renews in ${alerts.criticalDays} days`)}`),
        'END:VALARM',
        'END:VEVENT',
      );

      // The separate funding reminder, only where the card actually holds a float.
      if (card && (card.type === 'PREPAID' || card.type === 'DEBIT')) {
        const fundBy = new Date(r.date);
        fundBy.setDate(fundBy.getDate() - Math.max(3, alerts.criticalDays));
        if (fundBy > new Date(now.getTime() - 30 * 86_400_000)) {
          const fundEnd = new Date(fundBy);
          fundEnd.setDate(fundEnd.getDate() + 1);
          lines.push(
            'BEGIN:VEVENT',
            fold(`UID:topup-${r.subscriptionId}-${dateOnly(r.date)}@imperial-subs`),
            `DTSTAMP:${stamp(now)}`,
            `DTSTART;VALUE=DATE:${dateOnly(fundBy)}`,
            `DTEND;VALUE=DATE:${dateOnly(fundEnd)}`,
            fold(`SUMMARY:${esc(`Top up ${card.label} ···· ${card.last4} before ${r.name} renews`)}`),
            fold(
              `DESCRIPTION:${esc(
                [
                  `${r.name} takes ${formatMoney(r.amountGbp)} on ${r.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.`,
                  card.currentBalance != null ? `Balance when last recorded: ${formatMoney(card.currentBalance, card.currency)}.` : 'No balance has been recorded for this card.',
                  `Total falling due on this card within 30 days: ${formatMoney(card.due30)}.`,
                  'Check the live balance before transferring — the figure above is as last entered in the tracker.',
                ].join('\n'),
              )}`,
            ),
            'BEGIN:VALARM',
            'ACTION:DISPLAY',
            'TRIGGER:-P1D',
            fold(`DESCRIPTION:${esc(`Card top-up needed for ${r.name}`)}`),
            'END:VALARM',
            'END:VEVENT',
          );
        }
      }
    });

  lines.push('END:VCALENDAR');

  return new Response(lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="imperial-subscription-renewals-${dateOnly(now)}.ics"`,
      'Cache-Control': 'no-store',
    },
  });
}

import { buildDigest, dispatchToTeams } from '@/services/alerts';
import { getAlertSettings } from '@/services/settings';
import { refreshFxRates } from '@/services/fx-refresh';

/**
 * The scheduled entry point for the reminder.
 *
 * This exists separately from /api/alerts/dispatch for one practical reason:
 * Vercel Cron issues a GET and will not issue a POST, so a scheduler cannot
 * call the dispatch endpoint directly. It also sits under /api/alerts/ because
 * that path is on the public list in src/proxy.ts — anywhere else and the cron
 * request would be redirected to the sign-in page and quietly do nothing every
 * morning.
 *
 * Authorisation accepts either form a scheduler is likely to send:
 *   · Vercel Cron:  Authorization: Bearer <CRON_SECRET>
 *   · anything else: ?key=<ALERTS_API_KEY>
 *
 * If neither secret is configured the endpoint refuses every request rather
 * than defaulting open.
 */
export const dynamic = 'force-dynamic';

function authorised(request: Request, url: URL): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const apiKey = process.env.ALERTS_API_KEY;

  const bearer = request.headers.get('authorization');
  if (cronSecret && cronSecret.length >= 16 && bearer === `Bearer ${cronSecret}`) return true;

  const key = url.searchParams.get('key') ?? request.headers.get('x-alerts-key');
  if (apiKey && apiKey.length >= 16 && key === apiKey) return true;

  return false;
}

export async function GET(request: Request) {
  const url = new URL(request.url);

  if (!authorised(request, url)) {
    return Response.json(
      {
        error: 'Not authorised.',
        hint: 'Send Authorization: Bearer <CRON_SECRET>, or add ?key=<ALERTS_API_KEY>. Both must be at least 16 characters.',
      },
      { status: 401 },
    );
  }

  // Rates first: the digest quotes money, so it should quote today's numbers.
  // A refresh failure must not stop the reminder — stale rates are still
  // usable and are labelled with the date they were published.
  const fx = await refreshFxRates();
  if (!fx.ok) console.error('Exchange rates were not refreshed:', fx.error);

  const settings = await getAlertSettings();
  const webhook = settings.teamsWebhookUrl || process.env.TEAMS_WEBHOOK_URL || '';
  const digest = await buildDigest();

  // Stay silent when there is nothing to say. A reminder that fires every day
  // regardless of content stops being read within a fortnight.
  const force = url.searchParams.get('force') === '1';
  if (!digest.needsAttention && !force) {
    return Response.json({ sent: false, reason: 'Nothing needs attention today.', summary: digest.summary, fx });
  }

  if (!webhook) {
    // Not an error: the digest is still returned so a scheduler that posts the
    // response elsewhere can use it. Teams simply is not configured yet.
    return Response.json({
      sent: false,
      reason: 'No Teams flow URL is configured. See POWER-AUTOMATE.md.',
      summary: digest.summary,
      plainText: digest.plainText,
    });
  }

  const result = await dispatchToTeams(digest, webhook, process.env.APP_URL || url.origin);
  if (!result.ok) {
    return Response.json({ sent: false, error: `Teams rejected the message: ${result.detail}` }, { status: 502 });
  }
  return Response.json({ sent: true, summary: digest.summary, fx });
}

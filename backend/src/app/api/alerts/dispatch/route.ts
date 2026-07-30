import { buildDigest, dispatchToTeams } from '@/services/alerts';
import { sessionFromRequest, canAdminister } from '@/lib/auth';
import { getAlertSettings } from '@/services/settings';

/**
 * Pushes the digest into Microsoft Teams via a Power Automate flow webhook.
 *
 * Push rather than pull is deliberate: the Power Automate HTTP action that
 * would be needed to pull from this application sits behind a premium licence,
 * whereas the Teams webhook trigger this posts to does not. POWER-AUTOMATE.md
 * explains the trade-off and how to set the flow up.
 *
 * Call it on a schedule from anything that can issue an HTTP POST — a cron job,
 * a Windows scheduled task, or an Azure timer function.
 */
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get('key') ?? request.headers.get('x-alerts-key');
  const expected = process.env.ALERTS_API_KEY;

  const user = await sessionFromRequest(request);
  const viaKey = !!expected && expected.length >= 16 && key === expected;

  if (!(viaKey || (user && canAdminister(user.role)))) {
    return Response.json({ error: 'Not authorised.' }, { status: 401 });
  }

  const settings = await getAlertSettings();
  const webhook = settings.teamsWebhookUrl || process.env.TEAMS_WEBHOOK_URL || '';

  if (!webhook) {
    return Response.json(
      {
        error: 'No Teams flow URL is configured.',
        hint: 'Set it in Settings → Reminders, or as TEAMS_WEBHOOK_URL in the environment. See POWER-AUTOMATE.md.',
      },
      { status: 400 },
    );
  }

  const digest = await buildDigest();

  // By default stay quiet when there is nothing to say — a reminder that fires
  // every day regardless of content stops being read within a fortnight.
  const force = url.searchParams.get('force') === '1';
  if (!digest.needsAttention && !force) {
    return Response.json({ sent: false, reason: 'Nothing needs attention, so no message was sent.', summary: digest.summary });
  }

  const appUrl = process.env.APP_URL || url.origin;
  const result = await dispatchToTeams(digest, webhook, appUrl);

  if (!result.ok) {
    return Response.json({ sent: false, error: `Teams rejected the message: ${result.detail}` }, { status: 502 });
  }
  return Response.json({ sent: true, summary: digest.summary });
}

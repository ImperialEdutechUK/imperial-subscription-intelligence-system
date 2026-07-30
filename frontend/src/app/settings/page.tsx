import { getSession, canAdminister } from '@/lib/auth';
import { getSettingsPageData } from '@/server/settings';
import { SectionHeading } from '@/components/ui/kit';
import { SettingsView, type SettingsData } from '@/components/settings/SettingsView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
  // One call rather than five: the API service assembles the brand, the alert
  // thresholds, the exchange rates and the account list together, so this page
  // costs a single round trip.
  const [data, user] = await Promise.all([getSettingsPageData(), getSession()]);

  const view: SettingsData = {
    brandHex: data.brand.hex.toUpperCase(),
    orgName: data.brand.orgName,
    criticalDays: data.alerts.criticalDays,
    soonDays: data.alerts.soonDays,
    upcomingDays: data.alerts.upcomingDays,
    teamsWebhookUrl: data.alerts.teamsWebhookUrl,
    fxRates: data.fxRates.map((r) => ({
      code: r.code,
      rateToGbp: r.rateToGbp,
      source: r.source,
      updatedAt: r.updatedAt.toISOString(),
    })),
    users: data.users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      active: u.active,
      lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    })),
    authDisabled: data.authDisabled,
    alertsKeyConfigured: data.alertsKeyConfigured,
    canAdminister: canAdminister(user?.role),
  };

  return (
    <div className="space-y-4">
      <SectionHeading
        title="Settings"
        description="Brand, currency conversion, reminder thresholds and access. Changes here affect every figure and every chart in the application."
      />
      <SettingsView data={view} />
    </div>
  );
}

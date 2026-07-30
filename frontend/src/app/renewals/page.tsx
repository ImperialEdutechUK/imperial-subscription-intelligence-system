import { getPortfolio } from '@/server/portfolio';
import { getSession } from '@/lib/auth';
import { SectionHeading } from '@/components/ui/kit';
import { RenewalsView, type RenewalRow } from '@/components/renewals/RenewalsView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Renewals & alerts' };

const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

export default async function RenewalsPage() {
  const [p, user] = await Promise.all([getPortfolio(), getSession()]);

  const rows: RenewalRow[] = p.renewals.map((r) => ({
    subscriptionId: r.subscriptionId,
    name: r.name,
    vendor: r.vendor,
    date: iso(r.date)!,
    days: r.days,
    amountGbp: r.amountGbp,
    currency: r.currency,
    amountNative: r.amountNative,
    cardLabel: r.cardLabel,
    cardLast4: r.cardLast4,
    cardType: r.cardType,
    cardNeedsTopUp: r.cardNeedsTopUp,
    autoRenew: r.autoRenew,
    urgency: r.urgency,
    departments: r.departments,
    estimated: r.estimated,
  }));

  return (
    <div className="space-y-4">
      <SectionHeading
        title="Renewals and alerts"
        description="What is due, when, and which card it comes off. The warnings are the ones worth acting on: a payment falling due on a card that will not cover it at the balance last recorded."
      />
      <RenewalsView
        rows={rows}
        departments={p.departments.map((d) => ({ code: d.code, name: d.name, color: d.color }))}
        compiledBy={user?.name ?? null}
      />
    </div>
  );
}

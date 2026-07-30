import { getPortfolio } from '@/server/portfolio';
import { getSession, canEdit as canEditRole, canRevealSecrets } from '@/lib/auth';
import { SectionHeading } from '@/components/ui/kit';
import { SubscriptionWorkbench, type Row } from '@/components/subs/SubscriptionWorkbench';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Subscriptions' };

const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

export default async function SubscriptionsPage({ searchParams }: PageProps<'/subscriptions'>) {
  const [p, user, sp] = await Promise.all([getPortfolio(), getSession(), searchParams]);

  const rows: Row[] = p.subscriptions.map((s) => ({
    id: s.id,
    name: s.name,
    vendor: s.vendor,
    url: s.url,
    category: s.category,
    categoryLabel: s.categoryLabel,
    status: s.status,
    criticality: s.criticality,
    billingModel: s.billingModel,
    billingLabel: s.billingLabel,
    currency: s.currency,
    unitAmount: s.unitAmount,
    seats: s.seats,
    perSeat: s.perSeat,
    monthlyGbp: s.monthlyGbp,
    annualGbp: s.annualGbp,
    oneOffGbp: s.cost.oneOffGbp,
    amountPerCharge: s.cost.amountPerCharge,
    confidence: s.cost.confidence,
    basis: s.cost.basis,
    caveat: s.cost.caveat,
    renewalDate: iso(s.renewalDate),
    nextCharge: iso(s.nextCharge),
    daysToRenewal: s.daysToRenewal,
    autoRenew: s.autoRenew,
    allocationMethod: s.allocationMethod,
    allocationWarning: s.allocationWarning,
    allocations: s.allocations.map((a) => ({
      departmentId: a.departmentId,
      departmentName: a.departmentName,
      departmentCode: a.departmentCode,
      color: a.color,
      share: a.share,
      monthlyGbp: a.monthlyGbp,
    })),
    shared: s.shared,
    ownerDepartmentId: s.ownerDepartmentId,
    ownerName: s.ownerName,
    accountEmail: s.accountEmail,
    username: s.username,
    hasPassword: s.hasPassword,
    credentialLocation: s.credentialLocation,
    cardId: s.cardId,
    cardLabel: s.cardLabel,
    cardLast4: s.cardLast4,
    notes: s.notes,
    tags: s.tags,
    startDate: iso(s.startDate),
    contractEndDate: iso(s.contractEndDate),
    noticePeriodDays: s.noticePeriodDays,
    creditBalance: s.creditBalance,
    creditRunwayMonths: s.creditRunwayMonths,
    costChangeCount: s.costChangeCount,
  }));

  return (
    <div className="space-y-4">
      <SectionHeading
        title="Subscription register"
        description="The single list. Click any row to inspect it, or use the pencil to edit. Everything on the dashboards is derived from what is here."
      />
      <SubscriptionWorkbench
        rows={rows}
        departments={p.departments.map((d) => ({ id: d.id, name: d.name, code: d.code, color: d.color }))}
        cards={p.cards.map((c) => ({ id: c.id, label: c.label, last4: c.last4, type: c.type }))}
        fxRates={p.fx}
        canEdit={canEditRole(user?.role)}
        canReveal={canRevealSecrets(user?.role)}
        openNew={sp?.new === '1'}
        focusId={typeof sp?.focus === 'string' ? sp.focus : undefined}
      />
    </div>
  );
}

import { api } from '@/lib/api';
import { getPortfolio } from '@/server/portfolio';
import { getSession, canEdit as canEditRole } from '@/lib/auth';
import { SectionHeading } from '@/components/ui/kit';
import { CardsWorkbench, type CardRow } from '@/components/cards/CardsWorkbench';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Cards & top-ups' };

const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

interface CardDetail {
  id: string;
  holderName: string | null;
  expiryMonth: number | null;
  expiryYear: number | null;
  notes: string | null;
}

export default async function CardsPage() {
  // `getPortfolio` owns the derived view of a card: what falls due on it, what
  // the balance covers and why it is at risk. The purely administrative fields
  // are not part of that model, but `saveCard` writes the whole record, so the
  // edit form has to send them back unchanged or they would be cleared. They
  // are read here, and used for nothing else.
  const [p, user, details] = await Promise.all([
    getPortfolio(),
    getSession(),
    api<{ cards: CardDetail[] }>('/api/cards/detail'),
  ]);

  const detailById = new Map(details.cards.map((d) => [d.id, d]));

  const cards: CardRow[] = p.cards.map((c) => {
    const d = detailById.get(c.id);
    return {
      id: c.id,
      label: c.label,
      last4: c.last4,
      provider: c.provider,
      type: c.type,
      currency: c.currency,
      currentBalance: c.currentBalance,
      balanceUpdatedAt: iso(c.balanceUpdatedAt),
      lowBalanceThreshold: c.lowBalanceThreshold,
      active: c.active,
      subscriptionCount: c.subscriptionCount,
      monthlyGbp: c.monthlyGbp,
      due30: c.due30,
      due60: c.due60,
      shortfall30: c.shortfall30,
      riskLevel: c.riskLevel,
      riskReason: c.riskReason,
      nextChargeDate: iso(c.nextChargeDate),
      holderName: d?.holderName ?? null,
      expiryMonth: d?.expiryMonth ?? null,
      expiryYear: d?.expiryYear ?? null,
      notes: d?.notes ?? null,
    };
  });

  return (
    <div className="space-y-4">
      <SectionHeading
        title="Cards and top-ups"
        description="The cards subscriptions are charged to, and whether each one holds enough to meet what falls due on it. Prepaid and debit cards are the ones that need funding before a renewal; the rest are shown for completeness."
      />
      <CardsWorkbench cards={cards} canEdit={canEditRole(user?.role)} />
    </div>
  );
}

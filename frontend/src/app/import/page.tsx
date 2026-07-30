import { getPortfolio } from '@/server/portfolio';
import { getSession, canEdit as canEditRole } from '@/lib/auth';
import { SectionHeading } from '@/components/ui/kit';
import { ImportWorkbench } from '@/components/import/ImportWorkbench';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Import & export' };

export default async function ImportPage() {
  const [p, user] = await Promise.all([getPortfolio(), getSession()]);

  // Department codes and card last-4s are loaded so that a pasted sheet can be
  // checked against what actually exists before anything is written, rather
  // than importing rows that quietly lose their department or their card.
  return (
    <div className="space-y-4">
      <SectionHeading
        title="Import & export"
        description="Bring subscriptions in from the spreadsheet you already keep, or take the register out for Finance. Nothing is written until you have seen what will be imported."
      />
      <ImportWorkbench
        departments={p.departments.map((d) => ({ code: d.code, name: d.name }))}
        cards={p.cards.map((c) => ({ label: c.label, last4: c.last4 }))}
        canEdit={canEditRole(user?.role)}
      />
    </div>
  );
}

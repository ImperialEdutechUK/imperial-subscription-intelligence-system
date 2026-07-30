import { prisma } from '@/lib/db';
import { guard, json, requireUser } from '@/lib/http';

/**
 * The handful of card fields the cards page reads directly rather than through
 * the portfolio read model — holder, expiry and notes.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return guard(async () => {
    await requireUser(request);
    const cards = await prisma.card.findMany({
      select: { id: true, holderName: true, expiryMonth: true, expiryYear: true, notes: true },
    });
    return json({ cards });
  });
}

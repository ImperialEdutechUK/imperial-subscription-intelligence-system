'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CreditCard, Pencil, Plus, Trash2, Wallet } from 'lucide-react';
import { Badge, BentoTile, EmptyState, KeyValue, Meter, Stat, TileBody, TileHeader, type Tone } from '@/components/ui/kit';
import { Button, Field, IconButton, InfoTip, Input, Modal, Select, Sheet, Textarea, Toggle } from '@/components/ui/controls';
import { deleteCard, recordTopUp, saveCard, setCardBalance } from '@/server/actions';
import { CARD_TYPES, CARD_TYPE_META, CURRENCIES, CURRENCY_SYMBOL, type CardType } from '@/lib/domain';
import { formatMoney } from '@/lib/money';
import { formatDate } from '@/lib/utils';

export interface CardRow {
  id: string;
  label: string;
  last4: string;
  provider: string | null;
  type: string;
  currency: string;
  currentBalance: number | null;
  balanceUpdatedAt: string | null;
  lowBalanceThreshold: number;
  active: boolean;
  subscriptionCount: number;
  monthlyGbp: number;
  due30: number;
  due60: number;
  shortfall30: number | null;
  riskLevel: 'NONE' | 'WATCH' | 'ACTION' | 'URGENT';
  riskReason: string;
  nextChargeDate: string | null;
  /** Administrative fields. Held here only so an edit does not clear them. */
  holderName: string | null;
  expiryMonth: number | null;
  expiryYear: number | null;
  notes: string | null;
}

/**
 * Risk is never carried by colour alone — each level has a word as well as a
 * tone, and the Badge adds an icon on top of that.
 */
const RISK: Record<CardRow['riskLevel'], { label: string; tone: Tone }> = {
  URGENT: { label: 'Urgent', tone: 'danger' },
  ACTION: { label: 'Top up', tone: 'danger' },
  WATCH: { label: 'Watch', tone: 'warning' },
  NONE: { label: 'Funded', tone: 'positive' },
};

const RISK_ORDER: Record<CardRow['riskLevel'], number> = { URGENT: 0, ACTION: 1, WATCH: 2, NONE: 3 };

const metaFor = (type: string) => CARD_TYPE_META[type as CardType] ?? CARD_TYPE_META.CORPORATE_CREDIT;

interface CardFormValues {
  id?: string;
  label: string;
  last4: string;
  provider: string;
  type: CardType;
  holderName: string;
  currency: string;
  currentBalance: number | null;
  lowBalanceThreshold: number;
  expiryMonth: number | null;
  expiryYear: number | null;
  notes: string;
  active: boolean;
}

const EMPTY_CARD: CardFormValues = {
  label: '',
  last4: '',
  provider: '',
  type: 'PREPAID',
  holderName: '',
  currency: 'GBP',
  currentBalance: null,
  lowBalanceThreshold: 0,
  expiryMonth: null,
  expiryYear: null,
  notes: '',
  active: true,
};

export function CardsWorkbench({ cards, canEdit }: { cards: CardRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [form, setForm] = useState<CardFormValues | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [topUpFor, setTopUpFor] = useState<CardRow | null>(null);
  const [topUpAmount, setTopUpAmount] = useState<number | null>(null);
  const [topUpNote, setTopUpNote] = useState('');
  const [topUpError, setTopUpError] = useState<string | null>(null);

  const [correctFor, setCorrectFor] = useState<CardRow | null>(null);
  const [correctBalance, setCorrectBalance] = useState<number | null>(null);
  const [correctError, setCorrectError] = useState<string | null>(null);

  const [confirmDelete, setConfirmDelete] = useState<CardRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Cards that need funding come first, then cards being watched, then the
  // rest. A card taken out of use always sits at the bottom.
  const ordered = useMemo(
    () =>
      [...cards].sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1;
        const byRisk = RISK_ORDER[a.riskLevel] - RISK_ORDER[b.riskLevel];
        return byRisk !== 0 ? byRisk : a.label.localeCompare(b.label);
      }),
    [cards],
  );

  const needsAction = useMemo(() => cards.filter((c) => c.riskLevel === 'ACTION' || c.riskLevel === 'URGENT'), [cards]);
  const totalShortfall = useMemo(() => cards.reduce((a, c) => a + (c.shortfall30 ?? 0), 0), [cards]);

  const set = <K extends keyof CardFormValues>(key: K, value: CardFormValues[K]) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  const openCreate = () => {
    setFormError(null);
    setForm({ ...EMPTY_CARD });
  };

  const openEdit = (c: CardRow) => {
    setFormError(null);
    setForm({
      id: c.id,
      label: c.label,
      last4: c.last4,
      provider: c.provider ?? '',
      type: (CARD_TYPES as readonly string[]).includes(c.type) ? (c.type as CardType) : 'CORPORATE_CREDIT',
      holderName: c.holderName ?? '',
      currency: c.currency,
      currentBalance: c.currentBalance,
      lowBalanceThreshold: c.lowBalanceThreshold,
      expiryMonth: c.expiryMonth,
      expiryYear: c.expiryYear,
      notes: c.notes ?? '',
      active: c.active,
    });
  };

  const openTopUp = (c: CardRow) => {
    setTopUpError(null);
    setTopUpAmount(null);
    setTopUpNote('');
    setTopUpFor(c);
  };

  const openCorrect = (c: CardRow) => {
    setCorrectError(null);
    setCorrectBalance(c.currentBalance);
    setCorrectFor(c);
  };

  const submitCard = () => {
    if (!form) return;
    setFormError(null);
    if (!form.label.trim()) {
      setFormError('Give the card a label, so it can be told apart from the others in a dropdown.');
      return;
    }
    if (!/^\d{4}$/.test(form.last4)) {
      setFormError('Enter the last four digits of the card number — four digits and nothing else.');
      return;
    }
    const holdsFloat = metaFor(form.type).needsBalance;
    const v = form;
    startTransition(async () => {
      try {
        const res = await saveCard({
          id: v.id,
          label: v.label,
          last4: v.last4,
          provider: v.provider,
          type: v.type,
          holderName: v.holderName,
          currency: v.currency,
          // A card that holds no float has no balance to record, so the stored
          // figure is cleared rather than left behind to go stale.
          currentBalance: holdsFloat ? v.currentBalance : null,
          lowBalanceThreshold: holdsFloat ? v.lowBalanceThreshold : 0,
          expiryMonth: v.expiryMonth,
          expiryYear: v.expiryYear,
          notes: v.notes,
          active: v.active,
        });
        if (!res.ok) {
          setFormError(res.error);
          return;
        }
        setForm(null);
        router.refresh();
      } catch (e) {
        setFormError(e instanceof Error ? e.message : 'That card could not be saved.');
      }
    });
  };

  const submitTopUp = () => {
    if (!topUpFor) return;
    setTopUpError(null);
    if (!topUpAmount || !(topUpAmount > 0)) {
      setTopUpError('Enter the amount that was added to the card. It must be greater than zero.');
      return;
    }
    const card = topUpFor;
    const amount = topUpAmount;
    const note = topUpNote.trim();
    startTransition(async () => {
      try {
        const res = await recordTopUp(card.id, amount, note || undefined);
        if (!res.ok) {
          setTopUpError(res.error);
          return;
        }
        setTopUpFor(null);
        router.refresh();
      } catch (e) {
        setTopUpError(e instanceof Error ? e.message : 'The top-up could not be recorded.');
      }
    });
  };

  const submitCorrection = () => {
    if (!correctFor) return;
    setCorrectError(null);
    if (correctBalance == null || !Number.isFinite(correctBalance)) {
      setCorrectError('Enter the balance the card actually holds.');
      return;
    }
    const card = correctFor;
    const balance = correctBalance;
    startTransition(async () => {
      try {
        await setCardBalance(card.id, balance);
        setCorrectFor(null);
        router.refresh();
      } catch (e) {
        setCorrectError(e instanceof Error ? e.message : 'The balance could not be saved.');
      }
    });
  };

  const submitDelete = () => {
    if (!confirmDelete) return;
    setDeleteError(null);
    const card = confirmDelete;
    startTransition(async () => {
      try {
        const res = await deleteCard(card.id);
        if (!res.ok) {
          setDeleteError(res.error);
          return;
        }
        setConfirmDelete(null);
        router.refresh();
      } catch (e) {
        setDeleteError(e instanceof Error ? e.message : 'That card could not be deleted.');
      }
    });
  };

  const formHoldsFloat = form ? metaFor(form.type).needsBalance : false;
  const formSymbol = form ? (CURRENCY_SYMBOL[form.currency] ?? '') : '';
  const last4Invalid = !!form && form.last4.length > 0 && !/^\d{4}$/.test(form.last4);

  return (
    <div className="space-y-4">
      {/* ── Summary strip ────────────────────────────────────────────────── */}
      <div
        className="flex flex-wrap items-start justify-between gap-4 rounded-[var(--radius-md)] border p-3"
        style={{ background: 'var(--surface-raised)', borderColor: 'var(--border-subtle)' }}
      >
        <div className="grid min-w-[260px] flex-1 gap-4 sm:grid-cols-3">
          <Stat
            size="sm"
            label="Cards on record"
            value={cards.length}
            hint={`${cards.filter((c) => metaFor(c.type).needsBalance).length} of them hold a float that has to be topped up.`}
          />
          <Stat
            size="sm"
            label="Need action"
            value={needsAction.length}
            tone={needsAction.length > 0 ? 'danger' : undefined}
            hint="A card needs action when what falls due on it in the next 30 days is more than the balance recorded here, or when no balance has ever been recorded."
          />
          <Stat
            size="sm"
            label={
              <span className="inline-flex items-center gap-1">
                Total shortfall
                <InfoTip label="How the shortfall is worked out">
                  <strong style={{ color: 'var(--text-primary)' }}>Shortfall</strong>
                  <p className="mt-1">
                    For each card that holds a float: the total falling due on it in the next 30 days, less the balance last
                    recorded. Cards that are covered contribute nothing. Cards with no balance on record cannot be measured and
                    are counted under &ldquo;need action&rdquo; instead.
                  </p>
                  <p className="mt-1.5" style={{ color: 'var(--text-tertiary)' }}>
                    This is the amount that has to reach the cards before the dates shown, not a forecast of the month.
                  </p>
                </InfoTip>
              </span>
            }
            value={formatMoney(totalShortfall)}
            tone={totalShortfall > 0 ? 'danger' : undefined}
            hint={totalShortfall > 0 ? 'Money that has to be moved before the renewal dates below.' : 'Every card with a float covers what falls due on it in the next 30 days.'}
          />
        </div>
        {canEdit ? (
          <Button variant="primary" icon={Plus} onClick={openCreate}>
            Add card
          </Button>
        ) : null}
      </div>

      {/* ── Cards ────────────────────────────────────────────────────────── */}
      {ordered.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border" style={{ background: 'var(--surface-raised)', borderColor: 'var(--border-subtle)' }}>
          <EmptyState
            icon={CreditCard}
            title="No cards recorded"
            description="Add the cards subscriptions are charged to. Once a prepaid or debit card has a balance on record, this page works out whether it will cover what falls due on it."
            action={canEdit ? <Button variant="primary" icon={Plus} onClick={openCreate}>Add card</Button> : undefined}
          />
        </div>
      ) : (
        <div className="bento">
          {ordered.map((c) => {
            const meta = metaFor(c.type);
            const risk = RISK[c.riskLevel];
            const shortfall = c.shortfall30 ?? 0;
            const showMeter = meta.needsBalance && c.due30 > 0 && c.currentBalance != null;

            return (
              <BentoTile key={c.id} col={4} row={4} className={c.riskLevel === 'URGENT' ? 'pulse-urgent' : undefined}>
                <TileHeader
                  title={c.label}
                  subtitle={
                    <>
                      •••• {c.last4} · {meta.label}
                      {c.provider ? ` · ${c.provider}` : ''}
                    </>
                  }
                  icon={CreditCard}
                  action={
                    canEdit ? (
                      <span className="flex items-center gap-0.5">
                        <IconButton icon={Pencil} label={`Edit ${c.label}`} size="xs" onClick={() => openEdit(c)} />
                        <IconButton icon={Trash2} label={`Delete ${c.label}`} size="xs" onClick={() => { setDeleteError(null); setConfirmDelete(c); }} />
                      </span>
                    ) : undefined
                  }
                />
                <TileBody className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={risk.tone} size="xs">
                      {risk.label}
                    </Badge>
                    {!c.active ? (
                      <Badge tone="neutral" size="xs">
                        Not in use
                      </Badge>
                    ) : null}
                    {!meta.needsBalance ? (
                      <Badge tone="neutral" size="xs" showIcon={false}>
                        No float held
                      </Badge>
                    ) : null}
                  </div>

                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    {c.riskReason}
                  </p>

                  {meta.needsBalance ? (
                    <div>
                      {showMeter ? (
                        <>
                          <Meter
                            value={c.currentBalance ?? 0}
                            max={c.due30}
                            tone={risk.tone}
                            label="Balance against the next 30 days"
                            showValue
                            height={6}
                          />
                          <p className="mt-1.5 text-meta leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
                            {formatMoney(c.currentBalance, c.currency)} on record
                            {c.balanceUpdatedAt ? `, last updated ${formatDate(c.balanceUpdatedAt)}` : ''}, against{' '}
                            {formatMoney(c.due30)} falling due by then.
                            {shortfall > 0 ? ` Short by ${formatMoney(shortfall)}.` : ''}
                          </p>
                        </>
                      ) : (
                        <p className="text-meta leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
                          {c.currentBalance == null
                            ? 'No balance has been recorded, so cover cannot be shown. Use “Correct balance” to enter what the card actually holds.'
                            : `${formatMoney(c.currentBalance, c.currency)} on record. Nothing falls due on this card in the next 30 days, so there is no cover to measure.`}
                        </p>
                      )}
                      {c.currency !== 'GBP' ? (
                        <p className="mt-1 text-meta leading-relaxed" style={{ color: 'var(--warning)' }}>
                          The balance is held in {c.currency} and the amounts due are converted to GBP, so treat the comparison
                          as indicative and check the card before relying on it.
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  <dl>
                    <KeyValue label="Subscriptions on this card">{c.subscriptionCount}</KeyValue>
                    <KeyValue label="Monthly total">{formatMoney(c.monthlyGbp)}</KeyValue>
                    <KeyValue label="Due in 30 days">{formatMoney(c.due30)}</KeyValue>
                    <KeyValue label="Due in 60 days">{formatMoney(c.due60)}</KeyValue>
                    <KeyValue label="Next charge">{c.nextChargeDate ? formatDate(c.nextChargeDate) : 'None scheduled'}</KeyValue>
                  </dl>

                  {canEdit && meta.needsBalance ? (
                    <div className="mt-auto flex flex-wrap gap-2 pt-1">
                      <Button size="xs" variant="primary" icon={Plus} onClick={() => openTopUp(c)}>
                        Add top-up
                      </Button>
                      <Button size="xs" icon={Wallet} onClick={() => openCorrect(c)}>
                        Correct balance
                      </Button>
                    </div>
                  ) : null}
                </TileBody>
              </BentoTile>
            );
          })}
        </div>
      )}

      {/* ── Record a top-up ──────────────────────────────────────────────── */}
      <Modal
        open={!!topUpFor}
        onClose={() => setTopUpFor(null)}
        title={topUpFor ? `Add a top-up to ${topUpFor.label}` : 'Add a top-up'}
        width={480}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setTopUpFor(null)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submitTopUp} loading={pending}>
              Record top-up
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            A top-up <strong style={{ color: 'var(--text-primary)' }}>adds</strong> to the balance recorded here and is kept in
            the card&apos;s top-up history, which is what the cost estimates for credit-based subscriptions are built from.
            Record it once the money has reached the card, not when it was requested.
          </p>
          {topUpFor ? (
            <p className="rounded-[var(--radius-sm)] p-2.5 text-xs leading-relaxed" style={{ background: 'var(--surface-sunken)', color: 'var(--text-secondary)' }}>
              Balance on record: {topUpFor.currentBalance == null ? 'none' : formatMoney(topUpFor.currentBalance, topUpFor.currency)}.
              {topUpAmount && topUpAmount > 0
                ? ` After this top-up it will read ${formatMoney((topUpFor.currentBalance ?? 0) + topUpAmount, topUpFor.currency)}.`
                : ''}
            </p>
          ) : null}
          <Field label="Amount added" required htmlFor="topup-amount" hint={topUpFor ? `In ${topUpFor.currency}, the currency the card is held in.` : undefined}>
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm" style={{ color: 'var(--text-tertiary)' }}>
                {topUpFor ? (CURRENCY_SYMBOL[topUpFor.currency] ?? '') : ''}
              </span>
              <Input
                id="topup-amount"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                autoFocus
                className="pl-6"
                value={topUpAmount ?? ''}
                onChange={(e) => setTopUpAmount(e.target.value === '' ? null : Number(e.target.value))}
              />
            </div>
          </Field>
          <Field label="Note" hint="Optional — for example the reference Finance used, or who approved it." htmlFor="topup-note">
            <Textarea id="topup-note" rows={2} value={topUpNote} onChange={(e) => setTopUpNote(e.target.value)} />
          </Field>
          {topUpError ? (
            <p className="flex items-start gap-1.5 rounded-[var(--radius-sm)] p-2.5 text-xs" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }} role="alert">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden />
              {topUpError}
            </p>
          ) : null}
        </div>
      </Modal>

      {/* ── Correct the recorded balance ─────────────────────────────────── */}
      <Modal
        open={!!correctFor}
        onClose={() => setCorrectFor(null)}
        title={correctFor ? `Correct the balance on ${correctFor.label}` : 'Correct the balance'}
        width={480}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCorrectFor(null)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submitCorrection} loading={pending}>
              Overwrite balance
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            Correcting the balance <strong style={{ color: 'var(--text-primary)' }}>replaces</strong> the figure held here with
            the one you enter. Nothing is added and no top-up is recorded. Use it when the recorded figure has drifted from
            reality — after a refund, a fee, or a top-up nobody wrote down. If money has just been added to the card, use
            &ldquo;Add top-up&rdquo; instead so the history stays complete.
          </p>
          {correctFor ? (
            <p className="rounded-[var(--radius-sm)] p-2.5 text-xs leading-relaxed" style={{ background: 'var(--surface-sunken)', color: 'var(--text-secondary)' }}>
              Currently on record:{' '}
              {correctFor.currentBalance == null ? 'no balance' : formatMoney(correctFor.currentBalance, correctFor.currency)}
              {correctFor.balanceUpdatedAt ? `, last updated ${formatDate(correctFor.balanceUpdatedAt)}` : ''}.
            </p>
          ) : null}
          <Field label="Balance the card actually holds" required htmlFor="correct-balance">
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm" style={{ color: 'var(--text-tertiary)' }}>
                {correctFor ? (CURRENCY_SYMBOL[correctFor.currency] ?? '') : ''}
              </span>
              <Input
                id="correct-balance"
                type="number"
                step="0.01"
                inputMode="decimal"
                autoFocus
                className="pl-6"
                value={correctBalance ?? ''}
                onChange={(e) => setCorrectBalance(e.target.value === '' ? null : Number(e.target.value))}
              />
            </div>
          </Field>
          {correctError ? (
            <p className="flex items-start gap-1.5 rounded-[var(--radius-sm)] p-2.5 text-xs" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }} role="alert">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden />
              {correctError}
            </p>
          ) : null}
        </div>
      </Modal>

      {/* ── Add / edit a card ────────────────────────────────────────────── */}
      <Sheet
        open={!!form}
        onClose={() => setForm(null)}
        width={560}
        title={form?.id ? `Edit ${form.label || 'card'}` : 'Add a card'}
        subtitle={form?.id ? undefined : 'The label and the last four digits are what everything else refers to'}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setForm(null)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submitCard} loading={pending}>
              {form?.id ? 'Save changes' : 'Add card'}
            </Button>
          </div>
        }
      >
        {form ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
              <Field label="Label" required htmlFor="card-label" hint="What people call it — for example “Course Dev prepaid”.">
                <Input id="card-label" value={form.label} onChange={(e) => set('label', e.target.value)} autoFocus />
              </Field>
              <Field
                label="Last four digits"
                required
                htmlFor="card-last4"
                error={last4Invalid ? 'Four digits, nothing else.' : null}
                hint={last4Invalid ? undefined : 'Shown as •••• 1234'}
              >
                <Input
                  id="card-last4"
                  inputMode="numeric"
                  maxLength={4}
                  invalid={last4Invalid}
                  value={form.last4}
                  onChange={(e) => set('last4', e.target.value.replace(/\D/g, '').slice(0, 4))}
                />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Type" htmlFor="card-type" hint={metaFor(form.type).hint}>
                <Select id="card-type" value={form.type} onChange={(e) => set('type', e.target.value as CardType)}>
                  {CARD_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {CARD_TYPE_META[t].label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Provider" htmlFor="card-provider" hint="Visa, Mastercard, Amex, or the bank collecting it.">
                <Input id="card-provider" value={form.provider} onChange={(e) => set('provider', e.target.value)} />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_100px]">
              <Field label="Cardholder name" htmlFor="card-holder">
                <Input id="card-holder" value={form.holderName} onChange={(e) => set('holderName', e.target.value)} />
              </Field>
              <Field label="Currency" htmlFor="card-currency">
                <Select id="card-currency" value={form.currency} onChange={(e) => set('currency', e.target.value)}>
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {/* Balance fields only exist for cards that hold a float. */}
            {formHoldsFloat ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Balance on the card" htmlFor="card-balance" hint="Leave blank if you do not know it yet.">
                  <div className="relative">
                    <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm" style={{ color: 'var(--text-tertiary)' }}>
                      {formSymbol}
                    </span>
                    <Input
                      id="card-balance"
                      type="number"
                      step="0.01"
                      inputMode="decimal"
                      className="pl-6"
                      value={form.currentBalance ?? ''}
                      onChange={(e) => set('currentBalance', e.target.value === '' ? null : Number(e.target.value))}
                    />
                  </div>
                </Field>
                <Field label="Warn below" htmlFor="card-threshold" hint="The card is flagged for watching once the balance reaches this.">
                  <div className="relative">
                    <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm" style={{ color: 'var(--text-tertiary)' }}>
                      {formSymbol}
                    </span>
                    <Input
                      id="card-threshold"
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      className="pl-6"
                      value={form.lowBalanceThreshold}
                      onChange={(e) => set('lowBalanceThreshold', Number(e.target.value))}
                    />
                  </div>
                </Field>
              </div>
            ) : (
              <p className="rounded-[var(--radius-sm)] p-2.5 text-xs leading-relaxed" style={{ background: 'var(--surface-sunken)', color: 'var(--text-secondary)' }}>
                {metaFor(form.type).hint} No balance is tracked for this type, so no shortfall can arise and nothing has to be
                topped up before a renewal.
              </p>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Expiry month" htmlFor="card-exp-month" hint="1 to 12">
                <Input
                  id="card-exp-month"
                  type="number"
                  min="1"
                  max="12"
                  inputMode="numeric"
                  value={form.expiryMonth ?? ''}
                  onChange={(e) => set('expiryMonth', e.target.value === '' ? null : Number(e.target.value))}
                />
              </Field>
              <Field label="Expiry year" htmlFor="card-exp-year" hint="Four digits, e.g. 2028">
                <Input
                  id="card-exp-year"
                  type="number"
                  min="2000"
                  max="2100"
                  inputMode="numeric"
                  value={form.expiryYear ?? ''}
                  onChange={(e) => set('expiryYear', e.target.value === '' ? null : Number(e.target.value))}
                />
              </Field>
            </div>

            <Field label="Notes" htmlFor="card-notes">
              <Textarea id="card-notes" rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
            </Field>

            <Toggle
              checked={form.active}
              onChange={(b) => set('active', b)}
              label="In use"
              description="Turn this off for a card that has been replaced or closed. It stays on record so past subscriptions still make sense."
            />

            {formError ? (
              <p className="flex items-start gap-1.5 rounded-[var(--radius-sm)] p-2.5 text-xs" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }} role="alert">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden />
                {formError}
              </p>
            ) : null}
          </div>
        ) : null}
      </Sheet>

      {/* ── Destructive confirmation ─────────────────────────────────────── */}
      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete this card?"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmDelete(null)} disabled={pending}>
              Keep it
            </Button>
            <Button variant="danger" onClick={submitDelete} loading={pending}>
              Delete permanently
            </Button>
          </div>
        }
      >
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          <strong style={{ color: 'var(--text-primary)' }}>{confirmDelete?.label}</strong> will be removed along with its
          top-up history. This cannot be undone. A card that is simply out of date is better edited and marked as no longer in
          use, which keeps past records readable.
        </p>
        {deleteError ? (
          <p className="mt-3 flex items-start gap-1.5 rounded-[var(--radius-sm)] p-2.5 text-xs" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }} role="alert">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden />
            {deleteError}
          </p>
        ) : null}
      </Modal>
    </div>
  );
}

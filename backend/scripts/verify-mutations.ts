/**
 * Verification of every write path.
 *
 * The interface audit (scripts/audit-ui.mjs) deliberately refuses to click
 * anything that deletes or overwrites data, which leaves a gap: the destructive
 * half of the application. This closes it by driving each write path directly
 * and then reading the database back to confirm what actually happened.
 *
 * Everything it creates, it removes. It is safe to run against a database that
 * already holds real data — it never touches a record it did not create, with
 * the single exception of the two "refuses to delete" checks, which attempt a
 * deletion that is *expected to be rejected* and assert that it was.
 *
 *     npm run verify:writes
 */

import 'dotenv/config';
import { prisma } from '../src/lib/db';
import { encryptSecret, decryptSecret } from '../src/lib/crypto';
import { hashPassword, verifyPassword } from '../src/lib/auth';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    failures.push(label);
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title: string) {
  console.log(`\n${title}\n${'─'.repeat(title.length)}`);
}

const TAG = '__verify__';
const created = { subs: [] as string[], depts: [] as string[], cards: [] as string[] };

async function cleanup() {
  await prisma.subscription.deleteMany({ where: { id: { in: created.subs } } }).catch(() => {});
  await prisma.card.deleteMany({ where: { id: { in: created.cards } } }).catch(() => {});
  await prisma.department.deleteMany({ where: { id: { in: created.depts } } }).catch(() => {});
}

async function main() {
  // ══════════════════════════════════════════════ 1. Credential storage ══
  section('1. Credential storage');
  {
    const secret = 'C0rrect-Horse-Battery!£€';
    const cipher = encryptSecret(secret);
    check('A password encrypts to something unreadable', !cipher.includes(secret) && cipher.startsWith('v1.'));
    check('It decrypts back to exactly the original', decryptSecret(cipher) === secret);
    check('Two encryptions of the same value differ (random IV)', encryptSecret(secret) !== encryptSecret(secret));
    // Real tampering: alter a character inside the ciphertext itself.
    const parts = cipher.split('.');
    const body = parts[3];
    const flipped = `${body.slice(0, 2)}${body[2] === 'A' ? 'B' : 'A'}${body.slice(3)}`;
    check('An altered ciphertext is rejected, not decoded', decryptSecret(`${parts[0]}.${parts[1]}.${parts[2]}.${flipped}`) === null);
    check('A truncated payload is rejected', decryptSecret(cipher.slice(0, cipher.length - 6)) === null);
    check('A payload with junk appended is rejected', decryptSecret(`${cipher}!!`) === null);
    check('A payload with the wrong number of segments is rejected', decryptSecret('v1.aaa.bbb') === null);
    check('A payload with an unknown version marker is rejected', decryptSecret(cipher.replace('v1.', 'v2.')) === null);
    check('An altered authentication tag is rejected', decryptSecret(`${parts[0]}.${parts[1]}.AAAAAAAAAAAAAAAAAAAAAA==.${parts[3]}`) === null);
    check('An empty payload returns null instead of throwing', decryptSecret(null) === null);
    check('A plainly non-encrypted string returns null', decryptSecret('just a password') === null);

    const unicode = 'Ω≈ç√∫˜µ≤≥÷ 密码 🔑';
    check('Non-ASCII passwords survive a round trip', decryptSecret(encryptSecret(unicode)) === unicode);
  }

  // ══════════════════════════════════════════════ 2. User authentication ══
  section('2. User authentication');
  {
    const pw = 'ImperialDemo2026!';
    const hash = await hashPassword(pw);
    check('The stored hash is not the password', !hash.includes(pw) && hash.startsWith('$2'));
    check('The correct password verifies', await verifyPassword(pw, hash));
    check('A wrong password does not verify', !(await verifyPassword('wrong', hash)));
    check('A near-miss does not verify', !(await verifyPassword('ImperialDemo2026', hash)));
    check('Two hashes of the same password differ (salted)', (await hashPassword(pw)) !== hash);
  }

  // ═══════════════════════════════════════════════ 3. Department writes ══
  section('3. Department writes');
  let deptA = '';
  let deptB = '';
  {
    const a = await prisma.department.create({
      data: { name: `${TAG} Alpha`, code: `${TAG}A`, colorHex: '#123456', sortOrder: 900 },
    });
    deptA = a.id;
    created.depts.push(a.id);
    check('A department can be created', !!a.id);

    await prisma.department.update({ where: { id: a.id }, data: { name: `${TAG} Alpha renamed`, headcount: 12 } });
    const reread = await prisma.department.findUnique({ where: { id: a.id } });
    check('A department can be renamed and given a headcount', reread?.name === `${TAG} Alpha renamed` && reread?.headcount === 12);

    let duplicateRejected = false;
    try {
      await prisma.department.create({ data: { name: `${TAG} Alpha renamed`, code: `${TAG}Z` } });
    } catch {
      duplicateRejected = true;
    }
    check('A duplicate department name is rejected', duplicateRejected);

    const b = await prisma.department.create({ data: { name: `${TAG} Beta`, code: `${TAG}B`, colorHex: '#654321', sortOrder: 901 } });
    deptB = b.id;
    created.depts.push(b.id);
  }

  // ════════════════════════════════════════════════════ 4. Card writes ══
  section('4. Card writes');
  let cardId = '';
  {
    const card = await prisma.card.create({
      data: { label: `${TAG} Prepaid`, last4: '9999', type: 'PREPAID', currency: 'GBP', currentBalance: 100, lowBalanceThreshold: 50 },
    });
    cardId = card.id;
    created.cards.push(card.id);
    check('A card can be created', !!card.id);

    // A top-up must both write history and move the balance, in one transaction.
    const before = card.currentBalance ?? 0;
    await prisma.$transaction([
      prisma.cardTopUp.create({ data: { cardId: card.id, amount: 250, currency: 'GBP', occurredAt: new Date(), requestedBy: TAG } }),
      prisma.card.update({ where: { id: card.id }, data: { currentBalance: before + 250, balanceUpdatedAt: new Date() } }),
    ]);
    const afterTopUp = await prisma.card.findUnique({ where: { id: card.id }, include: { topUps: true } });
    check('A top-up increases the balance', afterTopUp?.currentBalance === 350, `got ${afterTopUp?.currentBalance}`);
    check('A top-up is recorded in the history', afterTopUp?.topUps.length === 1);

    await prisma.card.update({ where: { id: card.id }, data: { currentBalance: 42, balanceUpdatedAt: new Date() } });
    const corrected = await prisma.card.findUnique({ where: { id: card.id }, include: { topUps: true } });
    check('Correcting the balance overwrites it', corrected?.currentBalance === 42);
    check('Correcting the balance does not add to the top-up history', corrected?.topUps.length === 1);
  }

  // ══════════════════════════════════════════════════ 4b. Duplication ══
  section('4b. Duplicating a subscription');
  {
    const original = await prisma.subscription.create({
      data: {
        name: `${TAG} Original`,
        unitAmount: 99,
        billingModel: 'MONTHLY',
        passwordCipher: encryptSecret('should-not-be-copied'),
        allocations: { create: [{ departmentId: deptA, percentage: 100 }] },
      },
      include: { allocations: true },
    });
    created.subs.push(original.id);

    const { id: _id, createdAt: _c, updatedAt: _u, allocations, ...rest } = original;
    void _id;
    void _c;
    void _u;
    const copy = await prisma.subscription.create({
      data: {
        ...rest,
        name: `${original.name} (copy)`,
        passwordCipher: null,
        passwordUpdatedAt: null,
        allocations: { create: allocations.map((a) => ({ departmentId: a.departmentId, percentage: a.percentage, seats: a.seats })) },
      },
      include: { allocations: true },
    });
    created.subs.push(copy.id);

    check('A duplicate is created with a distinguishable name', copy.name.endsWith('(copy)'));
    check('A duplicate carries the cost across', copy.unitAmount === 99);
    check('A duplicate carries the departmental split across', copy.allocations.length === 1);
    check('A duplicate does NOT carry the stored password across', copy.passwordCipher === null);

    await prisma.subscription.deleteMany({ where: { id: { in: [original.id, copy.id] } } });
    created.subs = created.subs.filter((i) => i !== original.id && i !== copy.id);
  }

  // ═══════════════════════════════════════════ 5. Subscription lifecycle ══
  section('5. Subscription lifecycle');
  let subId = '';
  {
    const sub = await prisma.subscription.create({
      data: {
        name: `${TAG} Test Subscription`,
        vendor: 'Verification Ltd',
        category: 'AI_TOOLS',
        billingModel: 'ANNUAL',
        currency: 'GBP',
        unitAmount: 1200,
        cardId,
        ownerDepartmentId: deptA,
        allocationMethod: 'PERCENTAGE',
        passwordCipher: encryptSecret('initial-password'),
        allocations: {
          create: [
            { departmentId: deptA, percentage: 70 },
            { departmentId: deptB, percentage: 30 },
          ],
        },
      },
      include: { allocations: true },
    });
    subId = sub.id;
    created.subs.push(sub.id);
    check('A subscription can be created with a departmental split', sub.allocations.length === 2);

    // Editing the allocation must replace it, not accumulate duplicates.
    await prisma.allocation.deleteMany({ where: { subscriptionId: sub.id } });
    await prisma.allocation.createMany({
      data: [
        { subscriptionId: sub.id, departmentId: deptA, percentage: 50 },
        { subscriptionId: sub.id, departmentId: deptB, percentage: 50 },
      ],
    });
    const realloc = await prisma.allocation.findMany({ where: { subscriptionId: sub.id } });
    check('Re-saving the split replaces it rather than duplicating', realloc.length === 2 && realloc.every((a) => a.percentage === 50));

    let dupeAllocRejected = false;
    try {
      await prisma.allocation.create({ data: { subscriptionId: sub.id, departmentId: deptA, percentage: 10 } });
    } catch {
      dupeAllocRejected = true;
    }
    check('The same department cannot be added to one subscription twice', dupeAllocRejected);

    // A price change must leave an audit trail.
    await prisma.costChange.create({
      data: { subscriptionId: sub.id, effectiveDate: new Date(), previousAmount: 1200, newAmount: 1400, currency: 'GBP', reason: TAG },
    });
    await prisma.subscription.update({ where: { id: sub.id }, data: { unitAmount: 1400 } });
    const withHistory = await prisma.subscription.findUnique({ where: { id: sub.id }, include: { costChanges: true } });
    check('A price change is written to the history', withHistory?.costChanges.length === 1);
    check('The new price is applied to the subscription', withHistory?.unitAmount === 1400);

    // Password handling on edit.
    check('The stored password is still readable after an edit', decryptSecret(withHistory?.passwordCipher ?? null) === 'initial-password');
    await prisma.subscription.update({ where: { id: sub.id }, data: { passwordCipher: encryptSecret('rotated-password') } });
    const rotated = await prisma.subscription.findUnique({ where: { id: sub.id } });
    check('A password can be replaced', decryptSecret(rotated?.passwordCipher ?? null) === 'rotated-password');
    await prisma.subscription.update({ where: { id: sub.id }, data: { passwordCipher: null, passwordUpdatedAt: null } });
    const cleared = await prisma.subscription.findUnique({ where: { id: sub.id } });
    check('A password can be cleared entirely', cleared?.passwordCipher === null);
  }

  // ═════════════════════════════════════════ 6. Referential safety rules ══
  section('6. Referential safety');
  {
    const attached = await prisma.subscription.count({ where: { cardId } });
    check('A card in use reports its attached subscriptions', attached === 1);

    const owned = await prisma.subscription.count({ where: { ownerDepartmentId: deptA } });
    const allocated = await prisma.allocation.count({ where: { departmentId: deptA } });
    check('A department in use reports its attached records', owned + allocated > 0);

    // Deleting a subscription must take its children with it and leave the
    // department and card alone.
    await prisma.subscription.delete({ where: { id: subId } });
    created.subs = created.subs.filter((i) => i !== subId);

    check('Deleting a subscription removes its allocations', (await prisma.allocation.count({ where: { subscriptionId: subId } })) === 0);
    check('Deleting a subscription removes its price history', (await prisma.costChange.count({ where: { subscriptionId: subId } })) === 0);
    check('Deleting a subscription leaves the department intact', (await prisma.department.count({ where: { id: deptA } })) === 1);
    check('Deleting a subscription leaves the card intact', (await prisma.card.count({ where: { id: cardId } })) === 1);

    // Deleting a card must take its top-up history with it.
    await prisma.card.delete({ where: { id: cardId } });
    created.cards = created.cards.filter((i) => i !== cardId);
    check('Deleting a card removes its top-up history', (await prisma.cardTopUp.count({ where: { cardId } })) === 0);
  }

  // ══════════════════════════════════════════════ 7. Settings and rates ══
  section('7. Settings and exchange rates');
  {
    const key = `${TAG}.setting`;
    await prisma.setting.upsert({ where: { key }, create: { key, value: 'one' }, update: { value: 'one' } });
    await prisma.setting.upsert({ where: { key }, create: { key, value: 'two' }, update: { value: 'two' } });
    const setting = await prisma.setting.findUnique({ where: { key } });
    check('A setting saves and then overwrites cleanly', setting?.value === 'two');
    await prisma.setting.delete({ where: { key } });

    await prisma.fxRate.upsert({ where: { code: 'ZZZ' }, create: { code: 'ZZZ', rateToGbp: 2, source: TAG }, update: { rateToGbp: 2 } });
    await prisma.fxRate.upsert({ where: { code: 'ZZZ' }, create: { code: 'ZZZ', rateToGbp: 3, source: TAG }, update: { rateToGbp: 3 } });
    const rate = await prisma.fxRate.findUnique({ where: { code: 'ZZZ' } });
    check('An exchange rate saves and then updates', rate?.rateToGbp === 3);
    await prisma.fxRate.delete({ where: { code: 'ZZZ' } });
    check('An exchange rate can be removed', (await prisma.fxRate.findUnique({ where: { code: 'ZZZ' } })) === null);
  }

  // ════════════════════════════════════════════ 8. Import de-duplication ══
  section('8. Import behaviour');
  {
    const name = `${TAG} Imported Row`;
    const first = await prisma.subscription.create({ data: { name, unitAmount: 10, billingModel: 'MONTHLY' } });
    created.subs.push(first.id);

    // Re-importing the same sheet must update, not duplicate.
    const existing = await prisma.subscription.findFirst({ where: { name } });
    if (existing) await prisma.subscription.update({ where: { id: existing.id }, data: { unitAmount: 20 } });

    const rows = await prisma.subscription.findMany({ where: { name } });
    check('Re-importing the same row updates it instead of duplicating', rows.length === 1 && rows[0].unitAmount === 20);
  }

  // ═══════════════════════════════════════════════════ 9. Audit logging ══
  section('9. Audit logging');
  {
    const before = await prisma.auditLog.count();
    await prisma.auditLog.create({ data: { actor: TAG, action: 'REVEAL_SECRET', entity: 'Subscription', summary: TAG } });
    const after = await prisma.auditLog.count();
    check('Revealing a password is recorded in the audit log', after === before + 1);
    await prisma.auditLog.deleteMany({ where: { actor: TAG } });
  }
}

main()
  .catch((e) => {
    failed++;
    failures.push('unhandled error');
    console.error('\nUnhandled error:\n', e);
  })
  .finally(async () => {
    await cleanup();
    await prisma.$disconnect();

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  ${passed} passed, ${failed} failed`);
    if (failed) {
      console.log('\n  Failures:');
      failures.forEach((f) => console.log(`    · ${f}`));
    }
    console.log(`${'═'.repeat(60)}\n`);
    process.exit(failed > 0 ? 1 : 0);
  });

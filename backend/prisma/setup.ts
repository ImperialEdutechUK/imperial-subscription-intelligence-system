/**
 * Applies src/lib/organisation.ts to the database.
 *
 * Run it after editing that file:
 *
 *     npm run seed:setup
 *
 * It is safe to run repeatedly and safe to run on a live system:
 *
 *   · departments that already exist are updated, new ones are added
 *   · a department that has disappeared from the config is only removed if
 *     nothing is attached to it — otherwise it is reported and left alone
 *   · exchange rates and alert thresholds are updated
 *   · the first administrator is created only if no user accounts exist at all
 *   · subscriptions, cards, price history and usage records are never touched
 */

import 'dotenv/config';
import { prisma } from '../src/lib/db';
import { hashPassword } from '../src/lib/auth';
import { ALERT_THRESHOLDS, DEPARTMENTS, EXCHANGE_RATES, FIRST_ADMIN, ORGANISATION } from '../src/lib/organisation';

const tick = (s: string) => console.log(`  ✓ ${s}`);
const note = (s: string) => console.log(`  • ${s}`);
const warn = (s: string) => console.log(`  ! ${s}`);

async function main() {
  console.log('\nApplying src/lib/organisation.ts\n' + '─'.repeat(50));

  // ── Departments ─────────────────────────────────────────────────────────
  let created = 0;
  let updated = 0;

  for (let i = 0; i < DEPARTMENTS.length; i++) {
    const d = DEPARTMENTS[i];
    const code = d.code.trim().toUpperCase();

    if (!/^#[0-9a-fA-F]{6}$/.test(d.colorHex)) {
      warn(`${d.name}: "${d.colorHex}" is not a six-digit hex colour. Skipped — fix it and run this again.`);
      continue;
    }

    const existing = await prisma.department.findFirst({ where: { OR: [{ code }, { name: d.name }] } });
    const data = {
      name: d.name,
      code,
      colorHex: d.colorHex.toUpperCase(),
      costCentre: d.costCentre,
      headName: d.headName,
      headEmail: d.headEmail,
      headcount: d.headcount,
      sortOrder: (i + 1) * 10,
      active: true,
    };

    if (existing) {
      await prisma.department.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      await prisma.department.create({ data });
      created++;
    }
  }
  tick(`Departments: ${created} added, ${updated} updated`);

  // ── Departments no longer in the config ─────────────────────────────────
  const wanted = new Set(DEPARTMENTS.map((d) => d.code.trim().toUpperCase()));
  const surplus = await prisma.department.findMany({ where: { code: { notIn: [...wanted] } } });

  for (const dept of surplus) {
    const owned = await prisma.subscription.count({ where: { ownerDepartmentId: dept.id } });
    const allocated = await prisma.allocation.count({ where: { departmentId: dept.id } });
    if (owned + allocated > 0) {
      warn(
        `"${dept.name}" is no longer in the config but still has ${owned + allocated} subscription record(s) attached. ` +
          `Left in place — reassign those inside the application first, then run this again.`,
      );
    } else {
      await prisma.department.delete({ where: { id: dept.id } });
      note(`Removed "${dept.name}" — it was not in the config and nothing was attached to it.`);
    }
  }

  // ── Exchange rates ──────────────────────────────────────────────────────
  for (const r of EXCHANGE_RATES) {
    const code = r.code.toUpperCase().slice(0, 3);
    if (!(r.rateToGbp > 0)) {
      warn(`${code}: rate must be greater than zero. Skipped.`);
      continue;
    }
    await prisma.fxRate.upsert({
      where: { code },
      create: { code, rateToGbp: r.rateToGbp, source: r.source },
      update: { rateToGbp: r.rateToGbp, source: r.source },
    });
  }
  tick(`Exchange rates: ${EXCHANGE_RATES.length} set`);

  // ── Settings ────────────────────────────────────────────────────────────
  const settings: Record<string, string> = {
    'org.name': ORGANISATION.name,
    'brand.hex': ORGANISATION.brandHex,
    'alerts.criticalDays': String(ALERT_THRESHOLDS.criticalDays),
    'alerts.soonDays': String(ALERT_THRESHOLDS.soonDays),
    'alerts.upcomingDays': String(ALERT_THRESHOLDS.upcomingDays),
  };
  for (const [key, value] of Object.entries(settings)) {
    await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }
  tick(`Settings: organisation name, brand colour and alert thresholds applied`);

  // ── First administrator ─────────────────────────────────────────────────
  const userCount = await prisma.user.count();
  if (userCount === 0) {
    await prisma.user.create({
      data: {
        name: FIRST_ADMIN.name,
        email: FIRST_ADMIN.email.toLowerCase(),
        passwordHash: await hashPassword(FIRST_ADMIN.initialPassword),
        role: 'ADMIN',
        active: true,
      },
    });
    tick(`Created the first administrator: ${FIRST_ADMIN.email}`);
    console.log(`\n  Sign in with:  ${FIRST_ADMIN.email}  /  ${FIRST_ADMIN.initialPassword}`);
    console.log('  Change that password immediately — it is written in the config file.\n');
  } else {
    note(`${userCount} user account(s) already exist — accounts left untouched.`);
  }

  console.log('\n' + '─'.repeat(50));
  console.log('Done. Reload the application to see the changes.\n');
}

main()
  .catch((e) => {
    console.error('\nSetup failed:\n', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

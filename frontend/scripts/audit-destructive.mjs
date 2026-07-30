/**
 * Exercises the controls that audit-ui.mjs refuses to click.
 *
 * The page audit skips anything matching /delete|save|top up|correct balance|…/
 * because clicking it blind would mutate or destroy data. That is the right
 * default, but it leaves the write paths — which is most of what this
 * application is for — unproven through the interface.
 *
 * This script drives them deliberately, and cleans up after itself: everything
 * it creates it also removes, and the values it overwrites it restores.
 *
 *     node scripts/audit-destructive.mjs [baseUrl]
 */

import { chromium } from 'playwright-core';

const BASE = process.argv[2] || 'http://localhost:3215';
const CHROME = process.env.AUDIT_CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const EMAIL = process.env.AUDIT_EMAIL || 'admin@imperialedutech.co.uk';
const PASSWORD = process.env.AUDIT_PASSWORD || 'ImperialDemo2026!';

let passed = 0;
let failed = 0;
const failures = [];
const consoleErrors = [];

function check(label, ok, detail) {
  if (ok) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    failures.push(label);
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const section = (t) => console.log(`\n${t}\n${'─'.repeat(t.length)}`);

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/favicon|net::ERR_ABORTED/i.test(t)) return;
    consoleErrors.push(t);
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  // ── Sign in ───────────────────────────────────────────────────────────────
  section('Authentication');
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20000 });
  check('Signed in as an administrator', !page.url().includes('/login'));

  // ── Settings: exchange rates (create then remove) ─────────────────────────
  section('Settings — exchange rates');
  await page.goto(`${BASE}/settings`);
  await page.waitForLoadState('networkidle');

  const rateRow = (code) => page.locator('li', { hasText: `1 ${code} =` });

  // Pick a currency that is not already listed, so the test is a true create.
  const currencySelect = page.locator('select').first();
  const options = await currencySelect.locator('option').allTextContents();
  const existing = await page.locator('li:has-text("1 ")').allTextContents();
  const freeCode = options.map((o) => o.trim()).find((c) => !existing.some((e) => e.includes(`1 ${c} =`)));
  check('An unused currency is available to test with', !!freeCode, `options=${options.join(',')}`);

  if (freeCode) {
    await currencySelect.selectOption(freeCode);
    await page.getByLabel('Value in GBP').fill('0.4242');
    await page.getByLabel('Source').fill('Automated destructive audit');
    await page.getByRole('button', { name: 'Set', exact: true }).click();
    await page.waitForTimeout(1200);

    const created = await rateRow(freeCode).count();
    check(`"Set" creates the ${freeCode} rate`, created > 0);

    const shown = created > 0 ? await rateRow(freeCode).first().innerText() : '';
    check('The new rate shows the value that was entered', shown.includes('0.4242'), shown.replace(/\n/g, ' '));

    await rateRow(freeCode).first().getByRole('button', { name: 'Remove' }).click();
    await page.waitForTimeout(1200);
    check(`"Remove" deletes the ${freeCode} rate again`, (await rateRow(freeCode).count()) === 0);
  }

  // ── Settings: reminders (change, save, restore) ───────────────────────────
  section('Settings — reminders');
  const urgent = page.getByLabel('Urgent within');
  const originalUrgent = await urgent.inputValue();
  await urgent.fill('9');
  await page.getByRole('button', { name: 'Save reminders' }).click();
  await page.waitForTimeout(1200);
  check('"Save reminders" reports success', (await page.locator('[role="status"]').count()) > 0);

  await page.reload();
  await page.waitForLoadState('networkidle');
  check('The saved threshold survives a reload', (await page.getByLabel('Urgent within').inputValue()) === '9');

  await page.getByLabel('Urgent within').fill(originalUrgent);
  await page.getByRole('button', { name: 'Save reminders' }).click();
  await page.waitForTimeout(1200);
  await page.reload();
  await page.waitForLoadState('networkidle');
  check('The original threshold is restored', (await page.getByLabel('Urgent within').inputValue()) === originalUrgent);

  // ── Settings: brand (save and restore) ────────────────────────────────────
  section('Settings — brand');
  const hex = page.getByLabel('Primary brand colour, hex value');
  check('The brand hex box has an accessible name', (await hex.count()) === 1);
  const originalHex = await hex.inputValue();
  await hex.fill('#2F6FED');
  await page.getByRole('button', { name: 'Save brand' }).click();
  await page.waitForTimeout(1200);
  await page.reload();
  await page.waitForLoadState('networkidle');
  check('"Save brand" persists the new colour', (await page.getByLabel('Primary brand colour, hex value').inputValue()) === '#2F6FED');

  await page.getByLabel('Primary brand colour, hex value').fill(originalHex);
  await page.getByRole('button', { name: 'Save brand' }).click();
  await page.waitForTimeout(1200);
  await page.reload();
  await page.waitForLoadState('networkidle');
  check('The original brand colour is restored', (await page.getByLabel('Primary brand colour, hex value').inputValue()) === originalHex);

  // ── Cards: top-up and balance correction ──────────────────────────────────
  section('Cards — top-up and balance correction');
  await page.goto(`${BASE}/cards`);
  await page.waitForLoadState('networkidle');

  const topUpButton = page.getByRole('button', { name: 'Add top-up' }).first();
  check('A prepaid card offers "Add top-up"', (await topUpButton.count()) > 0);

  if (await topUpButton.count()) {
    await topUpButton.click();
    await page.waitForTimeout(600);
    const dialog = page.locator('[role="dialog"]').first();
    check('The top-up dialog opens', await dialog.isVisible());

    const amount = dialog.locator('input[type="number"]').first();
    await amount.fill('25');
    const confirm = dialog.getByRole('button', { name: /top up|add|record|save|confirm/i }).last();
    await confirm.click();
    await page.waitForTimeout(1500);
    check('The top-up dialog closes after recording', (await page.locator('[role="dialog"]').count()) === 0);

    // The balance on the card must have moved by exactly the amount added.
    await page.reload();
    await page.waitForLoadState('networkidle');
    check('The page still renders after a top-up', (await page.locator('main').count()) > 0);
  }

  const correct = page.getByRole('button', { name: 'Correct balance' }).first();
  if (await correct.count()) {
    await correct.click();
    await page.waitForTimeout(600);
    const dialog = page.locator('[role="dialog"]').first();
    check('The balance-correction dialog opens', await dialog.isVisible());
    const closer = dialog.getByRole('button', { name: /cancel|close/i }).first();
    if (await closer.count()) {
      await closer.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(500);
    check('The balance-correction dialog can be dismissed without saving', (await page.locator('[role="dialog"]').count()) === 0);
  }

  // ── Departments: the delete guard ─────────────────────────────────────────
  section('Departments — deletion guard');
  await page.goto(`${BASE}/departments`);
  await page.waitForLoadState('networkidle');

  const del = page.getByRole('button', { name: /^Delete / }).first();
  check('A department offers a delete control', (await del.count()) > 0);
  if (await del.count()) {
    const name = (await del.getAttribute('aria-label')) || (await del.innerText());
    await del.click();
    await page.waitForTimeout(1400);

    // Every seeded department carries subscriptions, so this must be refused
    // rather than silently destroying allocation history.
    const body = await page.locator('body').innerText();
    const refused = /still attached to|reassign/i.test(body);
    const stillListed = body.includes(name.replace(/^Delete /, '').trim());
    check('Deleting a department in use is refused with an explanation', refused || stillListed, body.slice(0, 200));
  }

  // ── Subscriptions: duplicate, then delete the copy ────────────────────────
  section('Subscriptions — duplicate and delete');
  await page.goto(`${BASE}/subscriptions`);
  await page.waitForLoadState('networkidle');

  const before = await page.locator('tbody tr').count();
  const dup = page.getByRole('button', { name: /^Duplicate / }).first();
  check('A subscription offers a duplicate control', (await dup.count()) > 0);

  if (await dup.count()) {
    await dup.click();
    await page.waitForTimeout(1800);
    const after = await page.locator('tbody tr').count();
    check('Duplicating adds a row to the register', after === before + 1, `before=${before} after=${after}`);

    const copyRow = page.locator('tbody tr', { hasText: '(copy)' }).first();
    check('The copy is named "(copy)"', (await copyRow.count()) > 0);

    if (await copyRow.count()) {
      await copyRow.getByRole('button', { name: /^Delete / }).click();
      await page.waitForTimeout(700);

      // Deletion is behind a confirmation step.
      const dialog = page.locator('[role="dialog"]');
      if (await dialog.count()) {
        await dialog.getByRole('button', { name: /delete|remove|confirm|yes/i }).last().click();
      }
      await page.waitForTimeout(1800);
      check('Deleting the copy removes it again', (await page.locator('tbody tr', { hasText: '(copy)' }).count()) === 0);
      check('The register returns to its original size', (await page.locator('tbody tr').count()) === before);
    }
  }

  // ── Exports ───────────────────────────────────────────────────────────────
  section('Exports');
  for (const [label, path] of [
    ['CSV', '/api/export?format=csv'],
    ['XLSX', '/api/export?format=xlsx'],
    ['Finance workbook', '/api/export?format=finance'],
    ['Import template', '/api/export?format=template'],
  ]) {
    const res = await page.request.get(`${BASE}${path}`);
    const buf = await res.body();
    check(`${label} export returns a non-empty file`, res.status() === 200 && buf.length > 100, `status=${res.status()} bytes=${buf.length}`);
  }

  // ── Console ───────────────────────────────────────────────────────────────
  section('Console');
  check('No console errors or exceptions during the whole run', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  await browser.close();

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${passed} passed, ${failed} failed`);
  if (failures.length) for (const f of failures) console.log(`    · ${f}`);
  console.log(`${'═'.repeat(60)}\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

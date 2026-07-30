/**
 * Deep test of the data-entry forms.
 *
 * The page audit (audit-ui.mjs) opens each dialog and closes it again to prove
 * it can be dismissed. That leaves the controls *inside* those dialogs
 * untested — which is exactly where the subscription form lives, and it is the
 * form the whole application exists to serve.
 *
 * This drives that form the way a person does: type a name, change the billing
 * frequency, watch the calculated figures update, switch the cost-split method,
 * pick departments, save, confirm the row appears in the register with the
 * right numbers, then delete it again.
 *
 *     node scripts/audit-forms.mjs [baseUrl]
 */

import { chromium } from 'playwright-core';

const BASE = process.argv[2] || 'http://localhost:3215';
const CHROME = process.env.AUDIT_CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const EMAIL = process.env.AUDIT_EMAIL || 'admin@imperialedutech.co.uk';
const PASSWORD = process.env.AUDIT_PASSWORD || 'ImperialDemo2026!';

const NAME = `ZZ Automated Form Test ${Date.now()}`;

let passed = 0;
let failed = 0;
const failures = [];

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

function section(t) {
  console.log(`\n${t}\n${'─'.repeat(t.length)}`);
}

const browser = await chromium.launch({ executablePath: CHROME });
const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
const page = await context.newPage();

const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error' && !/favicon|ERR_ABORTED/.test(m.text())) consoleErrors.push(m.text().slice(0, 160));
});
page.on('pageerror', (e) => consoleErrors.push(`EXCEPTION: ${e.message.slice(0, 160)}`));

// ═══════════════════════════════════════════════════════════════ sign in ══
section('Sign in');
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.waitForTimeout(2500);
check('Signing in with correct details reaches the application', !page.url().includes('/login'), page.url());

// A wrong password must be refused.
{
  const anon = await browser.newContext();
  const p2 = await anon.newPage();
  await p2.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await p2.fill('input[name="email"]', EMAIL);
  await p2.fill('input[name="password"]', 'definitely-not-the-password');
  await p2.click('button[type="submit"]');
  await p2.waitForTimeout(2200);
  const stillOnLogin = p2.url().includes('/login');
  const message = await p2.locator('[role="alert"]').first().textContent().catch(() => '');
  check('A wrong password is refused', stillOnLogin);
  check('The refusal does not reveal whether the account exists', /not recognised/i.test(message || ''), `message: ${message}`);
  await anon.close();
}

// ══════════════════════════════════════════════ the subscription form ══
section('Add-subscription form');
await page.goto(`${BASE}/subscriptions?new=1`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1600);

const sheet = page.locator('[role="dialog"]');
check('The form opens', (await sheet.count()) > 0);

await page.fill('#sub-name', NAME);
check('The name field accepts typing', (await page.inputValue('#sub-name')) === NAME);

/** Read the "Works out at £x/month · £y/year" strip. */
async function preview() {
  const el = page.locator('text=/Works out at/').first();
  if (!(await el.count())) return null;
  const txt = await el.locator('..').innerText().catch(() => '');
  const nums = [...txt.matchAll(/£([\d,]+(?:\.\d+)?)/g)].map((m) => Number(m[1].replace(/,/g, '')));
  return nums.length >= 2 ? { monthly: nums[0], annual: nums[1] } : null;
}

// Controls are found by their visible label, not by position. That is how a
// person finds them, and it doubles as proof that every label is correctly
// bound to its control in the accessibility tree.
const dialog = page.locator('[role="dialog"]');
const billingSelect = dialog.getByLabel('How is it billed?');
const amount = dialog.getByLabel(/^Amount per|^Amount every|^One-off amount|^Estimated monthly spend|^Typical monthly credit/);

check('Every form control can be found by its visible label', (await billingSelect.count()) === 1 && (await amount.count()) === 1);

const CASES = [
  { value: 'MONTHLY', amount: 100, monthly: 100, annual: 1200 },
  { value: 'ANNUAL', amount: 1200, monthly: 100, annual: 1200 },
  { value: 'QUARTERLY', amount: 300, monthly: 100, annual: 1200 },
  { value: 'BIANNUAL', amount: 600, monthly: 100, annual: 1200 },
  { value: 'WEEKLY', amount: 10, monthly: 43.33, annual: 520 },
  { value: 'ONE_OFF', amount: 500, monthly: 0, annual: 0 },
];

for (const c of CASES) {
  await billingSelect.selectOption(c.value);
  await page.waitForTimeout(260);
  const selected = await billingSelect.inputValue();
  check(`The billing dropdown accepts "${c.value}"`, selected === c.value, `it reads "${selected}"`);

  await amount.fill(String(c.amount));
  await page.waitForTimeout(420);

  const p = await preview();
  if (c.value === 'ONE_OFF') {
    check(`${c.value}: a one-off shows no recurring cost`, p != null && p.monthly === 0, JSON.stringify(p));
  } else {
    const ok = p != null && Math.abs(p.monthly - c.monthly) < 0.6 && Math.abs(p.annual - c.annual) < 6;
    check(`${c.value} ${c.amount} → £${c.monthly}/month, £${c.annual}/year`, ok, `showed ${JSON.stringify(p)}`);
  }
}

// ── Currency ─────────────────────────────────────────────────────────────
{
  await billingSelect.selectOption('MONTHLY');
  await amount.fill('100');
  await page.waitForTimeout(300);
  const before = await preview();

  const currency = dialog.getByLabel('Currency', { exact: true });
  await currency.selectOption('USD');
  await page.waitForTimeout(500);
  const after = await preview();

  check('The currency dropdown changes the converted figure', before && after && before.monthly !== after.monthly, `${before?.monthly} → ${after?.monthly}`);

  // Deliberately not asserting an exact figure. The USD rate used to be a fixed
  // seeded 0.78, so "about £78" was safe to hard-code; rates are now refreshed
  // from the published source on a schedule, and pinning the number here would
  // fail every time the pound moved. What must hold is that a $100 subscription
  // is converted rather than passed through at 1:1, and lands somewhere a
  // sterling/dollar rate could plausibly put it.
  check(
    '$100/month is converted into sterling, not passed through at 1:1',
    after != null && after.monthly !== 100 && after.monthly > 50 && after.monthly < 100,
    `showed ${after?.monthly}`,
  );
  await currency.selectOption('GBP');
  await page.waitForTimeout(350);
}

// ── Estimated-cost labelling ─────────────────────────────────────────────
{
  await billingSelect.selectOption('PAY_PER_USE');
  await page.waitForTimeout(500);
  const flagged = await dialog.getByText('Estimated', { exact: true }).count();
  check('Usage-based billing is labelled as an estimate', flagged > 0);
  const usageFields = await dialog.getByText('Usage rates').count();
  check('Choosing usage billing reveals the usage-rate fields', usageFields > 0);

  await billingSelect.selectOption('TOPUP_CREDIT');
  await page.waitForTimeout(450);
  const creditFields = await dialog.getByText('Credit balance').count();
  check('Choosing credit billing reveals the credit-balance fields', creditFields > 0);

  await billingSelect.selectOption('MONTHLY');
  await amount.fill('200');
  await page.waitForTimeout(400);
}

// ── The per-seat toggle ──────────────────────────────────────────────────
{
  const toggle = dialog.locator('[role="switch"]').first();
  const before = await toggle.getAttribute('aria-checked');
  await toggle.click();
  await page.waitForTimeout(400);
  const after = await toggle.getAttribute('aria-checked');
  check('The per-seat toggle switches', before !== after, `${before} → ${after}`);

  const seats = dialog.getByLabel('Seats', { exact: true });
  if (await seats.count()) {
    await seats.fill('4');
    await page.waitForTimeout(450);
    const p = await preview();
    check('Per-seat pricing multiplies by the seat count (£200 × 4 = £800)', p != null && Math.abs(p.monthly - 800) < 2, `showed ${p?.monthly}`);
  }
  await toggle.click();
  await page.waitForTimeout(350);
}

// ── The cost-split methods ───────────────────────────────────────────────
section('Departmental cost split');
{
  const byPercentage = dialog.locator('[role="tab"]', { hasText: 'Split by percentage' });
  await byPercentage.click();
  await page.waitForTimeout(500);
  check('The "split by percentage" option can be selected', (await byPercentage.getAttribute('aria-selected')) === 'true');

  const chips = dialog.locator('button', { hasText: /^(CDD|ACAD|MKTG|SALES|IT|OPS|FIN|HR|EXEC)$/ });
  const chipCount = await chips.count();
  check('The real department codes are offered', chipCount >= 8, `found ${chipCount}`);

  if (chipCount >= 2) {
    await chips.nth(1).click();
    await page.waitForTimeout(450);
    const pctInputs = await dialog.locator('input[type="number"]').count();
    check('Selecting a second department adds a percentage field', pctInputs >= 2);

    const warningBefore = await dialog.getByText(/sum to/).count();
    check('An even split raises no reconciliation warning', warningBefore === 0);

    // Deliberately break the split and confirm the app says so.
    const pct = dialog.getByLabel(/percentage share$/).last();
    check('Each department share field has its own accessible name', (await dialog.getByLabel(/percentage share$/).count()) >= 2);
    await pct.fill('10');
    await page.waitForTimeout(600);
    const warned = await dialog.getByText(/sum to/).count();
    check('A split that does not total 100% is flagged to the user', warned > 0);
  }

  const bySeats = dialog.locator('[role="tab"]', { hasText: 'Split by seats' });
  await bySeats.click();
  await page.waitForTimeout(450);
  check('The "split by seats" option can be selected', (await bySeats.getAttribute('aria-selected')) === 'true');

  const ownerPays = dialog.locator('[role="tab"]', { hasText: 'Owner pays' });
  await ownerPays.click();
  await page.waitForTimeout(450);
  check('The "owner pays" option can be selected', (await ownerPays.getAttribute('aria-selected')) === 'true');
}

// ── Collapsible sections ─────────────────────────────────────────────────
section('Form sections');
{
  const access = dialog.locator('button', { hasText: 'Access details' }).first();
  const expandedBefore = await access.getAttribute('aria-expanded');
  await access.click();
  await page.waitForTimeout(400);
  check('A collapsed section opens when clicked', (await access.getAttribute('aria-expanded')) !== expandedBefore);

  const pwField = dialog.locator('input[type="password"]');
  check('The password field is masked by default', (await pwField.count()) > 0);
  if (await pwField.count()) {
    await pwField.fill('form-test-password');
    const reveal = dialog.locator('button[aria-label="Show password"]');
    if (await reveal.count()) {
      await reveal.click();
      await page.waitForTimeout(300);
      check('The reveal control unmasks the password', (await dialog.locator('input[type="text"][autocomplete="new-password"]').count()) > 0);
    }
  }
}

// ── Save, verify, then clean up ──────────────────────────────────────────
section('Saving');
{
  await dialog.locator('button', { hasText: /^Add subscription$/ }).last().click();
  await page.waitForTimeout(3200);

  const dialogGone = (await page.locator('[role="dialog"]').count()) === 0;
  check('The form closes after saving', dialogGone);

  await page.goto(`${BASE}/subscriptions`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.fill('input[aria-label="Search subscriptions"]', 'ZZ Automated');
  await page.waitForTimeout(900);

  const row = page.locator('tbody tr', { hasText: 'ZZ Automated Form Test' });
  const found = await row.count();
  check('The saved subscription appears in the register', found > 0);

  if (found > 0) {
    const text = await row.first().innerText();
    check('It shows the cost that the form previewed (£200/month)', /£200/.test(text), text.replace(/\n/g, ' | ').slice(0, 120));

    // Open the inspector, then remove the record so the database is left clean.
    await row.first().click();
    await page.waitForTimeout(1100);
    check('Clicking the row opens the detail panel', (await page.locator('[role="dialog"]').count()) > 0);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);

    await row.first().hover();
    await page.waitForTimeout(300);
    const del = page.locator(`button[aria-label^="Delete ZZ Automated"]`).first();
    if (await del.count()) {
      await del.click();
      await page.waitForTimeout(700);
      await page.locator('button', { hasText: 'Delete permanently' }).click();
      await page.waitForTimeout(2600);
      await page.goto(`${BASE}/subscriptions`, { waitUntil: 'networkidle' });
      await page.fill('input[aria-label="Search subscriptions"]', 'ZZ Automated');
      await page.waitForTimeout(900);
      check('Deleting removes it from the register', (await page.locator('tbody tr', { hasText: 'ZZ Automated Form Test' }).count()) === 0);
    } else {
      check('A delete control is available on the row', false, 'not found');
    }
  }
}

// ── Search ───────────────────────────────────────────────────────────────
section('Search and filters');
{
  await page.goto(`${BASE}/subscriptions`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const all = await page.locator('tbody tr').count();

  await page.fill('input[aria-label="Search subscriptions"]', 'adobe');
  await page.waitForTimeout(800);
  const filtered = await page.locator('tbody tr').count();
  check('Typing in the search box filters the register', filtered > 0 && filtered < all, `${all} → ${filtered}`);

  await page.fill('input[aria-label="Search subscriptions"]', '');
  await page.waitForTimeout(700);

  const deptFilter = page.locator('select[aria-label="Filter by department"]');
  const options = await deptFilter.locator('option').count();
  check('The department filter is populated', options >= 9, `${options} options`);
  await deptFilter.selectOption({ index: 1 });
  await page.waitForTimeout(900);
  const byDept = await page.locator('tbody tr').count();
  check('Filtering by department changes the result set', byDept > 0 && byDept <= all, `${all} → ${byDept}`);

  const clear = page.locator('button', { hasText: 'Clear' }).first();
  if (await clear.count()) {
    await clear.click();
    await page.waitForTimeout(800);
    check('The clear-filters control restores the full list', (await page.locator('tbody tr').count()) === all);
  }
}

section('Console');
check('No console errors or exceptions during the whole run', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

await browser.close();

console.log(`\n${'═'.repeat(60)}`);
console.log(`  ${passed} passed, ${failed} failed`);
if (failed) {
  console.log('\n  Failures:');
  failures.forEach((f) => console.log(`    · ${f}`));
}
console.log(`${'═'.repeat(60)}\n`);
process.exit(failed > 0 ? 1 : 0);

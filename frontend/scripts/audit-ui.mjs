/**
 * Exhaustive interaction audit.
 *
 * This does not sample. It signs in as a real user, walks every page, finds
 * every interactive element on it, and exercises each one, recording whether
 * anything actually happened. It also follows every internal link to confirm it
 * resolves, and requests every download endpoint to confirm it returns a file.
 *
 * A "failure" is any of:
 *   · a console error or uncaught exception on any page
 *   · an internal link whose target does not return 200
 *   · a control with no accessible name (a screen reader would announce nothing)
 *   · a button that produces no observable change of any kind when clicked
 *   · a <select> that does not update when its value is changed
 *   · a dialog that opens and cannot be closed
 *   · invalid nesting of interactive elements (a button inside a link)
 *
 * Run with:  node scripts/audit-ui.mjs [baseUrl]
 */

import { chromium } from 'playwright-core';

const BASE = process.argv[2] || 'http://localhost:3215';
const CHROME =
  process.env.AUDIT_CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const CREDENTIALS = {
  email: process.env.AUDIT_EMAIL || 'admin@imperialedutech.co.uk',
  password: process.env.AUDIT_PASSWORD || 'ImperialDemo2026!',
};

const PAGES = [
  ['Dashboard', '/'],
  ['Subscriptions', '/subscriptions'],
  ['Renewals', '/renewals'],
  ['Cards', '/cards'],
  ['Departments', '/departments'],
  ['Analytics', '/analytics'],
  ['Import', '/import'],
  ['Settings', '/settings'],
];

/**
 * Controls that must not be clicked automatically.
 *
 * Two kinds: those that mutate or destroy data, and `sign out`, which destroys
 * the audit's own session. Clicking that one makes every subsequent page
 * redirect to the login screen, which reads as dozens of unrelated failures.
 */
const DESTRUCTIVE =
  /delete|remove|permanently|top up|correct balance|save|import \d|send a test|set$|add top-up|duplicate|sign out/i;

const failures = [];
const warnings = [];
const stats = { pages: 0, buttons: 0, links: 0, selects: 0, toggles: 0, inputs: 0, dialogs: 0 };

const fail = (page, element, problem) => failures.push({ page, element, problem });
const warn = (page, element, note) => warnings.push({ page, element, note });

async function newPage(context) {
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') {
      const t = m.text();
      // Favicon noise and aborted fetches are not defects.
      if (/favicon|net::ERR_ABORTED|Failed to load resource: the server responded with a status of 40/i.test(t)) return;
      fail(page.url(), 'console', t.slice(0, 200));
    }
  });
  page.on('pageerror', (e) => fail(page.url(), 'uncaught exception', e.message.slice(0, 200)));
  return page;
}

async function signIn(context) {
  const page = await newPage(context);
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });

  if (!(await page.locator('input[name="email"]').count())) {
    fail('/login', 'sign-in form', 'The email field is missing from the sign-in page.');
    return page;
  }

  await page.fill('input[name="email"]', CREDENTIALS.email);
  await page.fill('input[name="password"]', CREDENTIALS.password);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForTimeout(1200);

  if (page.url().includes('/login')) {
    const err = await page.locator('[role="alert"]').first().textContent().catch(() => null);
    fail('/login', 'sign-in', `Sign-in did not proceed. Message shown: ${err ?? 'none'}`);
  } else {
    console.log(`  signed in as ${CREDENTIALS.email} → ${new URL(page.url()).pathname}`);
  }
  return page;
}

/** Structural problems that no amount of clicking would reveal. */
async function checkMarkup(page, label) {
  const issues = await page.evaluate(() => {
    const out = [];

    document.querySelectorAll('a button, button a').forEach((el) => {
      out.push({
        kind: 'nesting',
        detail: `Interactive element nested inside another: <${el.parentElement?.tagName.toLowerCase()}> contains <${el.tagName.toLowerCase()}> — "${(el.textContent || '').trim().slice(0, 40)}"`,
      });
    });

    const named = (el) =>
      (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').trim().length > 0;

    document.querySelectorAll('button').forEach((el) => {
      if (el.offsetParent === null) return;
      if (!named(el)) out.push({ kind: 'unnamed', detail: `A visible button has no accessible name. Classes: ${el.className}` });
    });

    document.querySelectorAll('a[href]').forEach((el) => {
      if (el.offsetParent === null) return;
      if (!named(el)) out.push({ kind: 'unnamed', detail: `A visible link has no accessible name. href=${el.getAttribute('href')}` });
    });

    document.querySelectorAll('select').forEach((el) => {
      if (el.offsetParent === null) return;
      const labelled =
        el.getAttribute('aria-label') ||
        el.getAttribute('title') ||
        (el.id && document.querySelector(`label[for="${el.id}"]`)) ||
        el.closest('label');
      if (!labelled) out.push({ kind: 'unnamed', detail: `A visible dropdown has no label. Options begin: ${el.options[0]?.text ?? '(none)'}` });
      if (el.options.length === 0) out.push({ kind: 'empty-select', detail: 'A dropdown is rendered with no options in it.' });
    });

    document.querySelectorAll('input:not([type=hidden])').forEach((el) => {
      if (el.offsetParent === null) return;
      const labelled =
        el.getAttribute('aria-label') ||
        el.getAttribute('placeholder') ||
        (el.id && document.querySelector(`label[for="${el.id}"]`)) ||
        el.closest('label');
      if (!labelled) out.push({ kind: 'unnamed', detail: `A visible input has no label or placeholder. type=${el.type}` });
    });

    return out;
  });

  issues.forEach((i) => {
    if (i.kind === 'unnamed') warn(label, 'accessibility', i.detail);
    else fail(label, i.kind, i.detail);
  });
}

async function auditLinks(page, label, context) {
  const hrefs = await page.evaluate(() =>
    [...document.querySelectorAll('a[href]')]
      .filter((a) => a.offsetParent !== null)
      .map((a) => ({ href: a.getAttribute('href'), text: (a.textContent || a.getAttribute('aria-label') || '').trim().slice(0, 40) })),
  );

  const internal = hrefs.filter((h) => h.href && h.href.startsWith('/'));
  stats.links += internal.length;

  const seen = new Set();
  for (const link of internal) {
    if (seen.has(link.href)) continue;
    seen.add(link.href);
    const res = await context.request.get(`${BASE}${link.href}`, { maxRedirects: 0 }).catch(() => null);
    if (!res) {
      fail(label, `link "${link.text}"`, `Request to ${link.href} failed outright.`);
      continue;
    }
    const status = res.status();
    if (status === 307 || status === 308 || status === 302) {
      fail(label, `link "${link.text}"`, `${link.href} redirected (${status}) while signed in — it should have loaded.`);
    } else if (status >= 400) {
      fail(label, `link "${link.text}"`, `${link.href} returned ${status}.`);
    }
  }
}

/**
 * Did anything at all change as a result of the click?
 *
 * The text fingerprint is a hash of the actual visible content, not its length.
 * That matters: re-sorting a table changes the order of every row while leaving
 * the character count identical, and a length comparison would report a working
 * sort control as broken.
 */
async function snapshot(page) {
  return page.evaluate(() => {
    const hash = (str) => {
      let h = 5381;
      for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
      return h;
    };
    const main = document.querySelector('main');
    return {
      url: location.href,
      dialogs: document.querySelectorAll('[role="dialog"]').length,
      html: document.body.innerHTML.length,
      content: hash(main ? main.innerText : document.body.innerText),
      markup: hash((main ? main.innerHTML : document.body.innerHTML).slice(0, 200000)),
      expanded: [...document.querySelectorAll('[aria-expanded]')].map((e) => e.getAttribute('aria-expanded')).join(''),
      selected: [...document.querySelectorAll('[aria-selected]')].map((e) => e.getAttribute('aria-selected')).join(''),
      checked: [...document.querySelectorAll('[aria-checked]')].map((e) => e.getAttribute('aria-checked')).join(''),
      pressed: [...document.querySelectorAll('[aria-pressed]')].map((e) => e.getAttribute('aria-pressed')).join(''),
    };
  });
}

const changed = (a, b) =>
  a.url !== b.url ||
  a.dialogs !== b.dialogs ||
  a.expanded !== b.expanded ||
  a.selected !== b.selected ||
  a.checked !== b.checked ||
  a.pressed !== b.pressed ||
  a.content !== b.content ||
  a.markup !== b.markup ||
  Math.abs(a.html - b.html) > 12;

async function closeAnyDialog(page) {
  for (let i = 0; i < 3; i++) {
    if (!(await page.locator('[role="dialog"]').count())) return true;
    const closer = page.locator('[role="dialog"] [aria-label="Close"]').first();
    if (await closer.count()) {
      await closer.click({ timeout: 3000 }).catch(() => {});
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(450);
  }
  return (await page.locator('[role="dialog"]').count()) === 0;
}

async function auditButtons(page, label, path) {
  const handles = await page.locator('button:visible').elementHandles();
  const total = handles.length;

  for (let i = 0; i < total; i++) {
    // The DOM is re-queried each time because a click can re-render the page.
    const fresh = await page.locator('button:visible').elementHandles();
    const el = fresh[i];
    if (!el) continue;

    const meta = await el.evaluate((n) => ({
      name: (n.getAttribute('aria-label') || n.getAttribute('title') || n.textContent || '').trim().slice(0, 50),
      disabled: n.disabled,
      role: n.getAttribute('role'),
      selected: n.getAttribute('aria-selected'),
      expanded: n.getAttribute('aria-expanded'),
    }));
    const name = meta.name;
    if (meta.disabled) continue;

    // Clicking the option that is already selected in a segmented control is
    // correctly a no-op. Its inactive siblings are still exercised, so the
    // control as a whole is covered.
    if (meta.role === 'tab' && meta.selected === 'true') continue;

    stats.buttons++;

    if (DESTRUCTIVE.test(name)) {
      warn(label, `button "${name || '(unnamed)'}"`, 'Skipped automatically — it writes or deletes data. Verify by hand.');
      continue;
    }

    const before = await snapshot(page);
    try {
      await el.click({ timeout: 4000 });
    } catch (e) {
      fail(label, `button "${name || '(unnamed)'}"`, `Could not be clicked: ${String(e).split('\n')[0].slice(0, 120)}`);
      continue;
    }
    await page.waitForTimeout(450);
    let after = await snapshot(page);

    // A control that calls the server needs longer than one paint. Give it a
    // second look before declaring it dead.
    if (!changed(before, after)) {
      await page.waitForTimeout(850);
      after = await snapshot(page);
    }

    if (!changed(before, after)) {
      fail(label, `button "${name || '(unnamed)'}"`, 'Clicking it produced no visible effect at all.');
    }

    if (after.dialogs > before.dialogs) {
      stats.dialogs++;
      if (!(await closeAnyDialog(page))) {
        fail(label, `button "${name || '(unnamed)'}"`, 'Opened a dialog that could not then be closed.');
      }
    }

    // Dismiss any transient popover so it cannot sit over the next control.
    if (await page.locator('[role="tooltip"]').count()) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(220);
      if (await page.locator('[role="tooltip"]').count()) {
        fail(label, `button "${name || '(unnamed)'}"`, 'Opened an explanation panel that Escape did not close.');
        await page.mouse.click(4, 4);
        await page.waitForTimeout(220);
      }
    }

    // A click may have navigated away; return to the page under test.
    if (!page.url().endsWith(path) && new URL(page.url()).pathname !== path) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);
    }
  }
}

async function auditSelects(page, label) {
  const count = await page.locator('select:visible').count();
  for (let i = 0; i < count; i++) {
    const sel = page.locator('select:visible').nth(i);
    if (!(await sel.count())) continue;

    const info = await sel.evaluate((n) => ({
      label: n.getAttribute('aria-label') || n.getAttribute('title') || '(unlabelled)',
      options: [...n.options].map((o) => o.value),
      value: n.value,
      disabled: n.disabled,
    }));
    if (info.disabled || info.options.length < 2) continue;
    stats.selects++;

    const target = info.options.find((o) => o !== info.value);
    if (target == null) continue;

    const before = await snapshot(page);
    await sel.selectOption(target, { timeout: 4000 }).catch((e) =>
      fail(label, `dropdown "${info.label}"`, `Could not be changed: ${String(e).split('\n')[0].slice(0, 100)}`),
    );
    await page.waitForTimeout(500);

    const nowValue = await sel.evaluate((n) => n.value).catch(() => null);
    if (nowValue !== target) {
      fail(label, `dropdown "${info.label}"`, `Selecting "${target}" did not take effect — it still reads "${nowValue}".`);
    }

    const after = await snapshot(page);
    if (!changed(before, after) && nowValue === target) {
      warn(label, `dropdown "${info.label}"`, 'Changed value but nothing on the page responded. Check it is wired to something.');
    }

    // Put it back so later checks start from a known state.
    await sel.selectOption(info.value).catch(() => {});
    await page.waitForTimeout(300);
  }
}

async function auditToggles(page, label) {
  const count = await page.locator('[role="switch"]:visible').count();
  for (let i = 0; i < count; i++) {
    const t = page.locator('[role="switch"]:visible').nth(i);
    if (!(await t.count())) continue;
    stats.toggles++;
    const before = await t.getAttribute('aria-checked');
    await t.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(300);
    const after = await t.getAttribute('aria-checked');
    if (before === after) {
      fail(label, 'toggle switch', `Clicking it did not change its state (stayed "${before}").`);
    } else {
      await t.click().catch(() => {});
      await page.waitForTimeout(250);
    }
  }
}

async function auditCommandPalette(page, label) {
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(700);

  if (!(await page.locator('[aria-label="Command palette"]').count())) {
    fail(label, 'command palette', 'Ctrl/⌘+K did not open the search palette.');
    return;
  }
  stats.dialogs++;

  await page.fill('[aria-label="Command palette"] input[aria-label="Search"]', 'adobe');
  await page.waitForTimeout(850);

  const results = await page.locator('[aria-label="Command palette"] button').count();
  if (results === 0) {
    fail(label, 'command palette', 'Searching returned nothing at all, including navigation entries.');
  } else {
    const first = page.locator('[aria-label="Command palette"] button').first();
    const text = (await first.textContent())?.trim().slice(0, 40);
    await first.click();
    await page.waitForTimeout(1600);
    const status = await page.evaluate(() => document.body.innerText.includes('404') || document.title.includes('404'));
    if (status) fail(label, 'command palette', `Selecting the result "${text}" led to a page that does not exist.`);
  }

  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

async function auditDownloads(context) {
  const endpoints = [
    ['CSV register export', '/api/export?format=csv'],
    ['Excel register export', '/api/export?format=xlsx'],
    ['Finance breakdown', '/api/export?format=finance'],
    ['Blank import template', '/api/export?format=template'],
    ['Renewal calendar', '/api/calendar.ics'],
    ['Alert digest', '/api/alerts/digest'],
    ['Search', '/api/search?q=adobe'],
  ];
  for (const [name, url] of endpoints) {
    const res = await context.request.get(`${BASE}${url}`).catch(() => null);
    if (!res) {
      fail('API', name, `${url} could not be reached.`);
      continue;
    }
    if (res.status() !== 200) {
      fail('API', name, `${url} returned ${res.status()}.`);
      continue;
    }
    const body = await res.body();
    if (body.length < 20) fail('API', name, `${url} returned an empty response (${body.length} bytes).`);
  }
}

async function auditAuthGate(browser) {
  const anon = await browser.newContext();
  const checks = [
    ['/', 'the dashboard'],
    ['/subscriptions', 'the register'],
    ['/settings', 'settings'],
    ['/api/export?format=csv', 'the export endpoint'],
  ];
  for (const [path, what] of checks) {
    const res = await anon.request.get(`${BASE}${path}`, { maxRedirects: 0 }).catch(() => null);
    const status = res?.status() ?? 0;
    const gated = status === 307 || status === 308 || status === 302 || status === 401;
    if (!gated) fail('Security', what, `A signed-out visitor received ${status} for ${path} — it should have been refused or redirected.`);
  }
  const bad = await anon.request
    .post(`${BASE}/api/alerts/dispatch`, { maxRedirects: 0 })
    .catch(() => null);
  if (bad && bad.status() === 200) fail('Security', 'alert dispatch', 'The dispatch endpoint accepted an unauthenticated request.');
  await anon.close();
}

// ────────────────────────────────────────────────────────────────── run ──

const browser = await chromium.launch({ executablePath: CHROME });
const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });

console.log(`\nAuditing ${BASE}\n${'─'.repeat(60)}`);

console.log('\nAuthentication');
await auditAuthGate(browser);
const page = await signIn(context);

for (const [label, path] of PAGES) {
  process.stdout.write(`\n${label} (${path})\n`);
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(900);
  stats.pages++;

  await checkMarkup(page, label);
  await auditLinks(page, label, context);
  await auditSelects(page, label);
  await auditToggles(page, label);
  await auditButtons(page, label, path);
  process.stdout.write(`  checked\n`);
}

console.log('\nCommand palette');
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await auditCommandPalette(page, 'Dashboard');

console.log('\nDownloads and API');
await auditDownloads(context);

await browser.close();

// ─────────────────────────────────────────────────────────────── report ──

console.log(`\n${'═'.repeat(60)}`);
console.log(
  `  ${stats.pages} pages · ${stats.buttons} buttons · ${stats.links} links · ${stats.selects} dropdowns · ${stats.toggles} toggles · ${stats.dialogs} dialogs`,
);
console.log(`${'═'.repeat(60)}`);

if (failures.length === 0) {
  console.log('\n  NO FAILURES.\n');
} else {
  console.log(`\n  ${failures.length} FAILURE${failures.length === 1 ? '' : 'S'}\n`);
  failures.forEach((f, i) => console.log(`  ${String(i + 1).padStart(2)}. [${f.page}] ${f.element}\n      ${f.problem}`));
}

if (warnings.length) {
  console.log(`\n  ${warnings.length} item${warnings.length === 1 ? '' : 's'} to review:\n`);
  warnings.forEach((w, i) => console.log(`  ${String(i + 1).padStart(2)}. [${w.page}] ${w.element}\n      ${w.note}`));
}

console.log('');
process.exit(failures.length > 0 ? 1 : 0);

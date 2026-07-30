# Quality assurance

Three automated suites, run against PostgreSQL with authentication switched on. They are checked into the repository and are meant to be run before every release, not once.

```bash
npm run verify          # 64 checks — the arithmetic
npm run verify:writes   # 49 checks — every create, update and delete path
npm run audit           # every button, link and dropdown on every page
npm run audit:forms     # 46 checks — the data-entry form, driven end to end
```

`audit` and `audit:forms` need the application running (`npm run build && npm start`).

## Current state

| Suite | Coverage | Result |
|---|---|---|
| Calculations | Every billing model, all three split methods, currency conversion, each statistic against a hand-worked value, full reconciliation against live data | 64 / 64 |
| Write paths | Create, update, delete and duplicate for subscriptions, departments and cards; card top-ups; cascade deletes; credential encryption and tamper rejection; import de-duplication; audit logging | 49 / 49 |
| Interface | 8 pages · 239 buttons · 89 links · 6 dropdowns · 64 dialogs | 0 failures |
| Data entry | Sign-in, every billing frequency against its arithmetic, currency conversion, per-seat pricing, all three split methods, save → verify → delete, search and filters | 46 / 46 |

Lint clean. Production build clean. No console errors or uncaught exceptions on any page.

## What the interface audit actually does

It signs in as a real user, then on every page finds every interactive element and exercises it, checking that something observably changed — a navigation, a dialog, a state attribute, or the rendered content itself. It follows every internal link to confirm it resolves rather than 404s, opens and closes every dialog to confirm it can be dismissed, requests every download endpoint to confirm it returns a file, and confirms that a signed-out visitor is refused on every protected route.

It deliberately does not click anything destructive. Those paths are covered by `verify:writes` instead, which drives them directly and reads the database back. Everything skipped is listed at the end of the run, so the coverage gap is visible rather than assumed.

## Defects found and fixed

These were found by the suites above, not by reading the code.

**Buttons wrapped in links did not reliably work.** Seven places rendered `<a><button>…</button></a>`, which is invalid HTML. Browsers recover from it inconsistently and in some cases the inner button swallows the click, so the link never navigates. This is the most likely cause of the "some buttons do not work" report. All seven now use a single `LinkButton` component where the anchor is the interactive element, so keyboard, middle-click and open-in-new-tab all behave correctly.

**Search results led to a page that did not exist.** Selecting a subscription in the ⌘K palette navigated to `/subscriptions/<id>`, a route that was never built. It now opens the register with that row's detail panel already open — one page, no URL that can 404 when a subscription is deleted.

**Form labels were not bound to their inputs.** Every label was correct visually but not associated in the accessibility tree, so a screen reader announced "edit text" with no indication of what the field was. Worse, fields whose input is wrapped — an amount with a currency symbol, a URL with an icon, a password with a reveal button — could not be bound by the obvious fix either. Both cases are now handled automatically.

**The add-subscription form previewed the wrong figure for foreign currencies.** It calculated its live "works out at £x/month" preview without the exchange rates, so a $100/month subscription previewed as £100 and then appeared in the register as £78. The form now uses exactly the same rates as every report.

**Help buttons were too small to click.** The "how this is calculated" targets were 16 px, below the WCAG 2.2 minimum and genuinely difficult to hit. They are now 24 px.

**Two explanation panels could be open at once.** Opening a second left the first on screen, where its floating panel could sit over neighbouring controls and swallow their clicks. Only one is open at a time now, and they dismiss on scroll and on Escape.

**Departments with no subscriptions were invisible.** They were omitted from the Departments page entirely, which meant a newly added department could not be seen, edited or deleted until something was attached to it. All departments now appear, with zero cost shown plainly.

**Card balances were compared against the wrong currency.** Amounts due were converted to GBP while the card balance was left in its own currency, so a shortfall on a non-GBP card would have been calculated from two different units.

**A malformed credential could be silently normalised.** Node's base64 decoder discards characters it does not recognise, so a corrupted stored password could decode to valid-looking bytes. Payloads are now validated strictly and rejected outright.

**Server and browser disagreed on number formatting.** Node rendered "£2.0k" where Chrome rendered "£2K", which produced a React hydration mismatch on every chart axis. Compact figures are now formatted by the application rather than by the platform.

**A deployment would have gone green with no database tables.** There was no `prisma/migrations` directory, so `prisma migrate deploy` printed "No migration found" and exited successfully. An initial migration is now committed and has been verified by applying it to an empty PostgreSQL database.

## Known limits

The audit tests what a browser can observe. It does not replace someone using the application for a week and noticing that a figure looks wrong.

It runs against seeded demonstration data. Every price, rate and balance in that data is invented; the arithmetic is verified, the inputs are not.

Destructive actions are exercised through the data layer rather than by clicking, so the confirmation dialogs are checked for opening and dismissing but the final "yes, delete it" click is not automated on every row.

There is no load testing. For a departmental register of a few hundred subscriptions this has not been necessary, and the queries are simple, but that is a judgement rather than a measurement.

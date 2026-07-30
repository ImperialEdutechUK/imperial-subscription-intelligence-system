# Subscription Intelligence — Imperial Edutech

A web application for tracking the software subscriptions a department pays for, splitting their cost across the departments that actually use them, and warning Finance to fund a card *before* a renewal fails rather than after.

Built for the Course Development department, with Finance as a read-only audience.

---

## What problem it solves

Three things were happening at once. Course Development was buying a growing number of subscriptions across AI tools, stock media libraries, authoring software and hosting. Several of those were used by other departments, so Finance had no reliable view of who was actually consuming the spend. And prepaid cards were not being topped up before renewal dates, which meant chasing people by hand every month.

The application addresses each directly. Every subscription is normalised to a comparable monthly and annual figure regardless of how it is billed. Shared subscriptions carry an explicit split, so departmental totals reconcile to the portfolio total exactly. And the renewal engine works out which cards will not cover what is coming, how much they are short by, and the date they need funding.

## What it does not do

It does not fetch live exchange rates, live vendor pricing, or live card balances. Every figure in it comes from what someone has entered. That is deliberate — a number that changes on its own cannot be reconciled against an invoice — but it means the output is only as current as the input. The application is explicit about this wherever it matters: figures derived from usage or credit top-ups are labelled as estimates, currencies without a recorded rate are flagged rather than silently converted, and statistics that are unreliable at small sample sizes say so next to the number.

---

## Repository layout

Two independently deployed services. `ARCHITECTURE.md` explains how they fit
together and why the browser never calls the API directly.

```
backend/    API service — database, domain logic, every write path.  → Railway
frontend/   Web interface — pages, forms, dashboards. No database.   → Vercel
```

The split matters for one practical reason: `DATABASE_URL` exists only in
`backend/`. Nothing in `frontend/` can reach the database, by construction.

---

## Running it locally

Requires Node.js 20.9 or later, and **two terminals** — the frontend is useless
without the API service behind it.

```bash
# A PostgreSQL database. Docker is the least effort:
docker run --name imperial-db -e POSTGRES_PASSWORD=devpass -p 5432:5432 -d postgres:16
```

**Terminal 1 — the API service**

```bash
cd backend
npm install
cp .env.example .env          # then set DATABASE_URL and APP_SECRET — see below
npx prisma migrate deploy     # creates the tables
npm run seed:setup            # your departments, currencies and first admin
npm run seed:demo             # optional: ~30 illustrative subscriptions to look at
npm run dev                   # http://localhost:3001
```

**Terminal 2 — the interface**

```bash
cd frontend
npm install
cp .env.example .env          # BACKEND_URL=http://localhost:3001, and the SAME APP_SECRET
npm run dev                   # http://localhost:3000
```

`APP_SECRET` must be byte-for-byte identical in both `.env` files. The backend
signs session tokens with it and the frontend verifies them; a mismatch makes
sign-in appear to succeed and then every page report "not signed in".

`npm run seed:setup` reads **`backend/src/lib/organisation.ts`** — the one file to
edit for departments, brand colour, exchange rates and alert thresholds. It is
safe to run repeatedly and never touches subscription data.

Generate a real `APP_SECRET` before storing anything you care about:

```bash
openssl rand -base64 48
```

`AUTH_DISABLED=true` bypasses the login screen entirely. That is convenient on a laptop and unacceptable on anything reachable over a network — the Settings page displays a prominent warning while it is set.

### Accounts

`npm run seed:setup` creates a single administrator from `backend/src/lib/organisation.ts`.
Change the email and password there before running it.

`npm run seed:demo` additionally creates three demonstration accounts, all sharing the
password `ImperialDemo2026!`:

| Email | Role | What they can do |
|---|---|---|
| `admin@imperialedutech.co.uk` | Administrator | Everything, including revealing stored passwords and changing settings |
| `editor@imperialedutech.co.uk` | Editor | Add and edit subscriptions, cards and departments |
| `finance@imperialedutech.co.uk` | Viewer | Read-only, no access to stored credentials. Intended for Finance |

Change or delete these before anyone else can reach the application. The password is in source control.

**The seeded data is illustrative.** Every price, exchange rate, balance and renewal date is invented. It is realistic enough to demonstrate the features and it must not reach a budget paper. Replace it with your own invoiced figures.

---

## How the numbers are worked out

Everything on every dashboard flows through two modules, so there is one definition of what a subscription costs and one definition of who pays for it.

**`backend/src/lib/money.ts` — normalisation.** A weekly, monthly, quarterly, six-monthly or annual price is converted to a monthly equivalent by annualising and dividing by twelve. Per-seat pricing is multiplied by the seat count first. Non-GBP amounts are converted at the rate recorded in Settings; a currency with no recorded rate is treated as 1:1 and flagged, rather than dropped from the totals.

Usage-based and credit top-up subscriptions have no contracted price to quote, so their monthly figure is the trailing average of whatever usage has actually been recorded. Where there is no history the estimate falls back to your own forecast and is labelled accordingly. These are the subscriptions marked with a `~` in the register and counted in the "estimated" portion of the headline figure.

Two annual figures are produced on purpose, because they answer different questions. The **annual run-rate** is the recurring commitment — what you spend per year if nothing changes — and excludes one-off purchases. **Twelve-month cash** includes them. Finance generally wants both.

**`backend/src/lib/allocation.ts` — departmental split.** Three methods are supported per subscription: the owning department pays the whole cost, the cost is split by an agreed percentage, or it is split in proportion to seats. Percentages that do not sum to 100 are scaled proportionally so departmental totals still reconcile, and the discrepancy is surfaced rather than hidden. Rounding residue is pushed onto the largest share, so the parts always add back to the whole exactly.

**`backend/src/lib/stats.ts` — statistics.** Every measure returns the formula used, the sample size it rests on, and a reliability verdict. This matters here: a portfolio of thirty subscriptions is a small dataset, and several routine measures — outlier detection in particular — are unstable below about a dozen data points. The interface prints that assessment next to the number instead of implying more confidence than the data supports.

### Verifying the arithmetic

The logic suites belong to the API service; the browser suites drive the real
interface and need both services running.

```bash
cd backend  && npm run verify          # 64 checks on the arithmetic
cd backend  && npm run verify:writes   # 49 checks on every create, update and delete path
cd frontend && npm run audit:all       # every button, link, dropdown and write path in the running app
```

`verify` runs 64 checks covering every billing model, all three allocation methods, each statistical function against hand-computed values, and a reconciliation pass over the live database confirming that departmental, category and billing-model totals all add back to the portfolio total. Each expected value is worked out by hand in a comment beside the assertion, so the file doubles as an audit trail.

---

## Getting data in

The register is the only place data is entered, and there are four ways to do it.

The **quick add form** requires only a name; everything else can follow later. As you type an amount and choose a billing frequency it shows the resulting monthly and annual figures live, with a "how this is worked out" explanation, so there is no gap between what you enter and what Finance will see. Pasting a URL fills in the name if it is blank.

**Paste from a spreadsheet** is on the Import page and is the fastest route if you already keep this in Excel. Copy a block of rows, paste, and the application detects the delimiter, guesses which column is which, and shows a validated preview before anything is written. Billing terms are interpreted leniently — "Yearly", "pa", "12 months" and "per year" all resolve to annual — as are dates in British, ISO and written formats, and amounts carrying currency symbols, thousands separators or a trailing "/mo".

**CSV upload** runs through the same pipeline. A blank template with the correct headings is downloadable from the same page.

**Inline editing** in the register handles the day-to-day. When you change a price the previous value is written to the price history automatically — that history is what makes the twelve-month trend chart meaningful, and it is the thing most likely to be forgotten if it has to be done by hand.

## Getting data out

| Export | Format | Intended for |
|---|---|---|
| Full register | CSV | Anything that needs the raw list |
| Full register | Excel | Reading and filtering by hand |
| Departmental breakdown | Excel, three sheets | Finance — summary, per department, and a per-subscription split showing every department's share |
| Renewal calendar | `.ics` | Outlook, including separate "top up the card by this date" events |

Passwords are never exported. The register export records only whether one is stored.

---

## Reminders

The renewal engine produces one digest consumed three ways: as JSON at `/api/alerts/digest`, as an Adaptive Card pushed into Microsoft Teams via `/api/alerts/dispatch`, and as plain text you can copy from the Renewals page and paste into a chat yourself. All three come from the same source, so they cannot drift apart.

Microsoft retired the Office 365 "Incoming Webhook" connector for Teams channels, so a connector URL will not work. The supported route is a Power Automate flow using the Teams webhook trigger, which does not require a premium licence. **`POWER-AUTOMATE.md` has the full setup**, including which parts could not be verified against current Microsoft documentation.

The application pushes to the flow rather than the flow pulling from the application, because the Power Automate HTTP action needed to pull sits behind a premium licence and the webhook trigger does not.

To run the reminder on a schedule, POST to the dispatch endpoint from anything that can issue an HTTP request:

```bash
curl -X POST "https://your-host/api/alerts/dispatch?key=$ALERTS_API_KEY"
```

By default it stays silent when nothing needs attention — a reminder that fires every day regardless of content stops being read within a fortnight. Add `&force=1` to send anyway, which is what the "Send a test message" button in Settings does.

---

## Design system

The interface is driven by three numbers: a brand hue, saturation and lightness. Change the brand colour in Settings and the entire application re-tunes — colour ramps, neutrals, focus rings, chart series and dark mode. Nothing is hard-coded to a specific red. Settings reports the measured WCAG contrast of whatever colour you paste and states plainly what it is and is not adequate for.

The default is `#DA291C`, which measures 4.87:1 against white and therefore meets WCAG 2.1 AA for normal-size text. **This was not taken from the Imperial Edutech website** — the site's stylesheets could not be reached from the build environment, so it is a deep institutional red chosen to sit in the range described. Paste the real brand hex into Settings and everything follows from it.

The chart palette was computed rather than chosen. Eight categorical colours were generated and machine-verified against the lightness band, a chroma floor, adjacent-pair separation under protanopia, deuteranopia and tritanopia, normal-vision separation, and a 3:1 contrast floor against the surface. Dark mode has its own set, derived against the dark surface and validated separately rather than being a lightened copy. Series colours are assigned in fixed order and never reassigned by rank, so filtering a chart never repaints the survivors.

Layout is a twelve-column bento grid with tiles declaring their own footprint, collapsing to eight, four and two columns as the viewport narrows. Density has comfortable and compact modes, both driven by the same five custom properties so every component responds without knowing about the setting.

Every chart carries a table view of the same numbers, a legend whenever more than one series is present, and a caption stating what the figures are and where they came from. Status is never carried by colour alone — every status badge renders an icon and a text label, which matters more than usual here because the brand colour is itself a red and sits close to the danger hue.

---

## Architecture

```
backend/prisma/schema.prisma          Data model (PostgreSQL)
prisma/migrations/            Committed migration — `prisma migrate deploy` needs this
backend/prisma/setup.ts               Applies backend/src/lib/organisation.ts to the database
backend/prisma/seed.ts                Illustrative sample data

src/lib/
  money.ts                    Cost normalisation and currency conversion
  allocation.ts               The three departmental split methods
  stats.ts                    Descriptive statistics with reliability reporting
  crypto.ts                   AES-256-GCM credential storage — read the header comment
  auth.ts                     Sessions, password hashing, role checks
  domain.ts                   Every enum and its human-readable label
  import-parse.ts             Delimiter detection, column guessing, lenient value parsing

src/server/
  portfolio.ts                The single source of truth every page reads from
  observations.ts             Automatic statistical observations, each with its method
  alerts.ts                   Digest, Adaptive Card, plain text
  actions.ts                  Server Actions — every one re-checks authorisation
  settings.ts                 Brand, alert thresholds, exchange rates

src/components/
  ui/                         Design-system primitives
  charts/                     Hand-built SVG charts
  dashboard/ subs/ cards/ …   Feature components

frontend/src/proxy.ts                  Next.js 16 replacement for middleware.ts — optimistic auth routing
scripts/verify-calculations.ts  The arithmetic audit trail
```

Server Actions are reachable by direct POST, not only through the interface, so each one re-checks the caller's role rather than trusting that they reached it through a page they were allowed to see. `frontend/src/proxy.ts` performs an optimistic cookie check for routing only and deliberately does not verify the token; a forged cookie gets past it and then achieves nothing.

Built on Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4 and Prisma 7. Charts are hand-written SVG rather than a charting library, which keeps mark geometry, spacing and colour assignment under direct control.

## Documentation

| File | What it answers |
|---|---|
| **`DEVELOPER-GUIDE.md`** | Where the front end ends and the back end begins, and how to change anything |
| **`HOSTING.md`** | Vercel and Railway — whether you need both, and step-by-step deployment |
| **`QA.md`** | What is tested, how to run it, and every defect found and fixed |
| **`SECURITY.md`** | What the credential store does and does not protect against |
| **`POWER-AUTOMATE.md`** | Getting the card top-up reminder into Microsoft Teams |
| **`backend/src/lib/organisation.ts`** | Departments, brand colour, currencies — the one file to edit |

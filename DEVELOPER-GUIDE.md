# Developer guide

Written for the developer taking this on. It covers what the code is, where the boundary between front end and back end sits, how to change the things that will need changing, and how to prove nothing is broken before shipping.

If you only read one section, read **"Changing things"** — most requests will land there and need no knowledge of the rest.

---

## What this is

One Next.js application. It is full-stack: the pages and the API live in the same project and deploy as one unit. There is no separate backend service to run, and adding one would create work rather than save it.

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS v4 · Prisma 7 · PostgreSQL.

---

## Where the boundary is

The split is by directory, and it is strict. Nothing in the front end talks to the database; nothing in the back end renders markup.

### Front end — the browser half

```
src/app/**/page.tsx        One file per screen. Fetches data, passes it down. No business logic.
src/app/layout.tsx         The shell: fonts, theme, sidebar.
src/components/ui/         Design-system primitives — Button, Input, Select, Sheet, Modal, Badge.
src/components/charts/     Charts, hand-written as SVG. No charting library.
src/components/<feature>/  One folder per screen: subs, cards, renewals, departments, settings, import.
src/app/globals.css        The design tokens. Every colour, radius and spacing value in the app.
```

A file marked `'use client'` at the top runs in the browser and can use state and event handlers. A file without it renders on the server. The rule that matters: **you cannot pass a function from a server file to a client file.** If you hit `Functions cannot be passed directly to Client Components`, that is what happened — see `src/components/shell/PageActions.tsx` for the pattern that solves it.

### Back end — the server half

```
backend/src/services/portfolio.ts    THE IMPORTANT ONE. Every page reads its data from here.
backend/src/services/actions.ts      Every write. Create, update, delete. Each re-checks permissions.
backend/src/services/observations.ts Generates the written statistical observations.
backend/src/services/alerts.ts       Builds the reminder digest and the Teams card.
backend/src/services/settings.ts     Brand colour, alert thresholds, exchange rates.

backend/src/lib/money.ts           Cost normalisation. Every billing model becomes a monthly figure here.
backend/src/lib/allocation.ts      The three ways cost is split across departments.
backend/src/lib/stats.ts           The statistics, each reporting its own reliability.
backend/src/lib/crypto.ts          Encrypts stored subscription passwords.
backend/src/lib/auth.ts            Sessions, password hashing, role checks.
backend/src/lib/db.ts              The database connection.

src/app/api/**/route.ts    HTTP endpoints: exports, calendar feed, search, reminders.
backend/prisma/schema.prisma       The database structure.
frontend/src/proxy.ts               Sends signed-out visitors to the sign-in page.
```

### The one rule worth enforcing

**`backend/src/services/portfolio.ts` is the only place that decides what a subscription costs and who pays for it.** Every screen, every export and the reminder engine all read from it. If you add a screen, read from `getPortfolio()` rather than querying Prisma directly — otherwise two parts of the application will eventually disagree about the same number, and Finance will be the ones who notice.

---

## Changing things

### The departments, brand colour, currencies and alert thresholds

Edit **`backend/src/lib/organisation.ts`**. That is the only file involved. Then:

```bash
npm run seed:setup
```

Safe to run as often as you like, and safe on live data. It updates departments that exist, adds new ones, and refuses to delete a department that still has subscriptions attached — it tells you which ones to reassign first rather than orphaning their costs.

Departments can also be added, renamed and recoloured from inside the application at **Departments → Add**, with no code change and no deployment. The config file is the starting point; the application is the day-to-day tool. Use whichever suits the moment.

### The list of software categories

`backend/src/lib/domain.ts`, the `CATEGORIES` array and `CATEGORY_META` beside it. Add an entry to both. Categories are stored as plain strings, so adding one is safe; removing one that is in use will leave those subscriptions showing the raw code instead of a label, so reassign them first.

### Billing models, statuses, card types, currencies

Same file, `backend/src/lib/domain.ts`. Each has an array and a matching metadata object with the human-readable label. Adding a billing model also needs a case in `normaliseCost` in `backend/src/lib/money.ts` — that function is a single `switch`, and there is a comment on each branch explaining the arithmetic.

### Colours, spacing, corner radius, dark mode

`src/app/globals.css`. Everything derives from `--brand-h`, `--brand-s` and `--brand-l` at the top. Change those three and the entire interface re-tunes, including dark mode and the charts. Do not add raw colour values in components; use the tokens, or the design system stops being one.

### The wording

All user-facing text is inline in the component that shows it. There is no translation layer. British English throughout; keep it plain and avoid exclamation marks.

---

## Running it locally

You need PostgreSQL. The application is configured for it because that is what it deploys onto, and running a different database locally is how "works on my machine" starts.

```bash
# 1. A database. Docker is the least effort:
docker run --name imperial-db -e POSTGRES_PASSWORD=devpass -p 5432:5432 -d postgres:16

# 2. Configure
cp .env.example .env
#    set DATABASE_URL="postgresql://postgres:devpass@localhost:5432/postgres?schema=public"
#    set APP_SECRET to the output of: openssl rand -base64 48

# 3. Set up
npm install
npx prisma migrate deploy
npm run seed:setup        # real departments, no sample data
npm run seed:demo         # optional: ~30 illustrative subscriptions to look at

# 4. Run
npm run dev               # http://localhost:3000
```

If you cannot run PostgreSQL locally, a free hosted development database (Railway, Neon, Supabase) works — point `DATABASE_URL` at it. Do not switch the schema to SQLite: the committed migration is PostgreSQL-specific and you would lose migration history.

`AUTH_DISABLED=true` in `.env` skips the sign-in screen while you work. It grants full administrator rights to anyone who can reach the address, so it must be `false` anywhere other than your own machine. The Settings page shows a red banner while it is on.

---

## Proving nothing is broken

Three commands. Run all three before you ship anything.

```bash
npm run verify          # 64 checks on the arithmetic
npm run verify:writes   # 45 checks on every create, update and delete path
npm run audit           # every button, link and dropdown in the running app
```

**`npm run verify`** checks the money and the statistics: every billing model against a hand-worked figure, all three allocation methods, currency conversion, each statistical function against a known value, and a reconciliation pass confirming that departmental, category and billing-model totals all add back to the portfolio total exactly. Every expected value has the arithmetic written out in a comment beside it, so you can check the checker.

**`npm run verify:writes`** covers what the interface audit will not touch: creating and deleting subscriptions, departments and cards; card top-ups against balance corrections; cascade behaviour when a record is deleted; the refusal to delete a department that is still in use; password encryption, rotation and tamper rejection; and re-import de-duplication. It cleans up after itself and is safe against a database with real data in it.

**`npm run audit`** needs the app running (`npm run build && npm start`, then `npm run audit`). It signs in as a real user, then on every page finds every button, link, dropdown and toggle and exercises each one, checking that something observably happened. It follows every internal link to confirm it resolves, opens and closes every dialog, requests every download endpoint, and confirms a signed-out visitor is refused. It skips anything destructive — that is what `verify:writes` is for — and lists what it skipped so the coverage is visible rather than assumed.

The audit is the one to run after any interface change. It is what found the invalid link markup, the search results pointing at a route that did not exist, the form labels that were not bound to their inputs, and the help buttons too small to click reliably.

---

## Things that will bite

**Prisma client not regenerated after a schema change.** Run `npx prisma generate`. On Vercel this is handled by the `postinstall` script — do not remove it, or a deploy will ship a stale client against a new schema.

**`params` and `searchParams` are Promises.** This is Next.js 16, not 14. `const { id } = await params`. Same for `cookies()` and `headers()`. Synchronous access was removed, not merely deprecated.

**`middleware.ts` is now `proxy.ts`.** Same idea, different filename and export name. It runs on Node, not the edge.

**`revalidateTag` takes two arguments now.** One argument fails the type check and therefore the build. This codebase uses `revalidatePath` instead, which is unchanged.

**Server Actions are public endpoints.** Anything in `backend/src/services/actions.ts` can be POSTed to directly, not only reached through the interface. Every one already re-checks the caller's role. Keep that up in anything you add — `assertEditor()` and `assertAdmin()` are there for it.

**Changing `APP_SECRET` destroys stored passwords.** They are encrypted with a key derived from it. There is no recovery. Set it once per environment and leave it.

---

## If you are adding a screen

1. `src/app/<name>/page.tsx` — a server component. `export const dynamic = 'force-dynamic'`. Read from `getPortfolio()`. Convert any `Date` to an ISO string before passing it to a client component.
2. `src/components/<name>/<Name>View.tsx` — `'use client'`. Take plain data as props. Build from `src/components/ui` primitives so it matches everything else.
3. Add it to `NAV` in `src/components/shell/AppShell.tsx`.
4. Writes go in `backend/src/services/actions.ts` with a permission check, and call `revalidatePath('/', 'layout')` afterwards.
5. Run `npm run audit`.

The existing screens are all the same shape. `src/app/departments/page.tsx` with `src/components/departments/DepartmentsView.tsx` is the clearest pair to copy.

---

## Deployment

See **`HOSTING.md`** — it answers the Vercel and Railway question directly, gives both options with costs, and has the step-by-step for the recommended one. **`SECURITY.md`** covers what the credential store does and does not protect against, and is worth reading before the first real password goes in.

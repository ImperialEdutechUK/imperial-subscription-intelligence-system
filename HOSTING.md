# Hosting on Vercel and Railway

This document answers one question: do you need both Vercel and Railway? It supersedes nothing —
`DEPLOYMENT.md` remains the general deployment guide and covers Azure, containers and internal
servers. This document only covers the two platforms you named.

Everything below was checked against the vendors' own documentation in July 2026. Where a fact could
not be confirmed it is marked **Not verified**, with what to look at instead.

---

## Short answer

**No. You do not need two hosting platforms for the application.**

A Next.js App Router application is already full-stack. The pages, the Route Handlers under
`/api/…` and the Server Actions all run on the same deployment. There is no separate backend to
host. Vercel runs server-rendered Next.js pages as [Vercel Functions](https://vercel.com/docs/frameworks/full-stack/nextjs)
in the same project, and Railway runs the whole thing as one ordinary Node process.

What you *do* need in addition to the application is **somewhere to run PostgreSQL**. That is the
only reason a second service enters the picture at all.

So the real choice is:

- **Option A** — Vercel runs the application, Railway runs the database. Two vendors.
- **Option B** — Railway runs both. One vendor.

Both work. Option B is the one I would pick for this application, for reasons set out below, but the
argument is not one-sided and Option A is a perfectly defensible choice.

One thing that is not optional either way: **SQLite cannot be used on either platform.** Vercel
functions run on a "read-only filesystem with writable `/tmp` scratch space up to 500 MB"
([Vercel: Runtimes](https://vercel.com/docs/functions/runtimes)), and `/tmp` does not survive
between deployments or across instances. On Railway a container filesystem resets on redeploy
unless a volume is attached. PostgreSQL is required.

---

## Option A — Vercel for the application, Railway for PostgreSQL

### What it costs

- **Vercel Pro: $20 per user per month**, plus usage above the included allowances
  ([Vercel pricing](https://vercel.com/pricing)). The free Hobby plan is **not available to you** —
  see the paragraph below.
- **Railway: from $5 per month (Hobby) or $20 per month (Pro)**, each including the same value of
  resource usage. Beyond that, RAM is $10/GB/month, CPU $20/vCPU/month, network egress $0.05/GB and
  volume storage $0.15/GB/month ([Railway pricing plans](https://docs.railway.com/reference/pricing/plans)).

Realistically **around $40 per month** for one developer seat on Vercel Pro plus Railway Pro.

**Vercel's Hobby plan cannot be used for this.** Vercel's fair use guidelines state: *"Hobby teams
are restricted to non-commercial personal use only. All commercial usage of the platform requires
either a Pro or Enterprise plan."* The definition includes *"Receiving payment to create, update, or
host the site"* ([Vercel: Fair Use Guidelines](https://vercel.com/docs/limits/fair-use-guidelines)).
A tool built for a company by a paid developer is commercial usage. Budget for Pro.

### What is good about it

- Zero-configuration Next.js. Vercel maintains Next.js; the build needs no framework tuning.
- Preview deployments per branch, HTTPS and a CDN with no work.
- A built-in scheduler ([Vercel Cron](https://vercel.com/docs/cron-jobs)), though see the caveat below.
- Node.js 24.x (default), 22.x and 20.x are supported
  ([Vercel: Supported Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)).
  This application needs 20.9 or later, so the default is fine. Note that Vercel has announced
  Node.js 20 will be disabled in Project Settings on 1 October 2026
  ([changelog](https://vercel.com/changelog/node-js-20-is-being-deprecated)) — do not pin to 20.

### What is awkward about it

Three things, all specific to splitting the application from its database:

1. **The database has to be exposed to the public internet.** Railway's private network only
   connects services inside the same Railway project and environment — *"Services in different
   projects cannot communicate over the private network"* and *"Traffic never leaves Railway's
   infrastructure and is not exposed to the public internet"*
   ([Railway: Private Networking](https://docs.railway.com/networking/private-networking/how-it-works)).
   Vercel is outside Railway, so it must connect through Railway's
   [TCP proxy](https://docs.railway.com/networking/tcp-proxy), which is *"enabled by default"* for
   Postgres and for which you *"will be billed for Network Egress"*
   ([Railway: PostgreSQL](https://docs.railway.com/databases/postgresql)). For a database that holds
   encrypted vendor credentials, that is a consideration worth naming.

2. **Connection management needs deliberate configuration.** See "Connection limits" below.

3. **The scheduler cannot call the reminder endpoint directly.** Vercel Cron issues a `GET`; the
   dispatch endpoint only accepts `POST`. See "Scheduling the reminder".

### Who it suits

Teams already on Vercel who value preview deployments and want the shortest path from a Git push to
a running site, and who are comfortable adding the small amount of configuration in this document.

---

## Option B — Railway for both

### What it costs

- **Railway Pro: $20 per month, including $20 of resource usage**
  ([Railway pricing plans](https://docs.railway.com/reference/pricing/plans)). A small Next.js
  service and a small Postgres instance for a department-sized register will plausibly sit inside
  that allowance, but it is metered, so treat $20 as the floor rather than the ceiling.

Railway's cheaper **Hobby plan is $5 per month**. Railway's published
[Acceptable Use / Fair Use policy](https://railway.com/legal/fair-use) does not mention commercial
use at all, but a Railway employee has stated on Railway's own community forum that *"the hobby plan
is only to be used with hobby workloads, for anything above that the pro plan is needed"*
([Railway Central Station](https://station.railway.com/questions/commercial-usage-using-hobby-plan-7fd8cf69)).
**Not verified** in Railway's formal terms. Budget for Pro, or ask Railway support in writing if the
$15 difference matters.

So roughly **$20 per month**, against roughly $40 for Option A.

### What is good about it

- **The database is never on the public internet.** The application and Postgres live in the same
  Railway project, so the app connects over the private network. Nothing needs a public port.
- **The connection-pooling problem largely disappears.** The application runs as one long-lived Node
  process with one connection pool, rather than as many short-lived function instances each opening
  their own. This is the single biggest technical simplification.
- **Migrations have a first-class place to run.** Railway's pre-deploy command *"execute[s] between
  building and deploying your application, handling tasks like database migrations"* and *"If your
  command fails, it will not be retried and the deployment will not proceed"*
  ([Railway: Pre-deploy command](https://docs.railway.com/deployments/pre-deploy-command)). Railway's
  own Next.js guide gives `npx prisma migrate deploy` as the example
  ([Railway: Full-stack Next.js](https://docs.railway.com/guides/fullstack-nextjs)).
- **One vendor, one bill, one place the data sits, one support relationship.**
- Scheduled backups are built in: daily (kept 6 days), weekly (kept 1 month) or monthly (kept 3
  months) ([Railway: Backups](https://docs.railway.com/volumes/backups)).

### What is awkward about it

- No CDN-backed preview deployments in the way Vercel provides them. For an internal tool used by
  one department and Finance, this matters very little.
- Railway's scheduler runs a container's start command on a schedule rather than making an HTTP
  request, so the reminder needs a small second service. See "Scheduling the reminder".
- Railway's own Next.js guide recommends `output: "standalone"` in `next.config.ts`. That is a build
  size optimisation, not a requirement, and it changes the start command. See step 6.

### Who it suits

An organisation that wants the smallest number of moving parts, keeps a single vendor relationship,
and cares that a database holding encrypted third-party credentials is not reachable from the open
internet.

---

## Where the data physically sits

This is a factor for a UK education company and it is worth deciding deliberately rather than by
default. It is not a reason to avoid either platform; it is a question for whoever owns information
governance.

**Vercel.** Functions run in `iad1` (Washington, D.C., USA) *"for all new projects"* by default.
London is available as `lhr1` and Dublin as `dub1`
([Vercel: Global network and regions](https://vercel.com/docs/regions)). Hobby is limited to a
single region and Pro to five
([Vercel: Configuring regions](https://vercel.com/docs/functions/configuring-functions/region)). If
you take Option A, **set the region to `lhr1` explicitly** — otherwise every request and every
database query runs from Virginia.

**Railway.** Four regions: `us-west2` (California), `us-east4-eqdc4a` (Virginia),
`europe-west4-drams3a` (Amsterdam, Netherlands) and `asia-southeast1-eqsg3a` (Singapore)
([Railway: Deployment regions](https://docs.railway.com/reference/deployment-regions)). **There is
no UK region.** The nearest is Amsterdam. For a UK controller that means a transfer to the
Netherlands.

**Not verified:** whether either vendor's standard data processing agreement, and the transfer
mechanism it relies on, meets Imperial Edutech's own requirements. That is a question for your DPO
or whoever signs off processors, not a technical one. What is verifiable is the geography above.

---

## Recommendation

**Take Option B — Railway for both.**

The reasoning is specific to this application, not a general preference:

- It is an internal register for one department with Finance reading it. Vercel's strongest
  advantages — global edge distribution, high-traffic scaling — are not advantages you will use.
- It stores encrypted subscription credentials. Option B keeps the database off the public internet
  entirely; Option A cannot.
- Option A introduces three configuration problems (serverless connection pooling, the Prisma client
  caching issue, and a scheduler that cannot call the endpoint) that Option B does not have.
- It is roughly half the cost and one bill.

**Take Option A instead if** your developer already works on Vercel daily, you want preview
deployments per branch, or you expect the application to be reached by many people at once. It is
not a wrong answer — it is more configuration for benefits this particular application makes limited
use of.

Both walkthroughs are below. Do the shared steps first.

---

## Shared step 1 — the one-line change to `prisma/schema.prisma`

Line 13 of `prisma/schema.prisma`. Change:

```prisma
datasource db {
  provider = "sqlite"
}
```

to:

```prisma
datasource db {
  provider = "postgresql"
}
```

That is the whole change. **Do not add a `url = env("DATABASE_URL")` line to that block.** Prisma 7
takes the CLI connection URL from `prisma.config.ts` (which already reads `process.env.DATABASE_URL`),
and the application takes it from `src/lib/db.ts`, which picks `@prisma/adapter-pg` automatically for
a URL starting `postgres://` or `postgresql://`. No application code changes.

## Shared step 2 — environment variables

Set all six in whichever platform runs the application. There are no others.

| Variable | Required | What it does |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string. Also selects the driver: a `postgres://` or `postgresql://` prefix makes `src/lib/db.ts` use `@prisma/adapter-pg`. |
| `APP_SECRET` | Yes | Signs session tokens **and** derives the AES-256-GCM key that encrypts stored subscription passwords. Generate with `openssl rand -base64 48`. `src/lib/auth.ts` and `src/lib/crypto.ts` both throw if it is missing or shorter than 16 characters; the guidance in `.env.example` is at least 32. Changing it later makes every previously stored password permanently unreadable. |
| `AUTH_DISABLED` | Yes | Set to `false`. If `true`, `src/proxy.ts` waves every visitor through with full administrator rights, including revealing stored passwords. |
| `ALERTS_API_KEY` | Yes, in practice | Shared secret for `/api/alerts/digest`, `/api/alerts/dispatch` and `/api/calendar.ics`. Must be at least 16 characters or key-based access is refused outright rather than defaulting open. Anyone holding it can read renewal dates, amounts and card labels. |
| `TEAMS_WEBHOOK_URL` | Optional | The Power Automate flow URL for Teams reminders. **Not** an Office 365 incoming webhook connector URL — see `POWER-AUTOMATE.md`. Can also be set in the application at Settings → Reminders, which takes precedence over this value. |
| `APP_URL` | Recommended | Public base URL, e.g. `https://subs.imperialedutech.co.uk`. Used for the "Open the subscription tracker" button on the Teams card. Falls back to the request origin if unset. |

Generate the two secrets now:

```bash
openssl rand -base64 48    # APP_SECRET
openssl rand -base64 24    # ALERTS_API_KEY
```

## Shared step 3 — create the initial migration

**This step is easy to skip and doing so will break the deployment silently.**

There is no `prisma/migrations` directory in this repository. I ran `prisma migrate deploy` against
an empty database to confirm what happens:

```
No migration found in prisma/migrations
No pending migrations to apply.
```

It exits with status 0. The build succeeds, the deployment goes green, and then every page fails at
runtime because no tables exist. Create the migration once, locally, before you deploy:

```bash
# 1. Make the schema.prisma change from shared step 1 first.
# 2. Point DATABASE_URL at the PostgreSQL instance you created (see the walkthroughs below).
#    An inline prefix wins over anything in .env, so you do not need to edit .env.

DATABASE_URL="postgresql://..." npx prisma migrate dev --name init
```

That creates `prisma/migrations/<timestamp>_init/migration.sql` and applies it. **Commit the
`prisma/migrations` directory.** From then on `prisma migrate deploy` has something to apply.

`prisma migrate dev` creates and drops a temporary shadow database on the same server. Railway's
default Postgres user has permission to do that; if you hit a permissions error, set
`shadowDatabaseUrl` in `prisma.config.ts` or use the alternative below.

Alternative, if you would rather not keep migration history: run `DATABASE_URL="postgresql://..."
npx prisma db push` once. It creates the tables directly. The cost is that future schema changes
have no migration trail, and you must not then put `prisma migrate deploy` in a build step.

---

## Walkthrough — Option B (recommended): Railway for both

### 1. Push the repository to GitHub

Railway deploys from a Git repository. There is currently no Git remote configured on this
repository; the branch is `main`. `.gitignore` already excludes `.env*`, so no secrets travel with
the push. Confirm that before pushing.

### 2. Set your deployment region before creating anything

Railway deploys to your preferred region, *"which you can change in your Account Settings"*
([Railway: Deployment regions](https://docs.railway.com/reference/deployment-regions)). Set it to
**EU West Metal — Amsterdam (`europe-west4-drams3a`)** unless information governance has told you
otherwise. Do this first; moving a database afterwards is more work than setting it now.

### 3. Create the project and the PostgreSQL service

In a new Railway project, add Postgres. Railway's docs describe three routes: *"through the
`ctrl / cmd + k` menu, the `+ New` button on the Project Canvas, or via the template marketplace"*
([Railway: PostgreSQL](https://docs.railway.com/databases/postgresql)). The full-stack guide phrases
it as *"click **+ New**, then **Database**, then **PostgreSQL**"*
([Railway: Full-stack Next.js](https://docs.railway.com/guides/fullstack-nextjs)).

The service exposes `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` and `DATABASE_URL`.

### 4. Get the connection string for your local machine

You need it once, for shared step 3 and for the first-run setup. Because your laptop is outside
Railway, use the **public** connection string, not the `.railway.internal` one. Railway's TCP proxy
is *"enabled by default"* for Postgres.

Copy the public URL from the Postgres service's variables in the Railway dashboard. Use it exactly
as Railway gives it to you — **do not append `?sslmode=require` by hand** the way the generic
example in `DEPLOYMENT.md` shows. See "Things that will go wrong".

Now go back and complete **shared step 3** using that URL.

### 5. Deploy the application service

Add a second service in the same project, from your GitHub repository.

Railway's Node provider builds with no configuration and runs the `start` script from
`package.json`, which is `next start`. `next start` listens on `$PORT`, which Railway sets.

### 6. Optional: standalone output

Railway's guide sets `output: "standalone"` in `next.config.ts` because it *"creates a minimal
production build that does not require `node_modules` at runtime"*. If you enable it, be aware the
start command changes — Next.js produces `.next/standalone/server.js`, which *"can be used instead
of `next start`"*, and *"does not copy the `public` or `.next/static` folders by default"*, so those
must be copied manually:

```bash
cp -r public .next/standalone/ && cp -r .next/static .next/standalone/.next/
node .next/standalone/server.js
```

**Recommendation: skip this for now.** Deploy with the plain `npm start` path first, confirm it
works, and treat standalone as a later optimisation if build size becomes a problem.

### 7. Set the environment variables on the application service

For `DATABASE_URL`, do not paste a string. Use a Railway reference variable so it stays in sync and
resolves to the **private** address: *"Click **Add Reference Variable** and select `DATABASE_URL`
from the Postgres service"* ([Railway: Full-stack Next.js](https://docs.railway.com/guides/fullstack-nextjs)).
This is the point of Option B — the database is reached over the private network and is never
exposed publicly.

Then set the rest by hand:

```
APP_SECRET=<the value from openssl rand -base64 48>
AUTH_DISABLED=false
ALERTS_API_KEY=<the value from openssl rand -base64 24>
TEAMS_WEBHOOK_URL=<your Power Automate flow URL, or leave empty for now>
APP_URL=https://<your public domain>
```

### 8. Set the pre-deploy command

In the application service's settings, set the pre-deploy command to:

```bash
npx prisma migrate deploy
```

This runs between build and deploy, has access to environment variables and the private network,
and blocks the deployment if it fails. It also runs *"in a separate container from your
application"* with no volumes mounted, which is fine for a migration.

**Not verified:** the exact label of this field in the current Railway dashboard. The documentation
describes the setting and shows a screenshot but does not name the field in text. Look for it in the
service's settings; if you cannot find it, run `npx prisma migrate deploy` manually against the
public URL after each schema change instead.

### 9. Generate a public domain and deploy

Railway will provide a domain for the application service. Deploy.

### 10. First-time setup

`npm run seed:setup` runs `tsx prisma/setup.ts`, which applies `src/config/organisation.ts` to the
database: the nine departments, the exchange rates, the alert thresholds, and the first
administrator account. It is safe to run more than once — it updates departments that exist, adds
new ones, never deletes a department that has subscriptions attached, and never touches subscription
data. It creates the administrator **only if no user accounts exist at all**.

Edit `src/config/organisation.ts` before you run it. At minimum change `FIRST_ADMIN.email` and
`FIRST_ADMIN.initialPassword` — the current value is `ChangeThisOnFirstLogin!` and it is in your Git
history.

Run it from your own machine against the public database URL:

```bash
npx prisma generate
DATABASE_URL="<the public PostgreSQL URL>" npm run seed:setup
```

`tsx` is a devDependency, so this works locally where `npm install` has run.

**Do not run `npm run seed:demo`.** That is the illustrative sample data — every price, rate,
balance and renewal date in it is invented, and it also creates three accounts sharing the password
`ImperialDemo2026!`, which is in source control.

### 11. Turn on backups

In the Postgres service's Backups tab, add a schedule. **Daily** keeps backups for 6 days; weekly
keeps them for a month; monthly for three months
([Railway: Backups](https://docs.railway.com/volumes/backups)). You can select more than one.

Note the caveat in Railway's docs: *"Restoring a backup will remove any newer backups you may have
created after the backup you are restoring."*

Test a restore before you need one.

### 12. Sign in and finish

- Sign in as the administrator and change the password.
- Give Finance a Viewer account rather than sharing yours.
- Set your real exchange rates at Settings → Exchange rates.
- Paste the real Imperial Edutech brand hex at Settings → Brand. The current `#DA291C` was chosen to
  sit in the right range, not sampled from the website.
- Check that Settings does **not** show the red "Authentication is switched off" warning. If it
  does, `AUTH_DISABLED` is still `true`.

---

## Walkthrough — Option A: Vercel for the application, Railway for PostgreSQL

Do shared steps 1 and 2, and Railway steps 2, 3 and 4 above to create the database. Then:

### 1. Create the Vercel project

Import the GitHub repository. Vercel detects Next.js automatically and uses the `build` script from
`package.json`.

### 2. Set the function region to London

Create `vercel.json` in the repository root:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["lhr1"]
}
```

Or set it in the dashboard under Settings → Functions → Function Regions. Without this, functions run
in Washington, D.C. and every database query crosses the Atlantic — both a latency problem and a data
governance one.

### 3. Fix the Prisma client caching issue — do this before the first deploy

Vercel caches dependencies between builds, which means `postinstall` does not re-run and the Prisma
client is not regenerated. Prisma's own error text for this is: *"Prisma has detected that this
project was built on Vercel, which caches dependencies. This leads to an outdated Prisma Client
because Prisma's auto-generation isn't triggered."*
([Prisma: Vercel caching issue](https://www.prisma.io/docs/orm/more/help-and-troubleshooting/vercel-caching-issue)).

The durable fix is a `postinstall` script in `package.json`:

```json
{
  "scripts": {
    "postinstall": "prisma generate"
  }
}
```

This repository does **not** currently have one. Add it.

Prisma's Vercel deployment guide additionally recommends running the migration in the build:

```json
{
  "scripts": {
    "vercel-build": "prisma generate && prisma migrate deploy && next build"
  }
}
```

([Prisma: Deploy to Vercel](https://www.prisma.io/docs/orm/prisma-client/deployment/serverless/deploy-to-vercel)).
Vercel picks up `vercel-build` in preference to `build`. If you would rather not edit
`package.json`, the equivalent is to override the Build Command in the dashboard: Settings →
Build and Deployment → Build & Development Settings → Build Command → turn on the Override toggle and
enter `prisma generate && prisma migrate deploy && next build`
([Vercel: Configuring a Build](https://vercel.com/docs/builds/configure-a-build)).

One thing this repository already gets right: `prisma` is in `dependencies`, not `devDependencies`,
so you will not hit the `prisma: command not found` error that Prisma's guide warns about.

### 4. Set the environment variables

Settings → Environment Variables, applied to **Production**. Vercel states that *"Your source code
can read these values to change behavior during the Build Step or during Function execution"*, so
`DATABASE_URL` will be available to `prisma migrate deploy` during the build
([Vercel: Environment variables](https://vercel.com/docs/environment-variables)).

Set `DATABASE_URL` to Railway's **public** connection string — Vercel is outside Railway and cannot
reach `.railway.internal`. Then `APP_SECRET`, `AUTH_DISABLED=false`, `ALERTS_API_KEY`,
`TEAMS_WEBHOOK_URL`, `APP_URL`, plus `CRON_SECRET` (see "Scheduling the reminder").

Note: *"Any change you make to environment variables are not applied to previous deployments, they
only apply to new deployments."* Redeploy after changing one.

### 5. Configure the connection pool

See "Connection limits" below. This is the step most likely to be skipped and most likely to cause
an outage under load.

### 6. Deploy, then run first-time setup

Deploy. Then run the setup script from your own machine against the Railway public URL, exactly as in
Option B step 10 — Vercel has no facility for running a one-off command against a deployment.

---

## Scheduling the reminder

The reminder does not run itself. Something has to call `POST /api/alerts/dispatch`.

08:30 UK time on weekday mornings is a reasonable cadence. It stays silent when nothing needs
attention, so it will not train people to ignore it. Add `&force=1` to send regardless, which is what
the "Send a test message" button in Settings does.

**Both platforms schedule in UTC only.** In British Summer Time (late March to late October) 08:30
local is 07:30 UTC; in GMT it is 08:30 UTC. Neither platform will adjust for you. Pick 07:30 UTC and
accept that the message arrives at 07:30 local in winter, or pick 08:30 UTC and accept 09:30 local in
summer.

### On Railway (Option B)

Railway's scheduler *"will look for a defined cron schedule in your service settings, and execute the
start command for that service on the given schedule"* — it runs a container, it does not make an
HTTP request. The service must exit cleanly, *"the shortest time between successive executions of a
cron job cannot be less than 5 minutes"*, and *"Schedules are based on UTC"*
([Railway: Cron jobs](https://docs.railway.com/cron-jobs)).

So add a **third service** in the same project, from the same repository, with a cron schedule of
`30 7 * * 1-5` and a start command that issues the POST and then exits:

```bash
node -e "fetch(process.env.APP_URL+'/api/alerts/dispatch',{method:'POST',headers:{'x-alerts-key':process.env.ALERTS_API_KEY}}).then(r=>r.text()).then(t=>{console.log(t);process.exit(0)}).catch(e=>{console.error(e);process.exit(1)})"
```

Set `APP_URL` and `ALERTS_API_KEY` on that service too. The dispatch route accepts the key either as
a `?key=` query parameter or as an `x-alerts-key` header; **use the header**, so the secret does not
end up in access logs.

### On Vercel (Option A)

**Vercel Cron issues a `GET`, not a `POST`.** Vercel's documentation is explicit: *"To trigger a cron
job, Vercel makes an HTTP GET request to your project's production deployment URL"*
([Vercel: Cron Jobs](https://vercel.com/docs/cron-jobs)). `src/app/api/alerts/dispatch/route.ts`
exports `POST` only, so a cron job pointed at it will get a 405 and do nothing.

Frequency limits, from [Vercel: Cron usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing):

| Plan | Cron jobs per project | Minimum interval | Scheduling precision |
|---|---|---|---|
| Hobby | 100 | Once per day | Per-hour (±59 min) |
| Pro | 100 | Once per minute | Per-minute |
| Enterprise | 100 | Once per minute | Per-minute |

On Pro this is fine. On Hobby a daily 08:30 job would fire anywhere between 08:00 and 08:59 — but
Hobby is not available to you anyway.

**The workaround: add a small `GET` handler that does the same work.** Create
`src/app/api/alerts/cron/route.ts`:

```ts
import { buildDigest, dispatchToTeams } from '@/server/alerts';
import { getAlertSettings } from '@/server/settings';

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!expected || auth !== `Bearer ${expected}`) {
    return Response.json({ error: 'Not authorised.' }, { status: 401 });
  }

  const settings = await getAlertSettings();
  const webhook = settings.teamsWebhookUrl || process.env.TEAMS_WEBHOOK_URL || '';
  if (!webhook) {
    return Response.json({ sent: false, error: 'No Teams flow URL is configured.' }, { status: 400 });
  }

  const digest = await buildDigest();
  if (!digest.needsAttention) {
    return Response.json({ sent: false, reason: 'Nothing needs attention, so no message was sent.' });
  }

  const appUrl = process.env.APP_URL || new URL(request.url).origin;
  const result = await dispatchToTeams(digest, webhook, appUrl);
  return Response.json({ sent: result.ok });
}
```

**The path matters.** `src/proxy.ts` treats `['/login', '/api/alerts', '/api/calendar.ics']` and
anything beneath them as public; everything else without a session cookie is redirected to
`/login`. Vercel cron requests carry no cookie, and *"Cron jobs do not follow redirects. When a
cron-triggered endpoint returns a 3xx redirect status code, the job completes without further
requests"* ([Vercel: Managing Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs)). Put
the handler under `/api/alerts/` — as above — and it is exempt. Put it at `/api/cron/` and it will
silently redirect to the login page every morning and never send anything.

Then add the schedule to `vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["lhr1"],
  "crons": [
    { "path": "/api/alerts/cron", "schedule": "30 7 * * 1-5" }
  ]
}
```

And set `CRON_SECRET` in the project's environment variables. Vercel *"will be automatically sent as
an `Authorization` header when Vercel invokes your cron job"*, with the `Bearer` prefix. Use *"a
random string of at least 16 characters"*.

Two more things worth knowing about Vercel Cron: *"Vercel will not retry an invocation if a cron job
fails"*, and delivery *"is best effort"* — occasional runs can be missed or duplicated. For a daily
reminder that is acceptable; a missed run means one quiet morning, and a duplicate means one repeated
message.

### The alternative that needs no scheduler at all

The calendar feed at `/api/calendar.ics?key=…` can be subscribed to directly in Outlook. Renewals
then arrive as calendar entries, including separate "top up the card by this date" events ahead of
each charge on a prepaid card. No cron, no second service, no premium licence. Anyone holding that
URL can read renewal dates, amounts and card labels, so treat it as confidential.

`POWER-AUTOMATE.md` covers the Power Automate route and explains why a scheduled flow that calls the
endpoint needs a premium licence, whereas the Teams webhook trigger this application pushes to does
not.

---

## Connection limits

This section matters for Option A and is largely moot for Option B.

`src/lib/db.ts` constructs the adapter as `new PrismaPg({ connectionString: url })`. That argument is
a `pg.PoolConfig`, so the adapter creates its own `pg` connection pool internally. **The `pg` default
maximum pool size is 10** (confirmed in `node_modules/pg-pool/index.js`: `this.options.max =
this.options.max || this.options.poolSize || 10`).

**On Railway (Option B)** there is one long-lived process and therefore one pool of up to 10
connections. Nothing to configure.

**On Vercel (Option A)** each function instance gets its own pool. Prisma's guidance is blunt about
where this goes wrong: without configuration, *"many concurrent functions responding to a traffic
spike"* can *"exhaust the database connection limit very quickly"*. Prisma's recommendations are to
*"Configure a small pool size for your driver adapter"*, to instantiate `PrismaClient` outside the
request handler (this repository already does — the module-scope singleton in `src/lib/db.ts`), and
to *"not explicitly `$disconnect()`"*
([Prisma: Database connections](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections)).

Vercel's Fluid compute changes the picture in your favour: it has been *"enabled by default for new
projects"* since 23 April 2025, and it lets *"multiple invocations share a single function
instance"*, so concurrent requests reuse one pool
([Vercel: Fluid compute](https://vercel.com/docs/fluid-compute)).

**What to actually do, in order:**

1. **Cap the pool.** In `src/lib/db.ts`, change `new PrismaPg({ connectionString: url })` to
   `new PrismaPg({ connectionString: url, max: 5, idleTimeoutMillis: 5000 })`. `PrismaPg` accepts a
   `pg.PoolConfig`, so `max` and `idleTimeoutMillis` pass straight through. Vercel's guidance
   recommends *"a relatively short idle timeout (e.g., 5 seconds)"* and warns to *"Avoid max pool
   size of 1: This does not reduce total connections and harms concurrency in Fluid Compute. Instead,
   keep the minimum pool size to 1"*
   ([Vercel: Connection pooling with Vercel Functions](https://vercel.com/kb/guide/connection-pooling-with-functions)).

2. **Register the pool with Vercel.** Vercel's recommended approach is `attachDatabasePool` from
   `@vercel/functions`, which *"automatically manages pooling behavior, preventing connection leaks
   while maintaining reusable connections"*
   ([Vercel: Managing pools with Fluid compute](https://vercel.com/kb/guide/efficiently-manage-database-connection-pools-with-fluid-compute)).
   This needs `@vercel/functions` added as a dependency and a small change to `src/lib/db.ts`, because
   you must construct the `pg.Pool` yourself and hand it to the adapter. `PrismaPg`'s constructor
   accepts `pg.Pool | pg.PoolConfig | string`, so this works:

   ```ts
   import { Pool } from 'pg';
   import { attachDatabasePool } from '@vercel/functions';

   const pool = new Pool({ connectionString: url, max: 5, idleTimeoutMillis: 5000 });
   attachDatabasePool(pool);
   return new PrismaPg(pool);
   ```

   Note `attachDatabasePool` is a Vercel-specific API — guard it so local development and any Railway
   deployment do not call it.

3. **Only if you still exhaust connections, add a pooler.** Railway has one built in: Postgres
   service → Database → Config → Connection Pooling → **Add PgBouncer**. The default mode is
   **Transaction**, which is what Prisma requires. Enabling it exposes four variables:
   `DATABASE_URL` (PgBouncer over the private network), `DATABASE_PUBLIC_URL` (PgBouncer over the TCP
   proxy), `DATABASE_UNPOOLED_URL` and `DATABASE_PUBLIC_UNPOOLED_URL`
   ([Railway: PostgreSQL connection pooling](https://docs.railway.com/databases/postgresql-pgbouncer)).

   If you do this, point the **application** at the pooled public URL and point **Prisma CLI commands
   and migrations** at the unpooled one. Prisma's guidance for driver adapters is to *"use PgBouncer
   for runtime traffic via the adapter's connectionString, while maintaining a direct database
   connection for Prisma CLI commands through `prisma.config.ts`"*
   ([Prisma: External connection pooler](https://www.prisma.io/docs/guides/performance-and-optimization/connection-management/configure-for-external-connection-pooler)).
   Prisma also advises *"not setting `pgbouncer=true` in the database connection string if you're
   using PgBouncer 1.21.0 or later"* — **Not verified** which PgBouncer version Railway ships, so
   start without the flag and add it only if you see prepared-statement errors.

**Not verified:** Railway's default `max_connections` for its Postgres service. It is not stated in
their documentation. Check it directly before sizing anything:

```sql
SHOW max_connections;
```

Rule of thumb once you know it: keep (pool max × expected concurrent function instances) comfortably
below that number.

---

## Things that will go wrong

**No migrations, so nothing is created.** Covered in shared step 3, repeated here because it is the
one that will cost you an afternoon. `prisma migrate deploy` exits 0 and does nothing when
`prisma/migrations` is absent. The deployment goes green and then every page errors. Create and
commit the initial migration first.

**The Prisma client is not regenerated on Vercel.** Vercel caches `node_modules` between builds and
the generated client lives in `node_modules/.prisma/client`, so it is cached along with everything
else and `postinstall` does not re-run. The symptom is a client that does not match your schema —
often a type error at build time, sometimes a runtime error about an unknown field. Add
`"postinstall": "prisma generate"` to `package.json`, or put `prisma generate` at the front of the
build command. This repository has neither today.

**Connection exhaustion.** Ten connections per function instance, multiplied by however many
instances Vercel spins up, against a `max_connections` you have not checked. Symptom: intermittent
"too many clients already" errors under load that vanish when traffic drops. See "Connection limits".
This does not arise on Option B.

**`APP_SECRET` set carelessly, then changed.** It signs sessions *and* derives the AES-256-GCM key
that encrypts stored subscription passwords. If it changes, sessions are invalidated (harmless) and
every previously stored password becomes permanently unreadable (not harmless). There is no recovery
path — that is deliberate. `src/server/actions.ts` will report *"The stored password could not be
decrypted. This normally means APP_SECRET has changed since it was saved."* Generate it once with
`openssl rand -base64 48`, store it wherever you keep production secrets, and never regenerate it
casually. Setting it to a short placeholder now and a real value later has exactly this effect.

**`AUTH_DISABLED=true` reaching production.** `src/proxy.ts` returns `NextResponse.next()` for every
request when this is set. Anyone who can reach the URL is an administrator and can reveal stored
subscription passwords. Nothing prevents it deploying that way; the Settings page shows a red warning
but only to someone already looking. Set it to `false` explicitly rather than relying on it being
absent, and check the Settings page after the first deploy.

**Leaving `provider = "sqlite"`, or using SQLite deliberately.** Vercel's filesystem is *"read-only
… with writable `/tmp` scratch space"*, and `/tmp` does not persist. On Railway a container
filesystem resets on redeploy unless you attach a volume. Either way the database file vanishes and
takes the price history with it — the thing that makes the twelve-month trend chart meaningful and
the thing that takes months to accumulate back. Make the one-line schema change.

**Adding `?sslmode=require` to the Railway URL.** The example in `DEPLOYMENT.md` is a generic
PostgreSQL URL and includes it. Railway's Postgres TLS behaviour over the TCP proxy is **Not
verified** — there are recurring community reports of `self-signed certificate in certificate chain`
errors from Node clients. Use the connection string exactly as Railway supplies it. If you see that
error, that is the cause, and the fix belongs in the `pg` client's `ssl` options rather than the URL.

**Cron fires but nothing arrives.** On Vercel, check first that the endpoint is a `GET` and that it
sits under `/api/alerts/` so `src/proxy.ts` does not redirect it. Cron jobs do not follow redirects,
so a redirect looks like a successful invocation in the logs. Also check the digest actually had
something to say — the endpoint stays silent by design when nothing needs attention.

**`proxy.ts` on Vercel.** This application uses Next.js 16's `proxy.ts`, which replaced
`middleware.ts` and runs on the Node.js runtime with no configurable alternative. Vercel's Routing
Middleware documentation still uses `middleware.ts` in its examples and does not mention `proxy.ts`.
**Not verified** whether anything about the rename needs attention on Vercel. It should be handled
automatically, since Vercel maintains Next.js. Confirm on the first deploy by visiting the site
signed out — you should be redirected to `/login`. If you are not, authentication routing is not
running.

**Railway private networking on an older project.** Environments created before 16 October 2025
resolve internal DNS names *"to IPv6 addresses only"*; newer ones resolve both. A project created
today is dual-stack, so this should not arise, but if a Node client cannot resolve
`postgres.railway.internal`, this is the first thing to check.

---

## What could not be verified

Listed in one place so nothing above is mistaken for confirmed fact.

- **Railway's default `max_connections`.** Not documented. Run `SHOW max_connections;`.
- **The exact field label for Railway's pre-deploy command** in the current dashboard. The setting is
  documented and screenshotted but not named in text.
- **Whether Railway's Hobby plan permits commercial use.** Railway's formal fair use policy is
  silent; a Railway employee has said on the community forum that it does not. Budget for Pro or ask
  Railway in writing.
- **Railway Postgres TLS behaviour over the TCP proxy**, and therefore whether any `sslmode`
  parameter is appropriate. Use the string Railway gives you.
- **Which PgBouncer version Railway ships**, which determines whether `pgbouncer=true` should be in
  the connection string. Start without it.
- **Whether Vercel needs anything specific for Next.js 16's `proxy.ts`.** Vercel's middleware docs
  have not been updated to mention it. Verify by loading the site signed out.
- **Whether either vendor's data processing terms meet Imperial Edutech's requirements.** The
  geography is verified above; the contractual position is not a technical question.
- **Actual monthly cost.** Both platforms meter usage. The figures above are the published
  subscription floors and unit rates, not a forecast for this application's real consumption.

---

## Sources

Vercel:

- [Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs)
- [Runtimes — filesystem, isolation, regions](https://vercel.com/docs/functions/runtimes)
- [Supported Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
- [Node.js 20 is being deprecated on October 1, 2026](https://vercel.com/changelog/node-js-20-is-being-deprecated)
- [Fair Use Guidelines — commercial usage](https://vercel.com/docs/limits/fair-use-guidelines)
- [Hobby plan](https://vercel.com/docs/plans/hobby)
- [Pricing](https://vercel.com/pricing)
- [Cron Jobs](https://vercel.com/docs/cron-jobs)
- [Cron Jobs — usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- [Managing Cron Jobs — CRON_SECRET, redirects, retries](https://vercel.com/docs/cron-jobs/manage-cron-jobs)
- [Global network and regions](https://vercel.com/docs/regions)
- [Configuring regions for Vercel Functions](https://vercel.com/docs/functions/configuring-functions/region)
- [Fluid compute](https://vercel.com/docs/fluid-compute)
- [Connection pooling with Vercel Functions](https://vercel.com/kb/guide/connection-pooling-with-functions)
- [Efficiently manage database connection pools with Fluid compute](https://vercel.com/kb/guide/efficiently-manage-database-connection-pools-with-fluid-compute)
- [Environment variables](https://vercel.com/docs/environment-variables)
- [Configuring a Build](https://vercel.com/docs/builds/configure-a-build)
- [Routing Middleware](https://vercel.com/docs/routing-middleware)

Railway:

- [PostgreSQL](https://docs.railway.com/databases/postgresql)
- [PostgreSQL connection pooling (PgBouncer)](https://docs.railway.com/databases/postgresql-pgbouncer)
- [Private Networking](https://docs.railway.com/networking/private-networking)
- [Private Networking — how it works](https://docs.railway.com/networking/private-networking/how-it-works)
- [TCP Proxy](https://docs.railway.com/networking/tcp-proxy)
- [Pricing plans](https://docs.railway.com/reference/pricing/plans)
- [Deployment regions](https://docs.railway.com/reference/deployment-regions)
- [Pre-deploy command](https://docs.railway.com/deployments/pre-deploy-command)
- [Cron jobs](https://docs.railway.com/cron-jobs)
- [Backups](https://docs.railway.com/volumes/backups)
- [Deploy a Next.js app with Postgres](https://docs.railway.com/guides/nextjs)
- [Deploy a full-stack Next.js app with Postgres](https://docs.railway.com/guides/fullstack-nextjs)
- [Acceptable Use / Fair Use](https://railway.com/legal/fair-use)
- [Commercial usage using Hobby plan — Railway Central Station](https://station.railway.com/questions/commercial-usage-using-hobby-plan-7fd8cf69) (community forum, Railway employee response)

Prisma:

- [Vercel dependency caching issue](https://www.prisma.io/docs/orm/more/help-and-troubleshooting/vercel-caching-issue)
- [Deploy to Vercel](https://www.prisma.io/docs/orm/prisma-client/deployment/serverless/deploy-to-vercel)
- [Database connections](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections)
- [Configure Prisma Client with an external connection pooler](https://www.prisma.io/docs/guides/performance-and-optimization/connection-management/configure-for-external-connection-pooler)

Next.js:

- `next.config.js` `output` option — bundled with this repository at
  `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md`
- `middleware` to `proxy` rename — bundled at
  `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`

Facts established by inspecting this repository rather than from documentation: the absence of
`prisma/migrations` and the observed output of `prisma migrate deploy`; the absence of a `postinstall`
or `vercel-build` script and of `vercel.json`; `prisma` being a runtime dependency and `tsx` a dev
dependency; the `pg` default pool maximum of 10; the `APP_SECRET` length checks in `src/lib/auth.ts`
and `src/lib/crypto.ts`; the public path list in `src/proxy.ts`; and `POST` being the only method
exported by `src/app/api/alerts/dispatch/route.ts`.

# Architecture

Two independently deployed services, one database.

```
        browser
           │
           │  HTTPS · httpOnly session cookie, same origin
           ▼
┌──────────────────────────┐
│  frontend/               │   Vercel · region lhr1
│  Next.js 16              │
│                          │
│  · pages and components  │
│  · Server Actions, which │
│    call the API          │
│  · /api/* passthroughs   │
│    for downloads         │
│                          │
│  NO database access      │
└───────────┬──────────────┘
            │
            │  HTTPS · Authorization: Bearer <jwt>
            │  server-to-server only; never from the browser
            ▼
┌──────────────────────────┐
│  backend/                │   Railway
│  Next.js 16, API only    │
│                          │
│  · 31 route handlers     │
│  · domain logic          │
│  · Prisma + migrations   │
│  · encryption at rest    │
└───────────┬──────────────┘
            │
            ▼
      PostgreSQL            Railway
```

## Why the browser never calls the backend

The obvious split — browser talks to both services — needs the session cookie to
work across two origins. That means `SameSite=None`, which Safari's tracking
prevention and Chrome's third-party cookie work both restrict, and it needs CORS
with credentials on every endpoint.

Instead the token lives in an httpOnly cookie on the **frontend's** origin, and
every backend call is made from the Next.js server, which attaches it as a
bearer header. The consequences are worth stating plainly:

- the backend needs **no CORS configuration at all**
- no cross-site cookie, so nothing breaks when a browser tightens its rules
- the backend URL and the token are never visible to page scripts
- download links (`/api/export`, `/api/calendar.ics`) keep working, because they
  are same-origin URLs that this service proxies

`frontend/src/lib/api.ts` starts with `import 'server-only'`. If a client
component ever imports it, the build fails rather than leaking the token.

## What each service owns

| | `frontend/` | `backend/` |
|---|---|---|
| Deployed to | Vercel | Railway |
| Database | none | Prisma → PostgreSQL |
| Holds `DATABASE_URL` | no | yes |
| Holds `APP_SECRET` | yes — verifies tokens only | yes — signs tokens, derives the credential key |
| Renders HTML | yes | a status page only |
| Enforces authorisation | presentation only | **authoritative, on every endpoint** |

Authorisation is decided in `backend/src/lib/http.ts` (`requireUser`,
`requireEditor`, `requireAdmin`). The frontend's role checks only decide whether
to draw a button; a Server Action is reachable by direct POST, so a check on
that side would be a hint, not a control.

## The shared-code boundary

`domain.ts`, `money.ts`, `allocation.ts`, `stats.ts`, `import-parse.ts` and the
portfolio type declarations exist in **both** services.

This is deliberate duplication, not an oversight. The two services deploy to
different platforms from different root directories, and neither build can reach
a common parent without the fragile "include files outside the root directory"
configuration each platform offers. A workspace package would have to be
published or vendored to be resolvable in both.

**If you change one of these, change the other.** The type declarations in
`frontend/src/server/portfolio.ts` are the contract for `/api/portfolio`; if they
drift from `backend/src/services/portfolio.ts`, the frontend will compile against
a shape the backend no longer sends.

Two things that specifically do **not** cross the wire intact and are handled
explicitly:

- **`Map`** — `Portfolio.departmentIndex` is a `Map` and carries one entry more
  than the `departments` array (the synthetic "unassigned" bucket). It is sent as
  an entry list and rebuilt in `hydrate()`.
- **`Date`** — everything arrives as an ISO string. `frontend/src/lib/api.ts`
  revives them during `JSON.parse`, because pages call `.toISOString()` on them.

## Environment variables

`APP_SECRET` must be **byte-for-byte identical** on both services. The backend
signs tokens with it and the frontend verifies them; a mismatch produces the
confusing symptom of a sign-in that appears to succeed followed by every page
reporting "not signed in".

| Variable | frontend | backend |
|---|---|---|
| `BACKEND_URL` | required | — |
| `DATABASE_URL` | — | required |
| `APP_SECRET` | required (same value) | required (same value) |
| `AUTH_DISABLED` | `false` | `false` |
| `ALERTS_API_KEY` | required (same value) | required (same value) |
| `CRON_SECRET` | set by Vercel Cron | — |
| `TEAMS_WEBHOOK_URL` | — | optional |
| `APP_URL` | — | recommended |

## Running both locally

Two terminals. The backend first — the frontend is useless without it.

```bash
# 1
cd backend && npm run dev     # :3001

# 2
cd frontend && npm run dev    # :3000
```

`frontend/.env` needs `BACKEND_URL="http://localhost:3001"`.

## Verifying a change

The logic suites talk to the database directly and belong to the backend. The
browser suites drive the real interface and belong to the frontend; both
services must be running for them.

```bash
cd backend  && npm run verify:all   # 64 calculation + 49 mutation checks
cd frontend && npm run audit:all    # page, form and destructive-path audits
```

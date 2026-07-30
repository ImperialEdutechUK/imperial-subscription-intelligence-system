# Security

This document states plainly what the application protects and what it does not. It is written so that whoever signs off on holding credentials in it can make that decision on accurate information.

---

## The short version

Stored subscription passwords are encrypted at rest and only administrators can reveal them. That defeats casual exposure: a leaked database file, a backup sitting on a shared drive, someone reading over your shoulder, or a Finance colleague with a Viewer account.

It does **not** defeat someone who has both the database and the server's environment variables. The application must be able to decrypt on demand in order to show you a password, so the key has to be available to it. This is a convenience store, not a password manager.

**For any credential where loss of control would be damaging, keep the real password in your organisation's password manager and use the "where the credential lives" field to record where it is.** The application has that field precisely so it can be useful without holding the secret.

---

## How credential storage actually works

Passwords are encrypted with AES-256-GCM. The key is derived from `APP_SECRET` using scrypt with a fixed salt. GCM is an authenticated mode, so a value that has been tampered with fails to decrypt rather than returning corrupted plaintext.

Consequences worth knowing:

Changing `APP_SECRET` makes every previously stored password permanently unreadable. There is no recovery path. This is intentional — an application that could recover them without the key would not be encrypting anything meaningfully. Reveals are logged. Every time an administrator reveals a password, an entry is written to the audit log recording who did it and when.

If `APP_SECRET` is unset or shorter than 16 characters, the application refuses to encrypt rather than storing anything in the clear.

Passwords are never included in any export. The CSV and Excel exports record only whether a password is stored, as a yes or no.

---

## Roles

| Role | Can view | Can edit | Can reveal passwords | Can change settings and users |
|---|---|---|---|---|
| Administrator | Yes | Yes | Yes | Yes |
| Editor | Yes | Yes | No | No |
| Viewer | Yes | No | No | No |

Viewer is the role to give Finance. It shows every figure, chart and export, and nothing about credentials.

Roles are checked in three places, deliberately overlapping. `frontend/src/proxy.ts` performs an optimistic cookie check that routes anonymous visitors to the sign-in page — it does not verify the token, because proxy-level checks are for routing, not authorisation. Every page re-reads the session properly through `getSession()`. And every Server Action re-checks the caller's role independently, because Server Actions are reachable by direct HTTP POST and not only through the interface. A forged cookie gets past the proxy and then achieves nothing.

---

## Authentication

Sessions are JSON Web Tokens signed with HS256, held in an `httpOnly`, `sameSite=lax` cookie marked `secure` in production, expiring after twelve hours.

User passwords — as distinct from stored subscription passwords — are hashed with bcrypt at cost factor 12 and are never stored or recoverable in plaintext.

The sign-in form returns identical wording for an unknown email address and a wrong password, so it cannot be used to discover which addresses have accounts. There is no automated password reset; an administrator resets a password directly.

There is no rate limiting on the sign-in endpoint. On an internal deployment behind a corporate network this is usually acceptable. If the application is reachable from the public internet, put rate limiting in front of it at the reverse proxy or WAF layer.

---

## `AUTH_DISABLED`

Setting `AUTH_DISABLED=true` bypasses authentication completely and grants every visitor administrator rights, including the ability to reveal stored passwords.

It exists so the application can be run on a laptop without setting up accounts. It must never be set on anything reachable over a network. The Settings page shows a red warning while it is active, but nothing in the application prevents it being deployed that way — that is a deployment control, not a software one.

---

## The API endpoints

`/api/alerts/digest` and `/api/calendar.ics` accept either a session cookie or an `ALERTS_API_KEY` query parameter, because Outlook and Power Automate cannot present a cookie. If the key is unset or shorter than 16 characters, key-based access is refused outright rather than defaulting open.

Anyone holding the key can read subscription names, renewal dates, amounts, card labels and last-four digits. They cannot read passwords, which are not exposed by any API endpoint. Treat the key and any calendar subscription URL containing it as confidential; a calendar URL pasted into a shared channel is a data disclosure.

`/api/alerts/dispatch` additionally accepts an administrator session, which is how the "Send a test message" button in Settings works.

`/api/export` requires a session and has no key-based access, deliberately — a full register export is the highest-value single request in the application.

---

## Data held

The application holds software names and vendors, account emails and usernames, encrypted passwords where entered, the last four digits of payment cards, cardholder names, card balances, costs and renewal dates, departmental allocations, and the names and emails of internal owners and department heads.

It does **not** hold full card numbers, expiry security codes, or bank details. The card model has a `last4` field and no field for a full number, so a full card number cannot be stored even by mistake.

Under UK GDPR the personal data here is limited — work email addresses and names in a workplace context — but it is not nothing. The register is a legitimate business record; treat it with the same care as any internal finance system.

---

## What is not implemented

Being explicit about the gaps is more useful than a list of what is present.

There is no rate limiting, no account lockout, no multi-factor authentication, no automated password reset, no encryption of the database file as a whole (only the password fields), no IP allow-listing, and no CSRF token beyond the `sameSite=lax` cookie attribute and Next.js's built-in Server Action origin checks.

For an internal departmental tool behind a corporate network, that set of omissions is defensible. If this is going to be reachable from the public internet, or hold credentials for anything financially significant, put an identity-aware proxy in front of it — Entra ID application proxy, Cloudflare Access, or similar — rather than relying on the application's own login as the only gate.

---

## If `APP_SECRET` leaks

Assume every stored subscription password is compromised and rotate them at the vendors. Rotating `APP_SECRET` afterwards is necessary but not sufficient, and it will make the stored values unreadable, so rotate the vendor passwords first and re-enter them after.

Existing sessions are invalidated automatically when the secret changes, since they can no longer be verified.

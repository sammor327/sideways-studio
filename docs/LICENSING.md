# Sideways Studio — accounts and licensing

Spec for the account system: self-serve free sign-up, a signed token the app
carries, the control panel gated behind it, and a clean seam for charging
later. Drafted 2026-09-15 from Sam's calls in that session. Not built.

Companion to `docs/SPEC.md`. The threat model here follows the same honesty
rule as `server/cardstore.js`: say plainly what this is worth.

## 1. The locked decision this reopens

`docs/SPEC.md` opens with the app being "distributed free to tournament
organizers and streamers", locked in the 2026-08-09 interview. Accounts do not
cancel that, but they do change it, so it gets recorded rather than quietly
contradicted. Amendment text, for Sam to paste into SPEC.md's header when he is
ready:

> **Amendment 2026-09-15 (Sam):** still free, now with an account. Anyone can
> sign up at the account portal; the app is free to download and free to use.
> The control panel asks the operator to sign in once, and the app carries a
> signed token from then on. This exists to give Sam a roster of operators he
> can reach about breaking changes, and to put the plumbing in place so a paid
> tier can be added later without re-architecting the app. Broadcast output is
> never gated and never watermarked: see the latch rule in docs/LICENSING.md.

## 2. Be honest about what this is worth

This is an **account system**, not copy protection. It will not stop anyone who
does not want to be stopped:

- The repo is public. Deleting the gate is a five-line edit and an `npm start`.
  Going private now does not un-publish v0.11.1.
- The verifying public key ships inside the exe, exactly like the card-store
  key. Anyone willing to open the binary can swap it for their own.
- Everything the app does is local rendering. There is no server-side component
  to withhold, so there is nothing to withhold it *from*.

What it does buy, which is the actual goal:

- A roster of operators with working email, and the version each one runs.
- A way to tell people before a breaking change lands mid-season.
- Revocation that works on the honest majority.
- The client-side plumbing a real server-side gate would need later, if the card
  database and art ever move behind an authenticated endpoint. That is the only
  version of this with teeth, and it is out of scope here.

Design as if every user is honest, because the dishonest ones are not in scope.

## 3. The latch rule

**The license decision is made once, at startup, and frozen for the life of the
process.**

This falls straight out of `server/updater.js`'s governing rule, NEVER BLOCK THE
SHOW, and it is the most important line in this document. A token that expires
at 21:00 during an event does not lock the panel at 21:00. It locks on the next
launch. The operator finishes the show.

Concretely, whatever `initLicense()` decides at boot governs the whole run:

| Surface | Unlicensed |
| --- | --- |
| `/scenes/*`, `/stage/*`, `/theme/*` | Served normally, always |
| WebSocket push | Connected normally, always |
| `GET /api/state` and every read API | Served normally, always |
| Mutating APIs (state writes, decklist, theme upload, cards) | `402` with a `licensed:false` body |
| `/panel/` | Serves, renders the sign-in gate instead of the controls |
| `/window/` | Serves, account tile shows signed-out |

Background refresh writes a new token to disk for **next** launch. It never
changes the live decision, in either direction. A copy that signs in mid-session
gets a "restart to unlock" prompt rather than a panel that changes shape under
the operator's hands.

A failed network call never counts as unlicensed. Only a cryptographically
invalid token, or one past its hard expiry, does.

## 4. Hosted side

Cloudflare, since it is already in the stack for TES Tools.

- **Worker** serving the portal and four endpoints:
  - `POST /v1/signup` — email, password, display name. Sends a verification mail.
  - `POST /v1/login` — returns a signed license token.
  - `POST /v1/refresh` — token in, fresh token out. Also the telemetry beat:
    records `app_version` and `last_seen`.
  - `GET /v1/verify-email?token=` — completes sign-up.
- **D1** for the user table. Not KV: you will want to query this ("who is on
  0.11.x", "who signed in this month") and D1 makes that a `SELECT`. Schema,
  with the billing columns present and unused from day one:

  ```sql
  CREATE TABLE users (
    id                 TEXT PRIMARY KEY,
    email              TEXT UNIQUE NOT NULL,
    pw_hash            TEXT NOT NULL,   -- PBKDF2-SHA256, salt and iterations inline
    display_name       TEXT,
    verified_at        INTEGER,
    created_at         INTEGER NOT NULL,
    last_seen_at       INTEGER,
    app_version        TEXT,
    plan               TEXT NOT NULL DEFAULT 'free',
    plan_expires       INTEGER,
    stripe_customer_id TEXT,
    revoked_at         INTEGER
  );
  ```

- **Password hashing**: PBKDF2-SHA256 via WebCrypto, OWASP-current iteration
  count. Note the CPU gotcha in §9.
- **Portal pages**, served by the same Worker: sign up, verify, sign in, forgot
  password, and an account page showing the machines that have refreshed. Plain
  server-rendered HTML. The app never renders sign-up; it links out with
  `openExternal`, which is already how the panel opens external URLs.

## 5. Token

A compact JWS, EdDSA over Ed25519. Verify Workers' Ed25519 support at
implementation time; if it fights you, ECDSA P-256 is the zero-risk fallback and
changes nothing else here.

```json
{
  "sub": "usr_...",
  "email": "to@example.com",
  "name": "Example TO",
  "plan": "free",
  "entitlements": [],
  "tv": 1,
  "iat": 1757894400,
  "exp": 1760486400
}
```

- `exp` is 30 days out.
- `tv` is the token format version, so a later change does not strand old builds.
- `entitlements` is empty in v1 and is the billing seam. See §7.

The app verifies with a public key baked into the build. No network call is
needed to check a token, which is what makes the offline story work.

**Offline tolerance.** The app refreshes on startup, not awaited, and every 12
hours while running, exactly like `autoRefreshCardDb()`. Past `exp`, a further
**14-day stale window** is honored, so a machine that has been off the internet
for six weeks still opens the panel. Past that, the panel locks and the scenes
keep running.

## 6. App side

New file, modelled closely on `server/updater.js` (module-level `status` object,
never throws, short timeout, silent failure):

- **`server/license.js`** — `initLicense()`, `login(email, password)`,
  `logout()`, `refresh()`, `isLicensed()`, and a `status` object the panel polls.
  Token cached at `DATA_DIR/license.json`. Reuses updater.js's host-allowlist
  pattern so `SIDEWAYS_ACCOUNT_URL` can be pointed at a loopback for tests.

Changed:

- **`server/index.js`** — four routes (`/api/license/status` GET,
  `/api/license/login` POST, `/api/license/logout` POST, `/api/license/refresh`
  POST), one `await initLicense()` in `start()` beside `initCardDb()`, and the
  mutating-API guard from §3's table. The guard belongs in one place at the top
  of the dispatcher at `server/index.js:92`, listing read-only and scene paths as
  the allowlist, so a route added later is gated by default.
- **`web/panel/`** — sign-in gate. Email, password, a "Create an account" link
  that opens the portal, and the stale-token warning line. The gate replaces the
  controls rather than overlaying them, so there is nothing to click through.
- **`web/window/`** — an account tile beside the existing status tiles. Signed-in
  name, plan, days until refresh, sign out. 371 lines of `window.js` today, so
  this is small.
- **`scripts/build-exe.mjs`** — bake `SIDEWAYS_LICENSE_PUBKEY` and
  `SIDEWAYS_ACCOUNT_URL` as esbuild literals, the same mechanism
  `SIDEWAYS_CARDDB_KEY` already uses, read from a gitignored `.license-key`.
- **`test/license.test.js`** — `node --test`, matching the existing convention: a
  valid token verifies, a tampered one does not, an expired one inside the stale
  window still opens, one past it does not, a network failure is not a lock, and
  the latch does not move mid-process.
- **`docs/SPEC.md`** — the §1 amendment.
- **`docs/LOOP.md`** — a new roadmap part.

## 7. The billing seam

The point of doing this now is that adding payment later should be a Worker
change, not an app rewrite. Three things make that true:

1. `plan` and `entitlements` ride in the token from v1, always `"free"` and `[]`.
2. The app asks one helper, `hasEntitlement(name)`, which returns true for
   everything while the build's `BILLING_ENABLED` literal is false. Call sites
   can be added to features as they ship, and they stay inert.
3. D1 carries `plan`, `plan_expires` and `stripe_customer_id` from the first
   migration, so turning on Stripe is a webhook writing columns that exist.

Nothing else about billing is specified here, deliberately.

## 8. Cost and effort

| Item | |
| --- | --- |
| Worker, D1, portal pages, email | ~1 day |
| `server/license.js`, routes, tests | ~0.5 day |
| Panel gate, window account tile | ~0.5 day |
| Build wiring, release, docs, verification | ~0.5 day |
| **Total** | **~2.5 focused days, or two loops** |

Running cost: **Workers Paid, $5/month**, plus a domain. D1 and email volume sit
inside free tiers at this scale for a long time.

## 9. Flags

- **Workers free tier will not do the password hashing.** The free plan caps CPU
  at 10ms per invocation; PBKDF2 at a current iteration count is well past that.
  Workers Paid, or a deliberately weaker hash, and the weaker hash is not worth
  it. Budget the $5.
- **No domain.** `turnemsideways.com` belongs to the party in the trademark
  dispute, so the portal needs a hostname decided before launch. A
  `*.workers.dev` subdomain is fine to build against and painful to hand to
  users, so decide early.
- **This makes you a custodian of credentials.** Email addresses and password
  hashes for tournament organizers, with the breach-notification duties that
  implies. Hash correctly, never log a password, and put up a short privacy note
  saying what is collected and why. If the Riot relationship means PII
  collection needs clearance, that is a conversation before launch, not after.
- **Sign-in in the app is a phishing-shaped pattern.** A desktop app asking for a
  password trains operators to type it into windows. The upgrade path, if it ever
  matters, is device-code: the app shows a code, the operator approves it in a
  real browser, the app polls for its token. Not worth the extra work at this
  stage, but it is the reason §4 keeps sign-up out of the app.
- **Self-serve free sign-up plus a panel-only lock deters almost nothing.** That
  is the right call for the stated goal, and worth stating out loud so nobody
  later mistakes this for protection it never claimed.

## 10. Review notes (2026-09-15, second session, against 3ea27f0)

Checked before the build starts. Everything §6 points at exists as
described: the dispatcher is at `server/index.js:92`, `server/updater.js`
carries the status object, host allowlist, timeout and silent-failure
pattern, `scripts/build-exe.mjs` bakes `SIDEWAYS_CARDDB_KEY` from a
gitignored `.carddb-key`, `web/window/window.js` is 371 lines, the panel
opens external URLs through `/api/app/open`, and `npm test` is `node --test`
(91 passing). The WebSocket is push-only, with no inbound message handler,
so the HTTP guard in §3 covers every mutation there is.

Gaps to close in the spec, or in the build, before it ships:

1. **The allowlist is not "read-only and scene paths".** These POST routes
   must stay open when unlicensed or the app cannot recover: the three
   `/api/license/*` routes (or nobody can sign in), `/api/app/open`,
   `/api/app/quit`, and `/api/update/check`, `/skip`, `/install` (an
   unlicensed copy must still update itself). Gate the rest by default as
   §6 says, but write these six into the allowlist by name and test that
   each answers 200 with no token.
2. **A definitive rejection is not a failed network call.** §3 treats every
   refresh failure as neutral. A refresh that gets a 401 or 403 back
   (revoked, password changed, token version retired) is an answer, not a
   failure: delete or mark `license.json` so the next launch locks, while
   the latch keeps this run open. Timeouts, DNS failures and 5xx keep the
   cached token. Without this rule, revocation only bites when the cached
   token ages past `exp` plus the stale window, up to 44 days, and §2's
   "revocation that works on the honest majority" is overstated.
3. **"Machines that have refreshed" needs a devices table.** The schema has
   one `last_seen_at` and one `app_version` per user, so the account page
   cannot list machines. Add `devices (user_id, device_id, app_version,
   first_seen_at, last_seen_at)` with the app sending a random per-install
   `device_id` on refresh. That is also how "who is on 0.11.x" is answered
   per machine rather than per account.
4. **Forgot password is two more endpoints.** The portal page needs
   `POST /v1/reset-request` and `POST /v1/reset`, so §4 is six endpoints,
   not four.
5. **Verification mail needs the domain, not just the portal.** Cloudflare
   Email Service's outbound sending (public beta since 2026-04) is on the
   Workers Paid plan and sends only from a domain onboarded with SPF and
   DKIM. A `*.workers.dev` build cannot send the sign-up mail at all, so
   the §9 "No domain" flag blocks sign-up itself, not just a nice URL. The
   $5 plan covers both this and the PBKDF2 CPU. Free-plan CPU is confirmed
   at 10 ms per invocation, Paid at 5 minutes.
6. **Write the key-rotation rule before generating the first key.** The
   verifying key is baked into each build, so retiring a signing key
   strands every older build once its cached token passes the stale
   window. Rule: a signing key is never retired while any app version that
   carries only that key is in the field. The Worker sees `app_version` on
   every refresh, so it can sign with the key that build carries.
7. **401, not 402.** Minor. 402 Payment Required for a free account that is
   merely signed out reads wrong in logs; 401 with `licensed:false` is the
   conventional code and leaves 402 free for a real paid gate later. Pick
   one and pin it in `test/license.test.js`.
8. **Ed25519 on Workers stayed unconfirmed** in this review (the docs search
   did not surface the algorithm table). The app side is certain: Node 24
   verifies Ed25519 natively through `crypto.verify(null, ...)`. The P-256
   fallback in §5 stands.

Working-tree note: the cards-in-hand work (LOOP.md 2026-09-15j) is
uncommitted in `panel.js`, `index.html`, `LOOP.md` and `PROMPT.md`, the same
files §6 changes. Commit it first or the two ship as one commit.

---
status: proposed
authority_level: authoritative
owner: architecture
date: 2026-10-03
last_reviewed: 2026-10-03
review_by: 2027-04-03
applies_to: apps/dgfy-admin, apps/dgfy-ims, apps/dgfy-pos, apps/dgfy-storefront, apps/dgfy-opis, infrastructure/docker/nginx, infrastructure/nginx-host
topic: dgfy_admin_fifth_frontend_app
supersedes_in_part: docs/architecture/adr/0087-dedicated-back-office-fourth-frontend-app-opis.md (Decisions 1, 2, and 4 only)
---

# ADR 0089: Platform Admin as a Fifth Frontend App (`apps/dgfy-admin`) with Cross-Host `/admin` Routing

## Status

Proposed. Tech-lead approval is required before merge because this decision supersedes binding
clauses in ADR 0087 (Decisions 1, 2, and 4). Pat's product direction (2026-10-03, issue #350):
extract the landlord Platform Admin console into its own app and serve it at `/admin` on
`dgfy.ph`, `pos.dgfy.ph`, `opis.dgfy.ph`, and `skupervisor.dgfy.ph` during the legacy-host
compatibility window, with **independent per-host login** — explicitly not a shared cross-host
session — so no `SESSION_COOKIE_DOMAIN` broadening is required by this decision.

## Context

The landlord Platform Admin console (tenants, DGFY accounts, payments, pricing, hosting,
invoices, Platform Admin accounts, store templates, feedback) is governed by ADR 0047
(identity/page RBAC) and ADR 0026 (browser session cookie authority). It is distinct from the
merchant Back Office OPIS owns under ADR 0087 and epic #1354.

Today the console is **not** a separate app — it lives inside `apps/dgfy-ims` (branded
"SKUpervisor"), mounted at `/admin/*` via `apps/dgfy-ims/src/main.jsx`, with its pages in
`apps/dgfy-ims/Pages/admin/*.jsx` (~6,650 lines; `TenantManager.jsx` alone is 3,587 lines). Some
admin-only code already sits in the shared trunk rather than in IMS itself:
`packages/web-core/src/services/adminService.js`, `packages/web-core/src/features/admin/`, and
the shell `packages/web-core/Components/admin/AdminLayout.jsx`.

ADR 0071, extended by ADR 0087, binds the repo to four independently deployable frontend apps
(`dgfy-ims`, `dgfy-pos`, `dgfy-storefront`, `dgfy-opis`) over one shared trunk
(`packages/web-core`), each served from its own root-level path on its own host — i.e. each app
owns its whole origin (`infrastructure/docker/nginx/nginx.conf.template` routes each production
host's `server {}` block to exactly one app by Host header, one `proxy_pass` per host) — and each
keeping an isolated cookie namespace from the others (ADR 0087 Decision 4: `opis_*` vs. `sku_*`,
selected per-request by an `x-dgfy-app-surface` header, never used for authorization).

Issue #350 asks for a **fifth** app, `apps/dgfy-admin`, whose `/admin/*` path is reachable from
inside **four other apps' origins** at once. That is a genuinely new shape: every existing app
boundary in this repo is "one app owns one origin," and #350's own body correctly requires an
approved architecture decision — covering the fifth app, cross-host routing, session/cookie
boundaries, deployment ownership, and `skupervisor.dgfy.ph` compatibility/cutover — before any
implementation starts. This ADR is that decision.

Two facts from the current session-cookie implementation drive the session-model choice below:
`apps/dgfy-api/src/utils/browserSessionCookies.js` currently keys the Platform Admin cookie as
`sku_admin_session`, inside the same `sku_*` namespace as tenant/POS cookies, not an isolated one;
and `resolveCookieDomain()` leaves `SESSION_COOKIE_DOMAIN` unset in production today (host-only
cookies — confirmed live in
`docs/deployment/2026-07-20-dgfy-ph-production-cutover-runbook.md`). A Platform Admin login on
one host does not carry over to another today, and ADR 0026 gates any cross-host cookie-domain
broadening behind an explicit security review that #350 itself says this issue does not perform.
Pat's direction resolves this by keeping sessions host-only and per-host, rather than broadening
cookie scope.

## Decision

1. Extract the Platform Admin console into a new, independently deployable, independently
   buildable, independently testable top-level app `apps/dgfy-admin` (dev port `5177`, container
   port `8085`, image `ghcr.io/sieitzz/dgfy-admin` per ADR 0072's flat naming convention — the
   next free values after OPIS's `5176`/`8084`). `apps/dgfy-ims/Pages/admin/*` and its `/admin`
   route tree move into the new app. The admin-only code currently misplaced inside the shared
   trunk — `packages/web-core/src/services/adminService.js`,
   `packages/web-core/src/features/admin/*`, and `packages/web-core/Components/admin/
   AdminLayout.jsx` — moves into `apps/dgfy-admin` too, since no other app renders it; it was
   never genuinely shared code, just colocated there. This supersedes ADR 0087 Decision 2's
   "four apps" framing only insofar as the count becomes five; the shared-trunk-exclusivity rule
   itself is unchanged and extends identically: `apps/dgfy-admin` declares
   `"@sieitzz/web-core": "file:../../packages/web-core"`, depends on no other app's source, and
   keeps its own `package.json`, lockfile, Vite config, and test config, like the other four.
   `[binding]`
2. `/admin/*` on `dgfy.ph`, `pos.dgfy.ph`, `opis.dgfy.ph`, and `skupervisor.dgfy.ph` (and their
   supported dev/staging equivalents) is served by a server-side reverse-proxy `location /admin`
   rule inside each host's existing edge config, forwarding to `dgfy-admin`'s own container —
   never a client-side redirect to a different origin, and never a change to any other path on
   that host. Every path outside `/admin/*` keeps being served exactly as it is today by that
   host's existing owning app. The browser's address bar stays on the visited host throughout.
   This is added identically in all currently known routing-config locations — there is no single
   source of truth today, so each must be edited and kept in sync:
   `infrastructure/docker/nginx/nginx.conf.template` (prod), `infrastructure/nginx-host/
   dev.dgfy.ph.conf` (DEV), `infrastructure/nginx-host/stage.dgfy.ph.conf` (Docker staging),
   `nginx/dgfy.ph.conf` (legacy PM2-based, the live config for the separately-named
   `staging.dgfy.ph` environment), and `infrastructure/docker/nginx/conf.d.local-test/*.conf`
   (local Docker testing). This supersedes ADR 0087 Decision 1's "each app... served directly
   from its own root-level path" framing, for the `/admin` path prefix only — every other path on
   every host is unaffected and continues to be owned by exactly one app, unchanged. `[binding]`
3. Platform Admin keeps a browser session that is **host-only and independent per host** —
   `SESSION_COOKIE_DOMAIN` stays unset, exactly as today; this decision does not broaden cookie
   scope. A Platform Admin logs in separately on whichever host they access `/admin` from; there
   is no single session that follows them across `dgfy.ph`/`pos.dgfy.ph`/`opis.dgfy.ph`/
   `skupervisor.dgfy.ph`. The admin cookie moves out of the shared `sku_*` namespace (today:
   `sku_admin_session`) into its own isolated `admin_*` namespace (`admin_session`,
   `admin_csrf_token`), selected per-request by the existing `x-dgfy-app-surface: admin` header
   convention (a cookie-namespace selector only, never authorization — the same mechanism ADR
   0087 Decision 4 already established for `opis_*`). Logging into or out of Platform Admin on
   any host never touches that host's own `sku_*`/`opis_*` session cookies, and vice versa.
   `HttpOnly`, `Secure`, CSRF enforcement/rotation, and ADR 0047's existing DB-backed
   session/RBAC/audit model are preserved unchanged. This extends ADR 0087 Decision 4's
   isolation pattern to a third, independent namespace rather than superseding it. `[binding]`
4. `apps/dgfy-admin` builds into its own container image with its own Dockerfile under
   `infrastructure/docker/dgfy-admin/`, scoped to only the `VITE_*`/`SENTRY_*` build args its own
   code reads, its own compose service entry, and a curl-based health check — following the exact
   pattern ADR 0087 Decision 3 established for OPIS. It is added to the ~8 GitHub Actions
   workflow files that currently hardcode the four-app enum/path-filter list
   (`shared-changed-paths.yml`, `deploy-frontend.yml`, `deploy.yml`, `deploy-main.yml`,
   `deployment-orchestrator.yml`, `pr-frontend-build-checks.yml`, `pr-frontend-lint-checks.yml`,
   `pr-checks.yml`, `promotion-quality-gate.yml`). Deployment ownership (who dispatches/monitors
   its deploys) follows the same process already used for the other four apps — no new deployment
   process is introduced. `[binding]`
5. `skupervisor.dgfy.ph/admin` keeps working during the compatibility window described in epic
   #352, registered as a compatibility seam under ADR 0035 (owner, tests, rollback, removal
   criteria tied to #352's own completion condition). No retirement date for
   `skupervisor.dgfy.ph` is set by this ADR — that stays #352's decision, deliberately deferred,
   matching #350's own stated non-goal. `[default]`
6. `apps/dgfy-admin` never gets its own copy of `packages/web-core`'s `node_modules` or test
   runner, consistent with ADR 0087 Decision 6 — its app-owned tests run from `apps/dgfy-admin`
   like the other four apps. `[default]`

## Consequences

- **Five lockfiles to keep in sync**, not four. `security/audit-allowlist.json` gains a
  per-app-tree section for `dgfy-admin`.
- **Deploy/CI inputs grow by one app** across the ~8 workflow files named in Decision 4, mirroring
  the exact growth ADR 0087 already recorded for OPIS's addition.
- **Routing config has no single source of truth** (five separate files, two confusingly similar
  staging names — `stage.dgfy.ph` vs. `staging.dgfy.ph`) — real drift risk on every future
  `/admin`-affecting change. Not resolved by this ADR; flagged as a candidate follow-up (e.g. a
  generated/templated routing fragment shared across the five files) rather than solved here.
- **`apps/dgfy-ims` loses its `/admin/*` routes and ~6,650 lines of admin pages**, shrinking
  further — consistent with the existing "IMS is low-priority for new investment" direction
  (#1739), though that is a side effect of this decision, not its purpose.
- **No single Platform Admin login across hosts.** A Platform Admin who needs to work from both
  `dgfy.ph/admin` and `pos.dgfy.ph/admin` logs in twice. This is an explicit, accepted UX
  trade-off from Pat's direction, not an oversight — the alternative (shared-domain cookie) is the
  one thing #350 itself flagged as needing a security review this ADR does not perform.
- **One-time admin re-login on cutover.** Moving the admin cookie from `sku_admin_session` to an
  isolated `admin_*` namespace invalidates existing Platform Admin sessions on deploy; this is a
  single planned, bounded event, not an ongoing cost.
- **ADR 0087 Decision 1's text no longer literally holds for one path.** Every other path on every
  app's origin is unaffected; only `/admin/*` is now served by a different app than the one
  otherwise owning that host. Future ADRs or audits reading "each app served directly from its
  own root-level path" should read it as amended by this ADR's Decision 2 for that one path
  prefix.

## Validation

- `npm run build:admin` (new script) plus the existing per-app builds, to confirm shared-trunk
  reachability is unaffected by moving admin-only code out of `packages/web-core`.
- `docker build -f infrastructure/docker/dgfy-admin/Dockerfile .` plus a `docker run` + `curl`
  smoke test.
- A local/staging nginx smoke test hitting `/admin` on all four target hosts, confirming
  `location /admin` forwards correctly while every other path on each host is unaffected.
- Focused suites: admin cookie-namespace isolation (`admin_*` never touches `sku_*`/`opis_*`),
  ADR 0047's permission matrix/RBAC/audit behavior unchanged, CSRF enforcement on the new
  namespace, a direct-API-access denial test independent of host/path.
- `npm run check:architecture`, `npm run check:adr`, `npm run lint:docs`, `npm run check:compliance`,
  `npm run check:workspace-hygiene`, `npm run test:app-versions`.

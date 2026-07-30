---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-07-28
applies_to: deploy_operations
topic: production_readiness_posthog_and_nginx_drift
---

# Production Readiness: PostHog `/ingest` Proxy & Connection Budget

## Update (2026-07-28, later same day): nginx reconciliation done, `/ingest` live on prod/beta

PROD's `VITE_POSTHOG_*` variables were set (07:10 UTC) before the nginx reconciliation below had happened, which surfaced as Sentry issue `DGFY-STORE-1` on `dgfy.ph` (`SyntaxError: Unexpected token '<'` — `/ingest/array/.../config.js` falling through to the SPA's `index.html`).

Fixed: `infrastructure/docker/nginx/nginx.conf.template` now carries the dual-domain (`_PROD`) structure from the live server (reconciled, so the repo is the source of truth again) plus `/ingest/static/`, `/ingest/array/`, `/ingest/` on all 6 domain server blocks (beta + prod × skupervisor/POS/storefront). Deployed to `dgfy-gha:/opt/dgfy-platform/nginx/nginx.conf.template` and applied via `docker compose restart nginx` (a plain `reload` does not re-run the `envsubst`-on-templates entrypoint step for this containerized topology — a restart is required to pick up template changes). Verified live: `/ingest/static/surveys.js` and `/ingest/array/<key>/config.js` both return `application/javascript` on `dgfy.ph` and `pos.dgfy.ph`; `/api`, storefront root, `skupervisor.dgfy.ph`, `pos.dgfy.ph`, and `beta.dgfy.ph` all unaffected. The hand-added `bar.space.com.ph` special-case redirect in the storefront block was carried over verbatim (that domain currently resolves to unrelated infrastructure, not this server, so it wasn't exercisable in this verification either way).

The rest of this document (GitHub Actions variables, connection budget) describes the state as found earlier that day and is otherwise still accurate.

---

## Purpose

`docs/ops/STAGE_CONNECTION_EXHAUSTION_AND_CSP_INCIDENT_2026-07-27.md` fixed MySQL connection exhaustion and the PostHog CSP block on `stage.dgfy.ph`. Both are documented there as production-readiness risks, not staging-only quirks. This doc is the checklist for what's actually needed before either fix is real in **PROD** and **BETA** — gathered by directly inspecting those environments' live GitHub Actions configuration and servers (read-only; nothing in PROD/BETA was changed while gathering this).

The single most important finding: **do not copy `infrastructure/docker/nginx/nginx.conf.template` onto the production/beta server as-is.** It has drifted from what's actually deployed there in a way that would break production routing. See "Nginx" below before touching anything.

---

## GitHub Actions — Variables to add

Checked via `gh variable list --env <ENV>`. Current state, PostHog-relevant rows only:

| Variable | DEV | STAGING | BETA | PROD |
|---|---|---|---|---|
| `VITE_POSTHOG_ENABLED` | — | `true` | — | — |
| `VITE_POSTHOG_HOST` | — | `/ingest` | — | — |
| `VITE_POSTHOG_KEY` | — | `phc_BhKFdf2tn36...` | — | — |

**PROD and BETA have none of these set today — PostHog is completely inactive on both.** To enable it, add to each environment:

- `VITE_POSTHOG_ENABLED=true`
- `VITE_POSTHOG_HOST=/ingest` — **must be exactly this**, not a direct PostHog host. This is the literal mistake made on STAGING (inherited from before this fix, never updated) that caused the original rollout to silently no-op there: `analyticsClient.js` only falls back to `/ingest` when this variable is *unset*; setting it to `https://eu.i.posthog.com` (or leaving an old value in place) silently defeats the proxy and CSP errors return.
- `VITE_POSTHOG_KEY=<project key>` — **do not reuse the staging project's key** (`phc_BhKFdf2tn36...`, PostHog project "DGFY Staging", id 233222) for production traffic unless that's a deliberate choice. Obtain the correct production PostHog project's key first.
- Optional, currently unset in *every* environment: `VITE_POSTHOG_ENVIRONMENT`. Without it, `analyticsClient.js` falls back to the Vite build `MODE`, which doesn't distinguish stage/beta/prod as cleanly as an explicit value would. Not a blocker, worth setting alongside the above for cleaner PostHog-side segmentation.

## GitHub Actions — Secrets

**None needed for PostHog.** The project key is a client-visible token by design — PostHog's own docs treat it as public, and it's correctly modeled as a `vars` value (not a secret) in `deploy-frontend.yml`, consistent with how STAGING already has it. Do not add it as a GitHub secret; that would just make it harder to read back later for no security benefit.

### Adjacent, unrelated gap found while checking (not required for PostHog, flagging since it was directly visible)

Sentry is in the same situation: `VITE_SENTRY_*` variables and the `SENTRY_AUTH_TOKEN` secret exist **only** on STAGING. DEV/BETA/PROD have none — error tracking is currently off everywhere except staging. Out of scope for this doc; noted so it isn't mistaken for something this work already covered.

---

## Nginx

### Topology (confirmed live, read-only)

Production and beta run on one shared host (`ssh dgfy` / `ssh dgfy-gha`, both land on the same box), one shared docker-compose stack at `/opt/dgfy-platform`, and **one shared containerized `nginx` service** — unlike `stage.dgfy.ph`, which is fronted by an untracked *host* nginx (fixed in the 2026-07-28 follow-up to the incident doc). So in principle, prod/beta don't have stage's "wrong nginx" problem: `infrastructure/docker/nginx/nginx.conf.template` **is** the file that matters here.

```
dgfy-platform-backend-1         backend:beta    (shared backend, single DB)
dgfy-platform-frontend-beta-1   frontend:beta   (beta.dgfy.ph / skupervisor.beta.dgfy.ph / pos.beta.dgfy.ph)
dgfy-platform-frontend-1        frontend:latest (dgfy.ph / skupervisor.dgfy.ph / pos.dgfy.ph)
dgfy-platform-nginx-1           nginx:1.27-alpine   <- routes both sets of domains
dgfy-platform-certbot-1
dgfy-platform-mysql-1
dgfy-platform-redis-1
```

### The actual blocker: the deployed template has drifted from the repo

`diff` between `/opt/dgfy-platform/nginx/nginx.conf.template` (live) and `infrastructure/docker/nginx/nginx.conf.template` (repo, as of the `/ingest` commit) shows two independent, unmerged divergences:

1. **Live-only:** every server block's `server_name` and each domain-specific block are duplicated for a **second, `_PROD`-suffixed set of domain variables** (`${SKUPERVISOR_DOMAIN_PROD}`, `${POS_DOMAIN_PROD}`, `${STOREFRONT_DOMAIN_PROD}`), added directly on the server around the 2026-07-20 dgfy.ph cutover (per `/opt/dgfy-platform/.env`: `STOREFRONT_DOMAIN=beta.dgfy.ph` / `STOREFRONT_DOMAIN_PROD=dgfy.ph`, etc.) to let one nginx container front both beta and production. **This was never merged back into the repo.**
2. **Repo-only:** `include /etc/nginx/custom-storefronts/*.conf;` (the custom-storefront-domains feature) exists in the repo template but is **absent from the live file**.

**Copying the repo template over the live file as-is would delete the entire `_PROD` block set — taking down `dgfy.ph`, `skupervisor.dgfy.ph`, and `pos.dgfy.ph` production routing.** This must be reconciled before the `/ingest` blocks (or any other repo-side nginx change) can be safely synced to this server. Recommended approach: update the repo's `nginx.conf.template` to incorporate the dual-domain (`_PROD`) structure that's actually running in production — making the repo the source of truth again — rather than hand-patching the live file a second time. Treat this reconciliation as its own piece of work, separate from and prerequisite to the PostHog rollout.

### What to add once reconciled

The same three location blocks already written and validated in the repo template (`infrastructure/docker/nginx/nginx.conf.template`) and live-verified on stage (`infrastructure/nginx-host/stage.dgfy.ph.conf`):

| path | upstream |
|---|---|
| `/ingest/static/` | `eu-assets.i.posthog.com` → `/static/…` |
| `/ingest/array/` | `eu-assets.i.posthog.com` → `/array/…` |
| `/ingest/` | `eu.i.posthog.com` → `/…` |

Apply to the storefront/POS/skupervisor blocks for both the beta and prod domain sets (6 blocks total, given the dual-domain structure above); the `api.*` blocks are backend-only and don't need it.

### The deploy pipeline does not sync this file automatically

Confirmed: `infrastructure/docker/docker-compose.yml`'s own header comment states the `nginx/` directory must be **manually copied** alongside the compose file — no CI workflow does this. Merging an `nginx.conf.template` change to `main` will build and push new backend/frontend images and (per `deploy-production.yml`) deploy them, but the **nginx container will keep running its old, already-copied config** until someone manually re-copies the file and reloads. This is the same class of gap that produced the stage host-nginx surprise, just for the containerized case. Not fixing the pipeline itself here — documenting the required manual step:

```bash
# after infrastructure/docker/nginx/nginx.conf.template changes land on main:
scp infrastructure/docker/nginx/nginx.conf.template dgfy-gha:/opt/dgfy-platform/nginx/nginx.conf.template
ssh dgfy-gha 'cd /opt/dgfy-platform && docker compose exec nginx nginx -t && docker compose exec nginx nginx -s reload'
```

### DEV — dormant, not urgent

`dev.dgfy.ph` (on `sieitz-dgfy-local`, the same box as `stage.dgfy.ph`) is also fronted by an untracked host nginx (`/etc/nginx/sites-available/dgfy-dev-staging`) with no `/ingest` blocks. Since DEV has no `VITE_POSTHOG_*` variables set (table above), PostHog is inactive there and this is latent, not blocking. Revisit if/when PostHog is turned on for DEV.

---

## Connection budget (from the original incident, re-checked against prod/beta)

Confirmed live on the shared prod/beta MySQL: `max_connections = 151` (MySQL's implicit default — no explicit override), and **no** `DB_MAX_CONNECTIONS` / `LANDLORD_DB_POOL_MAX` / `TENANT_DB_POOL_MAX` / `TENANT_MAX_CACHED_CONNECTIONS` set in `/opt/dgfy-platform/.env`. The app-side budget introduced in the incident fix (`backend/src/config/connectionBudget.js`) computes a 170-connection worst case at its defaults — same as staging's original problem, just not yet triggered because that code is currently only on `develop`/`staging`, not `main`.

**Before (or immediately after) that code reaches production:** either raise MySQL's `max_connections` on this server (mirroring the stage fix: pinned explicitly, with headroom) or set `DB_MAX_CONNECTIONS` alongside a lower `TENANT_MAX_CACHED_CONNECTIONS`/pool sizing to fit under 151. Otherwise the very first deploy that includes `connectionBudget.js` will log `[ConnectionBudget] OVER BUDGET` at boot on every restart — which is the intended loud signal, not a bug, but worth doing deliberately rather than discovering it in a boot log.

These two checks are already recorded as gates in `docs/ops/PRODUCTION_CHECKLIST.md`'s "Post-Deploy Proof" section; this doc is what satisfies them for the PostHog/nginx side specifically.

---

## Related

- `docs/ops/STAGE_CONNECTION_EXHAUSTION_AND_CSP_INCIDENT_2026-07-27.md` — the original incident and its 2026-07-28 follow-up (the first `/ingest` rollout's silent no-op on stage, and how it was fixed there).
- `docs/ops/PRODUCTION_CHECKLIST.md`
- `infrastructure/nginx-host/stage.dgfy.ph.conf` — the pattern to follow for reconciling the prod/beta template (tracked host-nginx source, `/ingest` blocks already applied and verified).

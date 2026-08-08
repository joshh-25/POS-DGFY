---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-08-08
applies_to: deploy_operations
topic: dev_staging_environment_health_2026_08_08
---

# Dev/Staging Environment Health (2026-08-08)

## Summary

`dev.dgfy.ph` was reported unreachable — a **white page**, distinct from the browser
connection error the office link's known flakiness usually produces. Investigation found
the app, containers, and VM are all healthy; the fault is in the office network path
upstream of the VM. Two unrelated config defects were found along the way and are
recorded here too. No code caused any of this — the same-day merge (#295/#296/#300/#301/
#302) was independently verified clean against live dev data (see Finding 1's last
paragraph).

**Discriminator for next time**, since this looked identical to the known issue at first:

> A browser connection error (`ERR_CONNECTION_REFUSED`/`ERR_CONNECTION_TIMED_OUT`) means
> the office link itself is down — the known, already-tracked flakiness.
> **A white page with `net::ERR_CONTENT_LENGTH_MISMATCH` (200 OK) means the link is up
> but truncating large responses** — a different fault, diagnosed below. Tell them apart
> with:
> ```bash
> curl -s -D - -o /tmp/b https://dev.dgfy.ph/assets/<entry>.js | grep -i content-length
> wc -c < /tmp/b   # mismatch vs the header above = truncation, not a link outage
> ```

## Finding 1: office edge truncates responses over ~109 KB (the white page)

### Symptom

`dev.dgfy.ph` loads a blank page. Chrome console:

```
GET https://dev.dgfy.ph/assets/index-CEEBht7d.js net::ERR_CONTENT_LENGTH_MISMATCH 200 (OK)
GET https://dev.dgfy.ph/assets/index-Cisv1V69.css net::ERR_CONTENT_LENGTH_MISMATCH 200 (OK)
GET https://dev.dgfy.ph/assets/vendor-maplibre-BFPVEsmm.js net::ERR_CONTENT_LENGTH_MISMATCH 200 (OK)
```

The response status and headers are correct — only the body is short. The main JS bundle
never finishes downloading, so the SPA never boots.

### Evidence

Measured from the public internet against `dev.dgfy.ph`:

| Asset | Declared (`Content-Length`) | Received | Result |
|---|---|---|---|
| `vendor-qrcode-*.js` | 25,815 | 25,815 | OK |
| `vendor-icons-*.js` | 55,704 | 55,704 | OK |
| `index-*.css` | 167,176 | 109,258 | **truncated** |
| `vendor-maplibre-*.js` | 1,055,621 | 109,242 | **truncated** |
| `index-*.js` (entry bundle) | 1,860,807 | 109,242 | **truncated** |

The break point clusters right around 109 KB regardless of the asset's real size —
consistent with a fixed transfer/buffer cap somewhere in the path, not a random drop.

Isolating the layer:

- **Inside the VM** (`ssh sieitz-dgfy-remote`, `curl` against VM nginx on `127.0.0.1:80`):
  full **1,860,807 bytes, 3/3 tries**, clean every time.
- **From the public internet**: truncated at ~109 KB, every try, on **both HTTP and
  HTTPS** — ruling out the TLS terminator specifically.
- **Prod** (`dgfy.ph`, hosted on Linode, an entirely separate network path): full
  1,856,213 bytes, clean.
- **`stage.dgfy.ph`** truncates too, at a *varying* point across tries (141,098 /
  160,090 / 117,682 bytes) — same class of fault, same shared office edge, less
  deterministic than dev (possibly load- or timing-dependent on whatever device is doing
  the truncating).

All containers are `healthy`, `restarts=0`:

```
dgfy-platform-dev-backend-1      Up 2h   (healthy)  restarts=0
dgfy-platform-dev-frontend-1     Up 2h   (healthy)  restarts=0
dgfy-platform-staging-backend-1  Up 58m  (healthy)  restarts=0
dgfy-platform-staging-frontend-1 Up 58m  (healthy)  restarts=0
```

`dev-backend`'s own logs show successful DB connections and a real login during the
incident window — the backend was never down. VM nginx returns the correct
`Content-Length: 1860807` header on every request; the file on disk is the right size.

**Conclusion: not the app, not the containers, not the VM's nginx, not the same-day
code deploy.** The fault is upstream of `vm-sieitzstaging` (`10.123.32.26`) — the office
router/NAT/port-forward or an ISP-side middlebox doing the truncating.

### Why this was hard to catch before

Small responses (the 2.2 KB HTML shell, the `/api/v1/health` JSON) always succeed, so
uptime checks and a quick glance at the site both look fine — only large asset transfers
fail. And nothing reaches Sentry: the failure is a browser-level failed module load,
before the app's own JS — and Sentry's own init — ever executes.

### Root cause

Not identified beyond "somewhere between the office's public IP and its internal
network." `dev.dgfy.ph`, `stage.dgfy.ph`, `api.dev.dgfy.ph`/`api.stage.dgfy.ph`, and the
`pos.*`/`skupervisor.*` dev/stage subdomains all resolve to `38.10.89.116` (the office
static IP), which port-forwards to `vm-sieitzstaging` internally. `dgfy.ph` resolves to
`172.105.122.32` (Linode) — a completely different path, which is why prod is unaffected.

### Fix — not ours to make from here; interim mitigations to consider

Owner is whoever administers the office router/firewall. Suggested next steps:

1. Inspect the router/port-forward config and any ISP-provided modem/middlebox for a
   transfer-size or buffer cap around 109 KB.
2. **Interim mitigation**: route `dev.dgfy.ph`/`stage.dgfy.ph` through the existing
   Cloudflare tunnel pattern instead of the raw port-forward — several other hosts in
   this team's SSH config already use `cloudflared access ssh` tunnels, so the mechanism
   is already in house; the same approach (a `cloudflared` tunnel terminating HTTP)
   would bypass whatever in the port-forward path is truncating.
3. **Interim mitigation**: serve built static assets (the `/assets/*` bundle) from a CDN
   or object store instead of the office link, leaving only API traffic — which is
   small-response and unaffected — on the office path.

### Ruled out as a cause

The same-day merge to `develop` (#295 PayMongo/POS hardening, #296 storefront redesign,
#300 storefront-locations fan-out fix, #301 backend Sentry visibility, #302 docs) did not
cause this. Specifically verified: the `#300` fix depends on discovery responses carrying
`active_location_snapshot` — checked live against `dev.dgfy.ph`'s real discovery
endpoint, 5/5 sampled stores returned a populated snapshot as expected.

## Finding 2: `api.dev.dgfy.ph` / `api.stage.dgfy.ph` 502 — dormant upstream, already known

### Symptom

Reproducible **from inside the VM** (not edge-related, a genuine config issue):

```
Host: api.dev.dgfy.ph   -> http=502
Host: api.stage.dgfy.ph -> http=502
```

**Not a functional gap today**: current architecture is same-origin `/api` (proxied to
the real backend on `:5000`/`:6000`), which is what every app actually calls and is
unaffected by this. `api.*` is planned infrastructure for later, intentionally dormant
while the platform settles on same-domain `/api` — see Fix below.

### Root cause

Already documented in the tracked nginx config itself —
`infrastructure/nginx-host/dev.dgfy.ph.conf:15-17`:

> `api.dev.dgfy.ph`'s upstream (:5100) has no running service behind it as of 2026-08-07
> -- apps/dgfy-api was removed from the repo (ADR 0032); this block is dead until/unless
> that service returns.

`apps/dgfy-api` was introduced by
[ADR 0032](../architecture/adr/0032-standalone-dgfy-api-service.md) (2026-07-06) as a
standalone mobile-auth service, then later removed from the repo entirely
(`7834ef8d`, "chore: remove apps/dgfy-api and apps/dgfy-migration-runner"). The
`api.dev.dgfy.ph` vhost (`set $backend_upstream localhost:5100`) and its staging
counterpart `api.stage.dgfy.ph` (`localhost:6100`) both still point at that service's old
port. Nothing has listened there since the removal.

**Confirmed unused today**: the storefront/POS/skupervisor SPAs all call the same-origin
`/api` path, not `api.*` — that path works fine, as shown by dev/stage's
`/api/v1/health` returning 200 throughout this investigation. No `VITE_API_BASE_URL` or
Android build flavor in this repo currently references
`api.dev.dgfy.ph`/`api.stage.dgfy.ph`.

### Fix — leave as-is; correct the port when the service returns

Per the repo owner: `api.*` is not being removed — it's earmarked for a future
standalone API surface, and the platform is deliberately staying on same-origin `/api`
for now. **Do not remove the vhost blocks.** The only actionable item here is that the
upstream port (`:5100`/`:6100`) is stale from the old `apps/dgfy-api` service and should
be corrected to whatever port the next iteration of that service actually binds, once
one exists — not urgent before then, since nothing depends on the route today.

## Finding 3: DEV MySQL is under-provisioned relative to staging and prod

### Symptom

`dev-backend` logs this warning on every boot:

```
[ConnectionBudget] OVER BUDGET: 20 tenants x 7 + 30 landlord = 170,
but max_connections is 151. Under load this surfaces as "Too many connections"
and storefront requests failing with TENANT_CONTEXT_MISSING / INTERNAL_ERROR.
```

### Evidence

| Env | `max_connections` | Worst-case budget (`connectionBudget.js`) | Status |
|---|---|---|---|
| DEV | **151** (MySQL default, never overridden) | 170 | **over by 19** |
| STAGING | 200 | 170 | within budget |
| PROD | 200 (`DB_MAX_CONNECTIONS=200`) | 170 | within budget |

DEV is the only environment still at MySQL's implicit default. Not currently biting —
`Connection_errors_max_connections=0`, `Max_used_connections=74` of 151 at check time —
so this is a **latent** risk, not the cause of today's incident. But it is the exact
mechanism behind the prod incident `DGFY-STORE-X` (see
[`SENTRY_TRIAGE_2026-08-08.md`](./SENTRY_TRIAGE_2026-08-08.md)) and the
[2026-07-27 staging connection-exhaustion incident](./STAGE_CONNECTION_EXHAUSTION_AND_CSP_INCIDENT_2026-07-27.md)
— DEV is one connection burst away from the same failure mode staging already hit once.
Also noted, unexplained: `Aborted_connects=1057` on DEV vs `0` on staging at the same
check — worth a separate look, not diagnosed here.

See also
[`PRODUCTION_READINESS_POSTHOG_AND_NGINX_DRIFT.md:112-114`](./PRODUCTION_READINESS_POSTHOG_AND_NGINX_DRIFT.md)
for the equivalent prod-side gap this doc already tracked before prod was raised to 200.

### Fix

Raise DEV's MySQL `max_connections` to 200 to match staging and prod (preferred, for
parity), or set `TENANT_MAX_CACHED_CONNECTIONS`/`TENANT_DB_POOL_MAX` in
`/opt/dgfy-dev/.env` low enough to fit the existing 151 default. Either way, restart the
DEV MySQL container after applying and confirm the boot log flips to
`[ConnectionBudget] … within max_connections …`.

## Not in scope / explicitly not done here

- No code changes — nothing in the same-day merge caused any of this.
- No changes made to the office network, the VM's nginx config, or any `.env` file — all
  three fixes above are infrastructure actions for their respective owners to make
  deliberately, not something to apply as a drive-by from this investigation.
- The paused `staging` → `release/2026-08-08` → `main` promotion (see
  [`SENTRY_TRIAGE_2026-08-08.md`](./SENTRY_TRIAGE_2026-08-08.md)) is unaffected either
  way by this investigation and remains paused pending a separate decision.

## Related

- `docs/ops/STAGE_CONNECTION_EXHAUSTION_AND_CSP_INCIDENT_2026-07-27.md` — same connection-budget failure mode, previously hit on staging.
- `docs/ops/STAGING_TO_MAIN_PROMOTION_INCIDENT_2026-07-28.md` — prior promotion incident, same "only surfaces once code reaches an environment closer to production" shape.
- `docs/ops/PRODUCTION_READINESS_POSTHOG_AND_NGINX_DRIFT.md` — prod's own connection-budget headroom fix.
- `docs/ops/SENTRY_TRIAGE_2026-08-08.md` — same-day Sentry triage; `DGFY-STORE-X` is the same connection-budget failure mode as Finding 3, on prod.
- `infrastructure/nginx-host/dev.dgfy.ph.conf`, `infrastructure/nginx-host/stage.dgfy.ph.conf` — tracked source of truth for the host nginx vhosts referenced in Finding 2.
- `backend/src/config/connectionBudget.js` — the worst-case budget computation and boot-time warning referenced in Finding 3.

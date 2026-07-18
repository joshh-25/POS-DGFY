---
status: draft
authority_level: operational
owner: database
last_reviewed: 2026-07-14
applies_to: dgfy_data_migration_rehearsal
topic: dgfy_progressive_cutover_rehearsal
---

# DGFY Progressive Cutover Rehearsal Runbook

This runbook documents the **production-shaped, full-stack** rehearsal used to
prove the old→new DGFY migration against a faithful clone of `beta.dgfy.ph`,
one clone at a time. It is the two-stage counterpart to
`docs/database/dgfy-migration-rehearsal.md` (the authoritative *disposable-schema*
loop) and supersedes the uncommitted draft
`refactor-do-not-commit/local-test/REHEARSAL-METHODOLOGY.md`, which covered only
the migration half and assumed the clone was already beta-faithful.

The governing insight this runbook adds: **a migration proof is only as
trustworthy as the clone it runs against.** So Stage 1 establishes a clone that
demonstrably behaves like beta *before* Stage 2 layers the new API and migration
on top of it. It feeds Phase 7 / `CMP-05` (rehearsal runtime, realistic
data-volume evidence, operator-visible reports).

> **Harness location.** The rehearsal harness itself
> (`docker-compose.yml`, `import-db.sh`, `gen-manifest.sh`, `clone-local-test.sh`,
> `.env` / `.env.compose`, the seeded `app_databases.sql` dump) lives uncommitted
> at `refactor-do-not-commit/local-test/` because it carries a real restored
> production data snapshot and local credentials. This runbook (committed)
> documents the *method*; the harness (uncommitted) carries the *material*.

## Governing Docs and ADRs

- `docs/START_HERE.md` — documentation lookup order (authoritative).
- `docs/database/dgfy-migration-rehearsal.md` — the disposable-schema loop this
  extends; its command contract (env vars, manifest shape, dry-run/apply/verify
  semantics) is authoritative and **not restated here**.
- `docs/database/dgfy-data-migration-map.md` — source→target field mapping and
  reason-code taxonomy; also the authoritative list of **out-of-scope legacy
  tables** (product/inventory/POS/fiscal/storefront), which bounds what Stage 2
  can currently verify (see §Known Coverage Gap).
- `docs/architecture/adr/0003-migration-facade-strategy.md` — beside-legacy
  Strangler Fig strategy; legacy `sku_*` is never mutated and stays fully live.
- `.planning/phases/07-cutover-runbook-and-deferred-domain-split/07-CONTEXT.md`
  — Phase 7 scope this rehearsal informs.

**ADR impact:** Not needed. This runbook documents an operational rehearsal
method over existing locked decisions; it introduces no new architectural
decision.

## Safety Posture

- **Beside-legacy, nothing repoints.** The clone brings the new `dgfy-api` and
  `dgfy_*` schemas up *alongside* the still-running base platform. No backend is
  changed to use the new API; the legacy frontends keep talking to the legacy
  backend. Legacy `sku_*` is never mutated (the runner captures an
  `information_schema` fingerprint baseline and `verify` fails closed on any
  drift).
- **One clone at a time.** Each clone binds fixed host ports (see §Port & Domain
  Map). Run exactly one; tear down before starting the next.
- **No production credentials.** The stack always overrides DB/JWT creds to
  local-only throwaway values via the compose `environment:` blocks. The real
  `.env` production credentials are never used by the running containers, and no
  secret value appears in this committed doc — concrete values live only in the
  uncommitted `.env.compose`.
- **`data apply` is destructive** and requires `--confirm-destructive`, exactly
  as in the disposable-schema runbook. No weaker path exists.

## Stage 0 — Operator Prerequisites (once)

> **Docker context.** All rehearsal commands run against the `lima-dgfy-dev`
> Lima VM context, **not** the default Docker. Either export it once for the
> shell —
> ```bash
> export DOCKER_CONTEXT=lima-dgfy-dev
> ```
> (every harness script honours `DOCKER_CONTEXT`) — or pass
> `--context=lima-dgfy-dev` on each `docker` invocation. The command blocks
> below assume `DOCKER_CONTEXT=lima-dgfy-dev` is exported. Host ports
> (`3306`, `5000`, `5100`, `5173`–`5175`) must be published from that VM to the
> host `localhost` for the tunnels to reach them.

1. **Registry access.** `docker login ghcr.io` — the base-platform images
   (`backend` / `dgfy-api` / `frontend`) are pulled from a private registry at
   the `:develop` tag, i.e. whatever is currently deployed to beta. The
   migration-runner image is built locally, not pulled.
2. **Cloudflare tunnels.** Point the operator's tunnel domains at the local
   ports so the pulled `:develop` frontends — which have their production
   `VITE_*` URLs baked in — resolve back to the local stack and close the loop.
   See §Port & Domain Map for the required mapping.
3. **Harness env present.** Ensure `refactor-do-not-commit/local-test/` has both
   `.env` and `.env.compose` (`.env.compose` is `.env` with literal `$` doubled
   to `$$`; regenerate with `sed 's/\$/\$\$/g' .env > .env.compose`).
4. **Ports free.** The clone binds host ports `3306`, `5000`, `5100`,
   `5173`–`5175`. Nothing else may hold them. Retire any prior clone stack
   (`docker compose -p dgfy-local-test down -v`) first.

## Stage 1 — Beta-Parity Clone

**Goal:** stand up a clone that behaves like `beta.dgfy.ph` and *prove it does*,
so it can serve as the known-good baseline for every subsequent clone.

```bash
# from refactor-do-not-commit/local-test/  (DOCKER_CONTEXT=lima-dgfy-dev exported)
./clone-local-test.sh 1          # -> ../local-test-1 (pristine)
cd ../local-test-1

docker compose --env-file .env.compose up -d mysql redis
./import-db.sh                   # seed legacy sku_* snapshot; confirm tenant count (~41)
# ./import-uploads.sh            # optional — only if this attempt needs real uploaded files
docker compose --env-file .env.compose up -d   # full base platform (backend/dgfy-api/frontend/nginx)
```

Then run the **Beta-Parity Checklist** below against the tunnel domains, item by
item, recording `matches beta? Y/N + notes` for each. Any `N` is triaged: fix
the compose/clone config, or record it as an accepted, understood deviation.
Iterate until the operator deems the clone "working like beta."

### Beta-Parity Checklist

Cross-cutting (all surfaces):

- [ ] `GET http://localhost:5000/api/v1/health` returns 200 (not 503).
- [ ] `GET http://localhost:5100/v1/health` (new API) returns 200.
- [ ] Each tunnel domain resolves to the correct surface (see map below).
- [ ] Frontend → backend calls succeed with no CORS error in the browser console.
- [ ] Session persists across requests (Redis-backed) — a login survives a reload.
- [ ] Uploaded images/media render (only if `import-uploads.sh` was run).

IMS / SKUpervisor surface (`<ims-tunnel-domain>` → `:5173`):

- [ ] Business owner / staff account login with real migrated-tenant credentials.
- [ ] Business/tenant selection resolves to the right `sku_tenant_*` DB.
- [ ] Items / inventory list loads with Food items and stock quantities.
- [ ] Add / edit an item persists.
- [ ] A stock movement / adjustment records.
- [ ] Suppliers and purchase orders are visible.
- [ ] Report snapshots load.

POS surface (`<pos-tunnel-domain>` → `:5174`):

- [ ] Owner login → business selection → POS terminal loads.
- [ ] Catalog items appear with prices; add to cart, adjust qty, subtotal updates.
- [ ] Order method selection (Dine In / Takeout / Pickup / Delivery).
- [ ] Checkout / payment flow behaves as on beta (cash tendered, change calc).
- [ ] Receipt renders.
- [ ] Shift open/close + cash-drawer event records.
- [ ] Online orders list loads; confirm / reject / preparing / ready actions work.
- [ ] Purchase history / reports load.

Storefront surface (`<store-tunnel-domain>` → `:5175`, root beta):

- [ ] Map of storefronts loads (OpenFreeMap tile proxy via nginx works).
- [ ] Open a storefront page; catalog/menu displays with sold-out indicators.
- [ ] Add to cart, view cart & subtotal.
- [ ] Create account / login / continue-as-guest as on beta.
- [ ] Select delivery or pickup; now vs. scheduled.
- [ ] Payment method selection.
- [ ] Place an order; order-status flow advances.

### Recording the Baseline

When the operator declares parity, capture **every deviation found and its
resolution** into a short `STAGE1-BASELINE.md` inside the clone dir (kept with
the attempt, uncommitted). This becomes the checklist of known-good behavior and
known-accepted quirks that every later clone is measured against — so a Stage 2
clone that diverges from *this baseline* (not from a fuzzy memory of beta) is a
real signal.

## Stage 2 — New-API Migration Rehearsal

**Goal:** on a fresh clone identical to the Stage 1 baseline, wire in the new
`dgfy-api` + run the migration, and verify via **direct database checks** that
the migration retained what matters. The GUI is *not* the verification surface
here — the legacy frontends still talk to the legacy backend, so a successful
migration is invisible in the UI; the evidence is in the `dgfy_*` schemas.

1. **Preserve Stage 1 data, tear down.** Bring the good clone down without
   discarding its data volume if it must be reused; otherwise keep
   `../local-test-1/reports/` and `STAGE1-BASELINE.md` as the record.
2. **Fresh identical clone.** `./clone-local-test.sh 2`; bring it up exactly as
   Stage 1 and confirm it reproduces the baseline (spot-check a few checklist
   items) before changing anything. *One clone at a time.*
3. **Generate + review the manifest.** `./gen-manifest.sh` writes
   `migration/manifest.json` + `migration/business-db-names.txt` read-only from
   the legacy `tenants` table. **Review** it (and the "SKIPPED for blank owner"
   list) before proceeding — the runner never auto-discovers tenants.
4. **Run the migration sequence** (containerized one-shot under the `migrate`
   profile, or `node src/cli.js` directly against the clone's MySQL). Follow the
   command contract in `docs/database/dgfy-migration-rehearsal.md` §4:
   `verify-continuity` → `schema migrate --confirm-destructive` →
   `data dry-run` → `time … data apply --confirm-destructive` (record the
   wall-clock — `CMP-05` SC1 evidence) → second `data apply` (idempotency) →
   `verify`.
5. **Verify via DB checks** (the real acceptance surface):

   - [ ] `dgfy_core.accounts` row count matches migrated `dgfy_accounts`
         (net of explicitly-skipped rows in the dry-run/apply findings).
   - [ ] `dgfy_core.businesses` has one row per manifest tenant, and
         `business_database_registry` exactly one `active` row per tenant.
   - [ ] Each `dgfy_business_*` holds `staff_accounts` / `locations` /
         `terminal_identities` / `account_staff_assignments` per the migration map.
   - [ ] Second `data apply` wrote **zero** new rows and no second
         `legacy_id_map` row (idempotent / re-runnable).
   - [ ] `verify` reports `data_migration.ok: true` with zero open findings
         (or every finding is an explicitly reviewed, accepted item).
   - [ ] `verify`'s `legacy_non_mutation` fingerprint is unchanged — legacy
         `sku_*` untouched (beside-legacy honoured).
   - [ ] Legacy surfaces still work post-migration (re-run a few Stage 1
         checklist items) — proves the migration didn't disturb the live system.

6. **Preserve evidence, tear down.** Keep `reports/` (+ `reports/evidence/`) as
   the attempt record; `docker compose down`.

## Known Coverage Gap (as of 2026-07-14)

Stage 2 currently verifies the **accounts / tenancy / staff / location /
terminal** backbone only — that is the full extent of the migration-runner's
mappers (`apps/dgfy-migration-runner/src/data/mappings.js`). The following legacy
domains carry real data in the dump but have **no source-side mapper yet**, so
Stage 2 cannot yet prove they were retained:

| Domain | Legacy source (rows present in dump) | Target table | Mapper |
|--------|--------------------------------------|--------------|--------|
| Product catalog / folders | `items` (34 tenants), `item_folders` (22), `item_*` satellites | `products` / `product_folders` (Phase 8) | ❌ missing |
| Inventory levels | `item_location_stocks` (27) | (Phase 8 inventory) | ❌ missing |
| Inventory movements | `stock_movements` (29), `fifo_batches` | `inventory_movements` (Phase 8) | ❌ missing |
| Sales history | `pos_transactions` (10), `pos_transaction_lines` (10) | `availments` (Phase 9) — **no provenance field** | ❌ missing |

Closing these mappers is the scope this progressive rehearsal is meant to surface
and prioritize. Until they exist, "old items / businesses retained" per the user
acceptance bar is provable only for the accounts/tenancy backbone, not for
catalog/inventory/sales.

## Port & Domain Map

| Beta surface | Tunnel domain (operator config) | localhost | nginx `listen` | Upstream |
|--------------|--------------------------------|-----------|----------------|----------|
| SKUpervisor / IMS (`skupervisor.beta.dgfy.ph`) | `<ims-tunnel-domain>` | `:5173` | `skupervisor.conf` | `frontend:8081` |
| POS (`pos.beta.dgfy.ph`) | `<pos-tunnel-domain>` | `:5174` | `pos.conf` | `frontend:8082` |
| Storefront (`beta.dgfy.ph` root) | `<store-tunnel-domain>` | `:5175` | `storefront.conf` | `frontend:8083` |
| **New DGFY API** (no beta mirror) | `<new-api-tunnel-domain>` | `:5100` | (direct) | `dgfy-api:5100` |
| Legacy backend | (not tunnelled) | `:5000` | via each `/api` route | `backend:5000` |

All three frontend confs proxy `/api` and `/uploads` → `backend:5000`; the
storefront/IMS confs also same-origin-proxy `/openfreemap/` for map tiles.
Concrete tunnel domain values live in the operator's Cloudflare tunnel config,
not in this doc.

## What This Proves / Defers

**Proves:** the base platform clone is beta-faithful (Stage 1); the
accounts/tenancy migration runs against real ~41-tenant volume with a recorded
wall-clock, idempotency, clean verify, and legacy non-mutation (Stage 2).

**Defers** (not covered here — future Phase 7 cutover-runbook scope):
`dgfy_*` backup/restore proof, a pre-decided abort threshold, and reopen-on-legacy
steps. In this rehearsal, "rollback" is simply *discard the clone and retry*. The
catalog/inventory/sales mappers in §Known Coverage Gap are prerequisite build
work, not part of this rehearsal method.

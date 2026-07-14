# DGFY Standalone Refactor

## What This Is

DGFY is being refactored into a standalone Storefront + POS platform that no longer depends on the legacy SKUpervisor IMS schema as its foundation. The current production/beta system stays running while a new DGFY database, migration runner, and backend foundation are built beside it using a Strangler Fig migration path.

This project cycle starts with the database layer, not the frontend: create a dedicated one-shot migration container, establish new `dgfy_*` landlord/tenant schema foundations, prove old-to-new migration scripts, then build backend APIs for Accounts, Businesses, and Tenancy on top of that stable database contract.

## Core Value

DGFY can become a standalone multi-tenant POS and Storefront system without breaking the existing live platform during migration.

## Business Context

- **Customer**: DGFY vendors and consumers, starting with current beta/production users and fewer than 100 active users during the migration window.
- **Revenue model**: Free vendor POS and Storefront adoption, with future ecosystem and payment/commercial opportunities layered on a stable DGFY-owned foundation.
- **Success metric**: Existing users experience no regression while new DGFY Accounts, Businesses, Tenancy, and migration scripts prove a clean path away from the IMS-backed schema.
- **Strategy notes**: See `refactor/DGFY_Project_Status_and_Proposal.md`, `refactor/DGFY_Implementation_Phases.md`, and `refactor/DGFY_Migration_Cutover_Strategy.md`.

## Current Milestone: v2.1 Legacy Data Migration

**Goal:** Close the empirically-confirmed gap where the existing Accounts/Businesses/Tenancy migration leaves every tenant with zero products, availments, and inventory movements — build the schema extension and mapper functions to migrate legacy `items`/`item_folders`/`stock_movements` (plus satellite tables and `item_embeddings`) into the new `products`/`product_folders`/`inventory_movements` schema, and migrate `pos_transactions` sales history into `availments`, proven via re-rehearsal against a live production-parity environment.

**Target features:**
- `products` schema extension: 6 universal typed columns (`sku_code`, `cost_per_unit`, `vat_type`, `senior_pwd_discount_eligible`, `description`, `unit_of_measure`) plus one `attributes` JSON column for everything else category-specific
- `item_embeddings` (AI vector search data) migrated alongside product data
- New mapper functions following the existing `mappings.js` pattern: `items`→`products`, `item_folders`→`product_folders`, `stock_movements`→`inventory_movements`, satellite tables→`products.attributes`, `item_embeddings`→new embeddings storage
- Sales-history migration: `pos_transactions`→`availments` with a new `source_system` provenance field, as its own phase
- Legacy `category` (5 values, raw-material-centric) treated as generic sellable products for migration purposes; the raw-material-vs-finished-good distinction is explicitly deferred to a future, not-yet-scoped DGFY↔IMS integration contract
- Validation via re-rehearsal against a disposable production-parity environment (real GHCR images, real domains, real legacy data volume) using a tested snapshot/reset mechanism

**Deferred to later milestones:** new frontend apps (dgfy-storefront/pos/business), production cutover itself (Phase 7 stays paused until this migration is proven, then likely resumed), Comprehensive Inventory/IMS integration, co-ownership exposure, Hospitality/Ticketing/Jobs ecosystem integrations.

**Previous milestone (v2.0 Commerce Domain — Product, Checkout & Fulfillment):** Backend API parity with the legacy system's full commerce flow — product catalog, POS checkout/payment, storefront online ordering, and order fulfillment — built beside legacy on `dgfy_*` schemas. Completed across Phases 8-11 (see Validated requirements below).

## Requirements

### Validated

- ✓ Existing platform has a live landlord + tenant database pattern for tenant provisioning, account/tenant registry, and tenant-scoped operations — existing.
- ✓ Existing backend uses Sequelize with MySQL and tracks migrations through Sequelize CLI conventions under `backend/migrations` — existing.
- ✓ Existing deployable surfaces include backend API, standalone `apps/dgfy-api`, POS frontend, Storefront frontend, Skupervisor IMS frontend, Docker Compose infrastructure, MySQL, Redis, and Nginx routing — existing.
- ✓ Existing POS, Storefront, fiscal/compliance, payment, tenant provisioning, and discovery flows are valuable enough to preserve during the refactor — existing.
- ✓ Existing architecture governance already accepts phased migration through compatibility facades rather than a big-bang rewrite — `docs/architecture/adr/0003-migration-facade-strategy.md`.
- ✓ Dedicated database migration runner container built as a one-shot deploy artifact (`apps/dgfy-migration-runner`), separate from long-running API containers, with Docker packaging verified via build+run — validated in Phase 1: Architecture and Migration Runner Contract.
- ✓ Runner supports multiple commands from one migration image — schema migrate, data dry-run/apply, verify, status, rollback-plan — with pre-connection env/destructive-op validation and DB-backed execution metadata — validated in Phase 1: Architecture and Migration Runner Contract.
- ✓ New `dgfy_core` landlord schema (accounts, businesses, business_memberships, business_database_registry, business_audit_logs, storefront_discovery_index) and per-tenant `dgfy_business_*` schema (locations, staff_accounts, account_staff_assignments, roles/role_permissions, terminal_identities, tenant_ownership_metadata, tenant_audit_logs) exist beside legacy `sku_*` schemas via additive, idempotent migrations, without mutating legacy schemas by default — validated in Phase 2: DGFY Database Foundation.
- ✓ Re-running schema migration and verification proves expected tables/columns/indexes/constraints, target-scoped migration metadata, tenant coverage, idempotent reruns, and legacy `sku_*` non-mutation via a pre/post-migration `information_schema` fingerprint baseline — validated in Phase 2: DGFY Database Foundation.
- ✓ Old-to-new migration scripts transform legacy/current data into the new DGFY schema with dry-run, idempotency, checkpointing, and verification evidence — validated in Phase 3: Old-to-New Migration Proof.
- ✓ Backend Accounts, Businesses, and Tenancy APIs are built against the stable DGFY schema contract, with an operator-invokable tenant activation mechanism (`activate-tenant` CLI) and D-04 session/membership enforcement — validated in Phase 4: Backend Accounts, Businesses, and Tenancy Foundation (11/11 plans, human UAT confirmed against real MySQL, 35/36 STRIDE threats closed).
- ✓ Legacy code touches are limited to approved, manifest-governed compatibility seams with a mechanical CI acceptance gate (schema + completeness + code↔manifest reconciliation) and an ESLint compat-import ban backing the guardrail scan — validated in Phase 5: Compatibility and Backend-First Cutover Seam (CMP-01/02/03).
- ✓ Release evidence (architecture checks, migration verification, tenant drift checks, targeted smoke/contract checks) before cutover — validated in Phase 6: Release Evidence and Rehearsal Gates (CMP-04).
- ✓ Storefront Discovery & Online Ordering (map browse/search, store page, cart, guest-or-account checkout, pickup/delivery immediate-or-scheduled, PayMongo QR Ph payment) is built with a durable landlord-first order record that finalizes idempotently into the correct tenant's Availment, safely crossing the Landlord/Tenant database boundary for the first time — validated in Phase 10: Storefront Discovery & Online Ordering (STF-01..STF-05, 8/8 plans, code review found and fixed 4 critical bugs including a stock-reservation composition-root wiring defect, 16/16 must-haves independently re-verified against current code).
- ✓ Order Fulfillment & Delivery Coordination (business/staff retrieve and process incoming online orders, progress fulfillment status through a shared core pipeline with pickup/delivery/dine-in handoffs, manually assign courier/delivery partners and track payout through completion) — validated in Phase 11: Order Fulfillment & Delivery Coordination (FUL-01/02/03, 4/4 plans, code review found and fixed 2 critical bugs — non-atomic stage-progression writes and unvalidated fulfillmentMode — 14/14 must-haves re-verified against current code, migration applied and finalize paths proven end-to-end against a live tenant MySQL database).
- ✓ ADR 0029's legacy-table scope gate unblocked (`items`/`item_folders`/`stock_movements`/`pos_transactions` removed from `OUT_OF_SCOPE_LEGACY_TABLES`) and the extended target schema (`products` +7 columns incl. `attributes` JSON, new `product_embeddings` 1:1 table, `inventory_movements` natural-key unique index) exists and is proven against real tenant databases — validated in Phase 12: Scope Unblock + Schema Extension (LDM-01..04, 4/4 plans, code review found and fixed 1 critical bug — the natural-key index initially omitted `product_id`, which would have broken any multi-product checkout — re-verified against 3 real EC2 tenant DBs after the fix, 7/7 must-haves independently re-verified against current code).

### Active

- [ ] Preserve current POS/Storefront behavior until replacement paths have parity evidence and rollback options.
- [ ] Cutover rehearsal, data-volume evidence, backup/restore proof, and abort thresholds before production cutover is scheduled — CMP-05, Phase 7 (paused 2026-07-12, pending real Docker/GHCR rehearsal infra; will likely be revisited once this Legacy Data Migration milestone is proven, since the real production migration must move Product/Availment data too, not just Accounts/Businesses/Tenancy). Rehearsal infra itself has since been proven independently via a disposable EC2 environment during v2.1 kickoff — Phase 7 can likely reuse that approach when resumed.
- [ ] Product/Inventory data migration (`items`/`item_folders`/`stock_movements`/satellite tables/`item_embeddings` → `products`/`product_folders`/`inventory_movements`) — v2.1.
- [ ] Sales-history migration (`pos_transactions` → `availments` with `source_system` provenance) — v2.1.

### Out of Scope

- New frontend apps (dgfy-storefront/dgfy-pos/dgfy-business) — database/backend foundation and now the Commerce Domain must stabilize first; current POS and Storefront frontends stay live against the old backend.
- Product/Availment data-cutover migration and production cutover — downstream of the v2.0 Commerce Domain; Phase 7 stays paused until this domain is proven, not resumed as-is.
- Comprehensive Inventory / external IMS (SKUpervisor) integration — contract not yet defined technically.
- Co-ownership feature exposure — data model supports it (Phase 1) but the feature itself isn't exposed yet.
- Hospitality/Ticketing/Jobs Sieitz ecosystem integrations, and the Food Manufacturing IMS supply marketplace vision — directional notes only, not designed.
- Opportunistic cleanup of legacy code — avoided unless explicitly approved as a compatibility seam or required safety fix.
- Big-bang production cutover — full migration and cutover require rehearsals, abort thresholds, and a separate runbook.
- Deleting legacy code — migrated legacy code should move to `.archive` only after parity is proven and no active path depends on it.
- Strict zero-touch legacy policy — not adopted, because the plan allows documented seams such as future API base URL routing or compatibility adapters when needed.

## Context

The repository is a brownfield DGFY/SKUpervisor platform with a mapped codebase in `.planning/codebase/`. The current backend is a transitional modular monolith with Express, Sequelize, MySQL, Redis, Docker, and multiple frontend/app surfaces. Authoritative architecture rules require `routes -> controllers -> usecases -> repositories -> models`, transport-only controllers, repository-owned Sequelize access, and explicit governance for cross-boundary changes.

The refactor proposal in `refactor/` identifies the core product issue: DGFY was grown inside an IMS-backed schema. POS, Storefront, accounts, transactions, inventory, staff assignment, discounting, and compliance behavior inherited assumptions from SKUpervisor. The desired target is a DGFY-owned Storefront + POS foundation where SKUpervisor or other Sieitz systems become optional integrations, not required infrastructure.

The first implementation direction has been adjusted from backend-login-first to database-first. The migration container and new `dgfy_*` schema must precede backend Accounts/Businesses/Tenancy APIs so the backend does not depend on unstable schema assumptions. Sequelize CLI guidance supports a one-shot migration command model with DB-backed migration tracking; the project must add deployment guardrails around that pattern rather than running migrations inside long-lived API startup.

Existing codebase concerns make this database-first approach necessary: tenant schema drift has already recurred, existing tenant repairs require explicit handling, and current deploy defaults can report drift without applying repairs. The new refactor must treat migration execution, tenant schema coverage, and verification as first-class release artifacts.

**Phase 1 complete (2026-07-10):** The migration runner contract (`apps/dgfy-migration-runner`) is built, tested (46/46), and independently Docker-packaged, satisfying RUN-01 through RUN-05. It currently drives only a placeholder schema migration — no real `dgfy_*` landlord/tenant schema exists yet. Code review flagged 6 non-blocking warnings to prioritize before Phase 2 builds real migrations on top of this contract: most notably the destructive-op gate over-scans all migration files instead of just pending ones (will misbehave once a real destructive migration exists), and several command handlers don't mark `command_executions` rows `failed` on error. See `01-REVIEW.md` and `01-VERIFICATION.md` for full detail.

**Phase 2 complete (2026-07-11):** Real `dgfy_core` and `dgfy_business_*` schemas now exist beside legacy, satisfying DBF-01 through DBF-05. Canonical branches/locations live in tenant `dgfy_business_*` schemas, not `dgfy_core` — the landlord schema only holds a `storefront_discovery_index` projection, correcting the original assumption that Branches belonged to the landlord foundation (see D-10 in `02-CONTEXT.md`). Runner hardening from Phase 1's review debt was folded into Phase 2 (pending-only destructive gate, failure-safe command audit, container-safe `/reports` default). A code-review finding (CR-01: `verify.js`'s `migration_metadata` used one shared try/catch across all business targets, risking silent evidence loss on a mid-loop failure) was caught by verification and closed via a dedicated gap-closure plan (02-05) with an independently-confirmed RED/GREEN regression test. Full runner suite: 132 tests passing, 1 intentionally gated (real-MySQL integration test, confirmed passing via human UAT against a local disposable MySQL instance — never against the production credentials in `.env`). 24/24 phase threats verified closed; see `02-SECURITY.md`.

**Phase 3 complete (2026-07-11):** Old-to-new migration scripts (dry-run, apply, verify) satisfy MIG-01 through MIG-05, proving legacy-to-DGFY data transformation with durable checkpoints, deterministic ID maps, and idempotent retry.

**Phase 4 complete (2026-07-12):** Backend Accounts, Businesses, and Tenancy APIs are live against the new DGFY schema, satisfying API-01 through API-06 across 11 execution waves. Key structural outcome: the database foundation alone wasn't enough — a real, production-reachable mechanism to move a tenant's `business_database_registry` row from `provisioning` to `active/verified` didn't exist until Wave 9 (`04-09`), which shipped an operator-invokable `activate-tenant` CLI command; without it every business would have returned 404/503 for location creation, staff onboarding, and tenant session activation forever. Human UAT (real MySQL) confirmed all previously-gated integration/E2E suites pass after 3 rounds of fixes (missing `verified_at` default, missing FK-seed staff accounts in two journeys plus two integration suites, and a systemic `TRUNCATE`-vs-live-FK-constraint bug across 9 test files) — see `04-UAT.md`. Security audit closed 35/36 STRIDE threats (`04-SECURITY.md`); the one open item (a duplicate `business_database_registry` row bug affecting only a test helper, not a production-reachable path) is tracked as non-blocking technical debt. A real elevation-of-privilege bug (owner could activate a session against a still-provisioning tenant database) was found and fixed during Wave 8.

**Phase 5 complete (2026-07-12):** Compatibility-seam governance satisfies CMP-01 through CMP-03 across 3 plans (2 waves): a JSON manifest as source of truth, a zero-dependency CI validator (schema + completeness + code↔manifest reconciliation), a deterministic manifest→markdown inventory doc, an extended architecture guardrail (compat-import ban + `entities/` scan) mirrored by an ESLint rule, and one concrete reference seam — a read-only DB-level domain-continuity command in the migration runner, registered as the manifest's first real entry. Code review caught a foundational gap before sign-off: none of the phase's own new test suites (the migration-runner package's 26 tests, the validator's own 12-test suite, the guardrail's 3-test compat scan) were actually wired into CI — the governance logic was solid but mechanically unenforced. All 3 Critical + 3 Warning findings were fixed (real CI jobs added, `verifyContinuity.js` no longer masks probe errors on close-failure) and independently re-verified by the phase verifier reading the actual `ci.yml`/`package.json` diffs, not just the fix report. CMP-04 (release evidence) and CMP-05 (cutover rehearsal) are correctly deferred to Phases 6 and 7.

**Phase 6 complete (2026-07-12):** On-demand release-evidence tooling satisfies CMP-04 across 3 plans (2 waves): an interactive migration-runner `release-evidence` command producing per-tenant drift and migration-verification reports, a generic manifest-driven compatibility-seam smoke runner, and an orchestrator (`scripts/gate-release-dgfy-evidence.js`) that aggregates both plus architecture checks into a single `dgfy_release_evidence.json` verdict artifact. Code review caught a critical bug before sign-off: the orchestrator looked up evidence files with underscore suffixes while the actual sanitized report filenames use hyphens, so the migration-verification/tenant-drift gates could never read real evidence and could only ever pass in the vacuous zero-tenant case — fixed and covered by a regression test (CR-01), alongside a stale-evidence-directory fail-open risk where reruns could mask real failures as passes (CR-02). Phase verification then surfaced a second, narrower gap: the orchestrator claimed `apps/dgfy-migration-runner/` as an architecture-checked release boundary, but `check:architecture` never actually inspected that directory. Rather than narrow the claim to match the gap, a dedicated migration-runner architecture guardrail was built (enforces that DB connections are only ever constructed via the `src/config/db.js` factories, the invariant established in Phase 1) and wired into the chain, so the claim is now true rather than just documented as a known gap. All three success criteria were independently re-verified against a live end-to-end run of the orchestrator; full migration-runner suite: 308 tests passing, zero regressions.

## Constraints

- **Architecture**: Follow `docs/START_HERE.md`, `docs/architecture/ARCHITECTURE_BOUNDARIES.md`, and `docs/architecture/ARCHITECTURE_GOVERNANCE.md`; backend work must preserve `routes -> controllers -> usecases -> repositories -> models`.
- **Migration strategy**: Use ADR 0003 compatibility facades and Strangler Fig migration; legacy stays live until replacement paths prove parity.
- **Database safety**: New DGFY schema is created beside legacy by default; migration scripts transform data rather than raw-copying legacy shapes.
- **Migration runner**: Migrations run from a dedicated one-shot container with explicit commands; long-running API containers must not be the primary migration execution surface.
- **Idempotency**: Schema and data migration scripts need dry-run, checkpoint/re-run behavior, verification output, and operator-safe failure modes.
- **Legacy impact**: No legacy edits except approved seams; no broad cleanup of `backend/*` or old frontend surfaces during database/backend foundation phases.
- **v2.0 Commerce Domain zero-touch (Phases 8-11)**: No writes/edits/migrations to any file under `backend/` — not even an approved-seam exception. All Commerce Domain code is new module code inside `apps/dgfy-api`. Reading legacy `backend/` files as pattern-porting reference (already cited throughout Phase 8's `08-CONTEXT.md` canonical refs) is expected and fine; writing to `backend/` is not, for any reason, in these phases.
- **Scope**: First backend scope is Accounts, Businesses, and Tenancy only; Product/POS/payment/fiscal domains wait for later phases.
- **Deployment**: Production cutover requires rehearsal evidence, realistic data volume checks, and pre-decided abort thresholds.
- **Security**: Account, tenant, migration, and authentication work must satisfy the hardening contract in `docs/architecture/ARCHITECTURE_GOVERNANCE.md`.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Database-first refactor | Backend APIs should be built against a stable new DGFY schema, not inferred while still coupled to SKUpervisor tables. | — Pending |
| One migration image with multiple commands | Keeps schema/data/verify/rollback tooling together while allowing deploy scripts to run each command once and explicitly. | ✓ Built in Phase 1 — `apps/dgfy-migration-runner` with 6 Commander subcommands, DB-backed metadata, JSON+summary reports (46/46 tests, Docker build/run verified) |
| New `dgfy_*` databases beside legacy | Reduces risk to existing users and enables old-to-new migration rehearsal without mutating live legacy schemas by default. | ✓ Built in Phase 2 — `dgfy_core` landlord + `dgfy_business_*` tenant schemas, additive migrations, legacy `sku_*` non-mutation proven via pre/post fingerprint comparison |
| Canonical branches/locations live in tenant schema, not landlord | Discovered during Phase 2 planning (D-10): `dgfy_core` should only hold a public discovery projection, not canonical branch data — location ownership is tenant-local. | ✓ `dgfy_core.storefront_discovery_index` is projection-only; `locations` lives in each `dgfy_business_*` schema |
| Accounts + Businesses + Tenancy as first backend scope | Identity and tenant routing are the foundation for every later POS/Product/Storefront domain. | ✓ Built in Phase 4 — 11 execution waves, API-01 through API-06 satisfied, operator `activate-tenant` CLI closes the provisioning→active handoff gap, human UAT confirmed against real MySQL, 35/36 STRIDE threats closed |
| No legacy edits except approved seams | Preserves current uptime while allowing narrow compatibility wiring when migration requires it. | — Pending |
| Product/POS/payment/fiscal domains deferred from v1 | These domains are important but too large to bundle into the database and tenancy foundation. | ✓ Correctly deferred — now the v2.0 milestone scope |
| Phase 7 (cutover rehearsal) paused, v2.0 Commerce Domain started instead | Cutting over now would migrate Accounts/Businesses/Tenancy but leave Product/Availment data in legacy `sku_*` — new businesses would still depend on old tenant databases for their catalog. The real cutover migration must cover Product data too. | — Pending |
| v2.0 scope is backend-API-only, no new frontend apps | Matches the original phased plan (Phase 2 before Phase 3); avoids building frontend against an unstable API surface. | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `$gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `$gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Business Context check — customer, revenue model, success metric still accurate?
4. Audit Out of Scope — reasons still valid?
5. Update Context with current state

---
*Last updated: 2026-07-14 — Phase 12: Scope Unblock + Schema Extension complete*

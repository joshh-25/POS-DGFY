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

### Active

- [ ] Build old-to-new migration scripts that transform legacy/current data into the new DGFY schema, with dry-run, idempotency, checkpointing, and verification evidence.
- [ ] Build backend APIs only after the database contract is stable, starting with Accounts, Businesses, and Tenancy.
- [ ] Keep legacy `backend/*` and `frontend/apps/{store,pos}/*` running during the migration, with edits limited to approved compatibility seams.
- [ ] Preserve current POS/Storefront behavior until replacement paths have parity evidence and rollback options.
- [ ] Document and enforce database-first cutover gates before any frontend migration begins.

### Out of Scope

- Product, Availment, Inventory, POS checkout, payments, discounts, fiscal compliance, shifts, and Storefront frontend migration — deferred until Accounts/Businesses/Tenancy and migration foundations are stable.
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

## Constraints

- **Architecture**: Follow `docs/START_HERE.md`, `docs/architecture/ARCHITECTURE_BOUNDARIES.md`, and `docs/architecture/ARCHITECTURE_GOVERNANCE.md`; backend work must preserve `routes -> controllers -> usecases -> repositories -> models`.
- **Migration strategy**: Use ADR 0003 compatibility facades and Strangler Fig migration; legacy stays live until replacement paths prove parity.
- **Database safety**: New DGFY schema is created beside legacy by default; migration scripts transform data rather than raw-copying legacy shapes.
- **Migration runner**: Migrations run from a dedicated one-shot container with explicit commands; long-running API containers must not be the primary migration execution surface.
- **Idempotency**: Schema and data migration scripts need dry-run, checkpoint/re-run behavior, verification output, and operator-safe failure modes.
- **Legacy impact**: No legacy edits except approved seams; no broad cleanup of `backend/*` or old frontend surfaces during database/backend foundation phases.
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
| Accounts + Businesses + Tenancy as first backend scope | Identity and tenant routing are the foundation for every later POS/Product/Storefront domain. | — Pending (database foundation now stable; backend APIs are Phase 4) |
| No legacy edits except approved seams | Preserves current uptime while allowing narrow compatibility wiring when migration requires it. | — Pending |
| Product/POS/payment/fiscal domains deferred | These domains are important but too large to bundle into the database and tenancy foundation. | — Pending |

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
*Last updated: 2026-07-11 after Phase 2 completion*

# Project Research Summary

**Project:** DGFY Standalone Refactor
**Domain:** Brownfield database-first Strangler Fig refactor for a standalone multi-tenant Storefront + POS platform
**Researched:** 2026-07-10
**Confidence:** HIGH for repository constraints and architecture direction; MEDIUM for external tooling and cutover-pattern details

## Executive Summary

DGFY is a live brownfield Storefront + POS platform being extracted from an IMS-shaped SKUpervisor foundation into a standalone multi-tenant product. Experts should build this kind of refactor as a database-first Strangler Fig: create the new DGFY-owned databases beside legacy, transform data with auditable migration tooling, keep the legacy runtime live, then move backend and frontend traffic only after parity and rollback evidence are available.

The recommended approach is to start with one dedicated migration image exposing multiple explicit commands for schema migration, tenant repair, data migration, verification, status, and rollback/runbook support. The first schema contract should cover only DGFY Accounts, Businesses, Branches, Tenancy registry, Staff Accounts, Assignments, Terminal identity, and migration metadata. Backend Accounts, Businesses, and Tenancy APIs should be built only after that database contract is stable and verified.

The biggest risks are tenant schema drift, inferred backend schemas, non-idempotent data migration, raw-copying legacy IMS concepts, and compatibility adapters becoming permanent. Mitigate them with DB-backed migration metadata, per-tenant zero-drift reports, dry-run/apply/verify separation, legacy-to-DGFY ID maps, source-to-target mapping documents, architecture gates, and explicit adapter removal phases.

## Key Findings

### Recommended Stack

Use the existing Node.js, Sequelize, MySQL, Docker, and modular backend stack rather than introducing a new migration or persistence platform during the refactor. The only meaningful addition is Umzug as a programmatic orchestration layer around Sequelize migrations for multi-command workflows that Sequelize CLI alone does not model cleanly.

**Core technologies:**
- Node.js 22 in Docker: runtime for migration runner and backend foundation — matches deployed DGFY API/backend runtime and avoids a second migration language.
- Sequelize 6 with `mysql2`: schema/query layer — already used by the backend and DGFY API; use explicit migrations and repositories, not model sync as production strategy.
- Umzug v3: migration runner orchestration — supports custom commands, DB-backed storage, pending/executed inspection, and shared Sequelize context.
- MySQL 8.0+: landlord, tenant, legacy, and new `dgfy_*` databases — fits existing infrastructure but requires metadata-lock-aware migration planning.
- Docker Compose / Docker: one-shot migration runner artifact — explicit service/job execution keeps migrations out of long-running API startup.

### Expected Features

This milestone is not a product expansion. It is the minimum foundation needed to make DGFY own its database, data migration path, and first backend modules without regressing current POS and Storefront behavior.

**Must have (table stakes):**
- Dedicated one-shot migration runner container with separate schema, data, verify, status, and rollback/runbook commands.
- New `dgfy_*` landlord foundation for Accounts, Businesses, Branches, Tenancy registry, and migration metadata.
- New tenant foundation for Staff Accounts, Assignments, Terminal identity, and tenant-local ownership.
- Migration metadata, checkpoints, idempotency keys, and legacy-to-DGFY ID maps.
- Dry-run, apply, and verification reports for old-to-new transformations.
- Backend Accounts, Businesses, and Tenancy APIs following `routes -> controllers -> usecases -> repositories -> models`.
- Compatibility/facade seams that preserve current POS and Storefront behavior while keeping legacy edits narrow.
- Tenant schema drift prevention and security/session hardening for account and tenancy flows.

**Should have (competitive or operationally valuable):**
- Migration dashboard or richer report viewer after CLI/report formats stabilize.
- Compatibility adapter package if API-shape comparison proves the old POS frontend needs backend-side translation.
- Seeded clean DGFY demo tenant for QA after the core APIs exist.
- Automated rehearsal performance comparison using realistic snapshots.
- Expanded audit browsing UI for account/business/tenant changes after persistence evidence exists.

**Defer (v2+ or later milestones):**
- Product and Availment migration.
- POS checkout, payment mechanics, split tenders, discounts, shifts, and fiscal compliance.
- Storefront/POS/Business frontend migration into new app surfaces.
- Full production cutover runbook and legacy decommissioning.
- Optional IMS/SKUpervisor integration contract once DGFY owns its core schema.

### Architecture Approach

Use a database-first Strangler Fig architecture. The new DGFY landlord and tenant databases sit beside the live legacy landlord and tenant databases. A dedicated migration runner performs read-only extraction from legacy by default, writes transformed data into `dgfy_*`, and emits evidence. Backend modules then bind to the stable DGFY schema through governed modular-monolith boundaries. Compatibility adapters live at the edge and must be temporary.

**Major components:**
1. Migration runner image — owns schema migration, tenant repair, data transformation, verification, reporting, checkpoints, and rollback/runbook support.
2. New DGFY landlord DB — owns Accounts, Businesses, Branches, Tenancy registry, tenant DB pointers, discovery metadata foundation, and migration metadata.
3. New DGFY tenant DBs — own Staff Accounts, Assignments, Terminals, and later tenant-local operational domains.
4. Accounts module — owns DGFY Account lifecycle, authentication/profile basics, and owner/manager identity behavior.
5. Businesses module — owns Business and Branch registration, ownership relation, branch metadata, and lifecycle basics.
6. Tenancy module — owns tenant registry, tenant DB provisioning/resolution, tenant connection metadata, and migration-visible tenancy state.
7. Compatibility adapters — translate old client expectations only at approved seams with tests and removal criteria.

### Critical Pitfalls

1. **Treating landlord migration success as tenant migration success** — require per-tenant registry coverage, repair-apply evidence, and final zero-drift reports for all active tenants.
2. **Letting `sync({ alter: true })` become the migration strategy** — use explicit migrations and declared tenant repair SQL; reserve broad alter sync for new tenant provisioning or controlled maintenance only.
3. **Building backend APIs against an unstable schema** — freeze and test the minimal `dgfy_*` database contract before Accounts/Businesses/Tenancy API work.
4. **Copying legacy SKUpervisor data instead of transforming it** — define source-to-target mappings, skipped-data reports, and DGFY-owned domain names before writing migration jobs.
5. **Non-idempotent data migration and half-migrated state** — use durable migration metadata, checkpoints, deterministic idempotency keys, and kill/retry tests.
6. **Compatibility facade becoming permanent coupling** — keep adapters at the boundary, test both legacy and target API shapes, and assign a removal phase.
7. **Cross-tenant auth and tenancy leakage** — require landlord membership plus tenant-local assignment proof before tenant sessions, branch access, or terminal binding.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Architecture and Runner Contract

**Rationale:** The first dependency is the operational contract: where migrations run, what commands exist, where metadata lives, and whether backend code belongs in `backend/src/modules` or expanded `apps/dgfy-api`.
**Delivers:** ADR impact decision, migration runner skeleton, command/env contract, report format, migration metadata/checkpoint table design, and image/build wiring.
**Addresses:** Dedicated runner, architecture guardrails, migration metadata foundation.
**Avoids:** Hidden API-startup migrations, backend-first schema guessing, and untracked cross-boundary expansion.

### Phase 2: DGFY Database Foundation

**Rationale:** Backend APIs must not infer schema from legacy tables. Landlord and tenant foundations need to exist, rerun cleanly, and verify before API implementation begins.
**Delivers:** New `dgfy_*` landlord migrations, tenant foundation migrations, schema migration tracking, tenant repair/coverage commands, seed fixtures, and schema verification.
**Addresses:** Accounts, Businesses, Branches, Tenancy registry, Staff Accounts, Assignments, Terminal identity, tenant drift prevention.
**Avoids:** Landlord-only success, Sequelize alter as strategy, deferred payment/fiscal semantics polluting foundation tables.

### Phase 3: Old-to-New Migration Proof

**Rationale:** Data transformation is the riskiest part of the milestone and must prove dry-run, idempotency, retry, and verification before backend cutover pressure exists.
**Delivers:** Source-to-target mapping docs, dry-run transformation, apply mode with checkpoints, legacy-to-DGFY ID maps, skipped/conflict reports, data verification, and kill/retry tests.
**Addresses:** Migration scripts, checkpoints, idempotency, dry-run mode, verification reports, rehearsal evidence hooks.
**Avoids:** Raw-copy legacy schemas, non-idempotent partial migration, toy-data confidence.

### Phase 4: Backend Accounts, Businesses, and Tenancy Foundation

**Rationale:** Once the database contract and migration proof are stable, backend APIs can be implemented without importing legacy model assumptions.
**Delivers:** Accounts APIs, Businesses APIs, Tenancy APIs, repository contracts, auth/session hardening tests, tenant authorization negative tests, and architecture checks.
**Addresses:** First backend scope only: Accounts, Businesses, Tenancy.
**Avoids:** Cross-tenant auth leakage, controller-to-model imports, legacy model coupling.

### Phase 5: Compatibility and Backend-First Cutover Seam

**Rationale:** Existing POS and Storefront behavior must remain live. Any old-client path to new backend behavior needs a deliberately scoped anti-corruption boundary.
**Delivers:** API-base seam decision, optional response/request adapter, legacy-client contract tests, target API contract tests, adapter inventory, and removal phase.
**Addresses:** Compatibility/facade behavior and legacy behavior preservation tests.
**Avoids:** Permanent legacy-shaped API, broad legacy cleanup, accidental frontend migration.

### Phase 6: Cutover Rehearsal and Runbook

**Rationale:** Production cutover should be evidence-gated, not date-driven. The milestone should finish with realistic rehearsal evidence and an abortable runbook, even if production cutover itself remains separate.
**Delivers:** Production-like rehearsal, runtime reports, lock observations, backup/restore proof, abort thresholds, reopen-on-legacy steps, post-cutover smoke checklist.
**Addresses:** Abort-threshold hooks, realistic migration evidence, rollback/runbook support.
**Avoids:** Cutover exceeding window, rollback removal too early, health-check-only production proof.

### Phase 7: Post-Foundation Roadmap Split

**Rationale:** Product/POS/payment/fiscal/frontend migration should not contaminate the database/backend foundation. Split them into later domain-specific milestones after account/business/tenant authority is proven.
**Delivers:** Deferred-domain requirements split, product/availment mapping research, payment/fiscal/shift design requirements, frontend migration plan, legacy retirement criteria.
**Addresses:** v2+ scope only.
**Avoids:** Scope collapse into POS/Product/Fiscal and premature legacy archiving.

### Phase Ordering Rationale

- Migration operations and schema contracts come first because every later backend and cutover decision depends on a stable, verified `dgfy_*` database shape.
- Data migration proof is separated from schema work because transformation, checkpoints, skipped records, and rerun behavior have different failure modes from DDL.
- Backend APIs follow migration proof so repository contracts are grounded in a real schema and sample migrated data.
- Compatibility is its own phase because it is temporary anti-corruption work, not canonical DGFY domain design.
- Cutover rehearsal is last because it needs the runner, schema, data transformation, backend APIs, and compatibility evidence to be meaningful.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1:** Confirm ADR 0032 impact if expanding `apps/dgfy-api` beyond auth/registration; decide exact runner package location.
- **Phase 2:** Validate concrete MySQL DDL/lock behavior for any active tenant table alterations and tenant DB creation pattern.
- **Phase 3:** Research current legacy data quality and source-to-target mappings from actual schemas before implementation.
- **Phase 4:** Research session/auth hardening against current repository governance and existing token behavior.
- **Phase 5:** Compare old POS/Storefront API contracts with target API shapes before choosing adapter vs. frontend seam.
- **Phase 6:** Research backup/restore mechanics, production-like anonymized fixture creation, and downtime target using current infrastructure.

Phases with standard patterns (skip research-phase unless new uncertainty appears):
- **Phase 1 runner skeleton:** Standard Node/Docker command dispatcher and env validation patterns are well understood after location/ADR decision.
- **Phase 2 additive schema migrations:** Standard Sequelize/Umzug migration pattern applies once table contracts are specified.
- **Phase 4 module layering:** Existing architecture docs already define backend route/controller/usecase/repository/model boundaries.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | Repository fit is HIGH, but external tooling guidance for Sequelize CLI, Umzug, Docker Compose jobs, and MySQL DDL behavior was rated MEDIUM. |
| Features | MEDIUM | Feature scope is strongly grounded in repo/refactor docs, but the source file self-rates LOW because it relies on local/curated evidence rather than market research. For roadmap purposes, scope confidence is MEDIUM-HIGH. |
| Architecture | HIGH | Architecture research is grounded in authoritative repo docs, ADRs, mapped codebase structure, and explicit governance constraints. |
| Pitfalls | MEDIUM | Repo-specific risks are HIGH confidence; external Strangler Fig, DMS, and MySQL operational guidance is MEDIUM. |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **Backend placement:** Decide whether Accounts/Businesses/Tenancy live in `backend/src/modules` or expand `apps/dgfy-api`; update ADR 0032 or create a new ADR if scope expands.
- **Exact schema contract:** Formalize field-level landlord and tenant tables before implementation; do not let API work backfill schema design.
- **Legacy data quality:** Inspect real legacy/current landlord and tenant records before locking source-to-target mappings.
- **Runner package location:** Choose dedicated runner package vs. `apps/dgfy-api`-adjacent implementation vs. isolated backend entrypoint.
- **Production rehearsal inputs:** Define anonymized production-like fixtures and downtime targets before treating migration performance as known.
- **Compatibility strategy:** Compare old client API shapes against target APIs before deciding adapter or frontend config/seam changes.
- **Rollback mechanics:** Validate backup, restore, and reopen-on-legacy procedures in the actual deployment environment.

## Sources

### Primary (HIGH confidence)

- `.planning/PROJECT.md` — project scope, requirements, constraints, and active decisions.
- `.planning/codebase/ARCHITECTURE.md` — current runtime architecture and module patterns.
- `.planning/codebase/STRUCTURE.md` — current directory and deployable structure.
- `.planning/codebase/CONCERNS.md` — tenant drift, token/session, migration, and fragile-area risks.
- `.planning/codebase/TESTING.md` — verification patterns and release gates.
- `docs/START_HERE.md` — authoritative documentation lookup order.
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md` — backend boundary contract.
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md` — governance, hardening, rollback, and architecture evidence requirements.
- `docs/architecture/adr/0001-modular-monolith-boundaries.md` — accepted modular monolith boundary decision.
- `docs/architecture/adr/0003-migration-facade-strategy.md` — accepted compatibility facade strategy.
- `docs/architecture/adr/0032-standalone-dgfy-api-service.md` — standalone DGFY API boundary and scope concern.
- `refactor/DGFY_Project_Status_and_Proposal.md` — standalone DGFY business/product rationale.
- `refactor/DGFY_Implementation_Phases.md` — phased scope and explicit deferrals.
- `refactor/DGFY_Migration_Cutover_Strategy.md` — Strangler migration, cutover, rehearsal, and abort requirements.
- `refactor/DGFY_Developer_Technical_Reference.md` — target architecture and migration context.
- `refactor/DGFY_Domain_01_Accounts.md` — account, business, staff, branch, tenancy, and login model.

### Secondary (MEDIUM confidence)

- Context7 `/sequelize/cli` — Sequelize CLI migration execution, DB-backed `SequelizeMeta`, migration storage, and undo behavior.
- Context7 `/sequelize/umzug` — Umzug `SequelizeStorage`, custom context, and programmatic up/down behavior.
- Context7 `/docker/compose` — healthcheck dependency and one-shot service completion semantics.
- Context7 `/websites/dev_mysql_doc_refman_8_0_en` — MySQL metadata locking, online DDL, charset/collation behavior.
- Microsoft Azure Architecture Center, Strangler Fig pattern, last updated 2026-06-02 — facade, anti-corruption layer, database extraction, cutover, and rollback considerations.
- Martin Fowler, Strangler Fig, 2024-08-22 — modernization seam and transitional architecture guidance.
- AWS DMS best practices — validation, monitoring, metrics, and task logs during database migration.
- MySQL 8.4 Reference Manual — metadata locking and DDL contention guidance.

### Tertiary (LOW confidence)

- Feature market/differentiator inference from local refactor documents — adequate for milestone scope, but should not be treated as broader product-market validation.

---
*Research completed: 2026-07-10*
*Ready for roadmap: yes*

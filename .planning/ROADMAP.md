# Roadmap: DGFY Standalone Refactor

## Overview

DGFY moves from an IMS-backed foundation to standalone `dgfy_*` landlord and tenant databases through a database-first Strangler Fig path. The live legacy POS and Storefront stay available while one explicit migration runner, new database contracts, old-to-new migration proof, and backend Accounts/Businesses/Tenancy APIs are built beside legacy. Architecture decisions follow `docs/START_HERE.md`, `docs/architecture/ARCHITECTURE_BOUNDARIES.md`, `docs/architecture/ARCHITECTURE_GOVERNANCE.md`, and ADR 0003's compatibility facade strategy.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Architecture and Migration Runner Contract** - Operators get one explicit migration image contract before any schema or API work depends on it. (completed 2026-07-10)
- [x] **Phase 2: DGFY Database Foundation** - New landlord and tenant `dgfy_*` schemas exist beside legacy and can be verified repeatably. (completed 2026-07-11)
- [ ] **Phase 3: Old-to-New Migration Proof** - Operators can rehearse and apply legacy-to-DGFY data transformations with retry and verification evidence.
- [ ] **Phase 4: Backend Accounts, Businesses, and Tenancy Foundation** - Backend APIs use the stable DGFY schema for the first standalone identity and tenancy scope.
- [ ] **Phase 5: Compatibility and Backend-First Cutover Seam** - Current POS and Storefront behavior remains available through narrow, temporary compatibility seams.
- [ ] **Phase 6: Release Evidence and Rehearsal Gates** - Release evidence proves architecture, migration, tenant drift, and compatibility checks before cutover planning.
- [ ] **Phase 7: Cutover Runbook and Deferred Domain Split** - Production cutover remains gated by a rehearsal-backed runbook and later domain plans stay out of v1.

## Phase Details

### Phase 1: Architecture and Migration Runner Contract

**Goal**: Operators can run migration work through a dedicated one-shot artifact with explicit commands, environment validation, metadata storage, and reports.
**Depends on**: Nothing (first phase)
**Requirements**: RUN-01, RUN-02, RUN-03, RUN-04, RUN-05
**Success Criteria** (what must be TRUE):

  1. Operator can build and run the migration runner separately from long-running backend/API containers.
  2. Operator can choose schema, data dry-run, data apply, verify, status/reporting, and rollback-plan support commands from the same image.
  3. Runner refuses to connect until required environment, target database, runtime mode, and destructive-operation flags are valid.
  4. Every runner command leaves database-backed metadata plus machine-readable and human-readable evidence.

**Plans**: 4/4 plans complete

Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Runner foundation: env validation (RUN-03) + safety gates + lazy DB connection factories

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — Migration metadata store (RUN-04) + JSON/summary report writers (RUN-05)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-03-PLAN.md — CLI command surface (RUN-02): schema/data/verify/status/rollback-plan + Commander dispatch

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 01-04-PLAN.md — One-shot container packaging (RUN-01): Dockerfile + entrypoint

### Phase 2: DGFY Database Foundation

**Goal**: DGFY landlord and tenant database foundations exist beside legacy with additive, repeatable migrations and schema verification.
**Depends on**: Phase 1
**Requirements**: DBF-01, DBF-02, DBF-03, DBF-04, DBF-05
**Success Criteria** (what must be TRUE):

  1. Operator can create DGFY landlord and tenant schemas without mutating legacy schemas by default.
  2. Developer can inspect landlord tables for Accounts, Businesses, Branches, Tenancy registry, tenant DB pointers, and migration metadata.
  3. Developer can inspect tenant foundation tables for Staff Accounts, Assignments, Terminal identity, and tenant-local ownership metadata.
  4. Re-running schema migration and verification proves expected tables, columns, indexes, constraints, metadata records, and tenant coverage.

**Plans**: 5/5 plans complete

Plans:
**Wave 1**

- [x] 02-01-PLAN.md — Runner hardening before DGFY schema migrations

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 02-02-PLAN.md — DGFY core landlord schema foundation

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 02-03-PLAN.md — DGFY per-business schema foundation and target selection

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 02-04-PLAN.md — Schema verification evidence and documentation closure

**Wave 5** *(blocked on Wave 4 completion; gap closure)*

- [x] 02-05-PLAN.md — Gap closure: scope verify.js migration_metadata try/catch per target (CR-01)

### Phase 3: Old-to-New Migration Proof

**Goal**: Operators can transform legacy/current data into DGFY-owned schemas with dry-run, apply, checkpoint, retry, and verification evidence.
**Depends on**: Phase 2
**Requirements**: MIG-01, MIG-02, MIG-03, MIG-04, MIG-05
**Success Criteria** (what must be TRUE):

  1. Developer can review source-to-target mapping evidence for account, tenant, staff, branch/location, and terminal-like legacy records.
  2. Operator can run a dry-run that reports planned inserts, updates, skips, conflicts, orphan records, and tenant coverage without mutating `dgfy_*` data.
  3. Operator can run apply mode with durable checkpoints and deterministic legacy-to-DGFY ID maps.
  4. Operator can interrupt and retry migration without duplicate records, inconsistent references, or manual cleanup.
  5. Verification reports compare source and target counts, required relationships, skipped/conflict records, and unresolved data-quality issues.

**Plans**: 2/5 plans executed

Plans:
**Wave 1**

- [x] 03-01-PLAN.md — Metadata and target manifest contract

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 03-02-PLAN.md — Source-to-target mapping doc and mapper fixtures

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 03-03-PLAN.md — Dry-run transformations and report evidence

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 03-04-PLAN.md — Apply mode with ID maps, checkpoints, and retry safety

**Wave 5** *(blocked on Wave 4 completion)*

- [ ] 03-05-PLAN.md — Data verification and gated rehearsal evidence

### Phase 4: Backend Accounts, Businesses, and Tenancy Foundation

**Goal**: Users and operators can use backend Accounts, Businesses, and Tenancy APIs backed by the new DGFY schema and governed module boundaries.
**Depends on**: Phase 3
**Requirements**: API-01, API-02, API-03, API-04, API-05, API-06
**Success Criteria** (what must be TRUE):

  1. User can register or log in, manage profile/session basics, and be looked up through the DGFY account schema.
  2. Business owner or manager can create/select a business, register branch basics, and receive scope from the DGFY business schema.
  3. Operator or authenticated user can resolve tenant registry metadata, tenant context selection, and tenant session creation through DGFY tenancy APIs.
  4. Tenant session creation is rejected unless landlord membership and tenant-local assignment or authorized scope evidence both exist.
  5. Architecture and backend tests prove controllers are transport-only, use cases own business logic, repositories own Sequelize access, and persistence side effects are durable.

**Plans**: TBD

### Phase 5: Compatibility and Backend-First Cutover Seam

**Goal**: Existing POS and Storefront behavior stays available while any old-client path to new backend behavior is contained behind temporary API-boundary seams.
**Depends on**: Phase 4
**Requirements**: CMP-01, CMP-02, CMP-03
**Success Criteria** (what must be TRUE):

  1. Existing vendor and consumer paths through POS and Storefront remain available while the new foundation runs beside legacy.
  2. Any legacy touch has documented rationale, tests, rollback notes, and removal criteria before it is accepted.
  3. Compatibility adapters, when needed, translate at API boundaries and do not define canonical DGFY domain contracts.
  4. Developer can identify the temporary compatibility inventory and the condition that removes each seam.

**Plans**: TBD

### Phase 6: Release Evidence and Rehearsal Gates

**Goal**: Release readiness is backed by architecture, migration, drift, and compatibility evidence instead of health checks alone.
**Depends on**: Phase 5
**Requirements**: CMP-04
**Success Criteria** (what must be TRUE):

  1. Release evidence includes passing architecture checks for any changed backend or API boundary.
  2. Migration verification and tenant drift checks produce reviewable reports for all targeted `dgfy_*` schemas.
  3. Targeted smoke or contract checks prove any touched compatibility seams still preserve current behavior.

**Plans**: TBD

### Phase 7: Cutover Runbook and Deferred Domain Split

**Goal**: Production cutover is not scheduled until rehearsal, backup/restore, abort, and reopen-on-legacy evidence exists, and deferred domains are split into later milestones.
**Depends on**: Phase 6
**Requirements**: CMP-05
**Success Criteria** (what must be TRUE):

  1. Cutover planning captures rehearsal runtime, realistic data-volume evidence, and operator-visible migration reports.
  2. Backup/restore proof, abort thresholds, and reopen-on-legacy steps are documented before any production cutover is scheduled.
  3. Product, POS checkout, payment, fiscal, and frontend migration scope is explicitly deferred into post-foundation planning instead of entering v1 implementation.

**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Architecture and Migration Runner Contract | 4/4 | Complete    | 2026-07-10 |
| 2. DGFY Database Foundation | 5/5 | Complete    | 2026-07-10 |
| 3. Old-to-New Migration Proof | 2/5 | In Progress|  |
| 4. Backend Accounts, Businesses, and Tenancy Foundation | 0/TBD | Not started | - |
| 5. Compatibility and Backend-First Cutover Seam | 0/TBD | Not started | - |
| 6. Release Evidence and Rehearsal Gates | 0/TBD | Not started | - |
| 7. Cutover Runbook and Deferred Domain Split | 0/TBD | Not started | - |

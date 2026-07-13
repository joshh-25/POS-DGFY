# Roadmap: DGFY Standalone Refactor

## Overview

DGFY moves from an IMS-backed foundation to standalone `dgfy_*` landlord and tenant databases through a database-first Strangler Fig path. The live legacy POS and Storefront stay available while one explicit migration runner, new database contracts, old-to-new migration proof, and backend Accounts/Businesses/Tenancy APIs are built beside legacy. Architecture decisions follow `docs/START_HERE.md`, `docs/architecture/ARCHITECTURE_BOUNDARIES.md`, `docs/architecture/ARCHITECTURE_GOVERNANCE.md`, and ADR 0003's compatibility facade strategy.

Once that foundation stood (Phases 1-6), the v2.0 Commerce Domain milestone extends it with new module code inside `apps/dgfy-api` — Product Catalog, Booking, Shift & Cash Drawer, Fiscal/Compliance, POS Checkout & Payment, Storefront Discovery & Online Ordering, and Order Fulfillment — following the exact `routes -> controllers -> usecases -> repositories -> models` layering and per-module folder shape already proven by `modules/accounts`/`modules/businesses`. New tables live in `dgfy_business_*` tenant schemas (with `dgfy_core` used only for the Storefront Discovery Index and the cross-database order-write pattern). This milestone is backend-API-only: existing frontends keep talking to the old backend, and no new frontend apps are built.

## Milestones

- 🚧 **v1.0 Standalone Refactor Foundation** - Phases 1-7 (Phases 1-6 complete; Phase 7 paused 2026-07-12 pending real Docker/GHCR rehearsal infra — CMP-05 stays Pending, not archived)
- 📋 **v2.0 Commerce Domain — Product, Checkout & Fulfillment** - Phases 8-11 (planned; backend-API-only, does not depend on Phase 7 completing)

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Architecture and Migration Runner Contract** - Operators get one explicit migration image contract before any schema or API work depends on it. (completed 2026-07-10)
- [x] **Phase 2: DGFY Database Foundation** - New landlord and tenant `dgfy_*` schemas exist beside legacy and can be verified repeatably. (completed 2026-07-11)
- [x] **Phase 3: Old-to-New Migration Proof** - Operators can rehearse and apply legacy-to-DGFY data transformations with retry and verification evidence. (completed 2026-07-11)
- [x] **Phase 4: Backend Accounts, Businesses, and Tenancy Foundation** - Backend APIs use the stable DGFY schema for the first standalone identity and tenancy scope. (gaps found 2026-07-11 — see 04-VERIFICATION.md) (completed 2026-07-11) (activation handoff added in 04-09 (activate-tenant CLI); SC2/SC3 reachable once the DB-backed activation run is executed against real MySQL)
- [x] **Phase 5: Compatibility and Backend-First Cutover Seam** - Current POS and Storefront behavior remains available through narrow, temporary compatibility seams. (completed 2026-07-12)
- [x] **Phase 6: Release Evidence and Rehearsal Gates** - Release evidence proves architecture, migration, tenant drift, and compatibility checks before cutover planning. (completed 2026-07-12)
- [ ] **Phase 7: Cutover Runbook and Deferred Domain Split** - Production cutover remains gated by a rehearsal-backed runbook and later domain plans stay out of v1. (paused 2026-07-12 — requires real Docker/GHCR rehearsal infra and operator-run docker login; parked in favor of starting the next milestone. Resume with `/gsd-execute-phase 7` once prerequisites are ready.)
- [ ] **Phase 8: Commerce Foundation — Product Catalog, Booking, Shift & Cash Drawer, Compliance Gating** - Businesses can define what they sell/service and staff can run accountable cash shifts under a compliance-mode gate, without any new table referencing legacy `items`/IMS data. (gaps found 2026-07-13 — see 08-VERIFICATION.md; FSC-02 closed by 08-10 and independently re-verified; new gap FSC-01 — revoke/reject review outcome never demotes compliance_mode_state, so a revoked business keeps ALLOW)
- [ ] **Phase 9: POS Checkout & Payment** - Staff can run a complete, trustworthy checkout — line items, discounts incl. SC/PWD, payment method, server-verified totals/change, receipts — gated by an open shift and the compliance policy engine.
- [ ] **Phase 10: Storefront Discovery & Online Ordering** - Consumers can discover stores/Products and complete a guest-or-account online order that durably and idempotently becomes a real tenant Availment.
- [ ] **Phase 11: Order Fulfillment & Delivery Coordination** - Business staff can process incoming online orders through a shared fulfillment pipeline, including manual courier assignment and payout tracking.

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

**Plans**: 6/6 plans complete

Plans:
**Wave 1**

- [x] 03-01-PLAN.md — Metadata and target manifest contract

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 03-02-PLAN.md — Source-to-target mapping doc and mapper fixtures

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 03-03-PLAN.md — Dry-run transformations and report evidence

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 03-04-PLAN.md — Apply mode with ID maps, checkpoints, and retry safety

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 03-05-PLAN.md — Data verification and gated rehearsal evidence

**Wave 6** *(blocked on Wave 5 completion; gap closure)*

- [x] 03-06-PLAN.md — Gap closure: tenant-local verification keys and live rehearsal convergence

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

**Plans**: 11/11 plans complete

- [x] 04-PLAN.md

**Wave 1**

- [x] 04-01-PLAN.md

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 04-02-PLAN.md

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 04-03-PLAN.md
- [x] 04-03.5-PLAN.md

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 04-04-PLAN.md

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 04-05-PLAN.md

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 04-06-PLAN.md — Gap closure: business entity layer and safe tenant registry metadata/lookup

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 04-07-PLAN.md — Gap closure: durable tenant-backed location and staff onboarding persistence

**Wave 8** *(blocked on Wave 7 completion)*

- [x] 04-08-PLAN.md — Gap closure: TerminalIdentity tenant model wiring and refreshed DB-backed verification

**Wave 9** *(blocked on Wave 8 completion)*

- [x] 04-09-PLAN.md — operator tenant-activation CLI (activate-tenant) + provisioning->active/verified handoff

**Cross-cutting constraints:**

- All use cases return ApplicationResult; DomainError for validation/business failures

### Phase 5: Compatibility and Backend-First Cutover Seam

**Goal**: Existing POS and Storefront behavior stays available while any old-client path to new backend behavior is contained behind temporary API-boundary seams.
**Depends on**: Phase 4
**Requirements**: CMP-01, CMP-02, CMP-03
**Success Criteria** (what must be TRUE):

  1. Existing vendor and consumer paths through POS and Storefront remain available while the new foundation runs beside legacy.
  2. Any legacy touch has documented rationale, tests, rollback notes, and removal criteria before it is accepted.
  3. Compatibility adapters, when needed, translate at API boundaries and do not define canonical DGFY domain contracts.
  4. Developer can identify the temporary compatibility inventory and the condition that removes each seam.

**Plans**: 3/3 plans complete

Plans:
**Wave 1**

- [x] 05-01-PLAN.md — Compatibility-seam manifest (JSON source of truth) + CI validator (schema/completeness/reconciliation/path-safety) + inventory generator

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 05-02-PLAN.md — SC3 guardrail extension (compat-import ban + entities/ scan + eslint) + CI/husky acceptance gate + governance ADR 0035
- [x] 05-03-PLAN.md — DB-continuity reference seam (non-destructive verify-continuity command) + first manifest entry + inventory regeneration

### Phase 6: Release Evidence and Rehearsal Gates

**Goal**: Release readiness is backed by architecture, migration, drift, and compatibility evidence instead of health checks alone.
**Depends on**: Phase 5
**Requirements**: CMP-04
**Success Criteria** (what must be TRUE):

  1. Release evidence includes passing architecture checks for any changed backend or API boundary.
  2. Migration verification and tenant drift checks produce reviewable reports for all targeted `dgfy_*` schemas.
  3. Targeted smoke or contract checks prove any touched compatibility seams still preserve current behavior.

**Plans**: 3/3 plans complete

Plans:
**Wave 1**

- [x] 06-01-PLAN.md — Interactive tenant release-evidence runner command: registry discovery + inquirer checkbox selection + per-tenant drift/migration-verification reports (SC2, D-02/D-03)
- [x] 06-02-PLAN.md — Generic manifest-driven compatibility-seam smoke runner: active-entry iteration + integration-env fail-closed dispatch + per-seam report (SC3, D-04)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 06-03-PLAN.md — On-demand DGFY release-evidence orchestrator gate: architecture-checks gate + verdict aggregation into release_verdict-contract artifact + npm wiring (SC1, D-01, D-05)

### Phase 7: Cutover Runbook and Deferred Domain Split

**Goal**: Production cutover is not scheduled until rehearsal, backup/restore, abort, and reopen-on-legacy evidence exists, and deferred domains are split into later milestones.
**Depends on**: Phase 6
**Requirements**: CMP-05
**Success Criteria** (what must be TRUE):

  1. Cutover planning captures rehearsal runtime, realistic data-volume evidence, and operator-visible migration reports.
  2. Backup/restore proof, abort thresholds, and reopen-on-legacy steps are documented before any production cutover is scheduled.
  3. Product, POS checkout, payment, fiscal, and frontend migration scope is explicitly deferred into post-foundation planning instead of entering v1 implementation.

**Plans**: 0/3 plans complete

Plans:
**Wave 1**

- [ ] 07-01-PLAN.md — Production-volume migration rehearsal: run the guinea-pig clone loop (auto-provision/seed/manifest/migrate/verify, one human-action checkpoint for release-evidence's TTY tenant picker) until N consecutive clean attempts, then write the committed rehearsal runbook (SC1)
- [ ] 07-03-PLAN.md — Deferred-domain-split register: committed doc that makes SC3 explicit and traceable by cross-referencing (not duplicating) REQUIREMENTS.md v2 (PRD/CUT) + PROJECT.md Out of Scope (SC3, independent of 07-01)

**Wave 2** *(blocked on 07-01 completion)*

- [ ] 07-02-PLAN.md — Cutover runbook (SC2 gate): dgfy_*-only backup/restore proof against a preserved 07-01 clone (D-04) + committed governed runbook documenting the wall-clock abort threshold (D-01), human enforcement (D-02), and the reopen-on-legacy non-event (D-03)

### Phase 8: Commerce Foundation — Product Catalog, Booking, Shift & Cash Drawer, Compliance Gating

**Goal**: Businesses can define what they sell and service (Products, folders, Basic Inventory, bookable Services) and staff can run accountable cash shifts, with a tenant/branch compliance-mode gate in place — establishing every downstream Checkout/Storefront dependency (`product_id`, shift-open precondition, compliance gate contract) in one phase, before Checkout is written against it. No new table references the legacy IMS-shared `items`/`PosTransactionLine` tables.
**Depends on**: Phase 6 (stable `dgfy-api` foundation — Accounts/Businesses/Tenancy, compatibility governance, release-evidence tooling — that this milestone's modules extend). Independent of Phase 7 (paused cutover rehearsal is an unrelated track and does not block this milestone).
**Requirements**: PRD-01, PRD-02, PRD-03, PRD-04, PRD-05, BOK-01, BOK-02, BOK-03, SFT-01, SFT-02, SFT-03, FSC-01, FSC-02
**Success Criteria** (what must be TRUE):

  1. Business owner can create a Product in Food, Service, or Retail category, group Products into folders, and choose Basic Inventory (vendor-set stock count) or non-stock per Product — with whether a given sale line decrements stock decided per line, not fixed on the Product — using genuinely new `dgfy_business_*` tables, never a foreign key into legacy `items`/`PosTransactionLine`.
  2. Every stock-count change (sale, restock, loss, adjustment) is recorded as an append-only Inventory Movement row that cannot be mutated after insert.
  3. Business owner can mark a Service Product bookable with a slot duration and branch-level concurrent capacity; a Booking is blocked once that branch-level capacity for a slot is reached, and a fulfilled Booking links to the Availment that completes it.
  4. Staff can open a shift with a declared starting cash float (one open shift per cashier+terminal enforced at the database level), close it with a computed Expected-vs-Actual cash Difference, and every cash-drawer event — including a no-sale drawer pop — is logged.
  5. A tenant/branch carries a compliance-mode state reflecting whether required fiscal paperwork is present and verified, checked through one shared policy-engine gate port rather than duplicated per surface (wired into Checkout, Shift, and receipt issuance in Phase 9).

**Plans**: 11/12 plans executed

Plans:
**Wave 1**

- [x] 08-01-PLAN.md — Commerce-foundation migration (8 tenant tables + append-only triggers + one-open-shift generated-column unique index) + schema-contract update so verify passes (PRD-04, PRD-05, SFT-01, SFT-03)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 08-02-PLAN.md — 8 Tenant Sequelize models (insert-only ledgers) + TenantConnector modelDefiners registry (PRD-01, PRD-02, PRD-04, SFT-01, SFT-02, FSC-01)

**Wave 3** *(blocked on Wave 2 completion; 4 parallel module plans)*

- [x] 08-03-PLAN.md — products module: Product CRUD (Food/Service/Retail, inventory_mode), flat folders, mark-bookable config (PRD-01, PRD-02, PRD-03, PRD-05, BOK-01)
- [x] 08-04-PLAN.md — inventory module: sole-writer append-only ledger (restock/loss/adjustment) + reserved sale/booking effect contracts (PRD-04)
- [x] 08-05-PLAN.md — shifts module: open/close/reconcile + one-open-shift 409 mapping + append-only cash-drawer log + stale-flag (SFT-01, SFT-02, SFT-03)
- [x] 08-06-PLAN.md — compliance module: tenant state machine + shared gate port with the D-05 deviation (compliant_active allows fiscal AND non_fiscal) (FSC-01, FSC-02)

**Wave 4** *(blocked on 08-03 + 08-04)*

- [x] 08-07-PLAN.md — booking module: create/cancel with atomic branch-capacity guard, dual-auth cancel, reserved availment link (BOK-02, BOK-03)

**Wave 5** *(blocked on all module plans)*

- [x] 08-08-PLAN.md — composition-root wiring: build + mount all 5 commerce modules, cross-module injection, mount/integration smoke test (PRD-01, PRD-03, BOK-02, SFT-01, FSC-02)

**Wave 6** *(gap closure — CR-01/CR-02 from 08-VERIFICATION.md, isolated to modules/compliance)*

- [x] 08-09-PLAN.md — compliance gap closure: DB-enforceable one-row-per-branch invariant (generated-column unique index) + atomic findOrCreate write path with 409 mapping (CR-01), and full evidence-derived checklist enforcement in the compliant_active POS gate (CR-02), D-05 preserved (FSC-01, FSC-02)

**Wave 7** *(gap closure — FSC-02 re-verification: fail-open/fail-closed default inconsistency in evaluateComplianceChecklist, from 08-VERIFICATION.md)*

- [x] 08-10-PLAN.md — compliance gap closure: make all seven evidence-derived readiness signals fail closed uniformly (five `!== false` defaults → `=== true`) + partial-evidence regression test proving a compliant_active POS bundle with omitted signals yields REQUIRES_SETUP not ALLOW, D-05 preserved (FSC-02)

**Wave 8** *(gap closure — three Critical findings from the post-08-10 08-REVIEW.md / 08-VERIFICATION.md; disjoint modules, run in parallel)*

- [x] 08-11-PLAN.md — compliance gap closure (FSC-01): reject/revoke review outcomes now demote compliance_mode_state.state to non_compliant_active so a revoked/rejected compliant_active business no longer reaches ALLOW for a Fiscal POS_CHECKOUT (state-demotion as single source of truth), D-05 preserved (FSC-01)
- [ ] 08-12-PLAN.md — booking/shift concurrency hardening (CR-02, CR-03): row-lock (FOR UPDATE) the cancelBooking and closeShift guard reads so concurrent double-submits serialize — a second cancel cannot double-release capacity, a second close cannot write a duplicate 'close' event or lose the reconciliation update (BOK-02, SFT-02, SFT-03)

### Phase 9: POS Checkout & Payment

**Goal**: Staff can run a complete, trustworthy point-of-sale checkout — building an Availment, applying discounts (including the statutory Senior Citizen/PWD discount), selecting a payment method, and producing a receipt — gated by an open shift and the shared compliance policy engine, with totals and cash change always computed server-side.
**Depends on**: Phase 8 (Product Catalog for line items; Shift for the open-shift precondition; compliance gate port)
**Requirements**: CHK-01, CHK-02, CHK-03, CHK-04, CHK-05, CHK-06, FSC-03
**Success Criteria** (what must be TRUE):

  1. Staff can add Products to an Availment, adjust line-item quantities, and remove lines before finalizing a sale.
  2. The system computes order totals and cash change server-side (`change_due = cash_received - total`); the client cannot submit an arbitrary total or change amount.
  3. Staff can apply a discount code or a permission-gated manual discount (recorded with the applying staff ID and a reason), and the system computes the Senior Citizen/PWD discount server-side per BIR rules (VAT-exclusive base, 20% discount, MEMC group-meal rule), producing its own separate receipt line.
  4. Staff can select a payment method (Cash, GCash, Credit Card) per Availment, with the method and amount recorded (not a live gateway charge); an Availment is rejected unless the cashier and terminal have an open shift.
  5. A completed Availment produces a receipt reflecting every applied discount and tax, gated by the Phase 8 compliance policy engine.

**Plans**: TBD

### Phase 10: Storefront Discovery & Online Ordering

**Goal**: Consumers can discover DGFY stores and Products and complete an online order — as a guest or a logged-in DGFY Account — that is durably and idempotently finalized into the correct tenant's Availment, safely crossing the Landlord/Tenant database boundary for the first time in this system.
**Depends on**: Phase 8 (Product Catalog to browse), Phase 9 (Availment shape the order finalizes into)
**Requirements**: STF-01, STF-02, STF-03, STF-04, STF-05
**Success Criteria** (what must be TRUE):

  1. Consumer can browse and search DGFY stores and Products through the map-based discovery surface, then retrieve a specific store's product listing and add Products to a cart.
  2. Consumer can complete a purchase as a guest (with durable contact info) or as a logged-in DGFY Account, without forced account creation.
  3. Consumer can choose pickup or delivery, immediate or scheduled, and a payment method (cash on pickup/delivery, or GCash/Credit Card via PayMongo where available) at checkout.
  4. A storefront order is durably recorded on the Landlord side first, then finalized into the correct tenant's Availment idempotently — an interrupted or retried cross-database write never produces a duplicate or lost order, and any unresolved case lands in an explicit manual-resolution state rather than failing silently.

**Plans**: TBD

### Phase 11: Order Fulfillment & Delivery Coordination

**Goal**: Business staff can process incoming online orders through a shared fulfillment pipeline from placement to completion, including manual courier/delivery assignment and payout tracking — mirroring legacy's manual "outbound links" capability, not live courier API integration.
**Depends on**: Phase 10 (online orders are the primary fulfillment source); Phase 9 (POS-originated Availments also flow through the same stage-event lifecycle)
**Requirements**: FUL-01, FUL-02, FUL-03
**Success Criteria** (what must be TRUE):

  1. Business staff can retrieve and process incoming online orders.
  2. Staff can progress an order's fulfillment status through a shared core pipeline (placed to confirmed to preparing to ready/out-for-delivery to completed), with handoff steps specific to pickup, delivery, and dine-in.
  3. Staff can manually assign a courier/delivery partner to an order and track courier payout through to fulfillment completion.

**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 (v1.0; Phase 7 paused). v2.0 Commerce Domain runs 8 -> 9 -> 10 -> 11 and does not depend on Phase 7 completing.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Architecture and Migration Runner Contract | 4/4 | Complete    | 2026-07-10 |
| 2. DGFY Database Foundation | 5/5 | Complete    | 2026-07-10 |
| 3. Old-to-New Migration Proof | 6/6 | Complete   | 2026-07-11 |
| 4. Backend Accounts, Businesses, and Tenancy Foundation | 11/11 | Complete    | 2026-07-11 |
| 5. Compatibility and Backend-First Cutover Seam | 3/3 | Complete    | 2026-07-12 |
| 6. Release Evidence and Rehearsal Gates | 3/3 | Complete    | 2026-07-12 |
| 7. Cutover Runbook and Deferred Domain Split | 0/3 | Paused | - |
| 8. Commerce Foundation — Product Catalog, Booking, Shift & Cash Drawer, Compliance Gating | 11/12 | In Progress|  |
| 9. POS Checkout & Payment | 0/TBD | Not started | - |
| 10. Storefront Discovery & Online Ordering | 0/TBD | Not started | - |
| 11. Order Fulfillment & Delivery Coordination | 0/TBD | Not started | - |

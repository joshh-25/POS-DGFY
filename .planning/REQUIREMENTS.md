# Requirements: DGFY Standalone Refactor

**Defined:** 2026-07-10
**Core Value:** DGFY can become a standalone multi-tenant POS and Storefront system without breaking the existing live platform during migration.

## User Stories

- As a DGFY operator, I can run schema, data, verify, status, and rollback-support commands from one migration image so migrations are explicit deployment actions instead of hidden API startup side effects.
- As a DGFY developer, I can build Accounts, Businesses, and Tenancy APIs against stable `dgfy_*` database contracts instead of inferring behavior from IMS-shaped legacy tables.
- As a DGFY operator, I can rehearse old-to-new data migration with dry-run, checkpoint, retry, and verification reports before any cutover decision.
- As an existing DGFY vendor or consumer, I continue using the current POS and Storefront while the new database/backend foundation is built beside legacy.

## Acceptance Criteria

- The migration runner has explicit commands, documented environment contracts, DB-backed execution metadata, and deployment wiring as a one-shot container.
- New DGFY landlord and tenant schema foundations are created beside legacy schemas and verified without requiring legacy schema mutation.
- Old-to-new migration scripts provide dry-run and apply modes with durable checkpoints, deterministic source-to-target ID maps, skipped/conflict reports, and retry proof.
- Backend Accounts, Businesses, and Tenancy APIs are implemented only after the database contract is stable and follow repository-owned Sequelize access.
- Compatibility seams are narrow, documented, temporary, and covered by tests that prove current behavior remains available.

## Definition of Done

- Architecture impact is classified and ADR impact is resolved before cross-boundary work starts.
- `npm run check:architecture` and relevant backend tests pass for implementation phases.
- Migration commands emit machine-readable reports and human-readable summaries.
- Data migration rehearsal proves idempotency, kill/retry behavior, and verification against realistic legacy-shaped data.
- Account, business, tenancy, and migration flows satisfy the hardening requirements in `docs/architecture/ARCHITECTURE_GOVERNANCE.md`.
- Production cutover is not attempted until a separate rehearsal-backed runbook defines abort thresholds and rollback/reopen-on-legacy steps.

## v1 Requirements

Requirements for the initial database-first refactor milestone. Each maps to roadmap phases.

### Migration Runner

- [x] **RUN-01**: Operator can build and run a dedicated migration runner container separately from long-running backend/API containers.
- [x] **RUN-02**: Operator can execute explicit runner commands for schema migration, data migration dry-run, data migration apply, verification, status/reporting, and rollback-plan support.
- [x] **RUN-03**: Runner validates required environment variables, target database names, runtime mode, and destructive-operation flags before connecting to any database.
- [x] **RUN-04**: Runner stores schema/data migration execution metadata in database-backed tables, not local files inside the container.
- [x] **RUN-05**: Runner produces machine-readable report files and concise human-readable summaries for every command.

### Database Foundation

- [x] **DBF-01**: New DGFY landlord schema is created beside legacy/current databases without mutating legacy schemas by default.
- [x] **DBF-02**: DGFY landlord schema contains Accounts, Businesses, Branches, Tenancy registry, tenant database pointers, and migration metadata needed by the first backend scope.
- [x] **DBF-03**: New DGFY tenant schema foundation contains Staff Accounts, Assignments, Terminal identity, and tenant-local ownership metadata needed by the first backend scope.
- [x] **DBF-04**: Schema migrations are additive, repeatable, and tracked by migration metadata with no reliance on `sync({ alter: true })` as the production migration strategy.
- [x] **DBF-05**: Schema verification proves expected tables, columns, indexes, constraints, migration records, and tenant coverage for all targeted `dgfy_*` schemas.

### Data Migration

- [x] **MIG-01**: Source-to-target mapping documentation defines how legacy/current account, tenant, staff, branch/location, and terminal-like records map into DGFY-owned schemas.
- [x] **MIG-02**: Data migration dry-run reports planned inserts, updates, skips, conflicts, orphan records, and tenant coverage without mutating `dgfy_*` data.
- [x] **MIG-03**: Data migration apply mode writes transformed data into `dgfy_*` schemas using durable checkpoints and deterministic legacy-to-DGFY ID maps.
- [x] **MIG-04**: Data migration can be interrupted and safely retried without duplicate records, inconsistent references, or manual cleanup.
- [x] **MIG-05**: Data verification reports compare source and target counts, required relationships, skipped/conflict records, and unresolved data-quality issues.

### Backend Foundation

- [x] **API-01**: Backend exposes Accounts APIs for DGFY account registration/login basics, profile/session lifecycle, and account lookup against the new DGFY schema.
- [ ] **API-02**: Backend exposes Businesses APIs for business creation, business selection, branch registry basics, and owner/manager scope using the new DGFY schema.
- [ ] **API-03**: Backend exposes Tenancy APIs for tenant registry lookup, tenant provisioning metadata, tenant context selection, and tenant session creation.
- [x] **API-04**: Tenant session creation requires explicit landlord membership plus tenant-local assignment or authorized scope evidence before tenant-local access is granted.
- [x] **API-05**: Backend modules follow `routes -> controllers -> usecases -> repositories -> models`; controllers stay transport-only and repositories own Sequelize access.
- [x] **API-06**: Account, business, tenancy, and session flows include tests for success, validation failure, duplicate/conflict paths, replay/reuse rejection where applicable, logout/session cleanup, and durable persistence side effects.

### Compatibility And Safety

- [ ] **CMP-01**: Existing POS and Storefront behavior remains available while the new database/backend foundation is built beside legacy.
- [ ] **CMP-02**: Any legacy code touch is limited to an approved compatibility seam with documented rationale, tests, rollback notes, and removal criteria.
- [ ] **CMP-03**: Compatibility adapters, if required, live at API boundaries and do not define canonical DGFY domain contracts.
- [ ] **CMP-04**: Release evidence includes architecture checks, migration verification, tenant drift checks, and targeted smoke/contract checks for touched compatibility seams.
- [ ] **CMP-05**: Cutover planning captures rehearsal runtime, realistic data-volume evidence, backup/restore proof, abort thresholds, and reopen-on-legacy steps before production cutover is scheduled.

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Product And POS Domains

- **PRD-01**: Product and Availment database/API migration covers Food, Retail, Service, basic inventory, booking, and fulfillment modeling after tenancy foundation is stable.
- **PRD-02**: POS checkout, payment tender, split payments, discounts, shift management, fiscal compliance, and receipt behavior are designed as separate domain milestones with server-side correctness checks.
- **PRD-03**: Storefront/POS/Business frontend migration into new app surfaces proceeds only after backend and compatibility seams prove stable.

### Cutover And Decommissioning

- **CUT-01**: Full production cutover runbook is executed only after repeated realistic rehearsals meet the downtime target and abort threshold.
- **CUT-02**: Legacy code moves to `.archive` only after parity evidence proves no active runtime depends on it.
- **CUT-03**: Optional SKUpervisor/IMS integration contract is defined after DGFY owns its core schema.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Product/Availment implementation in v1 | Depends on stable Accounts/Businesses/Tenancy and has separate fulfillment, stock, scheduling, and migration design questions. |
| POS checkout/payment/fiscal/shift implementation in v1 | High-risk user-facing domains with known correctness and compliance issues; needs its own design and hardening. |
| Frontend migration in v1 | Database/backend foundation must stabilize first; current POS and Storefront stay live. |
| Big-bang cutover | Conflicts with Strangler Fig/ADR 0003 migration strategy and lacks rehearsal evidence. |
| Raw-copying legacy schemas | Preserves the IMS coupling this project is intended to remove. |
| Broad legacy cleanup | Risks regressions and merge conflicts while legacy remains the live fallback. |
| Automatic production cutover | Requires a separate rehearsal-backed runbook with abort and rollback proof. |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| RUN-01 | Phase 1 | Complete |
| RUN-02 | Phase 1 | Complete |
| RUN-03 | Phase 1 | Complete |
| RUN-04 | Phase 1 | Complete |
| RUN-05 | Phase 1 | Complete |
| DBF-01 | Phase 2 | Complete |
| DBF-02 | Phase 2 | Complete |
| DBF-03 | Phase 2 | Complete |
| DBF-04 | Phase 2 | Complete |
| DBF-05 | Phase 2 | Complete |
| MIG-01 | Phase 3 | Complete |
| MIG-02 | Phase 3 | Complete |
| MIG-03 | Phase 3 | Complete |
| MIG-04 | Phase 3 | Complete |
| MIG-05 | Phase 3 | Complete |
| API-01 | Phase 4 | Complete |
| API-02 | Phase 4 | Pending |
| API-03 | Phase 4 | Pending |
| API-04 | Phase 4 | Complete |
| API-05 | Phase 4 | Complete |
| API-06 | Phase 4 | Complete |
| CMP-01 | Phase 5 | Pending |
| CMP-02 | Phase 5 | Pending |
| CMP-03 | Phase 5 | Pending |
| CMP-04 | Phase 6 | Pending |
| CMP-05 | Phase 7 | Pending |

**Coverage:**

- v1 requirements: 26 total
- Mapped to phases: 26
- Unmapped: 0

---
*Requirements defined: 2026-07-10*
*Last updated: 2026-07-10 after roadmap creation*

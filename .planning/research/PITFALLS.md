# Pitfalls Research

**Domain:** Database-first multi-tenant Strangler Fig refactor for DGFY standalone platform
**Researched:** 2026-07-10
**Confidence:** MEDIUM overall. HIGH for repository-specific risks from governed docs and mapped codebase concerns; MEDIUM for external migration-pattern guidance.

## Critical Pitfalls

### Pitfall 1: Treating Landlord Migration Success as Tenant Migration Success

**What goes wrong:**
Landlord migrations pass, but one or more tenant databases miss tenant-scoped tables, columns, indexes, enum values, or seed/reference rows. Existing tenants then fail at runtime while newly provisioned tenants appear healthy.

**Why it happens:**
DGFY already has separate landlord and tenant schemas. The existing deployment path can run `npm run migrate` against the landlord database while tenant schema sync remains in report-only mode. The codebase map records this as a recurring drift path for POS catalog and transaction columns.

**How to avoid:**
Make tenant schema coverage a release artifact, not an optional post-deploy script. Every tenant-scoped schema change needs an explicit registry entry, `repair-dry-run`, `repair-apply`, and a zero-drift report across all active tenants before release. Avoid relying on broad `sync({ alter: true })` for mature tenants.

**Warning signs:**
- Migration PR only changes `backend/migrations` or new `dgfy_*` migrations with no tenant coverage manifest.
- Deploy evidence says tenant sync mode was `report`, not `repair-apply`.
- Tests create only fresh tenants and do not validate pre-existing tenant databases.
- Runtime errors mention missing tenant columns after a green landlord migration.

**Phase to address:**
Database foundation / one-shot migration runner phase before backend Accounts/Businesses/Tenancy APIs. Also gate every later tenant-scoped phase.

**Concrete validation evidence required:**
- Tenant schema registry coverage test output.
- Per-tenant `repair-dry-run` report showing intended SQL.
- Per-tenant `repair-apply` report showing success for active tenants.
- Final zero-drift report with `DEPLOY_TENANT_SYNC_REQUIRE_ZERO=1` semantics.
- At least one integration test that starts from an intentionally old tenant schema and proves repair.

---

### Pitfall 2: Letting Sequelize `sync({ alter: true })` Become the Migration Strategy

**What goes wrong:**
Schema changes appear easy during development, but production repairs become unpredictable, lock-prone, and hard to review. An alter pass across many tenant schemas can hold MySQL metadata locks, create transient 500s, and apply unplanned changes.

**Why it happens:**
Sequelize can alter schemas from model definitions, and DGFY already uses this pattern in provisioning/maintenance paths. That is convenient for new tenant creation but too broad for controlled multi-tenant production migration.

**How to avoid:**
Use explicit Sequelize migrations and declared additive tenant repair SQL. Keep `sync({ alter: true })` limited to new tenant provisioning or tightly controlled maintenance windows. For mature tenants, every schema mutation should be reviewable SQL with a rollback or forward-fix note.

**Warning signs:**
- A phase says "just run sync alter for all tenants."
- Migration diff is inferred from models instead of reviewed SQL.
- No lock/runtime estimate exists for tables with POS transactions, stock movements, bookings, or audit history.
- The migration runner has no command separation between schema migrate, tenant repair, data migrate, verify, and rollback/runbook support.

**Phase to address:**
Migration runner and schema foundation phase.

**Concrete validation evidence required:**
- One-shot migration image exposes explicit commands for schema, tenant-repair, data-migrate, verify, and rollback/runbook operations.
- Migration PR includes reviewed SQL or Sequelize migration operations, not only model edits.
- MySQL lock-risk note for every table alteration touching active tenant tables.
- Rehearsal report includes runtime and lock observations.

---

### Pitfall 3: Building Backend APIs Against an Unstable or Inferred DGFY Schema

**What goes wrong:**
Accounts, Businesses, Branches, Staff, Assignments, and Terminal APIs are implemented before the database contract is stable. The backend then encodes assumptions that later data migration cannot satisfy without compatibility hacks or destructive rewrites.

**Why it happens:**
Earlier refactor materials emphasize a backend/login cutover, while the current project brief explicitly corrects toward database-first. In a brownfield codebase, it is tempting to mirror current `Tenant`, `User`, and `DgfyAccountTenantMembership` shapes instead of first formalizing the new DGFY landlord/tenant contract.

**How to avoid:**
Freeze a minimal database contract before backend API work: landlord Accounts, Businesses, Branches, Tenancy registry, migration metadata; tenant Staff Accounts, Assignments, Terminal identity, and operational ownership. Backend use cases may only depend on that contract through repositories.

**Warning signs:**
- Backend route/controller work starts before migrations and seed fixtures exist.
- API tests mock persistence but no DB integration test proves the new schema.
- New code imports legacy models directly to bridge missing schema fields.
- Phase plan says "schema TBD" for identity or tenancy.

**Phase to address:**
Database foundation phase, before backend tenancy/auth foundation.

**Concrete validation evidence required:**
- Executed migrations for new `dgfy_*` landlord and tenant foundations.
- DB integration tests for account/business/tenant lifecycle on the new schema.
- Repository contracts for each backend tenancy/auth use case.
- `npm run check:architecture` evidence showing controllers remain transport-only and repositories own Sequelize access.

---

### Pitfall 4: Copying Legacy SKUpervisor Data Instead of Transforming It

**What goes wrong:**
The new DGFY database inherits IMS concepts: raw materials, FIFO/batch-costing assumptions, mixed IMS/DGFY role enums, subscription-billing names that collide with order payments, and POS line semantics that do not match the target domain.

**Why it happens:**
DGFY and SKUpervisor currently share schema. A raw copy is faster than a transformation map, but it preserves the exact coupling this refactor is meant to remove.

**How to avoid:**
Define source-to-target mapping tables before writing migration code. Migrate only the DGFY-relevant slice for the current phase. For product migration, finished-item catalog rows are in scope; `raw_material`, `packaging`, `supplies`, and IMS FIFO/batch-costing machinery are not default scope. Preserve target-domain names that avoid known collisions, especially around `Payment`.

**Warning signs:**
- Migration code selects `*` from legacy tables.
- Target schema reuses legacy enums without a decision record.
- Source categories are treated as target product categories.
- Staff/account role migration collapses DGFY account identity and tenant-local staff identity.

**Phase to address:**
Old-to-new data migration design in the database foundation phase; Product/Availment mapping in the later product phase.

**Concrete validation evidence required:**
- Field-level source-to-target mapping document for each migrated table.
- Explicit skipped-data report with counts and reasons.
- Reconciliation queries for counts, totals, and sampled transformed rows.
- Tests for edge cases: guest checkout data, cashier/staff assignment, terminal IDs, finished products, stock-exempt sale lines, and historical POS records.

---

### Pitfall 5: Non-Idempotent Data Migration and Half-Migrated State

**What goes wrong:**
A cutover run fails midway, and rerunning the migration duplicates accounts, products, transactions, stock movements, or bookings. Operators then face manual cleanup during the maintenance window.

**Why it happens:**
Sequelize CLI can track schema migration files, but old-to-new data transformation needs its own idempotency, checkpoints, and verification metadata. The current cutover strategy calls this out as not yet designed.

**How to avoid:**
Create DGFY migration metadata tables that record source system, source primary key, target entity, target primary key, migration version, checksum, status, and timestamps. Make every migration step re-runnable with deterministic natural/idempotency keys and resumable checkpoints.

**Warning signs:**
- Data migration uses blind inserts without unique source mapping keys.
- Rollback plan says "restore backup" but no forward-fix or retry design exists.
- Migration logs are free-form stdout with no durable per-tenant/per-step status.
- Verification only checks process exit code.

**Phase to address:**
Migration runner and old-to-new migration phase before any production cutover rehearsal.

**Concrete validation evidence required:**
- Tests that kill/restart migration after partial completion and prove no duplicates on rerun.
- Migration metadata table populated for every migrated source entity.
- Checksum or invariant report for each tenant and entity class.
- Operator-visible failed-row report with retry/skip policy.

---

### Pitfall 6: Rehearsing Against Toy Data Instead of Realistic History

**What goes wrong:**
The script works on seed data but exceeds the maintenance window or fails on historical POS transactions, stock movements, bookings, compliance records, or odd tenant records in production.

**Why it happens:**
Catalog size is small and easy to migrate. Historical operational data is usually where runtime, data-quality, and foreign-key problems appear. DGFY's own cutover strategy already warns that the one-hour target is meaningless without realistic volume rehearsal.

**How to avoid:**
Build anonymized production-like rehearsal fixtures and run full migration rehearsals repeatedly. Measure per-step time, row counts, failure rates, lock waits, and verification time. Decide the abort threshold before production night.

**Warning signs:**
- Rehearsal data has only a few tenants or current catalog rows.
- No historical transaction or stock movement volume is included.
- Runtime estimates are extrapolated from local fixtures.
- Abort threshold is discussed but not written into the runbook.

**Phase to address:**
Production cutover safety phase, but fixture design should start during data migration implementation.

**Concrete validation evidence required:**
- At least one non-production rehearsal using production-like row counts and tenant count.
- Runtime report by migration command and tenant.
- Documented abort time, rollback decision owner, and reopen-on-legacy procedure.
- Rehearsal proof that verification completes inside the downtime budget.

---

### Pitfall 7: Compatibility Facade Becomes a Permanent Coupling Layer

**What goes wrong:**
The old POS frontend is pointed at the new backend, but the backend absorbs legacy request/response shapes indefinitely. The new DGFY domain then becomes a thin adapter around SKUpervisor semantics rather than a standalone platform.

**Why it happens:**
ADR 0003 accepts temporary compatibility facades, and the cutover plan allows a targeted old POS frontend API-base change. Without cleanup checkpoints, adapters tend to become invisible product contracts.

**How to avoid:**
Name every compatibility endpoint or adapter as temporary. Require an owner, removal phase, and parity evidence. Keep translation at explicit anti-corruption boundaries; do not let controllers or repositories mix old and new models directly.

**Warning signs:**
- New APIs expose legacy field names because the old frontend expects them.
- No issue/phase tracks adapter removal.
- Compatibility code imports legacy services from new use cases.
- Tests assert only legacy response shape, not target domain behavior.

**Phase to address:**
Backend tenancy/auth foundation and every frontend cutover phase.

**Concrete validation evidence required:**
- Compatibility adapter inventory with planned removal phase.
- Contract tests for legacy client compatibility and separate tests for target DGFY API shape.
- Architecture guardrail pass with no new untracked allowlist entries.
- Parity checklist before moving legacy code to `.archive`.

---

### Pitfall 8: Cross-Tenant Auth and Tenancy Boundaries Leak During Rebuild

**What goes wrong:**
Business selection, staff login, branch assignment, terminal identity, or POS session creation grants access to the wrong tenant or branch. A DGFY account membership check in the landlord database is treated as sufficient tenant-local authorization.

**Why it happens:**
DGFY has multiple identity concepts: landlord-scoped DGFY Accounts, tenant-local Staff Accounts, membership/assignment records, and POS terminal/branch state. The existing code also has browser-token storage drift and admin/customer token paths not fully aligned with cookie authority.

**How to avoid:**
Make tenant authorization explicit at every transition: account login, business selection, branch selection, staff QR login, terminal binding, and session creation. Do not create tenant sessions without accepted active membership or tenant-local staff assignment. Keep browser authority in HttpOnly cookies with in-memory access tokens only.

**Warning signs:**
- Tenant is chosen from a request body without verifying active membership/assignment.
- POS terminal operations depend only on `terminal_id` string.
- Tests cover happy-path login but not rejected cross-tenant or stale assignment attempts.
- New auth code stores bearer/session authority in `localStorage` or `sessionStorage`.

**Phase to address:**
Backend tenancy/auth foundation; hardening before any login/POS cutover.

**Concrete validation evidence required:**
- Negative tests for cross-business, cross-branch, stale assignment, inactive membership, and terminal mismatch.
- Session/token guard tests proving no browser-readable authority persistence.
- Audit log assertions for tenant/session creation and denied tenant switches.
- Architecture governance hardening checklist evidence for auth/tenant provisioning changes.

---

### Pitfall 9: Cutover Removes Rollback Paths Too Early

**What goes wrong:**
Legacy tables, routes, or synchronization assumptions are removed before the new path has parity and verification evidence. After a production issue, rollback requires restoring dropped objects and replaying data under pressure.

**Why it happens:**
Teams often equate successful first cutover with permission to delete old code/data. External Strangler Fig guidance and DGFY's own plan both treat legacy removal as a deliberate final step after validation.

**How to avoid:**
Archive, do not delete, until every migrated domain has parity evidence, production observation, and an explicit rollback-retirement decision. Keep legacy objects and reopen-on-legacy procedure available through the first production cutover window unless a documented ADR accepts the risk.

**Warning signs:**
- PR removes legacy code in the same phase that introduces the replacement.
- Runbook lacks reopen-on-legacy steps.
- There is no defined "rollback no longer possible after this step" marker.
- Production proof is limited to health checks, not user-flow evidence.

**Phase to address:**
Cutover safety phase and every domain decommissioning phase.

**Concrete validation evidence required:**
- Cutover runbook with reversible and irreversible steps labeled.
- Snapshot/backup proof and restore rehearsal result.
- Legacy reopen smoke test before production cutover.
- Post-cutover parity and observation checklist before archival.

---

### Pitfall 10: Deferring Known High-Risk Data Semantics Until After They Pollute the Foundation

**What goes wrong:**
Payment status, cash tender/change, fiscal compliance, shift state, terminal identity, and stock-effect semantics are treated as later product details, but early schemas make them hard to fix without another migration.

**Why it happens:**
Some domains are explicitly out of scope for the first database/backend foundation. That is correct, but their boundary implications must still be reserved. The current reconciliation documents identify client-declared payment status, client-side change calculation, fiscal policy limitations, and `Payment` naming collision as real risks.

**How to avoid:**
Do not implement deferred domains early, but reserve clean boundaries and names. Avoid schema names that collide with subscription billing. Keep payment/fiscal/shift fields out of the foundation unless their invariants are designed. Where references are unavoidable, model them as future-safe foreign keys or status placeholders with documented non-authority.

**Warning signs:**
- New foundation stores order payment facts before payment mechanics design exists.
- `Payment` is reused ambiguously for subscription and order payment.
- Client-supplied payment/change fields are accepted as authoritative.
- Fiscal compliance fields are copied without deciding presence-vs-correctness semantics.

**Phase to address:**
Database foundation for naming/boundaries; Product/Availment and Post-MVP domain phases for full semantics.

**Concrete validation evidence required:**
- Schema review checklist covering reserved payment/fiscal/shift/terminal boundaries.
- Tests rejecting client-authoritative change/payment status where backend authority is required.
- ADR or governed design doc before implementing payment, fiscal, or shift domains.
- Migration mapping explicitly excludes deferred domain facts that cannot be validated.

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Report-only tenant drift check | Faster deploy | Existing tenants still break after landlord migration | Only for preflight, never as final release evidence for tenant-scoped changes |
| `sync({ alter: true })` across active tenants | Quick schema convergence | Lock risk, unreviewed DDL, unpredictable tenant differences | New tenant provisioning or controlled maintenance only |
| Backend-first API before schema contract | Faster visible progress | API hardens against unstable assumptions | Not acceptable for Accounts/Businesses/Tenancy foundation |
| Raw-copy legacy tables | Faster migration script | Preserves IMS coupling and naming collisions | Never for target DGFY domain tables |
| Temporary compatibility adapter without removal owner | Keeps old POS working | Permanent legacy-shaped API | Only with explicit removal phase and parity test |
| Delete legacy immediately after green cutover | Reduces code clutter | Removes rollback path | Only after post-cutover observation and documented rollback retirement |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Sequelize CLI | Assuming migration tracking equals cutover safety | Use DB-backed migration storage for schema files, plus DGFY-owned metadata/checkpoints for data migration |
| MySQL DDL | Treating additive column/index changes as harmless | Estimate lock impact, use declared SQL, rehearse on realistic data, monitor metadata lock waits |
| Legacy POS frontend | Pointing it at the new API without response-shape decision | Choose explicit adapter vs. small frontend contract update; track adapter removal |
| Tenant provisioning | Assuming new-tenant provisioning proves existing-tenant safety | Test old tenant schemas and run repair reports for all active tenants |
| Browser auth/session | Reusing legacy token persistence during auth rebuild | Follow cookie-authority model; keep browser-readable tokens out of persistent storage |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Tenant-by-tenant repair without bounded concurrency | Long deploys, connection pressure, lock waits | Batch tenants, cap concurrency, emit per-tenant timing | As tenant count grows beyond current beta size |
| Full historical migration with no chunking | Timeout, memory pressure, failed reruns | Chunk by tenant/table/time range with checkpoints | Historical POS/order/stock data, not catalog rows |
| Verification as one monolithic query | Slow or opaque cutover proof | Per-entity invariants and sampled row checks | During maintenance-window rehearsals |
| Facade bottleneck | New and old paths slow through one adapter | Keep adapters thin, observable, and temporary | Backend-first cutover with old POS traffic |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Tenant chosen without landlord membership and tenant-local assignment proof | Cross-tenant data access | Require active membership/assignment checks before session creation |
| Persisting admin/customer/DGFY authority tokens in browser storage | XSS can steal session authority | HttpOnly cookie authority, in-memory access token only, guard tests |
| Migration runner credentials too broad | Script can mutate legacy or wrong tenant DB | Separate least-privilege credentials per command; dry-run default for data migration |
| Migration logs include PII or secrets | Sensitive data leaks into CI/deploy logs | Structured redacted reports with row IDs/hashes, not raw payloads |
| Client-declared payment/change facts accepted | Fraud or incorrect financial records | Server-side verification in payment/checkout domain before promotion |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Login cutover changes tenant/business selection behavior silently | Owners/staff get blocked or land in wrong branch | Preserve current behavior via explicit compatibility tests and clear session audit |
| Maintenance window has vague rollback status | Operators improvise while users wait | Pre-written status, abort threshold, and reopen-on-legacy procedure |
| Store/POS behavior parity judged by API health | Users hit missing catalog, terminal, or order actions | Run POS and Storefront smoke/UAT flows against migrated tenant data |

## "Looks Done But Isn't" Checklist

- [ ] **Migration runner:** Has one image, but lacks separate schema/data/verify/rollback commands.
- [ ] **Schema migration:** Landlord migrated, but active tenants have no zero-drift proof.
- [ ] **Data migration:** Rows copied, but no source-to-target mapping, checksum, skipped-row report, or rerun proof.
- [ ] **Backend auth:** Login works, but cross-tenant negative tests and browser token guards are missing.
- [ ] **Compatibility facade:** Old POS works, but adapter has no owner or removal phase.
- [ ] **Cutover rehearsal:** Seed data passes, but historical data volume and abort threshold are unproven.
- [ ] **Rollback:** Backup exists, but restore/reopen-on-legacy has not been rehearsed.
- [ ] **Legacy archive:** Code moved to `.archive`, but parity evidence and dependency scan are incomplete.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Tenant drift after release | MEDIUM to HIGH | Stop affected tenant-scoped rollout, run drift report, apply declared repair, add missing registry coverage test |
| Bad alter/lock event | HIGH | Abort repair, kill blocking migration session if safe, reopen legacy path, replace alter with reviewed SQL |
| Partial data migration | MEDIUM if idempotent, HIGH if not | Resume from checkpoints; if not possible, restore target schema and rerun from clean snapshot |
| Wrong tenant/session grant | HIGH | Disable affected auth path, revoke sessions, audit access logs, add negative tests before re-enable |
| Compatibility adapter leaked into core | MEDIUM | Inventory adapter fields, move translation to boundary, add target-shape tests, schedule removal |
| Cutover exceeds window | HIGH | Execute pre-decided abort, reopen legacy, preserve logs, adjust migration batching/rehearsal before retry |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Landlord success mistaken for tenant success | Database foundation / every tenant-scoped phase | Tenant coverage, repair-apply, zero-drift reports |
| Sequelize alter as strategy | Migration runner foundation | Explicit migrations/repair SQL and lock-risk rehearsal |
| Backend before stable schema | Database foundation before backend | Executed `dgfy_*` migrations and DB integration tests |
| Raw-copy legacy data | Data migration design | Source-to-target mapping and reconciliation reports |
| Non-idempotent migration | Migration runner + data migration | Kill/retry test and migration metadata evidence |
| Toy-data rehearsal | Cutover safety | Production-like rehearsal runtime and verification report |
| Permanent facade | Backend/login cutover and frontend migration | Adapter inventory, target API contract tests, removal phase |
| Tenancy/auth leakage | Backend tenancy/auth foundation | Cross-tenant negative tests and session guard tests |
| Rollback removed too early | Cutover/decommissioning | Runbook with reversible steps, restore rehearsal, archive gate |
| Deferred semantics pollute foundation | Database foundation and later domain design | Schema boundary review and ADR/design docs for payment/fiscal/shift |

## Sources

- `.planning/PROJECT.md` — DGFY database-first project scope and active requirements.
- `.planning/codebase/CONCERNS.md` — tenant drift recurrence, `sync({ alter: true })` risk, browser token/session concerns.
- `.planning/codebase/TESTING.md` — existing test patterns and release gates.
- `.planning/codebase/ARCHITECTURE.md` — tenant resolution, modular boundaries, deployable surfaces.
- `docs/START_HERE.md` — authoritative documentation lookup order.
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md` — `routes -> controllers -> usecases -> repositories -> models` contract.
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md` — hardening contract, rollback notes, architecture evidence.
- `docs/architecture/adr/0003-migration-facade-strategy.md` — accepted compatibility facade strategy.
- `refactor/DGFY_Migration_Cutover_Strategy.md` — Strangler Fig, full-stop cutover, rehearsal and abort gaps.
- `refactor/DGFY_Plan_vs_Reality_Reconciliation.md` — shared-schema reality and domain mismatch risks.
- `refactor/DGFY_Legacy_Feature_Inventory.md` — legacy feature gaps and deferred domains.
- `refactor/DGFY_Implementation_Phases.md` — phase scopes, definitions of done, and deferred domain warnings.
- Context7 `/sequelize/cli` docs — Sequelize CLI migration storage, status, and undo behavior. Confidence: MEDIUM.
- Microsoft Azure Architecture Center, Strangler Fig pattern, last updated 2026-06-02 — facade, anti-corruption layer, database extraction/cutover/rollback considerations. Confidence: MEDIUM.
- Martin Fowler, Strangler Fig, 2024-08-22 — modernization outcomes, seams, transitional architecture. Confidence: MEDIUM.
- AWS DMS best practices — validation, monitoring, metrics, and task logs during database migration. Confidence: MEDIUM.
- MySQL 8.4 Reference Manual — metadata locking and DDL lock/contention behavior. Confidence: MEDIUM.

---
*Pitfalls research for: DGFY standalone database-first refactor*
*Researched: 2026-07-10*

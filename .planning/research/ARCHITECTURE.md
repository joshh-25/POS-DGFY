# Architecture Research

**Domain:** DGFY standalone database-first refactor beside a live modular-monolith platform
**Researched:** 2026-07-10
**Confidence:** HIGH

## Standard Architecture

### System Overview

The refactor should be structured as a database-first Strangler Fig, not as a backend rewrite that discovers its schema while being built. The new DGFY foundation sits beside the existing SKUpervisor/legacy landlord and tenant databases. Legacy runtime stays live until the new schema, migration evidence, backend modules, compatibility seams, and cutover rehearsals prove readiness.

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Existing Live Runtime                               │
├───────────────────────┬───────────────────────┬─────────────────────────────┤
│ frontend/apps/store   │ frontend/apps/pos     │ backend modular monolith    │
│ Storefront            │ POS + back office     │ legacy + module routes      │
└───────────┬───────────┴───────────┬───────────┴──────────────┬──────────────┘
            │                       │                          │
            ▼                       ▼                          ▼
┌─────────────────────────────┐ ┌─────────────────────────────────────────────┐
│ Legacy/current landlord DB  │ │ Legacy/current tenant DBs                   │
│ tenant registry, current    │ │ IMS-shaped operational schemas              │
│ DGFY account tables, etc.   │ │ POS, storefront, items, stock, bookings     │
└─────────────────────────────┘ └─────────────────────────────────────────────┘
            │
            │ read-only extraction by default
            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Dedicated DGFY Migration Runner                          │
│ one-shot container, explicit commands, no long-running API startup migrate  │
│ schema migrate | data migrate | verify | report | rollback/runbook support  │
└───────────┬───────────────────────────────┬─────────────────────────────────┘
            │ creates/updates               │ writes evidence/checkpoints
            ▼                               ▼
┌─────────────────────────────┐ ┌─────────────────────────────────────────────┐
│ New DGFY landlord DB        │ │ New DGFY tenant DBs                         │
│ dgfy_* account, business,   │ │ one DB per business for staff, assignments, │
│ branch, tenancy registry,   │ │ terminals, tenant-local ownership metadata  │
│ migration metadata          │ │ and later operational domains               │
└───────────┬─────────────────┘ └────────────────┬────────────────────────────┘
            │ stable DB contract                  │ request-scoped tenant bind
            ▼                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         New DGFY Backend Foundation                         │
│ routes -> controllers/handlers -> usecases -> repositories -> models        │
│ Accounts module | Businesses module | Tenancy module                        │
└───────────┬─────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Compatibility Seams and Cutover Gates                    │
│ api.dgfy.ph routing, old POS API-base seam, response adapters if required,  │
│ parity tests, dry-run evidence, rehearsal evidence, abort thresholds         │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Boundary |
|-----------|----------------|----------|
| Existing backend modular monolith | Keep current POS, Storefront, tenant provisioning, and legacy-compatible APIs running | Do not restructure for this refactor. Legacy controllers/services remain compatibility facades under ADR 0003. |
| Existing legacy/current landlord DB | Source for current tenant registry, current account/membership records, and migration input | Read-only by default during migration scripts. Schema mutations are forbidden unless explicitly accepted as a compatibility seam. |
| Existing legacy/current tenant DBs | Source for current tenant-local POS, items, storefront, staff, bookings, stock, and transaction data | Read-only extraction by default. Do not "fix" old schemas as part of new DGFY schema design except through approved production repair paths. |
| Migration runner image | Own schema migration, data transformation, verification, reporting, checkpoints, and rollback/runbook commands | One-shot deploy artifact. Long-running API containers must not be the primary migration execution surface. |
| New DGFY landlord DB | Own DGFY Accounts, Businesses, Branches, Tenancy registry, tenant DB pointers, discovery metadata foundation, and migration metadata | New `dgfy_*` schema family beside legacy. It becomes the authority only after cutover gates pass. |
| New DGFY tenant DBs | Own tenant-local Staff Accounts, Assignments, Terminals, and later operational DGFY domains | One DB per Business. Tenant-local operational data must not be queried cross-tenant in request paths. |
| Accounts backend module | Own DGFY Account lifecycle, login, profile, password, verification, legal acknowledgement, and owner/manager identity behavior | New module code follows `routes -> controllers -> usecases -> repositories -> models`. No direct model imports from controllers. |
| Businesses backend module | Own Business and Branch registration, ownership relation, branch type, business currency, and business-level lifecycle | Landlord-scoped repository access only. Tenant DB creation/provisioning is delegated to Tenancy. |
| Tenancy backend module | Own tenant registry, tenant DB provisioning, tenant resolution, tenant connection metadata, and migration-visible tenancy state | Separates landlord registry from tenant-local operational access. Avoid direct reuse of legacy tenant connector assumptions unless wrapped. |
| Compatibility adapters | Translate between old frontend/API expectations and the new backend where cutover requires it | Narrow, documented, temporary, and test-covered. Must have removal criteria. |
| Cutover gates | Decide whether to proceed, retry, abort, or roll back | Evidence-driven: dry-run, idempotency, realistic rehearsal volume, parity checks, architecture checks, and abort threshold. |

## Recommended Project Structure

The immediate refactor should not relocate the whole repo into the target `apps/dgfy-*` shape. That direction is documented by ADR 0032, but moving all deployables now would increase blast radius. The foundation should add the smallest number of new runtime surfaces needed to prove the database contract.

```text
dgfy-platform/
├── apps/
│   └── dgfy-api/                         # Existing standalone service; bounded auth slice per ADR 0032
├── backend/
│   ├── migrations/                       # Existing Sequelize migration convention, legacy/current surface
│   └── src/
│       ├── routes/
│       │   ├── dgfyAccounts.js           # New route file, if kept in main backend
│       │   ├── dgfyBusinesses.js         # New route file, if kept in main backend
│       │   └── dgfyTenancy.js            # New route file, if kept in main backend
│       └── modules/
│           ├── dgfyAccounts/
│           │   ├── controllers/*Handlers.js
│           │   ├── usecases/
│           │   ├── repositories/
│           │   ├── contracts/
│           │   ├── domain/
│           │   ├── index.js
│           │   └── README.md
│           ├── dgfyBusinesses/
│           └── dgfyTenancy/
├── infrastructure/
│   └── docker/
│       └── dgfy-migration-runner/        # New one-shot migration image
├── scripts/
│   └── dgfy-migrations/                  # Operator-facing wrappers and evidence helpers, if not inside runner package
└── refactor/                             # Planning/reference docs only, not runtime dependency
```

If the new backend foundation is placed in `apps/dgfy-api` instead of `backend/src/modules`, the same internal layering must still apply: routes/controllers are transport-only, use cases own workflow, repositories own Sequelize, and models are not imported by controllers. The important architectural decision is the boundary contract, not the exact folder root.

### Structure Rationale

- **`infrastructure/docker/dgfy-migration-runner/`:** Treat migration execution as an explicit deploy artifact with its own image lifecycle and command surface. This prevents API startup from becoming a hidden migration path.
- **`backend/src/modules/dgfyAccounts`, `dgfyBusinesses`, `dgfyTenancy`:** Keeps new backend work aligned with ADR 0001 and the architecture guardrails while avoiding broad changes to legacy controllers/services.
- **`apps/dgfy-api`:** Already accepted as a standalone DGFY API service, but currently bounded to auth/registration. Expanding it into broader Accounts/Businesses/Tenancy APIs is cross-boundary and should update ADR 0032 or create a follow-up ADR.
- **Compatibility files:** Keep adapters physically close to the boundary they translate, with names that make temporary compatibility obvious. Avoid burying legacy-shape translations inside core use cases.

## Architectural Patterns

### Pattern 1: Database-First Strangler Foundation

**What:** Create the new `dgfy_*` landlord and tenant schemas beside the existing live schemas, then migrate data through explicit transformation scripts. New backend APIs are built only after the schema contract is stable.

**When to use:** This is the default for this milestone because the current DGFY behavior grew inside IMS-shaped tables and tenant schema drift has already been a recurring issue.

**Trade-offs:** It delays visible API/frontend progress, but it prevents the backend from hard-coding unstable schema assumptions. It also allows rehearsal and verification without touching live legacy schemas as the default path.

### Pattern 2: One-Shot Migration Runner

**What:** A dedicated migration image exposes explicit commands:

```text
schema:migrate
data:migrate --dry-run
data:migrate --apply
verify
report
rollback:plan
```

Each command writes structured evidence and uses migration metadata/checkpoints in the new DGFY landlord database.

**When to use:** Every schema migration, data transformation, rehearsal, production cutover, and post-cutover verification step.

**Trade-offs:** It adds one deployable artifact, but it keeps migration operations observable, repeatable, and separate from API uptime. This is safer than running migrations inside long-lived API containers.

### Pattern 3: Layered Backend Modules

**What:** Accounts, Businesses, and Tenancy are separate modules with the enforced flow:

```text
routes -> controllers/handlers -> usecases -> repositories -> models
```

Controllers translate HTTP only. Use cases own business workflow. Repositories own Sequelize access. Models are persistence definitions only.

**When to use:** All new backend work in this refactor.

**Trade-offs:** More files up front, but lower coupling and direct compatibility with existing guardrails. It also prevents new code from repeating legacy controller/service layering drift.

### Pattern 4: Compatibility Adapter at the Edge

**What:** If the old POS frontend must call the new backend during interim backend-first cutover, put response-shape and request-shape translation in an explicit adapter at the API edge, not in core domain use cases.

**When to use:** Only for the old POS API-base seam or other approved legacy-facing routes.

**Trade-offs:** Temporary duplication is acceptable under ADR 0003, but every adapter must have tests and removal criteria. The adapter should never become the canonical DGFY API contract.

### Pattern 5: Evidence-Gated Cutover

**What:** Cutover is a gate sequence, not a date-driven switch. A production cutover can proceed only after dry-run, rehearsal, verification, parity, architecture, and rollback/abort evidence are collected.

**When to use:** Before backend-first cutover, before full database cutover, and before retiring any legacy path.

**Trade-offs:** More ceremony than a small greenfield launch, but appropriate for a live brownfield platform with real users and database transformations.

## Data Flow

### Schema Build Flow

```text
Developer adds migration
    ↓
Migration runner image built
    ↓
schema:migrate targets new dgfy landlord DB
    ↓
tenant schema migrations target each new dgfy tenant DB
    ↓
verify confirms expected tables, columns, indexes, constraints, and metadata
    ↓
report becomes release evidence
```

Direction is one-way into the new DGFY databases. Existing legacy schemas are not mutated as part of this flow.

### Data Migration Flow

```text
Legacy/current landlord DB + tenant registry
    ↓ read-only
Legacy/current tenant DBs
    ↓ read-only extract
Transformation layer in migration runner
    ↓ validate/map
New DGFY landlord DB
    ↓ tenant registry and migration metadata
New DGFY tenant DBs
    ↓ tenant-local staff, assignment, terminal, and later operational data
Verification/report output
```

The migration is a transformation, not a raw copy. For the early foundation, the data scope should be Accounts, Businesses, Branches, Tenancy registry, Staff Accounts, Assignments, Terminal identity, and migration metadata. Product/POS/payment/fiscal migration should wait for later phases.

### Backend Request Flow After Foundation

```text
Client request to DGFY API
    ↓
Route
    ↓
Controller/handler
    ↓
Accounts, Businesses, or Tenancy use case
    ↓
Repository
    ↓
New DGFY landlord DB or resolved new DGFY tenant DB
    ↓
Response DTO
```

Tenant resolution should consult the new DGFY landlord registry and bind exactly one tenant database per tenant-scoped request. Cross-tenant operational reads must not happen in request paths. Public discovery should read landlord-side materialized snapshots, not fan out across tenant DBs.

### Interim Compatibility Flow

```text
Old POS frontend
    ↓ configured API base URL seam
api.dgfy.ph or new backend route
    ↓
Compatibility adapter, if required
    ↓
New DGFY module use case
    ↓
New DGFY DBs
```

The old frontend API-base change is an explicitly approved legacy touch from the cutover docs. Any additional old frontend edits should be treated as exceptions requiring clear scope and tests.

### Cutover Flow

```text
Pre-cutover rehearsal evidence green
    ↓
Maintenance window starts
    ↓
Stop legacy write paths
    ↓
Run migration runner apply commands
    ↓
Run verification commands
    ↓
Decision gate: proceed, retry, or abort
    ↓
Point traffic to new backend/database foundation
    ↓
Post-cutover smoke and parity checks
```

The full-stop maintenance window is acceptable at the current scale because it avoids split-brain writes. It must not be used without a pre-decided abort threshold and rehearsal evidence against realistic historical data volume.

## Build Order Implications

1. **Architecture contract and ADR decision:** Confirm whether broader Accounts/Businesses/Tenancy APIs live in `backend/src/modules` or expand `apps/dgfy-api`. Expanding `apps/dgfy-api` beyond ADR 0032 auth/registration scope requires ADR update or a new ADR.
2. **Migration runner skeleton:** Build the one-shot image, command parser, environment contract, logging/report format, and migration metadata table before writing domain-heavy migrations.
3. **New DGFY landlord schema:** Add Accounts, Businesses, Branches, ownership/membership, tenant registry, tenant DB pointer, branch metadata, and migration metadata foundations.
4. **New DGFY tenant schema:** Add Staff Accounts, Assignments, Terminal identity, and tenant-local ownership foundations.
5. **Dry-run transformation scripts:** Extract from legacy/current schemas read-only, map into new schema, validate conflicts, and emit reports without writing.
6. **Apply transformation with checkpoints:** Add idempotency keys, per-tenant checkpoints, and retry-safe writes before production-like rehearsal.
7. **Verification suite:** Verify row counts, referential integrity, account/business/tenant mapping, tenant coverage, and expected empty/deferred domains.
8. **Backend module APIs:** Build Accounts, Businesses, and Tenancy modules against the stable DGFY schema.
9. **Compatibility seam:** Decide whether old POS gets a backend adapter or a small frontend shape update. Keep the seam narrow and temporary.
10. **Cutover rehearsal gates:** Run realistic data rehearsals, define abort threshold, prove retry path, and collect release evidence.
11. **Production cutover:** Execute only after the gate package is green.
12. **Legacy retirement:** Move old code to `.archive` only after parity is proven and no active runtime depends on it.

## Compatibility Seams and Forbidden Legacy Edits

### Approved Seams

| Seam | Allowed Change | Conditions |
|------|----------------|------------|
| Old POS API base URL | Point old POS frontend to `api.dgfy.ph` or the new backend route | Narrow config-only or minimal service-client change, with smoke tests. |
| Backend response/request adapter | Preserve old POS expectations during backend-first cutover | Temporary adapter at API edge, not core use case logic. |
| Legacy facade call-through | Existing legacy controllers call new use cases | Allowed by ADR 0003 when parity tests and cleanup checkpoints exist. |
| Nginx/API routing | Add routing for proven DGFY API service/domain | Must pass compose/nginx config validation for all environments. |
| Migration read access | Runner reads old landlord and tenant DBs | Read-only by default, with explicit env targeting and dry-run default. |

### Forbidden by Default

| Forbidden Edit | Why |
|----------------|-----|
| Broad cleanup of `backend/src/controllers` or `backend/src/services` | Increases blast radius and conflicts with the Strangler plan. |
| Mutating legacy schemas to make new DGFY design easier | Hides coupling and risks current production behavior. |
| Running new migrations from API startup | Makes deploy behavior implicit and hard to retry or audit. |
| Controller-to-model imports in new modules | Violates ADR 0001 and architecture guardrails. |
| Letting compatibility adapters define canonical DGFY API shape | Freezes legacy assumptions into the new system. |
| Migrating Product/POS/payment/fiscal domains in the foundation phase | Expands scope before Accounts/Businesses/Tenancy are stable. |
| Deleting legacy code after first green run | Legacy retirement needs parity evidence and no active dependency. |

## Cutover Gates

| Gate | Required Evidence | Blocks |
|------|-------------------|--------|
| Architecture gate | ADR impact recorded, module boundaries selected, `npm run check:architecture` green for touched backend surfaces | Backend module work and PR merge. |
| Runner gate | Runner image builds, commands are explicit, dry-run is default for destructive/data-writing actions, env targeting is validated | Any data migration apply command. |
| Schema gate | New landlord and tenant migrations apply cleanly from empty DB, re-run cleanly, and verify expected metadata | Backend API development against the schema. |
| Transformation gate | Dry-run maps realistic legacy/current data with conflict report and no unexpected legacy writes | Apply rehearsal. |
| Idempotency gate | Partial failure can retry without duplicate accounts, businesses, tenant DBs, memberships, staff, or terminals | Production rehearsal. |
| Verification gate | Row counts, referential integrity, tenant coverage, and known deferred scopes are reported | Cutover approval. |
| Compatibility gate | Old POS/base URL seam or adapter path is tested against old frontend expectations | Backend-first cutover. |
| Rehearsal gate | Realistic data volume rehearsals meet runtime target and produce evidence | Production maintenance window. |
| Abort gate | Time limit and rollback decision rules are written before cutover starts | Production maintenance window. |
| Post-cutover gate | Smoke tests, account/business/tenant login checks, and read/write checks pass | Legacy archive/removal planning. |

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Fewer than 100 active users | Full-stop maintenance cutover is acceptable if rehearsed. One DB server hosting landlord plus tenant DBs is acceptable. |
| 1k-10k users | Keep tenant DB per business, add stronger batching/concurrency controls to runner, track migration runtime per tenant, and make discovery snapshots explicit. |
| 10k+ users | Add tenant placement metadata for sharding across DB servers, queue-based discovery sync, and migration runner batching by shard/server. |

### Scaling Priorities

1. **First bottleneck:** Tenant-by-tenant migration and verification runtime. Fix with checkpointing, batching, progress reports, and bounded concurrency.
2. **Second bottleneck:** Public discovery freshness if many tenant databases feed one landlord-side index. Fix with explicit sync jobs and freshness SLOs, not live cross-tenant search.
3. **Third bottleneck:** Tenant connection lifecycle in backend APIs. Fix with a bounded tenant connection cache and registry-driven server placement metadata.

## Anti-Patterns

### Anti-Pattern 1: Backend-First Schema Guessing

**What people do:** Start Accounts/Businesses/Tenancy APIs first and let migrations follow whatever the API happens to need.

**Why it is wrong:** It recreates the current problem where DGFY behavior inherits the wrong database foundation. It also makes data migration an afterthought.

**Do this instead:** Stabilize the new DGFY landlord/tenant schema and migration verification first, then build APIs against that contract.

### Anti-Pattern 2: Hidden Migration on API Startup

**What people do:** Put schema/data migration logic into API container startup or health-check boot paths.

**Why it is wrong:** A failed migration becomes an API availability incident and is difficult to retry safely.

**Do this instead:** Use the dedicated one-shot migration runner with explicit commands and evidence output.

### Anti-Pattern 3: Raw Copy from Legacy Tables

**What people do:** Copy current IMS-shaped rows into new DGFY tables with minimal transformation.

**Why it is wrong:** It preserves the schema coupling the refactor exists to remove.

**Do this instead:** Map legacy/current data into DGFY concepts: Account, Business, Branch, Staff Account, Assignment, Terminal, and tenant registry. Later phases should transform finished-item Products separately.

### Anti-Pattern 4: Compatibility Logic in Core Use Cases

**What people do:** Add legacy POS request/response quirks inside Accounts/Businesses/Tenancy use cases.

**Why it is wrong:** It makes legacy shape part of the new domain model and complicates future API contracts.

**Do this instead:** Put translation in temporary adapters at the route/controller edge with removal criteria.

### Anti-Pattern 5: Scope Collapse into POS/Product/Fiscal

**What people do:** Add Product, POS checkout, payments, shifts, fiscal compliance, or Storefront migration into the same foundation milestone.

**Why it is wrong:** Those domains are real but carry separate correctness, compliance, and migration risks.

**Do this instead:** Keep this phase to migration runner, `dgfy_*` foundations, Accounts, Businesses, and Tenancy.

## Integration Points

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Migration runner -> legacy/current DBs | Read-only DB connections | Default to dry-run and explicit env targeting. |
| Migration runner -> new DGFY DBs | Schema/data writes plus verification reads | Owns migration metadata and checkpoints. |
| Accounts -> Businesses | Use-case/repository calls through module contracts | Account identity is landlord-scoped; business ownership is landlord-scoped. |
| Businesses -> Tenancy | Use-case call or command boundary | Business creation should request tenant provisioning; it should not manually create tenant DB internals. |
| Tenancy -> tenant DBs | Registry-driven connection binding | Exactly one tenant DB per tenant-scoped request. |
| New backend -> old POS frontend | API route/adapter seam | Temporary until frontend migrates or API contract becomes native. |
| New DGFY APIs -> `apps/dgfy-api` | Shared DB contract or bounded duplicate logic | ADR 0032 currently limits `apps/dgfy-api` to auth/registration. Expanding scope needs governance. |

### ADR and Governance Impact

| Topic | Impact |
|-------|--------|
| ADR 0001 modular monolith boundaries | Applies to all new backend modules. No controller model imports, business logic in use cases, persistence in repositories. |
| ADR 0003 migration facade strategy | Supports temporary facades/adapters and legacy call-through, but requires parity evidence and cleanup checkpoints. |
| ADR 0032 standalone DGFY API service | Existing accepted scope is auth/registration only. Using `apps/dgfy-api` for full Accounts/Businesses/Tenancy requires ADR update or a new ADR. |
| Architecture Governance Playbook | This is architecture-impacting and cross-boundary. PRs must include architecture checks, tests, rollback notes, and hardening proof for auth/registration/tenant provisioning changes. |
| Documentation freshness | `docs/START_HERE.md` and `docs/architecture/ARCHITECTURE_BOUNDARIES.md` were last reviewed 2026-03-06; `ARCHITECTURE_GOVERNANCE.md` 2026-05-21; ADR 0032 2026-07-06. These are current enough for this research. |

## Roadmap Phase Shape

1. **Foundation contract phase:** ADR decision, migration runner skeleton, new schema naming, metadata/checkpoint design.
2. **DGFY database foundation phase:** Landlord and tenant migrations for Accounts, Businesses, Branches, Tenancy, Staff Accounts, Assignments, and Terminals.
3. **Migration proof phase:** Dry-run transformation, idempotent apply, verification reports, and realistic rehearsal dataset.
4. **Backend foundation phase:** Accounts, Businesses, and Tenancy APIs against the stable schema.
5. **Compatibility phase:** Old POS API-base seam and adapter decision for backend-first cutover.
6. **Cutover rehearsal phase:** Runtime evidence, abort thresholds, rollback/runbook, and post-cutover smoke checks.
7. **Retirement planning phase:** Archive legacy only after parity and dependency checks.

## Sources

- `.planning/PROJECT.md` - project scope and active constraints.
- `.planning/codebase/ARCHITECTURE.md` - mapped current runtime architecture and module patterns.
- `.planning/codebase/STRUCTURE.md` - current directory/deployable structure.
- `.planning/codebase/CONCERNS.md` - tenant schema drift, allowlist, and fragile areas.
- `docs/START_HERE.md` - authoritative documentation lookup order and planning rules.
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md` - authoritative backend layering rules.
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md` - authoritative architecture process, hardening, gates, and exception rules.
- `docs/architecture/adr/0001-modular-monolith-boundaries.md` - accepted modular monolith decision.
- `docs/architecture/adr/0003-migration-facade-strategy.md` - accepted compatibility facade strategy.
- `docs/architecture/adr/0032-standalone-dgfy-api-service.md` - accepted standalone DGFY API boundary.
- `refactor/DGFY_Developer_Technical_Reference.md` - compiled DGFY target architecture and migration context.
- `refactor/DGFY_Domain_01_Accounts.md` - account, business, staff, branch, tenancy, and login model.
- `refactor/DGFY_Infrastructure_Deployment.md` - target app/domain/deployment structure.
- `refactor/DGFY_Migration_Cutover_Strategy.md` - Strangler approach, migration scope, and cutover rehearsal requirements.

---
*Architecture research for: DGFY standalone database-first refactor*
*Researched: 2026-07-10*

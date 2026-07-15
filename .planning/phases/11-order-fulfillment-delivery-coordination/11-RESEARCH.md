# Phase 11: Order Fulfillment & Delivery Coordination - Research

**Researched:** 2026-07-13
**Domain:** Backend API extension — Sequelize tenant-schema migration + new `fulfillment` module (stage-event lifecycle + manual courier assignment/payout) over the existing Availment domain
**Confidence:** HIGH (pure codebase reconnaissance; every claim below is grep/read-verified against the working tree)

## Summary

This is a **codebase-extension phase**, not a greenfield or external-integration one. Every pattern the planner needs already exists in `apps/dgfy-api` and `apps/dgfy-migration-runner` and was verified by reading the actual files. There are **no new npm packages** — the work is entirely Sequelize migrations, tenant model definitions, and one new Clean-Architecture module (`modules/fulfillment`) that mirrors the existing `modules/inventory` layout. Nyquist is disabled for this run, so no Validation Architecture section is included.

The phase adds: (1) an **append-only `availment_stage_events` table** (mirroring `inventory_movements`' append-only ledger shape exactly), (2) a **`courier_assignments` table** (append-only assignment history with a mutable payout sub-lifecycle), (3) **denormalized latest-stage columns on `availments`** as a read cache, and (4) staff-facing endpoints to list incoming online orders, progress stages, assign couriers, and mark payouts. Both existing finalize transactions — the POS/dine-in `finalizePersist()` and the online `finalizeStorefrontOrder()`, **both living in `availmentRepository.js`** — get a stage-event auto-write injected inside their existing `sequelize.transaction()` block (D-05/D-06).

**Primary recommendation:** Create ONE additive `targetKind: 'business'` migration copying the idempotent-helper scaffold from `20260713120000-create-availment-checkout.cjs` verbatim; add two new `models/Tenant/*.js` files mirroring `InventoryMovement.js`; register them in `tenantConnector.js` `getModels()`; build `modules/fulfillment` mirroring `modules/inventory`; and inject the stage-event write into the two existing repository transaction methods. **Critical naming landmine:** the domain spec's "coarse status" field CANNOT be named `status` — that column already exists on `availments` as the `draft/finalized/voided` checkout lifecycle. Use `fulfillment_status`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Free-text courier fields per order, not a reusable Courier entity. Staff type a courier name + contact fresh on each assignment. No saved roster. (Legacy `storefront_delivery_partners` is a DIFFERENT concept — advertised delivery-app links on the storefront page, NOT a per-order rider record. Do not conflate.)
- **D-02:** Payout tracked with a lifecycle, not just a number: `payout_amount` + `payout_status` (`owed`/`paid`) + `paid_at`.
- **D-03:** Courier payout is independent of Phase 8's Shift & Cash Drawer pay-outs. Fully separate bookkeeping.
- **D-04:** Courier assignment lives in a dedicated table, not columns on Availment. One row per assignment attempt (append-only), supporting reassignment without losing prior attempts.
- **D-05:** Dine-in Availments get the FULL stage-event history, auto-fast-forwarded at finalize (`placed → confirmed → preparing → ready → completed`) written as real rows all at once — not a single bare "completed" row. Keeps the event-log shape identical between POS and online Availments; a future phase can add real-time dine-in progression with no schema change.
- **D-06:** Phase 9's existing finalize transaction is EXTENDED (not left untouched). The stage-event write happens inside the existing `sequelize.transaction()` in `apps/dgfy-api/src/modules/availments`. Same-milestone `apps/dgfy-api` code, not legacy `backend/`, so zero-touch doesn't apply.
- **D-07:** A completed dine-in Availment's stage history is fixed — no further stage changes after finalize (matches Phase 9's immutable-Availment stance).
- **D-08:** The staff "incoming orders to process" queue (FUL-01) is scoped to ONLINE orders only (pickup/delivery Availments actively in placed/confirmed/preparing) — not a unified view including already-completed dine-in/POS.
- **D-09:** Staff marks "delivered"/"completed" themselves based on out-of-band customer confirmation (call/text), NOT a customer-facing API endpoint. No new frontend this milestone.
- **D-10:** Staff has an explicit override to force-complete an order if the customer never confirms. The stage-event log records that it was staff-forced rather than customer-confirmed.
- **D-11:** Pickup and dine-in need no customer-confirmation step; staff marks `completed` directly at the in-person handoff.
- **D-12:** **Pickup:** `placed → confirmed → preparing → ready → completed`. `ready` = bagged/waiting at counter; `completed` at customer pickup.
- **D-13:** **Delivery:** `placed → confirmed → preparing → out_for_delivery → completed`. NO separate `delivered` stage before `completed`.
- **D-14:** **Dine-in:** same stage names as pickup — `placed → confirmed → preparing → ready → completed` (auto-fast-forwarded per D-05). No separate `served`/`on_site` stage.
- **D-15:** `fulfillment_stage` is ONE shared enum/string across all modes, not a per-mode enum type. Valid-sequence-per-mode lives in APPLICATION LOGIC, not the DB (`DGFY_Domain_02_Product.md` line 234).

### Carrying Forward from the Domain Spec (already decided, not up for debate)

- **Two-field fulfillment status shape** — coarse `status` (pipeline) + mode-specific `fulfillment_stage`, backed by an append-only `AVAILMENT_STAGE_EVENT` table, with both denormalized onto `Availment` as a "latest" read cache. Source of truth = event table; if they ever disagree, the event table wins.
- **`fulfillment_mode` and `fulfillment_stage` are fixed enums, not open strings.**
- **Delivery/on-site traveler is external to DGFY, not a Staff Account** — consistent with D-01 free-text courier fields.

### Claude's Discretion

- Exact staff-endpoint query/filter shape for retrieving incoming orders (FUL-01) — by status, branch, fulfillment_mode, etc.
- Whether `availment_stage_events` needs a `forced_by_staff_id` / `is_forced` flag to record D-10's override distinctly, vs. a free-form `reason` column doing double duty (following the domain doc's `reason` column precedent, §9).
- Whether courier assignment / stage progression requires a minimum staff permission level (owner-only vs. any active staff) — following Phase 8/9's membership-gating precedent (inventory manual movements gate on ANY active membership, not owner-only).
- Exact migration/table naming for the new courier-assignment and stage-event tables — following existing `dgfy_business_*` naming conventions.

### Deferred Ideas (OUT OF SCOPE)

- Reusable, business-scoped Courier/DeliveryPartner entity (deferred per D-01).
- Token-based customer-facing delivery-confirmation endpoint (deferred per D-09).
- Real-time, staff-driven manual dine-in stage progression / kitchen-display workflow (schema supports it, but building the UI/workflow is a future phase).
- Real courier/delivery API integration (Grab, Lalamove) — v3 FUL-04.
- Refunds/cancellations on any Availment.
- The general compliance-verification-transaction todo (`2026-07-13-wrap-compliance-verification-and-state-writes-in-one-transac.md`) — reviewed, left as general backlog, NOT folded into this phase.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FUL-01 | Business staff can view and process incoming online orders. | New `modules/fulfillment` list-usecase querying tenant `availments` filtered by `fulfillment_mode IN (pickup,delivery)` AND `fulfillment_status IN (placed,confirmed,preparing)` (D-08). Auth via the `requireMembership` precedent (`inventoryMovementUseCases.js:96`). Online availments already carry `source_reference` + `customer_account_id` from `finalizeStorefrontOrder`. |
| FUL-02 | Staff can progress fulfillment status through the shared pipeline with mode-specific handoff steps. | Append-only `availment_stage_events` table (mirrors `InventoryMovement.js`) + denormalized `fulfillment_status`/`fulfillment_stage` on `availments`. Per-mode valid-sequence maps enforced in usecase app-logic (D-15), mirroring `MOVEMENT_TYPES = Object.freeze([...])`. Stage-event auto-write injected into BOTH `finalizePersist()` and `finalizeStorefrontOrder()` (D-05/D-06). |
| FUL-03 | Staff can manually assign a courier/delivery partner and track payout to completion. | New append-only `courier_assignments` table (D-04): free-text `courier_name`/`courier_contact` (D-01), `payout_amount`/`payout_status(owed\|paid)`/`paid_at` (D-02), independent of shift pay-outs (D-03). Repository mirrors `inventoryMovementRepository.js` scaffold. |
</phase_requirements>

## Project Constraints (from CLAUDE.md / docs/ai/CLAUDE.md)

The canonical project instructions (`docs/ai/CLAUDE.md`) describe the legacy SKU Inventory Manager (`backend/` + `frontend/`), NOT the new `apps/dgfy-api` platform this phase touches. The directives that DO transfer and MUST be honored:

- **Backend layering:** Controllers handle HTTP only; business logic + DB ops live below them. The `apps/dgfy-api` incarnation of this is the enforced `routes → controllers → usecases → repositories → models` layering (see `docs/architecture/ARCHITECTURE_BOUNDARIES.md`; enforced by `apps/dgfy-api/eslint.config.mjs`'s `no-restricted-imports` — controllers are BLOCKED from importing models).
- **Transactions:** Use Sequelize transactions for multi-table writes. This phase's stage-event auto-write and courier records fall under this.
- **Validation:** Validate before persistence. D-15 stage-sequence validation is app-layer.
- **Never hard-DELETE / append-only audit trails:** Directly matches the append-only stage-event and courier-assignment history requirement.
- **CommonJS in legacy `backend/`, ESM in `apps/dgfy-api`:** New API code is ESM (`import`/`export`); migrations under `apps/dgfy-migration-runner/src/migrations/schema/` are CommonJS `.cjs`.
- **Hard constraint (project-wide, PROJECT.md): ZERO writes/edits/migrations to any file under `backend/`.** Legacy `settingsValidator.js` / `settingsRepository.js` are read-only pattern references and are a DIFFERENT concept from per-order couriers.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| List incoming online orders (FUL-01) | API / Backend (`modules/fulfillment` usecase) | Database / Storage (tenant `availments` read) | Staff-facing read over tenant data; no client-side logic (backend-API-only phase). |
| Stage progression + valid-sequence enforcement (FUL-02) | API / Backend (usecase app-logic, D-15) | Database (append-only `availment_stage_events` + denormalized cache) | D-15 explicitly puts per-mode sequence rules in application logic, not the DB. |
| Stage-event auto-write at finalize (D-05/D-06) | API / Backend (`availmentRepository` transaction methods) | Database (same `sequelize.transaction()`) | Must be atomic with the existing finalize write; belongs inside the repository transaction. |
| Courier assignment + payout (FUL-03) | API / Backend (`modules/fulfillment` usecase) | Database (append-only `courier_assignments`) | Free-text per-order record with a payout sub-lifecycle; tenant-local write. |
| Auth / membership gating | API / Backend (`businessRepository.getMembership`, landlord `dgfy_core`) | — | Membership lives in the landlord DB; the `requireMembership` helper resolves it (cross-DB, no FK). |

## Standard Stack

No new packages. Everything is already installed and in use across Phases 8–10.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `sequelize` | ^6.x (in `apps/dgfy-api` + migration-runner) | Tenant model definitions + migrations + `sequelize.transaction()` | Already the ORM for every `dgfy_business_*` table (verified: `availmentRepository.js`, `tenantConnector.js`). |
| `express` | ^4.x | Routing (`createFulfillmentRoutes`) | Every existing module (`inventory`, `availments`) uses it. |
| `jest` | ^29.7.0 | Test framework (ESM via `--experimental-vm-modules`) | Sole test runner (`apps/dgfy-api/package.json` `test` script; `jest.config.cjs`). |

### Supporting (existing shared contracts to reuse verbatim)
| Module | Path | Purpose |
|--------|------|---------|
| `ApplicationResult` | `apps/dgfy-api/src/shared/contracts/applicationResult.js` | Every usecase returns `ApplicationResult.success/failure`. |
| `DomainError` / `DomainErrorCode` | `apps/dgfy-api/src/shared/contracts/domainErrors.js` | `validationError`/`forbiddenError`/`conflictError`/`notFoundError` helpers (copy the local-helper convention from `inventoryMovementUseCases.js:16-50`). |
| `sendUseCaseResult` | `apps/dgfy-api/src/shared/controllers/useCaseResponder.js` | Transport-only controller response formatting. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New `modules/fulfillment` module | Extending `modules/availments` in place | Rejected — stage progression + courier are distinct concerns from checkout; a new module matches the one-module-per-concern precedent (inventory/shifts/booking are all separate). But the stage-event auto-write at finalize (D-06) MUST live in `availmentRepository.js`, so expect a shared/injected port between the two modules. |
| Denormalized latest-stage columns on `availments` | Always computing latest from the event table | Domain spec + CONTEXT already decided the read-cache approach (two-field shape). Not up for debate. |

**Installation:** None. (No `npm install`; no Package Legitimacy Audit required — zero external packages added.)

## Architecture Patterns

### System Architecture Diagram

```
                          ┌──────────────────────────────────────────────┐
   Staff (authenticated)  │  Express router  /fulfillment/*               │
   ───────────────────▶   │  (authenticateAccount middleware, injected)   │
                          └───────────────┬──────────────────────────────┘
                                          ▼
                          ┌──────────────────────────────────────────────┐
                          │  fulfillmentController (transport-only)       │
                          │  reads business_id from body/query,           │
                          │  req.account.id → requestingAccountId         │
                          └───────────────┬──────────────────────────────┘
                                          ▼
        ┌────────────────────────────────────────────────────────────────────┐
        │  fulfillmentUseCases                                                │
        │   • guardBusinessAccess → businessRepository.getMembership          │  ← landlord dgfy_core
        │     (any-active-member gate, inventory precedent)                   │
        │   • STAGE_SEQUENCES[mode] valid-next-stage check (D-15 app-logic)   │
        │   • returns ApplicationResult                                       │
        └───────────────┬───────────────────────────────┬────────────────────┘
                        ▼                                ▼
        ┌───────────────────────────┐   ┌──────────────────────────────────┐
        │ stageEventRepository      │   │ courierAssignmentRepository       │
        │ withModel(businessId, fn) │   │ withModel(businessId, fn)         │
        └───────────┬───────────────┘   └───────────────┬──────────────────┘
                    ▼ (tenantConnector.getModels)        ▼
        ┌────────────────────────────────────────────────────────────────────┐
        │  dgfy_business_<suffix>   (tenant DB, resolved via registry)        │
        │   availment_stage_events (append-only)  courier_assignments         │
        │   availments (+ fulfillment_mode / fulfillment_status /             │
        │               fulfillment_stage denormalized read cache)            │
        └────────────────────────────────────────────────────────────────────┘

  AUTO-WRITE PATHS (D-05/D-06) — stage events written inside EXISTING transactions:
   POS/dine-in finalize:  availmentUseCases.buildFinalizeAvailmentUseCase
                            → availmentRepository.finalizePersist()  [sequelize.transaction @ line 434]
                              └─ inject: write placed→confirmed→preparing→ready→completed (all at once)
   Online finalize:       finalizePaidOrderUseCases / storefrontFinalizeUseCases
                            → availmentRepository.finalizeStorefrontOrder()  [sequelize.transaction @ line 606]
                              └─ inject: write initial `placed` stage event + set denormalized columns
```

### Recommended Project Structure

New module mirrors `apps/dgfy-api/src/modules/inventory/` exactly:

```
apps/dgfy-api/src/modules/fulfillment/
├── index.js                                   # buildFulfillmentModule() DI wiring + createFulfillmentRoutes re-export
├── routes.js                                  # createFulfillmentRoutes(useCases, { authenticateAccount })
├── controllers/fulfillmentController.js       # transport-only (sendUseCaseResult)
├── usecases/fulfillmentUseCases.js            # stage progression + courier + payout usecases; STAGE_SEQUENCES map
├── repositories/stageEventRepository.js       # append-only stage-event writes (mirror inventoryMovementRepository.js)
├── repositories/courierAssignmentRepository.js
└── entities/ (optional — only if a rich domain entity is warranted)

apps/dgfy-api/src/models/Tenant/
├── AvailmentStageEvent.js                     # mirror InventoryMovement.js (append-only, updatedAt:false, throwing hooks)
└── CourierAssignment.js

apps/dgfy-migration-runner/src/migrations/schema/
└── 2026XXXXXXXXXX-create-availment-fulfillment.cjs   # targetKind:'business', additive

apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js   # ADD new tables + new availments columns
apps/dgfy-api/src/infra/tenantConnector.js              # REGISTER new models in getModels()
apps/dgfy-api/src/routes/index.js                       # MOUNT /fulfillment + wire stage-event port into availments module
apps/dgfy-api/src/modules/availments/repositories/availmentRepository.js  # inject stage-event write into 2 txns
```

### Pattern 1: Additive tenant-schema migration (copy the idempotent scaffold verbatim)
**What:** A single `.cjs` migration with `meta.targetKind: 'business'` that structurally excludes it from `dgfy_core`. Every table/column/index/trigger op is guarded so re-running is a no-op.
**When to use:** Any new `dgfy_business_*` table or column.
**Example (from the ACTUAL Phase 9 migration — copy these helpers exactly):**
```javascript
// Source: apps/dgfy-migration-runner/src/migrations/schema/20260713120000-create-availment-checkout.cjs
module.exports = {
  meta: { destructive: false, targetKind: 'business', rollbackDescription: '...', estimatedRisk: 'low' },
  async up(queryInterface, Sequelize) {
    const tableExists = async (t) => { /* showAllTables tolerant match */ };
    const hasIndex = async (t, name) => { /* showIndex */ };
    const addIndexIfMissing = async (t, cols, opts) => { if (opts.name && await hasIndex(t, opts.name)) return; await queryInterface.addIndex(t, cols, opts); };
    const timestampColumns = () => ({ created_at: {...}, updated_at: {...} });

    // ADD COLUMNS to existing availments (guard with describeTable — see add-availment-source-reference.cjs):
    const desc = await queryInterface.describeTable('availments');
    if (!desc.fulfillment_mode) await queryInterface.addColumn('availments', 'fulfillment_mode', { type: Sequelize.ENUM('pickup','delivery','dine_in'), allowNull: true });
    if (!desc.fulfillment_status) await queryInterface.addColumn('availments', 'fulfillment_status', { type: Sequelize.ENUM('placed','confirmed','preparing','ready','out_for_delivery','completed'), allowNull: true });
    if (!desc.fulfillment_stage) await queryInterface.addColumn('availments', 'fulfillment_stage', { type: Sequelize.STRING(32), allowNull: true }); // D-15 shared/open

    // CREATE TABLE availment_stage_events (guard with tableExists), created_at only, then append-only triggers.
  },
  async down(queryInterface) { /* DROP TRIGGER IF EXISTS; dropTable reverse-order; DROP TYPE enum_* on mysql */ }
};
```
**Column-add guard precedent:** `20260714103000-add-availment-source-reference.cjs` shows the exact `describeTable` → `if (!desc.col) addColumn` idempotent pattern for extending an existing table.

### Pattern 2: Append-only ledger model (copy `InventoryMovement.js`)
**What:** A tenant model with `updatedAt: false`, throwing `beforeUpdate`/`beforeBulkUpdate` hooks (app-layer half), backed by DB `BEFORE UPDATE`/`BEFORE DELETE` `SIGNAL SQLSTATE '45000'` triggers in the migration (hard backstop).
**When to use:** `availment_stage_events` (strictly append-only). NOT for `courier_assignments`' payout columns (see Landmine 3).
**Example:**
```javascript
// Source: apps/dgfy-api/src/models/Tenant/InventoryMovement.js
AvailmentStageEvent.init({
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  business_id: { type: DataTypes.CHAR(36), allowNull: false },      // opaque cross-DB UUID, NO FK
  availment_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'availments', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
  fulfillment_mode: { type: DataTypes.ENUM('pickup','delivery','dine_in'), allowNull: false },
  fulfillment_status: { type: DataTypes.ENUM('placed','confirmed','preparing','ready','out_for_delivery','completed'), allowNull: false },
  fulfillment_stage: { type: DataTypes.STRING(32), allowNull: true },
  reason: { type: DataTypes.STRING(255), allowNull: true },          // domain §9 reason precedent; doubles for D-10 force note
  is_forced: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }, // D-10 (discretion — or fold into reason)
  actor_staff_account_id: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'staff_accounts', key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE' },
  actor_account_id: { type: DataTypes.CHAR(36), allowNull: true }    // opaque landlord accounts.id, NO FK
}, {
  sequelize, modelName: 'AvailmentStageEvent', tableName: 'availment_stage_events',
  underscored: true, timestamps: true, createdAt: 'created_at', updatedAt: false,
  hooks: { beforeUpdate() { throw new Error('availment_stage_events is insert-only'); },
           beforeBulkUpdate() { throw new Error('availment_stage_events is insert-only'); } }
});
```

### Pattern 3: Repository `withModel` scaffold (copy `inventoryMovementRepository.js` / `availmentRepository.js`)
**What:** `resolveDatabaseName(businessId)` (registry lookup requiring `status==='active'` + `verified_at`) → `getModels(databaseName)` → run `fn(model)`. Errors normalized to `TenantDatabaseUnavailableError`.
**When to use:** Both new repositories.
**Example:** `availmentRepository.js:99-164` (`resolveDatabaseName`, `resolveModel`, `withModel`). Duck-typed error classes (`error.name === 'TenantDatabaseUnavailableError'`) so usecases stay self-contained.

### Pattern 4: Stage-event write inside the EXISTING finalize transaction (D-05/D-06)
**What:** Both auto-write paths are transaction methods **in the same file**: `availmentRepository.finalizePersist()` (`sequelize.transaction` at line 434) and `availmentRepository.finalizeStorefrontOrder()` (`sequelize.transaction` at line 606). Add stage-event `create({ ..., transaction })` calls inside those blocks.
- **POS/dine-in (`finalizePersist`, D-05):** after the availment `.update({status:'finalized'})` (line 445) and before/after the Payment/Receipt writes, insert the FULL sequence `placed→confirmed→preparing→ready→completed` as 5 rows, and set the denormalized `fulfillment_mode`/`fulfillment_status='completed'`/`fulfillment_stage='completed'` on the availment update. The POS availment's `fulfillment_mode` must be supplied — see Open Question 1.
- **Online (`finalizeStorefrontOrder`, D-06 seam):** after the availment `.create({status:'finalized'})` (line 618), insert ONE `placed` stage event and set denormalized `fulfillment_mode` (from the already-threaded `fulfillmentMode`) + `fulfillment_status='placed'` + `fulfillment_stage='placed'`. `fulfillmentMode` is ALREADY passed all the way down (`finalizePaidOrderUseCases.js:140` → `storefrontFinalizeUseCases.js:127`) but currently DROPPED — this phase persists it.
- **Injection style:** Prefer passing a `recordStageEvents` port into `buildAvailmentsModule` (like `recordSaleEffect`/`commitReservation` are today) so the write is composed at the root (`routes/index.js`), keeping the availments repository from importing the fulfillment module directly. Mirrors the existing `recordSaleEffect: inventoryUseCases.recordSale` wiring (`routes/index.js:147`).

### Anti-Patterns to Avoid
- **Reusing `availments.status` for the pipeline.** `status` is the `draft/finalized/voided` checkout lifecycle. Naming the coarse fulfillment status `status` will collide. Use `fulfillment_status`.
- **DB-level per-mode stage constraints.** D-15 forbids this; a single shared enum/string + app-logic validation only.
- **Putting courier fields as columns on `availments`.** D-04 requires a dedicated append-only table.
- **Porting `storefront_delivery_partners` as the courier model.** D-01 — different concept.
- **Controller importing a model or repository.** Blocked by `eslint.config.mjs` `no-restricted-imports`; controllers are transport-only.
- **`sync({ alter: true })` / ad-hoc `model.sync()`.** DBF-04 forbids it; schema changes go through a real migration verified against `dgfyBusinessContract.js`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tenant DB resolution | Custom registry lookup | `resolveDatabaseName`/`withModel` from `availmentRepository.js` | Handles provisioning/inactive/unverified states + error normalization already. |
| Append-only enforcement | App-only guard | `updatedAt:false` + throwing hooks + migration `SIGNAL '45000'` triggers | Both layers already proven for `inventory_movements`/`payments`/`receipts`. |
| Membership auth | New role check | `businessRepository.getMembership(accountId, businessId)` + `status==='active'` | `requireMembership`/`guardBusinessAccess` (`inventoryMovementUseCases.js:96-119`) is the exact precedent. |
| Idempotent migration ops | Bare `createTable`/`addColumn` | `tableExists`/`hasIndex`/`addIndexIfMissing`/`describeTable` guards | Copied verbatim across all Phase 8–10 migrations; required for re-runnability. |
| Usecase result shape | Ad-hoc returns/throws | `ApplicationResult.success/failure` + `DomainError` | Every module + `sendUseCaseResult` depend on this contract. |
| Model registration | Direct model-factory import in a repo | `tenantConnector.getModels(databaseName)` | Single reachable registry; direct imports break the per-connection caching + associations. |

**Key insight:** This phase is 90% mechanical mirroring. The risk is not "how to build it" — it's getting the schema naming (Landmine 1), the two finalize seams (Pattern 4), and the payout-mutability tension (Landmine 3) right.

## Landmines / Conflicts

### Landmine 1 (HIGH): `status` name collision — the domain spec's "coarse status" cannot reuse `availments.status`
The domain spec's two-field shape names the coarse pipeline field `status`. But `availments.status` ALREADY exists as `ENUM('draft','finalized','voided')` — the Phase 9 checkout lifecycle (`Availment.js:136-140`, migration line 155). CONTEXT.md explicitly calls this out (canonical_refs → Existing Code). **Recommendation:** name the denormalized coarse pipeline column `fulfillment_status` (values `placed/confirmed/preparing/ready/out_for_delivery/completed`) and the event-table column identically. Do NOT touch or overload the existing `status`. `[VERIFIED: codebase — Availment.js:136, migration line 155]`

### Landmine 2 (MEDIUM): `finalizeStorefrontOrder` currently DISCARDS `fulfillmentMode`
`storefrontFinalizeUseCases.js:120-129` accepts `fulfillmentMode`/`requestedFor` "for interface completeness" but explicitly does NOT persist them ("no column exists for them"). The value is threaded from `finalizePaidOrderUseCases.js:140`. This phase closes that gap: add the column, persist `fulfillmentMode` onto the tenant availment, and write the `placed` stage event. The plumbing already exists end-to-end; only persistence is missing. `[VERIFIED: codebase — storefrontFinalizeUseCases.js:120-129, 202]`

### Landmine 3 (MEDIUM): courier payout lifecycle conflicts with strict append-only
D-04 says courier assignment is append-only (one row per attempt). D-02 says payout has a mutable lifecycle (`owed → paid`, `paid_at` set later). These conflict: a strictly append-only table (with `SIGNAL '45000'` UPDATE triggers like `inventory_movements`) cannot have its `payout_status` updated. **Recommendation:** make `courier_assignments` append-only for ASSIGNMENT IDENTITY (never delete/overwrite an attempt; reassignment inserts a NEW row + marks the prior via `superseded_at`/`is_active`) but ALLOW `UPDATE` of `payout_status`/`paid_at` on a row — i.e. do NOT attach the append-only UPDATE trigger to this table, and do NOT set `updatedAt:false`. This is a deliberate divergence from the `inventory_movements` pattern; state it explicitly in the migration doc comment. Alternatively, split payout into its own `courier_payouts` table — planner's call. `[VERIFIED: CONTEXT D-02/D-04 tension + inventory_movements trigger pattern]`

### Landmine 4 (MEDIUM): the schema-authority domain spec file is NOT in the working tree
`refactor-do-not-commit/DGFY_Domain_02_Product.md` (cited as §9/§10.1/line 234 schema authority throughout CONTEXT.md and the research brief) **does not exist** in the repo (`refactor-do-not-commit/` is absent; grep for `AVAILMENT_STAGE_EVENT` returns zero non-`.planning` hits). This is not blocking: CONTEXT.md's D-01…D-15 already encode every decision derived from it (exact stage names, two-field shape, app-logic sequence validation, fixed enums). The planner should treat **CONTEXT.md as the operative schema authority** and not attempt to re-read the domain doc. `[VERIFIED: filesystem — file absent]`

### Landmine 5 (LOW): `dgfyBusinessContract.js` has 4 pre-existing missing Phase 9 entries
`availment_items`, `availment_discounts`, `receipts`, `compliance_evidence` were never added to the contract (documented at `dgfyBusinessContract.js:464-474` and `add-availment-source-reference.cjs` header). The migration-runner `verify` command and the `applyAndVerifyBusinessSchema` test helper only check tables that ARE in the contract, so this doesn't block. **Recommendation:** ADD the new fulfillment tables + new `availments` columns to `dgfyBusinessContract.js` (so `verify` covers them); optionally backfill the 4 missing entries, but that is out of scope — do not let it expand the phase. `[VERIFIED: codebase — dgfyBusinessContract.js:464-474]`

## Runtime State Inventory

This is an ADDITIVE schema-extension phase (new tables + new nullable columns), not a rename/refactor. There is still one data-shape consideration:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data (existing rows) | Existing `availments` rows (POS from Phase 9, online from Phase 10) predate the new `fulfillment_*` columns; they will be NULL after the additive migration. | None required for correctness — new columns are nullable read-cache. Existing finalized availments have no stage-event history and won't appear in the FUL-01 queue (D-08 filters on active online stages). No backfill mandated; if the team wants historical online orders in the queue, that's a data-migration decision — flag to user, do NOT assume. |
| Live service config | None — no external service holds fulfillment/courier state (no courier API integration this phase, FUL-04 deferred). | None. |
| OS-registered state | None. | None. |
| Secrets / env vars | None new. Tenant DB creds reused from `tenantConnector` (`DB_HOST`/`DB_USER`/`DB_PASSWORD`/`DB_PORT`). | None. |
| Build artifacts | None — no new package, no compiled artifact. New `.js`/`.cjs` files only. | None. |

**Nothing found in categories: Live service config, OS-registered state, Secrets, Build artifacts — verified by grep (no `courier`/`fulfillment_stage`/`stage_event` refs anywhere in `apps/`) and by the phase being additive-only.**

## Common Pitfalls

### Pitfall 1: Forgetting to register the new models in `tenantConnector.getModels()`
**What goes wrong:** Repository calls resolve `undefined` for `AvailmentStageEvent`/`CourierAssignment` at runtime — the EXACT bug that hit Phase 9 (its 6 availment models existed but weren't registered; documented at `tenantConnector.js:153-158` / `09-06-SUMMARY.md`).
**How to avoid:** Add both `import` lines at the top of `tenantConnector.js` AND both entries to the `modelDefiners` map (lines 135-165). Add associations in the new models' `associate()` and in `Availment.js` (`hasMany` stage events / courier assignments).
**Warning signs:** `TypeError: Cannot read properties of undefined` on `.create` inside a repository.

### Pitfall 2: Writing the stage-event OUTSIDE the finalize transaction
**What goes wrong:** A dine-in availment finalizes but the stage events fail to write (or vice-versa) — split-brain between the availment and its history, violating D-05's "identical data shape."
**How to avoid:** Pass `{ transaction }` to every stage-event `create()` inside `finalizePersist`/`finalizeStorefrontOrder`. Follow the `recordSaleEffect(... transaction)` precedent (`availmentRepository.js:462-473`) — a non-success result must THROW to roll back the whole transaction.
**Warning signs:** Availments with `status='finalized'` but zero `availment_stage_events` rows.

### Pitfall 3: Enforcing stage sequence in the DB instead of app-logic
**What goes wrong:** Violates D-15; a per-mode DB enum/constraint makes the shared `fulfillment_stage` column impossible and blocks the future kitchen-progression extension.
**How to avoid:** One shared enum/string column. Define `STAGE_SEQUENCES = Object.freeze({ pickup:[...], delivery:[...], dine_in:[...] })` in the usecase (mirroring `MOVEMENT_TYPES = Object.freeze([...])` at `inventoryMovementUseCases.js:14`); validate `nextStage` is the legal successor for the availment's `fulfillment_mode` before writing; return `conflictError`/`validationError` on illegal transitions.
**Warning signs:** A migration adding a CHECK constraint or per-mode enum type.

### Pitfall 4: Mounting the route but forgetting the composition-root wiring
**What goes wrong:** `/fulfillment` 500s because the module was never built with its tenant connector / businessRepository.
**How to avoid:** In `routes/index.js`, build `buildFulfillmentModule({ tenantConnector, businessDatabaseRegistryRepository, businessRepository })` reusing the SAME instances (never a second divergent set — the pattern is stated repeatedly, e.g. `routes/index.js:126-151`), then `router.use('/fulfillment', createFulfillmentRoutes(fulfillmentUseCases, { authenticateAccount }))`.
**Warning signs:** `undefined is not a function` at request time; a second `TenantConnector` being constructed.

### Pitfall 5: Assuming POS availments know their `fulfillment_mode`
**What goes wrong:** `finalizePersist` has no `fulfillment_mode` today; dine-in auto-write (D-05) needs one. Defaulting silently to the wrong mode writes a wrong sequence.
**How to avoid:** Decide explicitly how a POS availment acquires its mode (default `dine_in`? controller input?). See Open Question 1 — flag for the planner, do not silently default.

## Code Examples

### Membership gate (copy verbatim into fulfillmentUseCases.js)
```javascript
// Source: apps/dgfy-api/src/modules/inventory/usecases/inventoryMovementUseCases.js:96-119
async function requireMembership(businessRepository, businessId, accountId) {
  const membership = await businessRepository.getMembership(accountId, businessId);
  if (!membership || membership.status !== 'active') {
    return { error: forbiddenError('You must be a staff member or owner of this business.') };
  }
  return { membership };
}
// roles at landlord are 'owner'|'manager'|'member'; status 'active'|'invited'|'removed'.
// Inventory manual movements gate on ANY active member (not owner-only) — recommended default here too (D-86 discretion).
```

### Enum + valid-sequence app-logic (D-15)
```javascript
// Pattern basis: inventoryMovementUseCases.js:14  (Object.freeze enum constant)
export const STAGE_SEQUENCES = Object.freeze({
  pickup:   ['placed', 'confirmed', 'preparing', 'ready', 'completed'],
  dine_in:  ['placed', 'confirmed', 'preparing', 'ready', 'completed'],
  delivery: ['placed', 'confirmed', 'preparing', 'out_for_delivery', 'completed']
});
function nextLegalStage(mode, current) {
  const seq = STAGE_SEQUENCES[mode];
  const i = seq.indexOf(current);
  return (i >= 0 && i < seq.length - 1) ? seq[i + 1] : null;
}
// D-10 force-complete: allow jumping to 'completed' from out_for_delivery with is_forced=true + reason.
```

### Migration column-add guard (from the real Phase 10 migration)
```javascript
// Source: apps/dgfy-migration-runner/src/migrations/schema/20260714103000-add-availment-source-reference.cjs:72-82
const desc = await queryInterface.describeTable('availments');
if (!desc.source_reference) {
  await queryInterface.addColumn('availments', 'source_reference', { type: Sequelize.STRING(64), allowNull: true });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single-field state machine for fulfillment status | Two-field event-sourced (`fulfillment_status` + `fulfillment_stage`) backed by append-only `availment_stage_events`, denormalized read cache on `availments` | Resolved by domain spec / CONTEXT (STATE.md open concern) | Not up for debate; the planner implements the decided shape. |
| POS availment finalize writes only availment/payment/receipt | Same txn ALSO auto-writes full dine-in stage sequence (D-05/D-06) | This phase | The two finalize seams in `availmentRepository.js` gain stage-event writes. |
| `finalizeStorefrontOrder` drops `fulfillmentMode` | Persists it + writes `placed` event | This phase | Closes the documented gap (Landmine 2). |

**Deprecated/outdated:** none relevant.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | POS/dine-in availments should default `fulfillment_mode='dine_in'` at finalize (no explicit mode input exists today). | Pattern 4 / Pitfall 5 / Open Q1 | Wrong sequence written for a POS pickup-style sale; low blast radius (planner/user confirms). |
| A2 | Online availments are created at `fulfillment_status='placed'` at finalize (payment confirmed ≠ staff-confirmed). | Pattern 4 | If business wants auto-`confirmed` on payment, the initial event differs by one step. |
| A3 | Courier assignment + stage progression gate on ANY active membership (inventory precedent), not owner-only. | Code Examples / Discretion | Over/under-permissive; explicitly a discretion item (D-86) — user may want owner-only. |
| A4 | No backfill of existing (pre-migration) availments into the fulfillment pipeline is required. | Runtime State Inventory | Historical online orders won't appear in the FUL-01 queue; may surprise the user. |
| A5 | `courier_assignments` allows `payout_status`/`paid_at` UPDATE (not strictly append-only). | Landmine 3 | If strict append-only is mandated, payout tracking needs a separate table. |

**These A1–A5 are the items the planner / discuss-phase should confirm with the user before locking.**

## Open Questions

1. **How does a POS/dine-in availment acquire its `fulfillment_mode` for the D-05 auto-write?**
   - What we know: `finalizePersist` has no fulfillment input today; D-14 treats dine-in ≈ pickup stage names.
   - What's unclear: default `dine_in` vs. an optional controller-supplied mode (some counter sales are pickup).
   - Recommendation: default `dine_in` for POS finalize; accept an optional `fulfillmentMode` override on the finalize controller body. Confirm with user (A1).

2. **`is_forced`/`forced_by_staff_id` flag vs. free-form `reason` for D-10 force-complete?** (Explicit CONTEXT discretion.)
   - Recommendation: add a boolean `is_forced` alongside `reason` (cheap, queryable, records the override distinctly per D-10's "records that it was staff-forced"). Following domain §9 `reason` precedent, `reason` still carries the human note.

3. **Split `courier_assignments` payout into its own table, or mutate columns on the assignment row?** (Landmine 3.)
   - Recommendation: single table, payout columns mutable (no append-only trigger). Simpler, matches D-04's "one row per assignment attempt." Only split if strict append-only is required.

4. **Should FUL-01 filter by branch (`branch_id`) in addition to status/mode?** (Explicit CONTEXT discretion.)
   - Recommendation: accept optional `branch_id`/`fulfillment_mode` query filters; default = all active online orders for the business. Keep it a simple, indexed `WHERE business_id AND fulfillment_status IN (...)` query.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| MySQL 8.0 (dev/CI) | Live integration tests + real migration apply | Not probed in this session (agent sandbox) | — | Unit tests mock Sequelize (see `storefrontFinalize.test.js`); live tests are ENV-gated (`LIVE_TENANT_DB`) and SKIP without MySQL — CI stays green. |
| Node.js (ESM + `--experimental-vm-modules`) | jest run | Assumed (repo is Node ESM) | — | — |
| `jest` ^29.7.0 | Test framework | Yes (declared in `apps/dgfy-api/package.json`) | ^29.7.0 | — |

**Missing dependencies with no fallback:** none — the phase is code + additive migration; unit tests need no DB, integration tests self-skip without one.
**Note:** MySQL 8.0 features are used by the existing pattern (STORED generated columns, `SIGNAL SQLSTATE '45000'` triggers). The new append-only triggers rely on the same MySQL 8.0 capability already proven in Phase 8/9 migrations.

## Security Domain

Backend API phase with authenticated staff endpoints; `security_enforcement` treated as enabled (no explicit `false` found).

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V4 Access Control | yes | `authenticateAccount` middleware + `requireMembership` (active-membership gate) on every `/fulfillment/*` route. Courier assignment + stage progression must both gate (discretion: any-active-member vs owner-only). Tenant isolation via `resolveDatabaseName` (registry-scoped `business_id`). |
| V5 Input Validation | yes | Validate `fulfillment_mode`/next-stage against `STAGE_SEQUENCES` (app-logic, D-15); reject illegal transitions with 409/400. Courier `payout_amount` must be validated as a non-negative number server-side; free-text `courier_name`/`courier_contact` length-bounded (STRING(255)). |
| V6 Cryptography | no | No new secrets/crypto; reuses tenant DB creds. |
| V2 Authentication / V3 Session | no (reused) | Handled by the existing accounts auth middleware; no change. |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-tenant availment access (progress/assign courier on another business's order) | Elevation of Privilege / Info Disclosure | `WHERE business_id = ?` scoping in every query + `requireMembership(businessId)`; opaque cross-DB `business_id`, never a joinable FK. |
| Illegal/skipped stage transition (e.g., `placed`→`completed` bypassing prep) | Tampering | App-logic `nextLegalStage` check; only D-10 force-complete may jump, recorded as `is_forced` + `reason`. |
| Client-supplied payout amount tampering | Tampering | Server validates/bounds `payout_amount`; it is operator-entered, not customer-facing — record who assigned (`assigned_by_staff_account_id`). |
| Mutating fulfillment history after the fact | Repudiation / Tampering | Append-only `availment_stage_events` (throwing hooks + `SIGNAL '45000'` triggers); immutable per D-07. |
| SQL injection | Tampering | Sequelize parameterized queries only (no raw string interpolation of user input; the only raw SQL is DDL in the migration with static identifiers). |

## Sources

### Primary (HIGH confidence — read directly this session)
- `apps/dgfy-api/src/models/Tenant/Availment.js` — confirmed `status` ENUM `draft/finalized/voided`; NO `fulfillment_*` columns exist; associations + indexes.
- `apps/dgfy-api/src/models/Tenant/InventoryMovement.js` — canonical append-only ledger model to mirror.
- `apps/dgfy-api/src/modules/availments/repositories/availmentRepository.js` — BOTH finalize transaction seams (`finalizePersist` line 434, `finalizeStorefrontOrder` line 606).
- `apps/dgfy-api/src/modules/availments/usecases/availmentUseCases.js` (finalize section ~583-865) + `storefrontFinalizeUseCases.js` — `fulfillmentMode` threaded-but-dropped gap.
- `apps/dgfy-api/src/modules/commercePayments/usecases/finalizePaidOrderUseCases.js:140` — `fulfillmentMode` passed into `finalizeStorefrontOrder`.
- `apps/dgfy-api/src/modules/inventory/{routes.js,controllers/…,usecases/inventoryMovementUseCases.js}` — module layout + `requireMembership`/`guardBusinessAccess` gating precedent.
- `apps/dgfy-api/src/infra/tenantConnector.js` — `getModels()` registry (model registration point + the Phase 9 "forgot to register" bug note).
- `apps/dgfy-api/src/routes/index.js` — composition root + mounting + `recordSaleEffect`/`commitReservation` port-injection precedent.
- `apps/dgfy-migration-runner/src/migrations/schema/20260713120000-create-availment-checkout.cjs` + `20260714103000-add-availment-source-reference.cjs` — migration scaffold (idempotent helpers, targetKind, triggers, addColumn guard).
- `apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js` — verification contract (add new tables/columns here; 4 missing Phase 9 entries noted).
- `apps/dgfy-api/tests/availments/storefrontFinalize.test.js` + `tests/helpers/tenantSchemaProvisioning.js` + `tests/integration/availments/finalizeLive.test.js` — Jest ESM patterns, mock-Sequelize unit style, ENV-gated live integration, dynamic business-migration loading.
- `apps/dgfy-api/src/models/Landlord/StorefrontOrder.js` — landlord `fulfillment_mode`(pickup/delivery STRING(16)) + `fulfillment_timing` + `requested_for` mapped onto the tenant availment at finalize.
- `.planning/phases/11-…/11-CONTEXT.md`, `.planning/REQUIREMENTS.md`, `docs/ai/CLAUDE.md` — decisions, requirements, project directives.

### Secondary (MEDIUM confidence)
- `apps/dgfy-api/src/models/Landlord/BusinessMembership.js` — roles `owner/manager/member`, status `active/invited/removed` (auth semantics).

### Tertiary (LOW confidence)
- None. No web search performed (codebase-extension phase; no external packages or APIs).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all libs already in use, verified in `package.json` + source.
- Architecture / patterns: HIGH — every pattern read directly from the working tree with file:line citations.
- Pitfalls / landmines: HIGH — derived from actual code (naming collision, dropped `fulfillmentMode`, model-registration bug all verified in source) and documented in-code.
- Open questions / assumptions: MEDIUM — A1–A5 are genuine design forks the user/planner must confirm; flagged, not silently resolved.

**Research date:** 2026-07-13
**Valid until:** 2026-08-12 (stable internal codebase; re-verify only if Phases 9/10 finalize paths change before planning).

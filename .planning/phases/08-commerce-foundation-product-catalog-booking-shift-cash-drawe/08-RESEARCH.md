# Phase 8: Commerce Foundation — Product Catalog, Booking, Shift & Cash Drawer, Compliance Gating - Research

**Researched:** 2026-07-12
**Domain:** Backend commerce foundation (Node/Express Clean-Architecture modules + MySQL 8.0 tenant schema) in `apps/dgfy-api`
**Confidence:** HIGH — every structural claim is verified against the live codebase; milestone research (`.planning/research/*`) is consolidated, not re-derived.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** `ComplianceModeState` is **tenant-scoped** (`dgfy_business_*`), not `dgfy_core`. Gates tenant-local operations in the same DB as what it gates.
- **D-02:** **Full port of legacy's 3-state model** — reuse `non_compliant_active` / `compliant_pending` / `compliant_active` (legacy `COMPLIANCE_MODE_STATE`).
- **D-03:** **Full BIR/NPC/BSP policy-pack depth**, ported as-is from `policyPacks.js` (versioned packs; required settings keys, profile fields, artifacts per regulator; peripheral-class + readiness checks). Not narrowed to BIR-only.
- **D-04:** **Manual state transitions now, automatic later.** Authorized staff/owner submits evidence; `tenant_master_admin`/`platform_admin` reviews and transitions. Don't build automation; don't block adding it later.
- **D-05 (MOST IMPORTANT):** Legacy `compliancePolicyEngine.js` forces `compliant_active` businesses into Fiscal-only (denies non-fiscal with `DOCUMENT_CONTEXT_NOT_ALLOWED`). **Do NOT port this.** New behavior:
  - `non_compliant_active` — Fiscal **denied** (`NON_COMPLIANT_FISCAL_DOCUMENT_BLOCKED`), non-fiscal **allowed** *(unchanged)*
  - `compliant_pending` — Fiscal → `REQUIRES_SETUP` (`COMPLIANT_ACTIVATION_PENDING`), non-fiscal **allowed** *(unchanged)*
  - `compliant_active` — **both** `fiscal` and `non_fiscal` **allowed** *(THE DEVIATION — legacy denies non-fiscal here)*
  Gate port must accept `requestedDocumentContext: 'fiscal' | 'non_fiscal' | 'training_test'` as first-class input. Client decides mode; backend only gates eligibility by state, never forces a mode.
- **D-06:** **Manual movements + reserved (unwired) sale/booking effect-type stubs.** Ship `restock`/`loss`/`adjustment` append-only `InventoryMovement` rows (single-writer per ADR 0029 — only `modules/inventory` writes). Define `sale`/`booking` effect-type contracts now (unwired) so Phase 9 plugs into an existing shape.
- **D-07:** **`stock_effect_type` is NOT a Phase 8 concern.** Product tracks only `inventory_mode` (`basic_inventory` vs `non_stock`). Per-sale-line `stock_effect_type` lives on `AvailmentItem` in Phase 9. Do not add it to Product.
- **D-08:** **Create + cancel, no reschedule.** Cancel releases branch-capacity slot atomically (same guarded increment/decrement pattern as inventory).
- **D-09:** **Cancel authorization: staff/owner AND the booking's own consumer account.** Either side; no reason required. Build the consumer-account-owns-booking check at usecase/API level against the Accounts API even though the consumer UI ships in Phase 10.
- **D-10:** **Open/close + no-sale pop only — no pay-in/pay-out event types yet.** `Expected cash = starting float` until Phase 9. Reconciliation formula shape must anticipate Phase 9's additional inputs without restructuring.
- **D-11:** **Stale shifts: flag only, never auto-close.** Threshold is an operator-configurable parameter (planner's call on where/how configured), not hardcoded.
- **D-12:** **One open shift per cashier+terminal, DB-level enforced** via MySQL `GENERATED ALWAYS AS (...) STORED` + `UNIQUE INDEX`, following `backend/migrations/20260703000002-enforce-one-open-shift-per-terminal.cjs`.

### Claude's Discretion

- Exact command/endpoint names for compliance transitions, inventory movements, booking cancel, shift open/close/pay-events — follow `routes → controllers → usecases → repositories → models` from `modules/accounts`/`modules/businesses`.
- Exact gate-port name (`assertComplianceGate` vs other) and parameter shape beyond the mandatory `requestedDocumentContext`.
- Exact stale-shift threshold value — operator-configurable, not hardcoded.
- Exact shape of reserved sale/booking `InventoryMovement` effect-type contracts — provided `modules/inventory` stays sole writer and the contract is reusable by Phase 9 without redesign.
- Folder structure for Product grouping — default to porting `ItemFolder.js`'s shape unless a concrete reason not to. *(See Open Question OQ-1: the actual legacy model DOES have `parent_id` self-nesting, contradicting CONTEXT's "flat, no nesting" description.)*

### Deferred Ideas (OUT OF SCOPE)

- Automatic compliance-mode state transitions (D-04 defers).
- Booking reschedule as a distinct action (covered by cancel + create new, D-08).
- Pay-in/pay-out cash-drawer event types (Phase 9, D-10).
- Consumer-facing Storefront UI for Booking cancel (authorization built now, entry point Phase 10, D-09).
- FSC-03 (SC/PWD discount math) — explicitly Phase 9.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PRD-01 | Product in Food/Service/Retail category; category on Product not Store; Store mixes categories | New `products` table with `category` ENUM. See Standard Stack + Code Examples. |
| PRD-02 | Basic Inventory vs non-stock per Product; per-sale-line `stock_effect_type` (Phase 9) | Product carries `inventory_mode` only (D-07). `stock_effect_type` deferred to `AvailmentItem` in Phase 9. |
| PRD-03 | Group Products into folders | Port `ItemFolder.js` shape as tenant-local `product_folders`. See OQ-1 (nesting). |
| PRD-04 | Every stock change is an append-only Inventory Movement row, never mutated | `inventory_movements` insert-only model + DB `BEFORE UPDATE`/`BEFORE DELETE` trigger. See Pattern C. |
| PRD-05 | New tables in `dgfy_business_*`; never reuse/FK legacy `items`/`PosTransactionLine` | New tenant tables; **schema-contract `rejectedTables` must be updated** (see CRITICAL finding). |
| BOK-01 | Mark Service Product bookable with slot duration + branch-level concurrent capacity | Booking fields on Product; `slot_duration_minutes`, `concurrent_capacity`. |
| BOK-02 | Create Booking; block once branch capacity reached — no staff calendar | Atomic guarded UPDATE against a `slots_remaining`-style counter (Pattern D). |
| BOK-03 | Fulfilled Booking links to the Availment that completes it | Nullable `availment_id` on `bookings` (Availment table is Phase 9 — column reserved, no FK yet). |
| SFT-01 | Open shift with starting float; one open shift per cashier+terminal (DB-level) | Generated-column + unique-index pattern (D-12, Pattern B). |
| SFT-02 | Close shift; Expected cash vs Actual with signed Difference | Reconciliation formula; `Expected = starting float` this phase (D-10). Port `PosTerminalShift` DECIMAL(14,4) columns. |
| SFT-03 | Every cash-drawer event including no-sale pop logged | Append-only `cash_drawer_events` insert-only model + trigger. |
| FSC-01 | Tenant/branch compliance-mode state reflecting paperwork present + verified | `compliance_mode_state` table (D-01, tenant-scoped) + policy packs (D-03). |
| FSC-02 | Checkout, shift-open, receipt issuance gated through one shared policy-engine check | Build the gate port (Pattern A) with `requestedDocumentContext` (D-05). Phase 8 builds port; Phase 9 wires call sites. |
</phase_requirements>

## Summary

Phase 8 adds five new Clean-Architecture modules to `apps/dgfy-api` (`products`, `inventory`, `booking`, `shifts`, `compliance`), mirroring the exact `routes → controllers → usecases → repositories → models` shape already proven by `modules/accounts` and `modules/businesses`. It needs **almost no new libraries** — the entire hard-problem surface (append-only ledger immutability, one-open-shift invariant, fiscal policy engine) is solved by porting three proven MySQL/JS patterns from the legacy `backend/` (read-only reference) into new tenant tables under `dgfy_business_*`. The single net-new dependency is `joi` for validating the richer commerce payloads.

The two highest-risk items are behavioral, not technical: (1) **D-05** — the legacy compliance engine's `compliant_active` block must be inverted from "deny non-fiscal" to "allow both fiscal and non-fiscal," and the gate port must take `requestedDocumentContext` as first-class input; and (2) a **previously-unflagged schema-contract blocker** — `apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js` currently lists `products`, `shifts`, `stock_movements`, `fiscal_receipts`, etc. in a `rejectedTables` array whose presence makes the runner's `verify` command **fail** (`ok: false`). Phase 8 must update that contract (add the new tables to `tables{}`, remove the now-legitimate names from `rejectedTables`) or the tenant-schema verification gate will reject the new schema.

**Primary recommendation:** Build all five modules as sibling DI factories (`buildXModule({...})`) returning `{ repository, useCases }`; put every schema change in idempotent Umzug migrations under `apps/dgfy-migration-runner/src/migrations/schema/` with `meta.targetKind: 'business'`; register every new Tenant model in `TenantConnector.getModels()`'s `modelDefiners` map; and treat `backend/` strictly as read-only pattern reference (zero writes).

## Architectural Responsibility Map

This is a backend-only phase; every capability lives in the API tier over the tenant database. "Tier" below = owning module.

| Capability | Primary Tier (module) | Secondary | Rationale |
|------------|----------------------|-----------|-----------|
| Product identity, category, inventory_mode, folders | `modules/products` (Tenant DB) | — | Owns `products`/`product_folders` tables |
| Append-only stock ledger writes | `modules/inventory` (Tenant DB) | — | **Sole writer** of `inventory_movements` (ADR 0029, D-06) |
| Booking create/cancel + branch-capacity guard | `modules/booking` (Tenant DB) | `modules/inventory` (effect stub) | Capacity counter atomic-guarded like stock |
| Shift open/close, cash-drawer events, reconciliation | `modules/shifts` (Tenant DB) | `modules/compliance` (gate) | One-open-shift invariant enforced in DB |
| Compliance-mode state + policy gate port | `modules/compliance` (Tenant DB) | — | Owns state machine + `assertComplianceGate` port (Phase 9 is first caller) |
| Tenant DB connection + model registry | `infra/tenantConnector.js` | — | Extend `getModels()` `modelDefiners`; do not build a parallel connector |
| Tenant-schema authority (contract + migration + verify) | `apps/dgfy-migration-runner` | — | New tables must be added to contract AND removed from `rejectedTables` |
| Booking customer identity resolution | `modules/accounts` (Landlord `dgfy_core.accounts`) | — | `customer_account_id` = opaque UUID, no cross-DB FK (D-09) |

## Standard Stack

### Core (unchanged — verified against `apps/dgfy-api`)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Express | ^4.22.2 | HTTP routing | New routes slot into existing structure `[VERIFIED: apps/dgfy-api/package.json]` |
| Sequelize | ^6.37.8 | ORM + models | All new models mirror existing Tenant model factories `[VERIFIED: package.json]` |
| MySQL | 8.0 | Database | Required for `GENERATED ALWAYS AS (...) STORED` + trigger `SIGNAL` `[CITED: STACK.md]` |
| Node.js | 22-alpine | Runtime | Native `fetch`/`crypto` available (not needed this phase; relevant Phase 9) `[CITED: STACK.md]` |

### Supporting — net-new
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `joi` | ^18.2.3 | Request-payload validation for commerce DTOs (booking, shift-open float, inventory movement, compliance evidence) | `dgfy-api` currently hand-validates inline in usecases via `DomainError` (see `locationUseCases.js`). Commerce payloads cross the complexity threshold. `[VERIFIED: npm registry — 18.2.3, published 2026-06-17, repo github.com/hapijs/joi]` `[CITED: STACK.md]` — **discovered via milestone STACK research, not authoritative docs; treat as recommended, confirm at plan time.** |

**Installation:**
```bash
cd apps/dgfy-api
npm install joi@^18.2.3
```
`joi` is currently **NOT** in `apps/dgfy-api/package.json` `[VERIFIED: grep of package.json]`. Whether to adopt it or continue the existing inline-`DomainError` validation convention is a genuine planner choice — the existing modules validate without it. If simplicity is preferred, the phase needs **zero** new dependencies.

### Alternatives Considered (from STACK.md, all rejected)
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled policy engine (port legacy) | `json-rules-engine`/`nools` | Only if rules become runtime-editable; PH BIR/NPC/BSP rules are code-owned/git-versioned → don't |
| Enum + guarded transitions for shift | `xstate` | Two states (`open`/`closed`) don't justify a state-machine lib |
| MySQL partial unique index | Postgres-style `WHERE` predicate | MySQL has no filtered indexes → use generated-column trick |
| Append-only Sequelize + trigger | `eventstore`/CQRS framework | Overkill for an audit trail with occasional balance projections |

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| joi | npm | ~mature (hapi ecosystem) | very high (millions/wk) | github.com/hapijs/joi | OK | Approved (optional — see Supporting table) |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none
All other capabilities reuse packages already pinned in `apps/dgfy-api`. `joi` is the only candidate net-new dependency and it is a long-established, high-reputation package. No `postinstall` risk.

## Architecture Patterns

### System Architecture Diagram

```
POS / Storefront client (Phase 9/10 — NOT this phase)
        │  (Phase 9 wires these call sites; Phase 8 only builds the ports/state)
        ▼
apps/dgfy-api (Express)  —  routes → controllers → usecases → repositories → models
        │
        ├─ modules/products      ──writes──▶ products, product_folders          (Tenant DB)
        ├─ modules/inventory     ──writes──▶ inventory_movements  [SOLE WRITER]  (append-only)
        │        ▲  recordRestock/recordLoss/recordAdjustment (manual, this phase)
        │        ╎  recordSaleEffect/recordBookingEffect (reserved stub, D-06 — unwired)
        ├─ modules/booking       ──writes──▶ bookings                            (atomic capacity guard)
        │        └─ customer_account_id ─(app-level, opaque UUID, no FK)─▶ dgfy_core.accounts
        ├─ modules/shifts        ──writes──▶ shifts, cash_drawer_events          (one-open-shift invariant)
        └─ modules/compliance    ──owns───▶ compliance_mode_state + policy packs
                 └─ assertComplianceGate({ businessId, operation, requestedDocumentContext })
                        │  (injected port — Phase 9 checkout/shift/receipt call it; built here)
                        ▼
        infra/tenantConnector.getModels(databaseName) → per-tenant Sequelize model registry
                        ▼
        apps/dgfy-migration-runner  (schema contract + idempotent migrations + verify gate)

backend/  (legacy — READ-ONLY pattern reference; ZERO writes this phase and all of v2.0)
```

### Recommended Project Structure (mirror `modules/accounts`/`modules/businesses` exactly)
```
apps/dgfy-api/src/
├── models/Tenant/
│   ├── Product.js                # NEW
│   ├── ProductFolder.js          # NEW
│   ├── InventoryMovement.js      # NEW — insert-only (updatedAt:false + hooks)
│   ├── Booking.js                # NEW
│   ├── Shift.js                  # NEW
│   ├── CashDrawerEvent.js        # NEW — insert-only
│   └── ComplianceModeState.js    # NEW
├── modules/
│   ├── products/{controllers,usecases,repositories,entities,routes.js,index.js}
│   ├── inventory/{...}           # sole writer of inventory_movements
│   ├── booking/{...}
│   ├── shifts/{...}
│   └── compliance/{policy/{policyEngine.js,policyPacks.js,constants.js}, ...}  # port legacy split
├── infra/tenantConnector.js      # extend getModels() modelDefiners map (see Pattern E)
└── shared/contracts/{applicationResult.js, domainErrors.js}   # reuse — ApplicationResult + DomainError
apps/dgfy-migration-runner/src/
├── schemaContracts/dgfyBusinessContract.js   # MUST update tables{} + rejectedTables[]
└── migrations/schema/2026NNNN-create-commerce-foundation.cjs  # NEW idempotent migration(s)
```

### Pattern A: Compliance gate as an injected use-case port — with the D-05 deviation

**What:** `modules/compliance` exposes one function `assertComplianceGate({ businessId, operation, requestedDocumentContext })`. Gated usecases take it as an injected dependency and call it as the first line of the usecase body — never in a controller, never as route middleware. `modules/shifts` (shift-open) is the only *real* caller inside Phase 8; Phase 9 wires checkout/receipt.

**The D-05 change, precisely (verified against `compliancePolicyEngine.js`):**
The legacy `compliant_active` branch (lines ~902–919) is the ONLY block to change. It currently reads:
```js
// backend/src/modules/compliance/policy/compliancePolicyEngine.js  (~line 903, DO NOT PORT AS-IS)
if (modeState === COMPLIANCE_MODE_STATE.COMPLIANT_ACTIVE) {
    if (POS_OPERATIONS.has(operation)
        && requestedDocumentContext
        && requestedDocumentContext !== DOCUMENT_CONTEXTS.FISCAL) {
        return buildDecision({ ...decision: DENY,
            reasonCode: DOCUMENT_CONTEXT_NOT_ALLOWED, ... });   // ← the wrong-for-us block
    }
    ...
}
```
`[VERIFIED: sed of compliancePolicyEngine.js lines 902-918]`. The `non_compliant_active` (lines ~804–861) and `compliant_pending` (lines ~862–901) branches are **already correct** and port unchanged — both allow non-fiscal, block/require-setup fiscal. Only delete the `DOCUMENT_CONTEXT_NOT_ALLOWED` deny branch so `compliant_active` allows both contexts. `POS_OPERATIONS = { pos.checkout, pos.terminal_operation, pos.receipt_render }` and `DOCUMENT_CONTEXTS = { fiscal, non_fiscal, training_test }` `[VERIFIED: engine lines 18-27]`.

**Anti-pattern:** Middleware gating (operation-specific meaning is lost) or scattered per-call checks. `[CITED: ARCHITECTURE.md Pattern 1]`

### Pattern B: One-open-shift-per-cashier+terminal (MySQL generated column + unique index)

**Verified reusable shape** from `backend/migrations/20260703000002-enforce-one-open-shift-per-terminal.cjs` (legacy uses `terminal_id VARCHAR`, single-key). Extend to composite cashier+terminal for Phase 8:
```sql
ALTER TABLE shifts
  ADD COLUMN active_terminal_cashier_key VARCHAR(150)
  GENERATED ALWAYS AS (
    CASE WHEN status = 'open'
      THEN CONCAT_WS('|', terminal_id, cashier_account_id)
      ELSE NULL END
  ) STORED;
CREATE UNIQUE INDEX uq_shifts_active_terminal_cashier ON shifts (active_terminal_cashier_key);
```
MySQL treats each `NULL` in a unique index as distinct → closed shifts never collide; only two concurrently-`open` rows for the same terminal+cashier collide `[VERIFIED: legacy migration + STACK.md]`. Pair with `sequelize.transaction()` + guard read in the open-shift usecase so a raw SQL constraint violation becomes a clean 409 `DomainError` instead of an unhandled error. **`terminal_id`** FKs `terminal_identities.id` (INTEGER, already migrated — see `TerminalIdentity.js`) `[VERIFIED: TerminalIdentity.js]`. **Decision needed (OQ-2):** is `cashier_account_id` the tenant-local `staff_accounts.id` (INTEGER) or the landlord `dgfy_account_id` (UUID)? The staff model is tenant-local `staff_accounts` linked to accounts via `account_staff_assignments.dgfy_account_id`.

### Pattern C: Append-only ledger (insert-only model + DB trigger)

**Model layer** (verified precedent `backend/src/models/StockMovement.js` line 85 `updatedAt: false`):
```js
// models/Tenant/InventoryMovement.js
export default (sequelize) => {
  const InventoryMovement = sequelize.define('InventoryMovement', { /* columns */ }, {
    tableName: 'inventory_movements', underscored: true,
    timestamps: true, updatedAt: false,               // matches StockMovement precedent
    hooks: {
      beforeUpdate: () => { throw new Error('inventory_movements is insert-only.'); },
      beforeBulkUpdate: () => { throw new Error('inventory_movements is insert-only.'); }
    }
  });
  return InventoryMovement;
};
```
Repository exposes ONLY `create`/`bulkCreate`/`findAll`/`findOne` — never `update`/`destroy`.

**DB layer** (hard backstop — verified `backend/migrations/20260408000003-harden-compliance-audit-immutability.cjs`):
```sql
CREATE TRIGGER trg_inventory_movements_append_only_update
BEFORE UPDATE ON inventory_movements FOR EACH ROW
BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'inventory_movements is append-only and cannot be updated'; END;

CREATE TRIGGER trg_inventory_movements_append_only_delete
BEFORE DELETE ON inventory_movements FOR EACH ROW
BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'inventory_movements is append-only and cannot be deleted'; END;
```
Write triggers as raw SQL via `queryInterface.sequelize.query(...)` inside the Umzug migration `[VERIFIED: legacy trigger migration]`. Apply the identical pattern to `cash_drawer_events` (SFT-03).

**Column shape** — port from `StockMovement.js` + `tenant_audit_logs` (verified): `BIGINT UNSIGNED` autoincrement PK, opaque tenant scope, `product_id` FK, `movement_type` ENUM (`restock`,`loss`,`adjustment` now; reserve `sale`,`booking` per D-06), `quantity DECIMAL(24,12)` (legacy uses this precision), `reference_type`/`reference_id`, actor ref, optional `before_snapshot`/`after_snapshot` JSON, `created_at` only (no `updated_at`, no `paranoid`).

### Pattern D: Atomic guarded UPDATE (never read-then-write) — stock AND booking capacity

For booking-capacity (D-08) and any counter decrement, use a single guarded statement and check `affectedRows === 1`:
```sql
UPDATE booking_capacity SET slots_remaining = slots_remaining - 1
  WHERE product_id = :id AND branch_id = :branch AND slot = :slot AND slots_remaining >= 1;
-- affectedRows === 0  → capacity full → reject booking (BOK-02) before any write
```
Cancel (D-08) releases with the mirror `slots_remaining + 1` inside the same transaction as the booking-status write. `[CITED: PITFALLS.md Pitfall 3]`. Do NOT `findOne` → `if(qty>=n)` → `update()` (check-then-act race). Where a read-decide-write is unavoidable, wrap in `SELECT ... FOR UPDATE` inside a transaction.

### Pattern E: Module DI + wiring (verified from `modules/businesses/index.js` + `routes/index.js`)

Each module ships a `buildXModule({ models, tenantConnector, ... })` factory in `index.js` that constructs repositories and closes usecases over them, returning `{ repository, useCases }`. Usecases return `ApplicationResult` and throw `DomainError` (never HTTP concerns). Routes are a `createXRoutes(useCases, { authenticateAccount })` factory with `.catch(next)` on each async handler and injected middleware `[VERIFIED: accounts/routes.js, businesses/index.js, locationUseCases.js]`. Wire in `apps/dgfy-api/src/routes/index.js` (`router.use('/products', ...)` etc.) and mount under `/v1` in `app.js` `[VERIFIED: routes/index.js lines 40-62, app.js line 16]`.

Register every new Tenant model in `TenantConnector.getModels()`'s `modelDefiners` map (currently `Location`, `StaffAccount`, `StaffInvitation`, `AccountStaffAssignment`, `TerminalIdentity`) so tenant-scoped repositories can resolve them `[VERIFIED: tenantConnector.js lines 120-127]`.

### Migration mechanics (verified from `20260710021000-create-dgfy-business-foundation.cjs`)

New tenant tables go in `apps/dgfy-migration-runner/src/migrations/schema/` with `meta.targetKind: 'business'` (structurally excludes the migration from `dgfy_core` runs). Use the file's own idempotent helpers — `tableExists()`, `hasIndex()`, `addIndexIfMissing()`, `timestampColumns()` — so re-runs are no-ops `[VERIFIED: migration lines 37-71]`. Cross-database references (`business_id`, `customer_account_id`, `dgfy_account_id`) are **opaque UUID columns, never real FKs** — MySQL can't FK across databases; same-DB FKs only `[VERIFIED: dgfyBusinessContract.js header + account_staff_assignments precedent]`.

### Anti-Patterns to Avoid
- **Writing anything under `backend/`** — read-only reference only, all v2.0 phases (hard constraint).
- **FK or Sequelize model reference from new tables into legacy `items`/`PosTransactionLine`/`stock_movements`** — recreates the IMS coupling this refactor removes (PITFALLS 7). New table for the ledger is `inventory_movements`, NOT `stock_movements`.
- **Naming the ledger `stock_movements`** — that name is in the `rejectedTables` gate (legacy IMS name). Use `inventory_movements`.
- **Compliance gate in middleware or duplicated per call site** (Pattern A).
- **`stock_effect_type` on Product** — belongs on `AvailmentItem`, Phase 9 (D-07).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| One-open-shift invariant | App-level "check then insert" | MySQL generated-column + unique index (Pattern B) | Race-proof at DB layer; app check alone is bypassable |
| Ledger immutability | App-only "don't call update" | `updatedAt:false` + hooks + DB `BEFORE UPDATE/DELETE` trigger (Pattern C) | Trigger is the hard backstop if the convention is ever violated |
| Booking capacity / stock decrement | `findOne` then `update` | Atomic guarded `UPDATE ... WHERE counter >= n` (Pattern D) | Check-then-act oversells under concurrency |
| Fiscal/compliance rules | New rules-engine library | Port legacy pure-function engine + versioned `policyPacks.js` | Rules are code-owned, git-versioned, ~1000 LOC proven |
| Tenant DB connection/model resolution | Per-module connector | `TenantConnector.getModels()` (Pattern E) | Centralizes membership/registry checks; avoids drift |
| Cross-DB customer reference | 2PC / DB link / cross-DB FK | Opaque UUID column + app-level resolution | MySQL can't FK across DBs; matches `account_staff_assignments` precedent |
| Result/error plumbing | New result type | `shared/contracts/{applicationResult,domainErrors}` | Already the convention across every module |

**Key insight:** This phase's genuinely hard problems (immutability, uniqueness, concurrency, fiscal rules) all have shipped, tested precedents in `backend/` and `apps/dgfy-migration-runner`. The work is *porting shapes into new tenant tables*, not inventing.

## Common Pitfalls

### Pitfall 1: The schema-contract `rejectedTables` gate silently blocks the new schema — **CRITICAL, previously unflagged**
**What goes wrong:** `apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js` has a `rejectedTables` array containing `'products'`, `'shifts'`, `'stock_movements'`, `'fiscal_receipts'`, `'fiscal_compliance_logs'`, `'discounts'`, `'promotions'`, `'checkout_sessions'`, etc. `[VERIFIED: dgfyBusinessContract.js lines 224-250]`. The runner's `verify` command computes `ok: tables.every(ok) && rejectedTablesPresent.length === 0` `[VERIFIED: verify.js line 133]` — so creating a `products` or `shifts` table makes tenant-schema verification **fail**.
**Why it happens:** The contract was authored in Phase 2 to keep operational tables OUT of the *foundation* migration (D-15/ADR 0029 scoping). Phase 8 is exactly when those tables become legitimate. A planner reusing the "new tenant table" pattern won't see the gate until verify fails.
**How to avoid:** Phase 8 must (a) add each new table (`products`, `product_folders`, `inventory_movements`, `bookings`, `shifts`, `cash_drawer_events`, `compliance_mode_state`) to the contract's `tables{}` object with its columns/indexes/FKs, and (b) remove the now-legitimate names (`products`, `shifts`; note `stock_movements` stays rejected — use `inventory_movements` which is NOT in the list) from `rejectedTables`. This is a required task in the plan, not optional cleanup.
**Warning signs:** `verify` reports `rejected_tables_present: ['products', 'shifts']`.

### Pitfall 2: Porting the legacy `compliant_active` fiscal-forcing block (D-05 violation)
**What goes wrong:** A faithful port of `compliancePolicyEngine.js` carries the `DOCUMENT_CONTEXT_NOT_ALLOWED` deny branch, forcing every activated business into Fiscal-only and breaking the Omni-default model.
**How to avoid:** Delete only that branch (Pattern A). Add a test asserting `compliant_active` + `requestedDocumentContext: 'non_fiscal'` → ALLOW.
**Warning signs:** A test or code path where `compliant_active` denies non-fiscal.

### Pitfall 3: Stock/booking-capacity double-decrement under concurrency
**What goes wrong:** `findOne`→check→`update` oversells the last unit/slot when two requests race. Passes every single-threaded manual test.
**How to avoid:** Pattern D atomic guard; add a concurrency test firing N simultaneous booking requests against one fixed-capacity slot asserting no oversell. `[CITED: PITFALLS.md Pitfall 3]`

### Pitfall 4: Shift that silently spans days / no-open-shift orphan
**What goes wrong:** A shift opened and never closed spans midnight, corrupting reconciliation; or (Phase 9) a sale completes with no open shift.
**How to avoid:** Stale-shift **flag only, never auto-close** (D-11) via an operator-configurable threshold; enforce open-shift as a server-side precondition in the usecase (Phase 9 checkout). Log every drawer event incl. no-sale pop (SFT-03). `[CITED: PITFALLS.md Pitfall 4]`

### Pitfall 5: Reusing legacy IMS `items`/`stock_movements`/`PosTransactionLine`
**What goes wrong:** Reading `cost_per_unit`/category "just once" from legacy tables reintroduces the shared-schema coupling.
**How to avoid:** Build `products` fresh; copy the *field list*, not the table. No new repository imports a `backend/src/models` model. `[CITED: PITFALLS.md Pitfall 7]`

## Code Examples

### One-open-shift generated column (verified legacy pattern, cashier+terminal extension)
```sql
-- Source: backend/migrations/20260703000002-enforce-one-open-shift-per-terminal.cjs (extended)
ALTER TABLE shifts ADD COLUMN active_terminal_cashier_key VARCHAR(150)
  GENERATED ALWAYS AS (CASE WHEN status='open' THEN CONCAT_WS('|', terminal_id, cashier_account_id) ELSE NULL END) STORED;
CREATE UNIQUE INDEX uq_shifts_active_terminal_cashier ON shifts (active_terminal_cashier_key);
```

### Insert-only ledger model (verified precedent StockMovement.js)
```js
// Source: backend/src/models/StockMovement.js (updatedAt:false) + ARCHITECTURE.md Pattern 2
sequelize.define('InventoryMovement', { /* cols */ }, {
  tableName: 'inventory_movements', underscored: true, timestamps: true, updatedAt: false,
  hooks: { beforeUpdate() { throw new Error('insert-only'); },
           beforeBulkUpdate() { throw new Error('insert-only'); } }
});
```

### Idempotent migration skeleton (verified foundation migration)
```js
// Source: apps/dgfy-migration-runner/src/migrations/schema/20260710021000-create-dgfy-business-foundation.cjs
module.exports = {
  meta: { destructive: false, targetKind: 'business', estimatedRisk: 'low', rollbackDescription: '...' },
  async up(queryInterface, Sequelize) {
    const tableExists = async (t) => (await queryInterface.showAllTables()).some(/* normalize + compare */);
    const addIndexIfMissing = async (t, cols, opts) => { if (opts.name && await hasIndex(t, opts.name)) return; await queryInterface.addIndex(t, cols, opts); };
    if (!await tableExists('products')) { await queryInterface.createTable('products', { /* ... */ }); }
    // triggers via queryInterface.sequelize.query(`CREATE TRIGGER ...`)
  },
  async down(queryInterface) { /* dropTable in reverse dependency order */ }
};
```

### Reconciliation formula shape (D-10 — anticipate Phase 9 inputs)
```
expected_cash = opening_float_amount
              + sales_cash_total        // 0 this phase; wired Phase 9
              - refunds_cash_total      // 0 this phase; wired Phase 9
              + pay_ins - pay_outs      // 0 this phase; wired Phase 9
cash_variance_amount = closing_cash_amount (actual) - expected_cash   // signed Difference (SFT-02)
```
Port `PosTerminalShift`'s `DECIMAL(14,4)` money columns (`opening_float_amount`, `expected_cash_amount`, `closing_cash_amount`, `cash_variance_amount`) `[VERIFIED: PosTerminalShift.js]`.

## State of the Art

| Old Approach (legacy `backend/`) | New Approach (Phase 8 `apps/dgfy-api`) | Impact |
|--------------|------------------|--------|
| Single shared IMS DB, global-unique table names (`ItemFolder.name unique`) | Per-tenant `dgfy_business_*` DB via `TenantConnector` | Names unique per-tenant, not globally |
| `compliant_active` forces Fiscal-only | `compliant_active` allows both fiscal + non-fiscal (D-05) | Omni-default, Fiscal-on-request model |
| `StockMovement` in shared IMS schema | `inventory_movements` new tenant table, sole-writer module | Removes IMS coupling (ADR 0029) |
| Shift uniqueness via non-unique indexes only | DB-enforced generated-column unique index | Race-proof one-open-shift |

**Deprecated/outdated for this phase:**
- Legacy `PosTerminalShift` uses `terminal_id VARCHAR(100)` + `cashier_id INTEGER`. New `shifts` should FK `terminal_identities.id` (INTEGER) — the identity table already exists.
- `stock_movements` table name is legacy/rejected — use `inventory_movements`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `joi@^18.2.3` is the right validator; adoption is optional | Standard Stack | Low — existing inline-`DomainError` validation works; joi is a convenience |
| A2 | New ledger table named `inventory_movements` (not in rejectedTables) | Pitfall 1 | Low — verified name absent from reject list; planner may choose another non-rejected name |
| A3 | `cashier_account_id` in the shift uniqueness key resolves to tenant `staff_accounts.id` | Pattern B / OQ-2 | Medium — wrong choice changes the generated-column definition and FK |
| A4 | Booking `availment_id` is a reserved nullable column (Availment table is Phase 9) | BOK-03 | Low — Availment doesn't exist yet; column reserved, no FK this phase |
| A5 | Product folders port `ItemFolder` incl. its `parent_id` self-nesting OR flatten it | PRD-03 / OQ-1 | Low — CONTEXT says flat; legacy model actually has parent_id |

## Open Questions (RESOLVED)

> All three questions were resolved during planning (2026-07-12): OQ-1 → **D-14** (flat folders, no `parent_id`); OQ-2 → **D-13** (`cashier_account_id` = tenant-local `staff_accounts.id` INTEGER); OQ-3 → keep inline `DomainError` validation, `joi` declined (zero net-new packages). D-13/D-14 are recorded in 08-CONTEXT.md and encoded in the plans (08-01/08-03/08-05).

1. **OQ-1 — Product folder nesting. [RESOLVED → D-14: flat, no `parent_id`]** CONTEXT D-discretion describes `ItemFolder.js` as "flat, business-scoped, no nesting," but the actual model **has a `parent_id` self-referencing FK** `[VERIFIED: ItemFolder.js lines 29-36]` — so legacy DOES support nesting.
   - What we know: The model supports one level of self-nesting; `name` is globally unique in legacy (would become per-tenant unique).
   - What's unclear: Whether Phase 8 wants flat (CONTEXT's stated intent) or ports the nesting the model actually has.
   - Recommendation: Default to **flat** per CONTEXT's explicit intent (drop `parent_id`); nesting is easy to add later. Flag this discrepancy to the user during discuss/plan.

2. **OQ-2 — Cashier identity in the shift key. [RESOLVED → D-13: tenant-local `staff_accounts.id` INTEGER]** Is `cashier_account_id` the tenant-local `staff_accounts.id` (INTEGER) or the landlord `dgfy_account_id` (UUID)?
   - What we know: Staff are tenant-local `staff_accounts`, linked to landlord accounts via `account_staff_assignments.dgfy_account_id` (opaque UUID) `[VERIFIED: foundation migration]`.
   - Recommendation: Use tenant-local `staff_accounts.id` (INTEGER) for a same-DB FK; store the opaque `dgfy_account_id` alongside for audit. Confirm at plan time.

3. **OQ-3 — joi adoption vs existing inline validation. [RESOLVED → keep inline `DomainError` validation; `joi` declined]** Existing modules validate inline via `DomainError` without joi. Adopting joi adds a dependency + a second validation idiom.
   - Recommendation: Planner's call; if minimizing dependencies, keep the inline convention (zero net-new packages).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| MySQL | Generated columns + triggers | ✓ (project standard) | 8.0 | none — required |
| Node.js | Runtime | ✓ | 22-alpine | — |
| Sequelize | Models/migrations | ✓ | ^6.37.8 | — |
| `apps/dgfy-migration-runner` | Tenant schema create + verify | ✓ | in-repo | — |
| `joi` | Payload validation (optional) | ✗ (not installed) | — | Existing inline `DomainError` validation |

**Missing dependencies with no fallback:** none.
**Missing with fallback:** `joi` (fallback: existing inline validation convention).

## Security Domain

Financial-integrity and fiscal-compliance surface — security is first-class here.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V4 Access Control | yes | Owner/staff role checks via `businessRepository.getMembership` (Pattern from `locationUseCases`); consumer-owns-booking check (D-09) |
| V5 Input Validation | yes | joi or inline `DomainError` validation on all commerce DTOs; never accept client-computed money |
| V7 Error/Logging | yes | Append-only `inventory_movements`/`cash_drawer_events`/audit as tamper-evident trail (DB triggers) |
| V6 Cryptography | no (this phase) | PayMongo HMAC is Phase 9 |
| V2/V3 AuthN/Session | reused | Existing `authenticateAccount` middleware injected into routes |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Ledger row tampering after insert | Tampering / Repudiation | `updatedAt:false` + hooks + DB `BEFORE UPDATE/DELETE` trigger (Pattern C) |
| Overselling stock/slots via race | Tampering | Atomic guarded UPDATE (Pattern D) |
| Ungated fiscal-mode operation | Elevation / Repudiation | Shared compliance gate port (Pattern A); Phase 9 wires call sites |
| Unlogged cash-drawer (no-sale) pop | Repudiation (internal theft) | Log every drawer event incl. no-sale (SFT-03) |
| Two open shifts on one terminal | Tampering (reconciliation) | DB generated-column unique index (Pattern B) |
| Cross-tenant data access | Info Disclosure | `TenantConnector` per-tenant DB isolation; membership checks in usecases |

## Project Constraints (from CLAUDE.md)

`./CLAUDE.md` is a pointer to `docs/ai/CLAUDE.md`, whose loaded content describes the **legacy IMS** (SKU Inventory Manager) app, not `apps/dgfy-api`. The genuinely portable directives:
- **Use Sequelize transactions for multi-table updates** (e.g., booking + capacity, shift close + reconciliation, ledger insert + balance cache) — matches Pattern C/D.
- **Never hard-`DELETE`; prefer soft-delete/status** — matches append-only ledger and `is_active` conventions.
- **Central error handler; throw errors with status** — matches `DomainError` + `errorHandler` already in `app.js`.
- **Validate before persistence; never trust client-supplied flags** — matches D-05 (backend gates eligibility, not client) and Pitfall 3/money-integrity.

CLAUDE.md's frontend/AI/PM2 sections do not apply to this backend phase.

## Sources

### Primary (HIGH confidence — live codebase, verified this session)
- `apps/dgfy-api/src/modules/{accounts,businesses}/*` — module shape, DI factory, routes, usecases (`ApplicationResult`/`DomainError`)
- `apps/dgfy-api/src/infra/tenantConnector.js` — `getModels()` `modelDefiners` registry to extend
- `apps/dgfy-api/src/models/Tenant/TerminalIdentity.js`, `models/Landlord/Account.js` — model factory conventions, FK targets
- `apps/dgfy-migration-runner/src/migrations/schema/20260710021000-create-dgfy-business-foundation.cjs` — idempotent migration helpers, `meta.targetKind`
- `apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js` + `src/commands/verify.js` — **`rejectedTables` gate (Pitfall 1)**
- `backend/src/modules/compliance/policy/{compliancePolicyEngine.js (lines 800-960),complianceConstants.js,policyPacks.js}` — D-02/D-03/D-05 exact port + deviation
- `backend/migrations/20260703000002-enforce-one-open-shift-per-terminal.cjs` — generated-column unique-index (D-12)
- `backend/migrations/20260408000003-harden-compliance-audit-immutability.cjs` — append-only trigger (D-06/PRD-04)
- `backend/src/models/{StockMovement.js,ItemFolder.js,PosTerminalShift.js}` — ledger/folder/shift field shapes
- `.planning/REQUIREMENTS.md`, `.planning/config.json` — phase requirements, `nyquist_validation:false`

### Secondary (HIGH — milestone research, consolidated)
- `.planning/research/{ARCHITECTURE.md,PITFALLS.md,STACK.md}` — patterns, pitfalls, stack rationale (grounded in same codebase)

### Tertiary (MEDIUM)
- npm registry `npm view joi` — 18.2.3 confirmed (registry existence only; adoption discovered via STACK.md)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero-to-one net-new package, all core verified against package.json
- Architecture/patterns: HIGH — every pattern has a verified in-repo precedent (file + line)
- Pitfalls: HIGH — Pitfall 1 (rejectedTables) verified against verify.js enforcement logic
- D-05 deviation: HIGH — exact legacy lines read and confirmed

**Research date:** 2026-07-12
**Valid until:** 2026-08-11 (30 days — stable internal codebase; re-verify `dgfyBusinessContract.js` if the migration-runner changes)

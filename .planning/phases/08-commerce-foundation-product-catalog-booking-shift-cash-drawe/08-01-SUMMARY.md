---
phase: 08-commerce-foundation-product-catalog-booking-shift-cash-drawe
plan: 01
subsystem: database
tags: [sequelize, mysql, migration-runner, umzug, tenant-schema, append-only-ledger, generated-column]

requires:
  - phase: 02-dgfy-database-foundation
    provides: dgfy_business_* tenant schema, migration-runner idempotent-migration helpers (tableExists/hasIndex/addIndexIfMissing/timestampColumns), dgfyBusinessContract.js verify-gate pattern
provides:
  - "8 new dgfy_business_* tenant tables: product_folders, products, inventory_movements, bookings, booking_capacity, shifts, cash_drawer_events, compliance_mode_state"
  - "DB-enforced append-only ledger (inventory_movements, cash_drawer_events) via BEFORE UPDATE/DELETE SIGNAL '45000' triggers"
  - "DB-enforced one-open-shift-per-(terminal,cashier) invariant via shifts.active_terminal_cashier_key GENERATED STORED column + unique index"
  - "Updated dgfyBusinessContract.js tables{}/rejectedTables[] so the migration-runner verify gate accepts the new schema"
  - "Authoritative column/index/FK shapes for 08-02's Tenant model files to port from"
affects: [08-02, 08-03, 08-04, 08-05, 08-06, 08-07, 08-08, phase-09-checkout, phase-10-storefront]

tech-stack:
  added: []
  patterns:
    - "Idempotent Umzug migration (meta.targetKind:'business') mirroring 20260710021000-create-dgfy-business-foundation.cjs's tableExists/hasIndex/addIndexIfMissing/timestampColumns helper shape"
    - "Append-only ledger: no updated_at column + DROP TRIGGER IF EXISTS / CREATE TRIGGER BEFORE UPDATE|DELETE ... SIGNAL SQLSTATE '45000' pair per table"
    - "One-open-shift invariant: MySQL GENERATED ALWAYS AS (...) STORED column + UNIQUE INDEX (NULL-per-row-distinct semantics let closed shifts never collide)"
    - "Cross-database references (business_id, customer_account_id, cashier_dgfy_account_id, actor_account_id) as opaque CHAR(36) columns with NO foreignKey — same-DB FKs only"

key-files:
  created:
    - apps/dgfy-migration-runner/src/migrations/schema/20260712100000-create-commerce-foundation.cjs
  modified:
    - apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js
    - apps/dgfy-migration-runner/tests/dgfyBusinessSchema.test.js

key-decisions:
  - "All 8 new tables use INTEGER autoincrement PKs (not BIGINT) to match the existing tenant-table convention (locations.id, staff_accounts.id, terminal_identities.id are all INTEGER), even though the legacy StockMovement precedent used INTEGER too — no deviation needed there, but this is an explicit, deliberate consistency choice across all 8 new tables including the append-only ledgers."
  - "actor_staff_account_id (inventory_movements) and actor_staff_account_id (cash_drawer_events) were given same-DB FK references to staff_accounts.id with onDelete SET NULL, matching the tenant_audit_logs.staff_account_id precedent — the plan text specified the column type but not explicitly the FK; added for referential integrity consistency with the rest of the schema."

patterns-established:
  - "Append-only table shape: only created_at (no updated_at), paired BEFORE UPDATE/DELETE SIGNAL '45000' triggers — the two-layer defense (model-layer hooks land in 08-02, DB-layer trigger lands here) documented in 08-RESEARCH.md Pattern C."
  - "One-open-shift generated-column pattern extended from legacy's single-key (terminal_id only) to a composite (terminal_id, cashier_account_id) key via CONCAT_WS."

requirements-completed: [PRD-04, PRD-05, SFT-01, SFT-03]

coverage:
  - id: D1
    description: "create-commerce-foundation migration creates all 8 tenant tables idempotently (meta.targetKind:'business')"
    requirement: "PRD-05"
    verification:
      - kind: unit
        ref: "node -e module-load check (meta.targetKind==='business', up/down are functions) — plan's automated verify"
        status: pass
      - kind: unit
        ref: "manual mock-queryInterface simulation: first up() creates 8 tables + 13 indexes + 9 trigger/ALTER queries; second up() against pre-existing state issues zero createTable/addIndex/ALTER calls (idempotent no-op)"
        status: pass
    human_judgment: false
  - id: D2
    description: "inventory_movements and cash_drawer_events are DB-enforced append-only (BEFORE UPDATE/DELETE SIGNAL '45000' triggers, no updated_at column)"
    requirement: "PRD-04, SFT-03"
    verification:
      - kind: unit
        ref: "grep check: SQLSTATE '45000' and GENERATED ALWAYS AS present in migration file — plan's automated verify"
        status: pass
    human_judgment: true
    rationale: "Trigger-rejection behavior (actual UPDATE/DELETE against a real MySQL row returning SQLSTATE 45000) can only be exercised against a live MySQL instance, not a mocked queryInterface. No real MySQL was available in this execution environment — this must-have truth ('An UPDATE or DELETE against any inventory_movements or cash_drawer_events row is rejected at the database layer with SQLSTATE 45000') is deferred to human UAT against real MySQL, consistent with this project's established pattern (see STATE.md Phase 2/4 real-MySQL UAT precedent)."
  - id: D3
    description: "shifts DB-enforces one open shift per (terminal_id, cashier_account_id) via GENERATED STORED column + unique index"
    requirement: "SFT-01"
    verification:
      - kind: unit
        ref: "grep check: GENERATED ALWAYS AS present; mock-queryInterface simulation confirms uq_shifts_active_terminal_cashier unique index is requested with unique:true"
        status: pass
    human_judgment: true
    rationale: "A second concurrent open-shift INSERT actually colliding on the unique index can only be proven against real MySQL (generated columns + unique-index enforcement is a MySQL 8.0 runtime behavior, not something a mocked queryInterface can simulate). Deferred to human UAT against real MySQL."
  - id: D4
    description: "dgfyBusinessContract.js recognizes all 8 new tables and the migration-runner verify gate would pass for a tenant carrying them"
    requirement: "PRD-05"
    verification:
      - kind: unit
        ref: "node -e contract-load check (plan's automated verify) — all 8 table entries present, products/shifts removed from rejectedTables, stock_movements still rejected"
        status: pass
      - kind: unit
        ref: "apps/dgfy-migration-runner full jest suite (npm test) — 308/308 passing"
        status: pass
      - kind: unit
        ref: "apps/dgfy-migration-runner architecture check (npm run test:architecture) — 4/4 passing"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-07-12
status: complete
---

# Phase 8 Plan 1: Commerce Foundation Migration Summary

**Idempotent business-target migration creating 8 new `dgfy_business_*` tenant tables (products, inventory ledger, booking, shift/cash-drawer, compliance state) with DB-enforced append-only triggers and a one-open-shift generated-column unique index, plus the schema-contract update that lets the migration-runner's `verify` command accept them.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-07-12
- **Tasks:** 2/2 completed
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments

- Created `20260712100000-create-commerce-foundation.cjs`, an idempotent Umzug migration (`meta.targetKind: 'business'`) that creates all 8 Commerce Domain tenant tables in one pass, verified by direct module-load, grep, and mock-`queryInterface` simulation (both first-run table/index/trigger creation and second-run idempotent no-op).
- Encoded both DB-level integrity guarantees required by this phase's threat model: append-only `BEFORE UPDATE`/`BEFORE DELETE SIGNAL SQLSTATE '45000'` trigger pairs on `inventory_movements` and `cash_drawer_events`, and a `GENERATED ALWAYS AS (...) STORED` column (`active_terminal_cashier_key`) + `UNIQUE INDEX` (`uq_shifts_active_terminal_cashier`) on `shifts` enforcing one open shift per `(terminal_id, cashier_account_id)`.
- Updated `dgfyBusinessContract.js`: added 8 new `tables{}` entries mirroring the migration's exact columns/indexes/foreign keys, and removed `products`/`shifts` from `rejectedTables` (kept `stock_movements` rejected — the ledger is `inventory_movements`).
- Ran the full migration-runner test suite (308 tests) plus the architecture guardrail (4 tests) — all passing after fixing one pre-existing test that hard-coded `products` as permanently out-of-scope (see Deviations).

## Task Commits

1. **Task 1: Create the commerce-foundation business migration (8 tables + integrity guarantees)** - `5e50af37` (feat)
2. **Task 2: Update the tenant schema contract so verify accepts the new tables** - `0e879b9c` (feat, includes Rule 1 test fix)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/dgfy-migration-runner/src/migrations/schema/20260712100000-create-commerce-foundation.cjs` - New idempotent business-target migration creating all 8 tables + triggers + generated column/index
- `apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js` - 8 new `tables{}` entries; `products`/`shifts` removed from `rejectedTables`
- `apps/dgfy-migration-runner/tests/dgfyBusinessSchema.test.js` - `OUT_OF_SCOPE_TABLE_NAMES` updated to drop the now-stale `'products'` out-of-scope assertion

## Decisions Made

- **INTEGER (not BIGINT) autoincrement PKs on all 8 tables**, including the append-only ledgers, per the plan's explicit instruction to match the existing tenant-table convention (`locations.id`, `staff_accounts.id`, `terminal_identities.id` are all `INTEGER`) rather than porting `StockMovement.js`'s table-level PK type verbatim — only the ledger's *field list* (column names/precision) was ported, not its exact PK type (which happened to also be INTEGER, so no actual divergence).
- **`actor_staff_account_id` FKs added** on `inventory_movements` and `cash_drawer_events` pointing at `staff_accounts.id` with `onDelete: 'SET NULL'` — the plan specified the column's type/nullability but not explicitly a FK; added to match the established `tenant_audit_logs.staff_account_id` referential-integrity precedent in the same codebase.
- **Reserved-unwired ENUM values retained exactly as specified**: `inventory_movements.movement_type` includes `sale`/`booking` (D-06, unwired until Phase 9); `cash_drawer_events.event_type` includes `pay_in`/`pay_out` (D-10, unwired until Phase 9).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Stale test] Fixed `dgfyBusinessSchema.test.js` hard-coding `products` as permanently out-of-scope**
- **Found during:** Task 2 (`npm test` verification step)
- **Issue:** `tests/dgfyBusinessSchema.test.js`'s `OUT_OF_SCOPE_TABLE_NAMES` array included `'products'` and asserted both that `dgfyBusinessContract.tables` must NOT have a `products` property and that `rejectedTables` must contain it — both assertions are now false by design, since this plan's whole purpose (per 08-RESEARCH.md Pitfall 1) is to legitimize `products` and `shifts`.
- **Fix:** Removed `'products'` from the test's `OUT_OF_SCOPE_TABLE_NAMES` array with a comment explaining the Phase 8 supersession; `'shifts'` was never in that array so needed no change. `stock_movements` and all other legacy names remain asserted out-of-scope.
- **Files modified:** `apps/dgfy-migration-runner/tests/dgfyBusinessSchema.test.js`
- **Verification:** Full suite re-run — 308/308 passing (was 307/308 before the fix), plus 4/4 architecture-check tests.
- **Committed in:** `0e879b9c` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 stale test, Rule 1)
**Impact on plan:** The fix updates a test assertion to match this plan's explicit, documented intent (removing `products`/`shifts` from `rejectedTables` per the plan's own acceptance criteria) — no scope creep, no behavior change beyond what the plan already specified.

## Issues Encountered

None beyond the stale-test deviation above.

## Authoritative Column Reference (for 08-02's Tenant models to port from)

The following is the single source of truth for column shapes — 08-02's Sequelize model files must match this exactly (column names, types, nullability, FKs).

### `product_folders`
| Column | Type | Null | Notes |
|---|---|---|---|
| id | INTEGER | NOT NULL | PK, autoincrement |
| business_id | CHAR(36) | NOT NULL | opaque UUID, no FK |
| name | VARCHAR(100) | NOT NULL | |
| description | TEXT | NULL | |
| show_in_pos_filter | BOOLEAN | NOT NULL | default true |
| is_active | BOOLEAN | NOT NULL | default true |
| created_at, updated_at | DATETIME | NOT NULL | |

Unique index: `unique_product_folders_business_name` on `(business_id, name)`. No `parent_id` (D-14, flat).

### `products`
| Column | Type | Null | Notes |
|---|---|---|---|
| id | INTEGER | NOT NULL | PK, autoincrement |
| business_id | CHAR(36) | NOT NULL | opaque UUID, no FK |
| folder_id | INTEGER | NULL | FK `product_folders.id`, SET NULL |
| name | VARCHAR(255) | NOT NULL | |
| category | ENUM('food','service','retail') | NOT NULL | |
| inventory_mode | ENUM('basic_inventory','non_stock') | NOT NULL | default 'non_stock' |
| stock_count | DECIMAL(24,12) | NULL | |
| base_price | DECIMAL(14,4) | NULL | |
| is_bookable | BOOLEAN | NOT NULL | default false |
| slot_duration_minutes | INTEGER | NULL | |
| concurrent_capacity | INTEGER | NULL | |
| is_active | BOOLEAN | NOT NULL | default true |
| created_at, updated_at | DATETIME | NOT NULL | |

Indexes: `idx_products_business` (business_id), `idx_products_folder` (folder_id), `idx_products_category` (category). No `stock_effect_type` (D-07).

### `inventory_movements` (append-only — sole writer `modules/inventory`, ADR 0029)
| Column | Type | Null | Notes |
|---|---|---|---|
| id | INTEGER | NOT NULL | PK, autoincrement |
| business_id | CHAR(36) | NOT NULL | opaque UUID, no FK |
| product_id | INTEGER | NOT NULL | FK `products.id`, CASCADE |
| movement_type | ENUM('restock','loss','adjustment','sale','booking') | NOT NULL | sale/booking reserved-unwired (D-06) |
| quantity | DECIMAL(24,12) | NOT NULL | |
| reference_type | VARCHAR(64) | NULL | |
| reference_id | VARCHAR(64) | NULL | |
| actor_account_id | CHAR(36) | NULL | opaque UUID, no FK |
| actor_staff_account_id | INTEGER | NULL | FK `staff_accounts.id`, SET NULL |
| before_snapshot | JSON | NULL | |
| after_snapshot | JSON | NULL | |
| created_at | DATETIME | NOT NULL | **no `updated_at`** |

Indexes: `idx_inventory_movements_business_product` (business_id, product_id), `idx_inventory_movements_movement_type` (movement_type). Triggers: `trg_inventory_movements_append_only_update`/`_delete` (SIGNAL '45000').

### `bookings`
| Column | Type | Null | Notes |
|---|---|---|---|
| id | INTEGER | NOT NULL | PK, autoincrement |
| business_id | CHAR(36) | NOT NULL | opaque UUID, no FK |
| product_id | INTEGER | NOT NULL | FK `products.id`, CASCADE |
| branch_id | INTEGER | NOT NULL | FK `locations.id`, CASCADE |
| customer_account_id | CHAR(36) | NULL | opaque UUID, no FK (D-09) |
| slot_start | DATETIME | NOT NULL | |
| slot_end | DATETIME | NULL | |
| status | ENUM('booked','cancelled','fulfilled') | NOT NULL | default 'booked' |
| availment_id | INTEGER | NULL | reserved, no FK (BOK-03, Phase 9) |
| cancelled_at | DATETIME | NULL | |
| created_at, updated_at | DATETIME | NOT NULL | |

Indexes: `idx_bookings_business_product_branch_slot` (business_id, product_id, branch_id, slot_start), `idx_bookings_customer_account` (customer_account_id).

### `booking_capacity`
| Column | Type | Null | Notes |
|---|---|---|---|
| id | INTEGER | NOT NULL | PK, autoincrement |
| business_id | CHAR(36) | NOT NULL | opaque UUID, no FK |
| product_id | INTEGER | NOT NULL | FK `products.id`, CASCADE |
| branch_id | INTEGER | NOT NULL | FK `locations.id`, CASCADE |
| slot_start | DATETIME | NOT NULL | |
| slots_remaining | INTEGER | NOT NULL | atomic guarded UPDATE target (Pattern D) |
| created_at, updated_at | DATETIME | NOT NULL | |

Unique index: `unique_booking_capacity_product_branch_slot` on `(product_id, branch_id, slot_start)`.

### `shifts`
| Column | Type | Null | Notes |
|---|---|---|---|
| id | INTEGER | NOT NULL | PK, autoincrement |
| business_id | CHAR(36) | NOT NULL | opaque UUID, no FK |
| terminal_id | INTEGER | NOT NULL | FK `terminal_identities.id`, CASCADE |
| cashier_account_id | INTEGER | NOT NULL | FK `staff_accounts.id`, CASCADE (D-13: tenant-local, not landlord UUID) |
| cashier_dgfy_account_id | CHAR(36) | NULL | opaque UUID, audit only, no FK |
| status | ENUM('open','closed') | NOT NULL | default 'open' |
| opening_float_amount | DECIMAL(14,4) | NOT NULL | |
| expected_cash_amount | DECIMAL(14,4) | NULL | |
| closing_cash_amount | DECIMAL(14,4) | NULL | |
| cash_variance_amount | DECIMAL(14,4) | NULL | |
| opened_at | DATETIME | NOT NULL | |
| closed_at | DATETIME | NULL | |
| active_terminal_cashier_key | VARCHAR(150) | NULL | **GENERATED ALWAYS AS STORED** — `CASE WHEN status='open' THEN CONCAT_WS('|', terminal_id, cashier_account_id) ELSE NULL END` |
| created_at, updated_at | DATETIME | NOT NULL | |

Unique index: `uq_shifts_active_terminal_cashier` on `active_terminal_cashier_key` (D-12 one-open-shift invariant).

### `cash_drawer_events` (append-only — sole writer `modules/shifts`)
| Column | Type | Null | Notes |
|---|---|---|---|
| id | INTEGER | NOT NULL | PK, autoincrement |
| business_id | CHAR(36) | NOT NULL | opaque UUID, no FK |
| shift_id | INTEGER | NOT NULL | FK `shifts.id`, CASCADE |
| event_type | ENUM('open','close','no_sale_pop','pay_in','pay_out') | NOT NULL | pay_in/pay_out reserved-unwired (D-10) |
| amount | DECIMAL(14,4) | NULL | |
| reason | VARCHAR(255) | NULL | |
| actor_staff_account_id | INTEGER | NULL | FK `staff_accounts.id`, SET NULL |
| created_at | DATETIME | NOT NULL | **no `updated_at`** |

Indexes: `idx_cash_drawer_events_shift` (shift_id), `idx_cash_drawer_events_event_type` (event_type). Triggers: `trg_cash_drawer_events_append_only_update`/`_delete` (SIGNAL '45000').

### `compliance_mode_state`
| Column | Type | Null | Notes |
|---|---|---|---|
| id | INTEGER | NOT NULL | PK, autoincrement |
| business_id | CHAR(36) | NOT NULL | opaque UUID, no FK (D-01: tenant-scoped) |
| branch_id | INTEGER | NULL | FK `locations.id`, CASCADE |
| state | ENUM('non_compliant_active','compliant_pending','compliant_active') | NOT NULL | default 'non_compliant_active' (D-02) |
| compliance_profile | JSON | NULL | D-03 policy-pack profile shape |
| active_policy_pack_version | VARCHAR(32) | NULL | |
| verification_status | ENUM('pending_review','verified','rejected','revoked') | NULL | D-04 manual review |
| verified_by_actor_type | ENUM('tenant_master_admin','platform_admin') | NULL | D-04 |
| verified_at | DATETIME | NULL | |
| created_at, updated_at | DATETIME | NOT NULL | |

Unique index: `unique_compliance_mode_state_business_branch` on `(business_id, branch_id)`.

## User Setup Required

None - no external service configuration required. Real-MySQL verification of the two DB-enforced invariants (append-only trigger rejection, one-open-shift unique-index collision) is deferred to human UAT, per this project's established pattern for MySQL-runtime-only behaviors not exercisable against a mocked `queryInterface`.

## Next Phase Readiness

- All 8 tables' column/index/FK shapes are now locked and documented above — 08-02 (Tenant model files) can port from this table directly without re-deriving shapes from the migration source.
- The schema contract's `verify` gate will accept a tenant carrying these tables (no `rejected_tables_present` regression) — downstream plans that call `apps/dgfy-migration-runner`'s `schema`/`verify` commands against a real tenant should re-confirm `rejected_tables_present: []` and `ok: true` against real MySQL as part of end-of-phase human UAT.
- No blockers for 08-02 through 08-08.

---
*Phase: 08-commerce-foundation-product-catalog-booking-shift-cash-drawe*
*Completed: 2026-07-12*

## Self-Check: PASSED

- FOUND: `apps/dgfy-migration-runner/src/migrations/schema/20260712100000-create-commerce-foundation.cjs`
- FOUND: `apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js`
- FOUND: `.planning/phases/08-commerce-foundation-product-catalog-booking-shift-cash-drawe/08-01-SUMMARY.md`
- FOUND commit: `5e50af37` (Task 1)
- FOUND commit: `0e879b9c` (Task 2)
- FOUND commit: `a9b443cc` (SUMMARY)

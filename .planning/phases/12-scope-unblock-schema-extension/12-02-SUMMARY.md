---
phase: 12-scope-unblock-schema-extension
plan: 02
subsystem: database
tags: [sequelize, mysql, umzug, migration, schema-contract, dgfy-api]

# Dependency graph
requires:
  - phase: 08-product-catalog-booking-shift-compliance
    provides: products/inventory_movements tables, dgfyBusinessContract.js contract shape, additive-migration idempotent-helper pattern
provides:
  - Additive migration 20260716100000-extend-schema-for-legacy-migration.cjs (products 7 columns, product_embeddings table, inventory_movements natural-key index)
  - dgfyBusinessContract.js updated in lockstep so `verify` can check the new shapes
  - dgfy-api Tenant models (Product.js, InventoryMovement.js, new ProductEmbedding.js) matching the migration for read-path parity
  - Committed satellite-folding design doc for Phase 13's items->products mapper
affects: [13-product-inventory-migration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Migration + dgfyBusinessContract.js update as one atomic commit (contract entries absent from the file are never checked by verify)"
    - "Namespaced JSON attributes container (products.attributes) reserved this phase, populated by a future phase's mapper — no resolution logic lands with the schema change"

key-files:
  created:
    - apps/dgfy-migration-runner/src/migrations/schema/20260716100000-extend-schema-for-legacy-migration.cjs
    - apps/dgfy-api/src/models/Tenant/ProductEmbedding.js
    - docs/database/legacy-product-attributes-folding-design.md
  modified:
    - apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js
    - apps/dgfy-api/src/models/Tenant/Product.js
    - apps/dgfy-api/src/models/Tenant/InventoryMovement.js
    - apps/dgfy-api/src/infra/tenantConnector.js

key-decisions:
  - "One combined migration file for all three LDM-02/03/04 changes (RESEARCH A1 — Claude's discretion), matching the 20260714103000 precedent of touching multiple tables in one file"
  - "Updated the 3 dgfy-api Tenant models NOW for read-path parity (RESEARCH A3 / Open Question 2 RESOLVED) rather than deferring to Phase 13, since no feature reads these columns yet but every sibling model should match its migration"
  - "cost_per_unit is DECIMAL(14,4) matching products.base_price convention, not legacy's narrower DECIMAL(10,4) (D-06)"
  - "idx_products_sku_code is non-unique — legacy allows duplicate SKUs, this phase does not tighten that (D-05)"
  - "inventory_movements natural-key unique index needs no backfill — existing organic rows have NULL reference_type/reference_id, and MySQL treats NULL tuples as distinct under a unique index (D-10)"

patterns-established:
  - "Design-doc-before-mapper-code: LDM-02 required the satellite-folding shape committed to docs/ before any Phase 13 implementation starts"

requirements-completed: [LDM-02, LDM-03, LDM-04]

coverage:
  - id: D1
    description: "Additive migration exports { meta, up, down } with meta.targetKind='business' and meta.destructive=false; adds products 6 typed columns + attributes JSON, product_embeddings table, inventory_movements natural-key unique index"
    requirement: "LDM-02"
    verification:
      - kind: unit
        ref: "node -e migration shape assertion (meta.targetKind==='business', meta.destructive===false, typeof up/down==='function')"
        status: pass
    human_judgment: false
  - id: D2
    description: "product_embeddings new table (1:1 per product) declared in dgfyBusinessContract.js with unique index + FK"
    requirement: "LDM-03"
    verification:
      - kind: unit
        ref: "grep 'product_embeddings' + 'unique_product_embeddings_product' in dgfyBusinessContract.js"
        status: pass
    human_judgment: false
  - id: D3
    description: "inventory_movements natural-key unique index (business_id, reference_type, reference_id) declared in contract"
    requirement: "LDM-04"
    verification:
      - kind: unit
        ref: "grep 'unique_inventory_movements_natural_key' in dgfyBusinessContract.js"
        status: pass
    human_judgment: false
  - id: D4
    description: "dgfy-api Tenant models (Product.js, InventoryMovement.js, new ProductEmbedding.js) match the migration; ProductEmbedding registered in tenantConnector.js modelDefiners"
    verification:
      - kind: unit
        ref: "node --check syntax validation on all 4 files (module-load verification blocked — node_modules not installed in this isolated worktree, pre-existing environment condition)"
        status: pass
    human_judgment: true
    rationale: "Plan's specified module-load verify command (node --input-type=module -e \"import(...)\") could not run because this worktree has no node_modules installed for apps/dgfy-api (sequelize package unresolvable) — an environment limitation unrelated to these code changes, not reproducible in a normal dev checkout. Syntax-only fallback (node --check) passed on all 4 touched files and the tenantConnector.js registration grep passed. A human/CI run with dependencies installed should confirm the module-load path; Plan 04's full apply+verify against a real tenant DB is the authoritative end-to-end proof per this plan's own <verification> section."
  - id: D5
    description: "Satellite-folding design doc committed before any Phase 13 mapper code — records D-01 (BOM in scope), D-03 (10-key namespace), D-04 (omit-key-when-absent), D-02 (legacy_id_map resolution deferred to Phase 13)"
    requirement: "LDM-02"
    verification:
      - kind: unit
        ref: "test -f + grep for legacy_id_map/composition/barcodes/costBreakdown in docs/database/legacy-product-attributes-folding-design.md"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-07-14
status: complete
---

# Phase 12 Plan 02: Schema Extension + Model Parity + Folding Design Summary

**One additive migration adding 7 products columns + product_embeddings table + inventory_movements natural-key index, in lockstep with dgfyBusinessContract.js, plus dgfy-api Tenant model parity and a committed satellite-folding design doc.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-07-14T09:58:58Z
- **Tasks:** 3
- **Files modified:** 7 (3 created, 4 modified)

## Accomplishments
- Created `20260716100000-extend-schema-for-legacy-migration.cjs` — one additive migration (`meta.targetKind: 'business'`, `meta.destructive: false`) adding 6 typed columns + `attributes` JSON to `products`, a new 1:1 `product_embeddings` table, and a natural-key unique index on `inventory_movements`, all guarded/idempotent.
- Updated `dgfyBusinessContract.js` in the same commit as the migration: `products.columns`/`indexes` extended, `inventory_movements.indexes`/`uniqueConstraints` extended, new `product_embeddings` contract entry added — so `verify` (Plan 04) can actually confirm the new shapes.
- Updated `Product.js` and `InventoryMovement.js` dgfy-api Tenant models for drift parity with the migration, and added a brand-new `ProductEmbedding.js` model registered in `tenantConnector.js`'s `modelDefiners`.
- Committed `docs/database/legacy-product-attributes-folding-design.md` — the 1:1-vs-1:many satellite-folding shape (10 namespace keys, BOM-in-scope, omit-key-when-absent rule, `legacy_id_map` resolution deferred to Phase 13) before any Phase 13 mapper code exists.

## Task Commits

Each task was committed atomically:

1. **Task 1: Additive migration + dgfyBusinessContract.js in lockstep** - `f9ccede2` (feat)
2. **Task 2: Update dgfy-api Tenant models + register ProductEmbedding** - `ba7fdca7` (feat)
3. **Task 3: Commit the satellite-folding design doc** - `b416f980` (docs)

_Note: worktree-mode execution — STATE.md/ROADMAP.md are NOT updated by this agent; the orchestrator owns those writes after all wave agents complete._

## Files Created/Modified
- `apps/dgfy-migration-runner/src/migrations/schema/20260716100000-extend-schema-for-legacy-migration.cjs` - NEW additive migration for LDM-02/03/04
- `apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js` - products/inventory_movements entries extended, new product_embeddings entry
- `apps/dgfy-api/src/models/Tenant/Product.js` - 7 new fields + idx_products_sku_code index
- `apps/dgfy-api/src/models/Tenant/InventoryMovement.js` - unique_inventory_movements_natural_key index added
- `apps/dgfy-api/src/models/Tenant/ProductEmbedding.js` - NEW model, 1:1 per product
- `apps/dgfy-api/src/infra/tenantConnector.js` - ProductEmbedding import + modelDefiners registration
- `docs/database/legacy-product-attributes-folding-design.md` - NEW design doc (LDM-02 deliverable)

## Decisions Made
- One combined migration file (not three per-LDM files) — matches the `20260714103000` precedent of touching multiple tables in one file; atomic and coarse-granularity per project's `granularity: coarse` config setting.
- Updated the 3 dgfy-api Tenant models now (RESEARCH Open Question 2, RESOLVED) rather than deferring to Phase 13 — no feature reads these columns yet, but keeps every Tenant model matching its migration and benefits Phase 13's verification.
- `cost_per_unit` widened to `DECIMAL(14,4)` (matches `base_price` convention) rather than legacy's narrower `DECIMAL(10,4)` — no precision loss, keeps money-shaped columns consistent (D-06).
- `idx_products_sku_code` kept non-unique — legacy explicitly allows duplicate SKUs (D-05).
- No backfill needed for the `inventory_movements` natural-key index — existing organic Phase 8/9 rows have NULL `reference_type`/`reference_id`, and MySQL's unique index treats NULL tuples as distinct (D-10).

## Deviations from Plan

None — plan executed exactly as written. No Rule 1-4 auto-fixes were needed; all three tasks matched their `<action>` specs directly.

## Issues Encountered

**Environment limitation (not a code defect):** this git worktree has no `node_modules` installed anywhere (confirmed for both `apps/dgfy-migration-runner` and `apps/dgfy-api`) — a pre-existing condition of the isolated worktree, not caused by this plan's changes. This blocked running:
- The full `apps/dgfy-migration-runner` Jest suite (skipped; Task 1's specified `node -e` shape-assertion + contract grep verify commands still ran and passed, since they use plain `require()`/`grep`, not Jest).
- Task 2's specified module-load verify command (`node --input-type=module -e "import('./src/models/Tenant/ProductEmbedding.js')..."`) — `sequelize` package unresolvable. Fell back to `node --check` (syntax-only validation) on all 4 touched/created files, which passed, plus the `tenantConnector.js` registration grep, which passed.

This is flagged in the `coverage` block (D4, `human_judgment: true`) for a human/CI run with dependencies installed to confirm the module-load path. Per this plan's own `<verification>` section, the authoritative end-to-end proof (full schema apply + `verify` against a real tenant DB) is Plan 04's job, not this plan's.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- LDM-02/03/04 schema artifacts exist and are declared in `dgfyBusinessContract.js`; the committed folding-design doc exists; dgfy-api Tenant models match the migration.
- Ready for Plan 04's [BLOCKING] gate: full schema apply + `verify` against a real tenant DB to prove these shapes against MySQL.
- Phase 13's `items` → `products` mapper (PIM-02) has a written contract (`docs/database/legacy-product-attributes-folding-design.md`) to read before implementing `attributes` JSON population logic.
- Recommend a CI/dev-environment run with `node_modules` installed to execute the full `apps/dgfy-migration-runner` test suite and the dgfy-api module-load check as a supplementary confirmation (see Issues Encountered above) — not blocking, since Plan 04 provides the authoritative DB-backed proof.

## Self-Check: PASSED

All 8 created/modified files confirmed present on disk; all 4 commit hashes (`f9ccede2`, `ba7fdca7`, `b416f980`, `cc7f866a`) confirmed present in git log.

---
*Phase: 12-scope-unblock-schema-extension*
*Completed: 2026-07-14*

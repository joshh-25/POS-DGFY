# Phase 14: Sales History Migration & Full Verification - Research

**Researched:** 2026-07-15
**Domain:** Legacy POS sales-history migration, provenance, reconciliation, and full-volume rehearsal
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Non-resolvable FK fields (pos_transactions header)

Legacy `pos_transactions` has ~9 FK-shaped columns added across many migrations with no clean target representation: `shift_id` (points to legacy `pos_terminal_shifts` — unrelated to the new `shifts` table `availments.shift_id` actually FKs to), `fnb_check_id`, `fnb_table_id`, `store_customer_id`, `payment_collected_shift_id`, `payment_collected_terminal_id`. None of these have an existing `legacy_id_map` entity type, and building one for them would exceed VER-01's ROADMAP-fixed list of exactly 6 entity types (`product_folder`, `product`, `inventory_movement`, `product_embedding`, `availment`, `availment_item`).

- **D-14-01:** These fields are preserved via one new additive JSON snapshot column on `availments` (header-level, since all are `pos_transactions` fields, not line-item fields) — not dropped silently, not resolved to new `legacy_id_map` entity types. Exact column name/shape is Claude's discretion (research/planner should follow the existing JSON-attributes-column precedent, e.g. `products.attributes` from Phase 12/13).
- **D-14-02:** `terminal_id` (raw string in legacy, FK to `terminal_identities.id` in target, resolvable via the existing `terminal_identity` legacy_id_map) — when a legacy terminal code doesn't resolve (stale/deleted terminal), null `availments.terminal_id` and emit a finding. The raw string is also captured in the D-14-01 snapshot column.
- **D-14-03:** `cashier_id` — when it doesn't resolve via the existing `staff_account` legacy_id_map (deleted staff, or reset_required/never-fully-migrated per Phase 13.5), still migrate the availment with `cashier_account_id = null` plus a non-blocking finding. Do not skip the sale record — preserving audit/reporting fidelity for the sale outweighs an incomplete cashier attribution, consistent with Phase 13.5's principle that credential/linkage gaps shouldn't block data fidelity.

#### Void status mapping (SHM-03)

`availments.status` ENUM('draft','finalized','voided') already has a `'voided'` value, but it's documented as a post-finalize refund concept (Phase 11+), not a POS-void-before-it-became-a-real-sale concept.

- **D-14-04:** Migrated legacy voids DO reuse `availments.status = 'voided'` directly (no new enum value) — but they must be distinguishable from refund-originated voids at reporting/verification time. The distinguishing signal is `source_system = 'legacy_migration'` combined with `status = 'voided'`, not a separate status value.
- **D-14-05:** Legacy void metadata (`voided_at`, `voided_by`, original legacy `status`) is preserved in the same D-14-01 snapshot column — no dedicated/indexed void-metadata columns. This keeps void provenance as part of the general "everything legacy that doesn't have a first-class target slot" bucket rather than adding narrowly-scoped schema.

#### Full-table-scan strategy for a live, growing source table

The migration runner's existing mechanism (`apps/dgfy-migration-runner/src/data/legacySource.js`, `dataState.js`) does an unpaginated `SELECT *` every run for every entity type, with `legacy_id_map` lookup-before-insert as the sole idempotency guard — no timestamp/watermark cursor exists anywhere in the runner (confirmed for Phase 13's `stock_movements` precedent too).

- **D-14-06:** Accept the existing full-scan-per-run mechanism as-is for `pos_transactions`/`pos_transaction_lines`. No watermark/incremental cursor is built. Rationale: this is a one-time cutover migration with a bounded rehearsal/cutover window, not a continuous sync; `legacy_id_map` already makes re-runs idempotent (rows created since the last run get picked up naturally, already-migrated rows are skipped by lookup).

#### Payment/cash detail scope, incl. new additional_fees column

`pos_transactions` carries payment-processing detail beyond `availments`' existing monetary columns (subtotal/discount/vat/total): `cash_received`, `change_amount`, `payment_status`/`reference`/`provider`/`checkout_url`, `service_fee`, `delivery_fee`.

- **D-14-07:** Core monetary totals (`subtotal_amount`, `discount_amount`, `vat_amount`, `vat_exempt_sales`→`vat_exempt_amount`, `total_amount`) map directly to `availments`' existing decimal columns.
- **D-14-08:** Generic payment-processing detail with no live target column (`cash_received`, `change_amount`, `payment_status`/`reference`/`provider`/`checkout_url`) folds into the D-14-01 snapshot column — preserved for audit, not resolved to any live target.
- **D-14-09:** `service_fee`/`delivery_fee` get their OWN new additive column, `availments.additional_fees` (JSON), separate from the general D-14-01 snapshot — not just buried in it. Same additive-schema pattern as `source_system` (LDM-05). The migration mapper populates this column from legacy `delivery_fee`/`service_fee` values during Phase 14's migration.
  - **Explicitly out of scope for Phase 14:** any live checkout write path that lets staff *set or edit* `additional_fees` at time of sale (UI, use-case logic, VAT/discount interaction, multi-fee support). Phase 14 only adds the column and migrates legacy data into it — see Deferred Ideas below. The new system today has no live fee computation at all (only a hardcoded `service_fee_amount: '0.0000'` placeholder in `apps/dgfy-api/src/modules/availments/usecases/availmentUseCases.js:1008`, used for receipt printing).

### Claude's Discretion

- Exact snapshot column name/shape for D-14-01 (JSON structure, key naming) — follow the existing `products.attributes` namespaced-JSON precedent from Phase 12/13.
- Whether `additional_fees` (D-14-09) is a flat `{service_fee, delivery_fee}` shape or a more general array-of-fee-objects shape — implementation detail, not a locked user preference, as long as it's additive and migration can populate it from the two known legacy fields.
- Exact finding/reason-code strings for D-14-02/D-14-03 unresolved-FK cases — follow the existing `classifyMappingConflict()` / `MAPPING_REASON_CODES` pattern in `apps/dgfy-migration-runner/src/data/mappings.js`.
- Line-item provenance column shape for `availment_items` (SHM-04 requires per-line `source_system`/legacy-reference, not just the header) — follow the existing `availments.source_reference` STRING(64) pattern (`20260714103000-add-availment-source-reference.cjs`) unless research finds a reason to diverge.
- VER-02 sum-by-type reconciliation shape (row counts + sum-by-type totals for products/inventory/embeddings/availments) — precedent exists in `verifyData.js`'s `summarizeMovementTypeTotals()`/`buildProductReconciliation()` group-by-type-and-SUM pattern; extend analogously for availments. Whether to add an explicit legacy-vs-migrated `total_amount` parity check was raised but not conclusively resolved by the user (see Deferred/open note below) — default to including it unless research surfaces a reason it's noisy, since it directly supports VER-03's "zero unresolved data-quality issues" bar.

### Deferred Ideas (OUT OF SCOPE)

- **Live checkout write path for `availments.additional_fees`** — letting staff set/edit arbitrary fees (delivery, service, or other) at time of sale, including VAT/discount interaction and multi-fee support. This is a new capability for the POS Checkout domain (`apps/dgfy-api/src/modules/availments/usecases/availmentUseCases.js` and related checkout logic), not migration work. Phase 14 only adds the column and migrates legacy `delivery_fee`/`service_fee` data into it. Raised by the user while discussing payment/cash detail scope, prompted by discovering the new system has no live fee computation today (only a hardcoded `service_fee_amount: '0.0000'` placeholder in receipt printing).

#### Reviewed Todos (not folded)
None — `todo.match-phase 14` returned zero matches.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LDM-05 | `availments` gains an additive `source_system` column, sequenced with Sales History. | Add nullable `source_system` to header and line persistence contracts; migration rows explicitly use `legacy_migration`, while existing live rows remain null. |
| SHM-01 | `pos_transactions` map after Product/Inventory, with provenance and legacy reference. | Header mapper, product-domain checkpoint gate, namespaced `source_reference`, preserved source timestamps, and ID-map idempotency are specified below. |
| SHM-02 | Every `pos_transaction_lines` row migrates as line detail. | Line field matrix, parent/product dependency resolution, line snapshot, and blocking orphan rules are specified below. |
| SHM-03 | Legacy void status is preserved. | `completed -> finalized`, `voided -> voided`; legacy void metadata remains in `legacy_snapshot`; verification groups by status and provenance. |
| SHM-04 | Provenance exists at inventory/availment line level. | Phase 13 already carries inventory `reference_type/reference_id`; Phase 14 adds `source_system` and unique `source_reference` to `availment_items`. |
| VER-01 | Dry-run/apply/retry/verify covers all six migration entity types. | Existing four product entity seams remain; `availment` and `availment_item` get pure mappers, independent checkpoints, ID maps, target natural keys, and retry assertions. |
| VER-02 | Per-tenant verification reports counts and sum-by-type totals. | Add sales reconciliation grouped by `source_system` and `status`, exact monetary sums, line/provenance coverage, and keep existing product reconciliation. |
| VER-03 | Full production-parity re-rehearsal proves the milestone. | Extend the ENV-gated rehearsal to all six entities and require operator-reviewed dry-run/apply/retry/verify evidence against the real-volume clone. |
</phase_requirements>

## Summary

Phase 14 should extend the existing Phase 13 pipeline, not create a second migration path. The correct implementation order is: additive tenant schema and persistence-contract parity; pure header/line mappers plus explicit field-coverage tests; source reader; dry-run; apply with parent/product ID resolution; verification; then one full-volume rehearsal. `[VERIFIED: codebase — mappings.js, legacySource.js, dryRun.js, apply.js, verifyData.js]`

Two current-code defects must be included in the plan because they directly undermine D-14-06 and VER-03. First, a completed entity checkpoint suppresses finding persistence even though newly-added source rows are still scanned and written. Second, a retry blanket-resolves findings for any successfully mapped record, so a persistent unresolved cashier/terminal finding becomes falsely resolved on the idempotency retry. Make finding recording idempotent/reopenable and record current findings on every scan; keep resolution for findings no longer emitted by the current mapper. `[VERIFIED: codebase — apply.js:385-425, dataState.js:130-189]`

The live legacy model uses `service_fee_amount`, not `service_fee`; D-14-09 must map `service_fee_amount` and `delivery_fee` into `additional_fees`. The target also lacks slots for several meaningful line fields, so add `availment_items.legacy_snapshot` rather than silently discarding unit/cost/override/F&B line evidence. `[VERIFIED: codebase — PosTransaction.js:123-275, PosTransactionLine.js:18-81]`

**Primary recommendation:** implement one additive schema migration and two pure mappers, preserve unmapped header/line data in explicit allowlisted JSON snapshots, fix current-state finding persistence before enabling growing-table retries, and make exact monetary parity plus full-volume rehearsal the final gate.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Additive provenance/snapshot/fees columns | Database / Storage | API persistence models | Schema owns durability; persistence-only models mirror the columns without adding live checkout behavior. |
| Legacy source scans | Migration runner / Backend | Legacy MySQL | `legacySource.js` is the established read-only boundary. |
| Header/line transformation | Migration runner / Backend | — | Pure mappers own deterministic classification and payload creation. |
| FK/ID-map resolution and idempotent writes | Migration runner / Backend | Migration metadata DB | Apply resolves durable IDs; `legacy_id_map` and target unique keys prevent duplicates. |
| Count/sum/fidelity verification | Migration runner / Backend | Source and target MySQL | `verifyData.js` compares both sides and emits the release verdict. |
| Production-parity proof | Operations / Rehearsal | Migration runner | Operator-reviewed environment and reports prove real-volume behavior. |

**Architecture classification:** `within-existing-boundary`. ADR 0029 already authorizes Phase 14's read-only legacy POS to additive `dgfy_business_*` migration path, so no new ADR is required unless implementation changes live POS ownership or adds a new cross-boundary write path. `[VERIFIED: docs/architecture/adr/0029-catalog-inventory-pos-storefront-ownership-boundaries.md]`

## Standard Stack

### Core

| Library / Facility | Version | Purpose | Why Standard Here |
|--------------------|---------|---------|-------------------|
| Node.js | `>=18` (local `v24.14.0`) | Runner runtime | Existing package engine and installed runtime. `[VERIFIED: package.json; local command]` |
| Sequelize | `^6.37.8` (installed `6.37.8`) | Source/target connections, QueryInterface migrations | Existing runner dependency and migration API. `[VERIFIED: package.json/npm ls; CITED: https://sequelize.org/docs/v6/other-topics/migrations/]` |
| mysql2 | `^3.6.5` (installed `3.22.6`) | MySQL driver and metadata bootstrap | Existing runner dependency; no replacement needed. `[VERIFIED: package.json/npm ls]` |
| Jest | `^29.7.0` (installed `29.7.0`) | Mapper/source/apply/verify/rehearsal tests | Existing runner test framework and fixtures. `[VERIFIED: package.json/npm ls]` |
| Existing migration metadata | repository contract | ID map, checkpoints, findings | VER-01 explicitly requires reuse; no new state store. `[VERIFIED: metadata/bootstrap.js, dataState.js]` |

### Supporting

| Facility | Purpose | When to Use |
|----------|---------|-------------|
| `dgfyBusinessContract` | Schema verification | Add all new columns/indexes and the currently missing `availment_items` contract entry. |
| `BigInt` fixed-scale normalization | Exact DECIMAL(14,4) comparisons | Compare source/target monetary sums without binary floating-point drift. |
| Docker context `lima-dgfy-dev` | Production-parity stack | Full rehearsal only; the currently active default context is `lima-docker`, so commands must select the documented context explicitly. |

**Installation:** none. This phase requires no new package.

## Package Legitimacy Audit

Not applicable. Phase 14 installs no external package; it reuses the repository's installed Sequelize/mysql2/Jest stack. `[VERIFIED: package.json and phase scope]`

## Recommended Schema Contract

| Table | Column / Index | Recommended Shape | Reason |
|-------|----------------|-------------------|--------|
| `availments` | `source_system` | `STRING(32) NULL` | Existing/live rows remain unchanged; migration explicitly writes `legacy_migration`. |
| `availments` | `legacy_snapshot` | `JSON NULL` | D-14-01/05/08 allowlisted unmapped header evidence. |
| `availments` | `additional_fees` | `JSON NULL` | Flat `{ service_fee_amount, delivery_fee }`, both fixed-scale decimal strings. |
| `availment_items` | `source_system` | `STRING(32) NULL` | SHM-04 line provenance. |
| `availment_items` | `source_reference` | `STRING(64) NULL` | Namespaced `legacy_pos_line:<line_id>` reference. |
| `availment_items` | unique index | unique on `source_reference` | Target-first crash recovery and retry idempotency for line inserts. |
| `availment_items` | `legacy_snapshot` | `JSON NULL` | Preserves line detail with no first-class target slot. |

Use existence-guarded `describeTable`/`showIndex` before `addColumn`/`addIndex`, mirror the fields in `dgfyBusinessContract`, `Availment`, and `AvailmentItem`, and add schema tests. Do not add these fields to live checkout use-case inputs, repository create payloads, or public entity serialization. `[VERIFIED: repository migration precedents; CITED: https://sequelize.org/docs/v6/other-topics/migrations/]`

## Mapping Contract

### Header: `pos_transactions -> availments`

| Source | Target / Action |
|--------|-----------------|
| `pos_transaction_id` | `legacy_id_map` key; `source_reference = legacy_pos:<invoice_number>`; raw ID also in snapshot. |
| `location_id` | Resolve existing `location` map into `branch_id`; null + attribution finding when unresolved; preserve raw ID. |
| `terminal_id` | Resolve existing `terminal_identity` map; null + non-blocking finding when unresolved; preserve raw string (D-14-02). |
| `cashier_id` | Resolve existing `staff_account` map; null + non-blocking finding when unresolved; preserve raw ID (D-14-03). |
| legacy `shift_id` | Always `availments.shift_id = null`; preserve raw ID because the schemas represent different shift domains. |
| `status` | `completed -> finalized`; `voided -> voided`; unknown status is blocking conflict. |
| `document_context` | `fiscal/non_fiscal` direct; `training_test -> null` with original preserved in snapshot (target enum cannot represent it honestly). |
| five core monetary totals | Direct per D-14-07. |
| `service_fee_amount`, `delivery_fee` | `additional_fees` fixed-scale string values. Note the live source field is `service_fee_amount`. |
| `created_at` | Preserve as target `created_at` and `finalized_at`; preserve `updated_at` too. Historical sales are unusable if insertion time replaces sale time. |
| all remaining current model fields | Explicit allowlisted `legacy_snapshot.legacy_pos`; never spread an arbitrary source row. Includes invoice/document/payment/customer/fulfillment/F&B/fiscal/void metadata and raw unresolved FK values. |
| target fulfillment cache fields | Leave null. They are documented as a cache of `availment_stage_events`; Phase 14 does not migrate that event ledger. |

### Line: `pos_transaction_lines -> availment_items`

| Source | Target / Action |
|--------|-----------------|
| `line_id` | `legacy_id_map` key and `source_reference = legacy_pos_line:<line_id>`. |
| `pos_transaction_id` | Resolve `pos_transactions -> availments` map into `availment_id`. Missing parent map is a blocking orphan/skip. |
| `item_id` | Resolve Phase 13 `items -> products` map into `product_id`. Missing product map is a blocking orphan/skip. |
| source item name | `product_name`; use the Phase 13 product snapshot lookup, not a target model query inside the pure mapper. |
| `quantity` | `quantity`. |
| `sale_price` | `unit_price`. |
| `stock_effect_type` | direct enum. |
| `vat_type_snapshot`, `vat_rate_snapshot` | `tax_treatment`, `tax_rate`. |
| `created_at`, `updated_at` | preserve source timestamps. |
| remaining line fields | Explicit allowlisted `legacy_snapshot.legacy_pos_line`: raw parent/item IDs, UOM, cost, stock-exempt reason, subtotal, override evidence, and all F&B snapshots. |

### Mapper Reason Codes

Add stable codes for unresolved `sale_location`, `sale_terminal`, `sale_cashier`, `availment_parent`, and `sale_product`. Header attribution gaps remain visible and non-blocking because the raw value is preserved; missing required line parent/product mappings block verification because target FKs are non-null. `[VERIFIED: D-14-02/D-14-03 and target schema]`

## Architecture Patterns

### System Architecture Diagram

```text
explicit target manifest
        |
        v
legacy tenant MySQL -- full SELECT * --> readLegacySalesSnapshot
        |                                      |
        |                                      v
        |                           pure header/line mappers
        |                                      |
        |                    +-----------------+-----------------+
        |                    |                                   |
        |                    v                                   v
        |                 dry-run                         checkpointed apply
        |              report-safe plan               product checkpoints gate
        |                                                    |
        |                                  +-----------------+----------------+
        |                                  |                                  |
        |                                  v                                  v
        |                         legacy_id_map lookups             target natural keys
        |                    location/terminal/staff/product/       source_reference
        |                              parent availment                       |
        |                                  +-----------------+----------------+
        |                                                    v
        +----------------------------------------------> dgfy_business_*
                                                             |
                                                             v
                                                     verifyData.js
                                             counts + exact sums + findings
                                                             |
                                                             v
                                              dry-run -> apply -> retry ->
                                             verify production-parity proof
```

### Recommended Project Structure

```text
apps/dgfy-migration-runner/
├── src/migrations/schema/<phase14-additive-migration>.cjs
├── src/schemaContracts/dgfyBusinessContract.js
├── src/data/mappings.js
├── src/data/legacySource.js
├── src/data/dryRun.js
├── src/data/apply.js
├── src/data/verifyData.js
├── src/metadata/dataState.js
└── tests/
    ├── phase14SalesHistorySchema.test.js
    ├── dataSalesMappings.test.js
    ├── dataSalesSource.test.js
    ├── dataSalesDryRun.test.js
    ├── dataSalesApply.test.js
    ├── dataSalesVerify.test.js
    └── dataMilestoneRehearsal.test.js

apps/dgfy-api/src/models/Tenant/
├── Availment.js
└── AvailmentItem.js
```

### Pattern 1: Dependency-ordered parent then line apply

Apply per tenant in the existing order through `product_embedding`, assert the four product-domain checkpoints are completed, then apply all `availment` entries before `availment_item`. Resolve both the parent availment and product ID maps immediately before each line mapper call. `[VERIFIED: apply.js Phase 13 ordering pattern]`

### Pattern 2: Planned dependency in first dry-run

On a clean target, auto-increment IDs do not exist during dry-run. Build header entries first and track valid planned source IDs. Line entries may be classified as planned inserts when both source dependencies are valid/planned, while their unresolved target IDs remain explicitly represented as pending dependencies. Apply must still require real resolved IDs. This avoids falsely reporting every first-run line as an orphan. `[VERIFIED: dryRun.js resolvedIdMap behavior]`

### Pattern 3: Current-state findings, not append-only noise

Make `recordDataQualityFinding` idempotent on `(run_scope, tenant, entity, legacy_table, legacy_id, reason_code)`: keep an existing open row, reopen a resolved row if the mapper still emits it, and resolve a prior row only when the current mapper no longer emits that reason. Always process current findings even when the entity checkpoint was already completed. `[VERIFIED: current retry defect in apply.js/dataState.js]`

### Pattern 4: Preserve source timestamps

Change the shared insert helper to fill `created_at`/`updated_at` only when the mapper did not supply them. Add regression tests for existing entities and historical timestamp tests for headers/lines. `[VERIFIED: apply.js currently overwrites mapper timestamps with new Date()]`

### Anti-Patterns to Avoid

- Do not map legacy `shift_id` into target `shift_id`; the tables represent unrelated domains.
- Do not populate fulfillment cache fields without corresponding stage events.
- Do not spread the entire source row into JSON; use an explicit audited allowlist and coverage tests.
- Do not expose `legacy_snapshot` in dry-run JSON reports; it contains customer, payment, delivery, and fiscal evidence.
- Do not treat a completed checkpoint as permission to suppress findings for newly discovered rows.
- Do not compare DECIMAL totals with `Number()`/floating point.
- Do not create more `legacy_id_map` entity types than VER-01's six domain types.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Incremental sync | watermark/cursor framework | Locked full scan + ID map | D-14-06 explicitly rejects continuous-sync scope. |
| Retry identity | ad hoc duplicate queries | `legacy_id_map` + unique `source_reference` | Covers normal retry and target-first interruption. |
| FK resolution | raw legacy IDs | `findLegacyIdMap()` | Required target IDs are auto-increment tenant-local IDs. |
| Finding taxonomy | arbitrary logs | `MAPPING_REASON_CODES` + durable findings | Dry-run/apply/verify already consume this contract. |
| Money parity | floating-point arithmetic | SQL `SUM(DECIMAL)` + fixed-scale `BigInt` normalization | Exact four-decimal comparison without adding a package. |
| Schema application | model sync | guarded QueryInterface migration + contract verification | Existing migration safety contract. |

## Current Code Reality and Required Seams

| Area | Current Reality | Phase 14 Work |
|------|-----------------|---------------|
| Scope list | `pos_transaction_lines` is still in `OUT_OF_SCOPE_LEGACY_TABLES`; `pos_transactions` is already removed. | Remove line table and update comments/docs/tests. |
| Source reader | Product reader ends at `item_embeddings`; source-reader header still says POS is never queried. | Add two-table sales snapshot and correct comments. |
| Mapper | 12 entity mappers exist; no sales mapper/reason codes. | Add header/line pure mappers and complete field-classification tests. |
| Apply target config | Ends at `product_embedding`. | Add `availment` natural key `source_reference`; `availment_item` natural key `source_reference`. |
| Apply ordering | Ends at embeddings; timestamps are overwritten. | Add prerequisite gate, headers, lines, and timestamp preservation. |
| Findings | Retry can falsely resolve persistent findings; completed checkpoints suppress new findings. | Make findings idempotent/current-state before relying on D-14-06. |
| Dry-run reports | Redacts only credential hashes; otherwise returns payloads. | Redact snapshot values and expose only safe presence/key evidence. |
| Verification | Product counts/reconciliation only; no sales tables. | Add header/line counts, map keys, provenance/FK/void coverage, exact sums. |
| Schema contract | `availments` exists, but `availment_items` is still missing despite Phase 9. | Add the line table contract plus Phase 14 fields/indexes. |
| API persistence models | Neither model declares Phase 14 fields. | Add persistence-only fields/indexes; no live write path or public serialization. |
| Rehearsal | Phase 13 test exists; no `13-06-SUMMARY.md`; STATE says Phase 14 owns final live proof. | Replace/extend with milestone-wide test and committed evidence summary. |
| Connections | Dry-run/apply open landlord/tenant/business connections without closing them. | Add `try/finally` closure as rehearsal hardening; otherwise many-tenant full scans accumulate pools. |

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored source data | Tenant-local `pos_transactions` and `pos_transaction_lines`; current model has substantially more fields than the 2026-03 base migration. | Read current physical tables, classify every current model field, preserve legacy DB unchanged. |
| Stored target data | `availments`, `availment_items`, plus Phase 14 additive columns. Existing storefront/POS rows may already occupy `availments.source_reference`. | Use namespaced legacy references; schema migration must be nullable/non-breaking. |
| Migration metadata | `legacy_id_map`, `data_checkpoints`, `data_quality_findings` under `run_scope='data-migration'`. | Clean-slate rehearsal resets target domain rows and matching metadata together; normal retry retains them. |
| Live service config | Explicit manifest and `DGFY_BUSINESS_DB_NAMES`; Docker rehearsal context is operational state outside git. | Human checkpoint confirms manifest/target/context before destructive apply. |
| OS-registered state | Docker contexts include `lima-dgfy-dev`, but active context was `lima-docker` during research. | Rehearsal commands explicitly select/export `lima-dgfy-dev`; never rely on current context. |
| Secrets and env vars | Source/target DB credentials and migration actor remain environment-only. | Never copy them into plans/reports/commits; apply still requires explicit destructive confirmation. |
| Build artifacts / installed packages | Runner dependencies are installed; no compiled artifact. Report files and command-execution rows are release evidence. | Preserve reports outside disposable DB lifecycle; no package install. |

## Common Pitfalls

### Pitfall 1: Source schema wording drifts from the real model
The context says `service_fee`; the current model and migration use `service_fee_amount`. Map the real field and assert it in tests. `[VERIFIED: PosTransaction.js:215]`

### Pitfall 2: Retry makes unresolved attribution disappear
`applyTenantEntityBatch()` currently resolves all findings for a reconciled mapped row and skips recording when the checkpoint is complete. A second apply can therefore turn a still-missing cashier/terminal into a false clean. Fix the lifecycle before the idempotency rehearsal. `[VERIFIED: apply.js:385-419]`

### Pitfall 3: Growing tables add rows after checkpoint completion
The full scan still discovers and writes a new mapped row, but current code suppresses that row's finding because suppression is batch-wide. Always deduplicate findings per source record/reason instead of suppressing them per completed batch. `[VERIFIED: apply.js:404-419]`

### Pitfall 4: Historical timestamps become migration timestamps
`insertTargetRow()` always assigns `new Date()` after spreading payload values. Preserve mapper-supplied timestamps or sales-history ordering and period totals become misleading. `[VERIFIED: apply.js:176-183]`

### Pitfall 5: Line migration cannot resolve only one dependency
Every line needs both `availment_id` and `product_id`. Apply headers first and use two map lookups; missing either is blocking. Do not insert a partially linked line. `[VERIFIED: target availment_items non-null FKs]`

### Pitfall 6: Header reference collides with storefront reference
The existing unique index covers `source_reference` alone. Namespace legacy references (`legacy_pos:`) rather than writing bare invoice values that may overlap another source system. `[VERIFIED: unique_availments_source_reference]`

### Pitfall 7: Dry-run leaks customer/payment snapshots
The current report redactor strips only credential hashes. Redact the entire snapshot value and report safe evidence flags/key names only. `[VERIFIED: dryRun.js:89-113]`

### Pitfall 8: Populating fulfillment caches creates ledger inconsistency
Target docs define these fields as a cache of the latest stage event, but stage-event migration is out of scope. Keep them null and preserve legacy fulfillment data in the snapshot. `[VERIFIED: dgfyBusinessContract.js:567-572]`

### Pitfall 9: JS floating point creates false monetary mismatches
Use exact fixed-scale comparison for DECIMAL(14,4) sums. Group by `status` and `source_system`, compare source/target count and totals, and surface each mismatch. `[VERIFIED: source/target DECIMAL schema]`

### Pitfall 10: Full-volume command leaks connection pools
Current dry-run/apply orchestrators do not close source/business connections. Close each tenant connection in `finally` and close the landlord connection after orchestration so a 26+ tenant rehearsal does not accumulate pools. `[VERIFIED: dryRun.js/apply.js missing close paths; STATE reports 26-target prior proof]`

## Verification Strategy

`workflow.nyquist_validation` is explicitly `false` in `.planning/config.json`, so no Nyquist wave-0 section is required. Phase plans should still use the repository's established targeted Jest files plus the full runner suite.

### Requirement-to-Proof Matrix

| Requirement | Fast Automated Proof | Full Gate |
|-------------|----------------------|-----------|
| LDM-05 | schema migration + contract/model tests | schema migrate/verify on rehearsal target |
| SHM-01/03 | mapper tests for provenance/status/timestamps/snapshot | source-target header count/status/sum comparison |
| SHM-02/04 | line mapper and apply ordering/FK tests | every source line mapped with line provenance and valid FKs |
| VER-01 | dry-run/apply/retry unit/integration tests for six entity types | second apply inserts zero new headers/lines |
| VER-02 | sales reconciliation pure tests | exact per-tenant count and monetary sum parity |
| VER-03 | ENV-gated test skips cleanly without env | operator-run production-parity dry-run/apply/retry/verify with preserved reports |

## Security and Threat Model

### Trust Boundaries

| Boundary | Risk | Required Control |
|----------|------|------------------|
| Manifest/operator -> source and target DB selection | Wrong-tenant or legacy-target write | Existing target guard, explicit DB allowlist, human destructive checkpoint. |
| Legacy rows -> mapper JSON snapshots | PII/payment/fiscal evidence disclosure | Explicit snapshot allowlist; redact snapshot values from dry-run/apply reports. |
| Meta DB -> retry decisions | Stale/incorrect finding or ID-map state | Idempotent maps, current-state findings, clean-slate reset procedure for rehearsals. |
| Decimal source -> verification | False parity due coercion | Fixed-scale exact comparison. |
| Docker context -> destructive rehearsal | Apply against wrong runtime | Explicit `--context`/`DOCKER_CONTEXT` and operator confirmation. |

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V1 Architecture | Yes | Keep pure mapping, DB access, schema, and verification in existing runner boundaries; run architecture gates. |
| V4 Access Control | Yes | Operator-supplied manifest and target allowlist scope every tenant; no auto-discovery. |
| V5 Validation | Yes | Validate enum/status/required IDs; SQL values use Sequelize replacements, not interpolation. |
| V8 Data Protection | Yes | Snapshots are durable audit data but must not appear in reports; credentials remain environment-only. |
| V10 Malicious Code | Low | No package install or dynamic code execution. |
| V14 Configuration | Yes | Explicit runtime mode, destructive confirmation, Docker context, and DB-name guards. |

### STRIDE Priorities

| Threat | Severity | Mitigation |
|--------|----------|------------|
| Tampering: duplicate header/line after crash | High | ID map plus unique namespaced source references; retry tests. |
| Tampering: false-clean findings after retry | High | Current-state idempotent finding lifecycle tests. |
| Information disclosure: customer/payment snapshot in reports | High | Redaction tests search serialized reports for seeded sensitive values. |
| Elevation/spoofing: wrong target/context | High | Existing guards plus blocking human checkpoint. |
| Repudiation: missing source attribution | Medium | Header/line source system/reference and preserved command reports. |
| Denial of service: many unclosed pools/full scans | Medium | Per-tenant `finally` closure and real-volume duration evidence. |

## Environment Availability

| Dependency | Required By | Available | Version / State | Fallback |
|------------|-------------|-----------|-----------------|----------|
| Node.js | all runner tests/commands | Yes | `v24.14.0` | Project requires >=18. |
| npm | tests/scripts | Yes | `11.12.1` | — |
| Docker | full rehearsal | Yes | client `29.4.2`, server available | Use explicit `lima-dgfy-dev` context. |
| MySQL service | schema/data proof | Yes in `lima-dgfy-dev` | container healthy, but current dev DB has zero sales rows | Real-volume clone/remote rehearsal remains required. |
| MySQL host CLI | ad hoc inspection | No | not installed | Use containerized MySQL client/runner; not blocking. |
| Real-volume legacy clone | VER-03 | Present as local harness data, not active in current dev DB | operator-controlled, gitignored | Blocking human rehearsal gate. |

**Missing dependency with no automated fallback:** operator-approved real-volume rehearsal credentials/manifest/target reset. Unit and disposable integration tests cannot satisfy VER-03.

## Project Constraints (from AGENTS.md)

- Read planning sources in order: `START_HERE`, boundaries, governance, relevant ADRs, then domain/testing docs; never use `docs/archive/**` or deprecated docs as authority.
- Cite authoritative docs in the plan and classify ADR impact; cross-boundary changes require ADR work.
- Run applicable architecture checks and confirm no unresolved allowlist/exception without a removal plan.
- Before any commit, run the repository's prohibited-marker scan from `docs/ai/PR.md`; use Conventional Commits and logical commit batches.
- Before any PR work, follow `docs/ai/PR.md`; non-`rc/*` branches target `develop` and PR bodies require Summary/Motivation/Testing.
- Evaluate risks and hidden assumptions before implementation; keep the phase scoped to migration, not live checkout features.
- Documentation freshness checked: `START_HERE` and boundaries last reviewed 2026-03-06; governance 2026-05-21; ADR 0029 2026-07-14; data migration map/foundation/rehearsal 2026-07-11. Phase 14 must refresh the database docs it changes.
- No architecture allowlist entry is needed for the recommended design; add none.

## Authoritative Documentation Updates

1. Update `docs/database/dgfy-data-migration-map.md` with complete header/line field classification, reason codes, ID-map keys, and verification checks; remove the Phase-14 exclusion wording.
2. Update `docs/database/dgfy-foundation.md` with Phase 14 columns/indexes and the `availment_items` contract.
3. Update `docs/database/dgfy-migration-rehearsal.md`: its statement that missing membership always blocks is stale after Phase 13.5; add six-entity and sales-sum evidence.
4. Update the operational progressive rehearsal doc only as supporting guidance; it is `draft`, not architectural authority.
5. ADR 0029 needs no new decision unless scope expands into live checkout or ownership changes. Its existing amendment already authorizes this phase.

## Code Examples

### Header mapper shape

```javascript
// Source: repository mappings.js contract + Phase 14 locked decisions
return {
  operation: 'insert',
  entity_type: 'availment',
  target_table: 'availments',
  target_database: targetBusinessDbName,
  target_payload: {
    business_id: expectedBusinessId,
    branch_id: resolvedLocationId ?? null,
    terminal_id: resolvedTerminalId ?? null,
    cashier_account_id: resolvedCashierId ?? null,
    shift_id: null,
    status: legacy.status === 'voided' ? 'voided' : 'finalized',
    source_system: 'legacy_migration',
    source_reference: `legacy_pos:${legacy.invoice_number}`,
    additional_fees: {
      service_fee_amount: toMoneyString(legacy.service_fee_amount),
      delivery_fee: toMoneyString(legacy.delivery_fee)
    },
    legacy_snapshot: buildLegacyPosSnapshot(legacy),
    created_at: legacy.created_at,
    updated_at: legacy.updated_at,
    finalized_at: legacy.created_at
  },
  legacy_id_map_key: {
    legacy_source: legacyTenantDbName,
    legacy_table: 'pos_transactions',
    legacy_id: legacy.pos_transaction_id
  },
  related_targets: [],
  findings
};
```

### Exact money comparison

```javascript
// Source: standard BigInt; preserve DECIMAL(14,4) exactly
function decimal4ToUnits(value) {
  const match = String(value ?? '0').trim().match(/^(-?)(\d+)(?:\.(\d{0,4}))?$/);
  if (!match) throw new Error(`Invalid DECIMAL(14,4): ${value}`);
  const units = BigInt(match[2]) * 10000n + BigInt((match[3] || '').padEnd(4, '0'));
  return match[1] ? -units : units;
}
```

### Report-safe snapshot redaction

```javascript
// Source: extend dryRun.js redactTargetPayload() pattern
if (key === 'legacy_snapshot') {
  redactedPayload.has_legacy_snapshot = value != null;
  redactedPayload.legacy_snapshot_keys = value ? Object.keys(value) : [];
  return;
}
```

## Open Questions (RESOLVED)

No user decision is required before planning. Use these researched defaults:

1. **RESOLVED:** Snapshot column: `legacy_snapshot` on both header and line, with explicit nested `legacy_pos` / `legacy_pos_line` allowlists.
2. **RESOLVED:** Fee shape: flat `{ service_fee_amount, delivery_fee }` using fixed-scale strings; restaurant service charge stays in the general snapshot because D-14-09 names only the two known fee fields.
3. **RESOLVED:** Provenance: nullable `STRING(32)` plus namespaced unique source references; no ENUM migration.
4. **RESOLVED:** Reconciliation: include strict legacy-vs-target `total_amount` parity, grouped status totals, line counts, and provenance/FK coverage.
5. **RESOLVED:** Fulfillment fields: keep target caches null; preserve source fulfillment fields in the snapshot.

## Sources

### Authoritative project docs

- `docs/START_HERE.md`
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
- `docs/architecture/adr/0029-catalog-inventory-pos-storefront-ownership-boundaries.md`
- `docs/architecture/adr/0028-dgfy-account-company-switching.md`
- `docs/database/dgfy-foundation.md`
- `docs/database/dgfy-data-migration-map.md`
- `docs/database/dgfy-migration-rehearsal.md`

### Code and phase evidence

- `.planning/phases/14-sales-history-migration-full-verification/14-CONTEXT.md`
- `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md`
- `backend/src/models/PosTransaction.js`, `PosTransactionLine.js` and listed legacy migrations
- `apps/dgfy-migration-runner/src/data/{mappings,legacySource,dryRun,apply,verifyData}.js`
- `apps/dgfy-migration-runner/src/metadata/{bootstrap,dataState}.js`
- `apps/dgfy-migration-runner/src/migrations/schema/20260713120000-create-availment-checkout.cjs`
- `apps/dgfy-migration-runner/src/migrations/schema/20260714103000-add-availment-source-reference.cjs`
- `apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js`
- `apps/dgfy-api/src/models/Tenant/{Availment,AvailmentItem}.js`
- `.planning/phases/13-product-inventory-migration/13-06-PLAN.md`
- `.planning/phases/13.5-staff-authentication-model-correction/13.5-04-SUMMARY.md`

### External documentation

- Sequelize v6 migrations: https://sequelize.org/docs/v6/other-topics/migrations/ `[CITED]`
- Sequelize v6 model basics: https://sequelize.org/docs/v6/core-concepts/model-basics/ `[CITED]`

## Research Confidence

| Area | Level | Reason |
|------|-------|--------|
| Existing architecture and seams | HIGH | Direct code and authoritative project-doc inspection. |
| Source/target field mapping | HIGH | Current Sequelize models and physical schema migrations inspected. |
| Finding/retry pitfalls | HIGH | Exact apply/dataState control flow inspected. |
| Sequelize migration API | MEDIUM | Official v6 documentation via Context7; repository precedent is stronger for local style. |
| Real-volume execution | MEDIUM | Harness and Docker runtime exist, but current dev DB has zero sales rows; operator rehearsal remains required. |

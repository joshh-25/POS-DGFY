# Phase 14: Sales History Migration & Full Verification - Context

**Gathered:** 2026-07-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Legacy `pos_transactions`/`pos_transaction_lines` migrate into `availments`/`availment_items` with `source_system` provenance and void-state fidelity, sequenced after Product/Inventory migration (Phase 13/13.5) because line items have a real FK dependency on migrated products. The complete milestone (product/inventory + sales-history) is then proven end-to-end via a full re-rehearsal against real legacy data volume. Requirements: LDM-05, SHM-01 through SHM-04, VER-01 through VER-03 (ROADMAP.md Phase 14).

This phase does NOT build live checkout/POS-domain features. Where migration surfaces a genuine gap in the new system's capabilities (e.g., no extensible fee concept), the phase adds the minimum additive schema needed to preserve legacy data honestly — it does not wire new business logic, UI, or write paths for that data going forward.

</domain>

<decisions>
## Implementation Decisions

### Non-resolvable FK fields (pos_transactions header)

Legacy `pos_transactions` has ~9 FK-shaped columns added across many migrations with no clean target representation: `shift_id` (points to legacy `pos_terminal_shifts` — unrelated to the new `shifts` table `availments.shift_id` actually FKs to), `fnb_check_id`, `fnb_table_id`, `store_customer_id`, `payment_collected_shift_id`, `payment_collected_terminal_id`. None of these have an existing `legacy_id_map` entity type, and building one for them would exceed VER-01's ROADMAP-fixed list of exactly 6 entity types (`product_folder`, `product`, `inventory_movement`, `product_embedding`, `availment`, `availment_item`).

- **D-14-01:** These fields are preserved via one new additive JSON snapshot column on `availments` (header-level, since all are `pos_transactions` fields, not line-item fields) — not dropped silently, not resolved to new `legacy_id_map` entity types. Exact column name/shape is Claude's discretion (research/planner should follow the existing JSON-attributes-column precedent, e.g. `products.attributes` from Phase 12/13).
- **D-14-02:** `terminal_id` (raw string in legacy, FK to `terminal_identities.id` in target, resolvable via the existing `terminal_identity` legacy_id_map) — when a legacy terminal code doesn't resolve (stale/deleted terminal), null `availments.terminal_id` and emit a finding. The raw string is also captured in the D-14-01 snapshot column.
- **D-14-03:** `cashier_id` — when it doesn't resolve via the existing `staff_account` legacy_id_map (deleted staff, or reset_required/never-fully-migrated per Phase 13.5), still migrate the availment with `cashier_account_id = null` plus a non-blocking finding. Do not skip the sale record — preserving audit/reporting fidelity for the sale outweighs an incomplete cashier attribution, consistent with Phase 13.5's principle that credential/linkage gaps shouldn't block data fidelity.

### Void status mapping (SHM-03)

`availments.status` ENUM('draft','finalized','voided') already has a `'voided'` value, but it's documented as a post-finalize refund concept (Phase 11+), not a POS-void-before-it-became-a-real-sale concept.

- **D-14-04:** Migrated legacy voids DO reuse `availments.status = 'voided'` directly (no new enum value) — but they must be distinguishable from refund-originated voids at reporting/verification time. The distinguishing signal is `source_system = 'legacy_migration'` combined with `status = 'voided'`, not a separate status value.
- **D-14-05:** Legacy void metadata (`voided_at`, `voided_by`, original legacy `status`) is preserved in the same D-14-01 snapshot column — no dedicated/indexed void-metadata columns. This keeps void provenance as part of the general "everything legacy that doesn't have a first-class target slot" bucket rather than adding narrowly-scoped schema.

### Full-table-scan strategy for a live, growing source table

The migration runner's existing mechanism (`apps/dgfy-migration-runner/src/data/legacySource.js`, `dataState.js`) does an unpaginated `SELECT *` every run for every entity type, with `legacy_id_map` lookup-before-insert as the sole idempotency guard — no timestamp/watermark cursor exists anywhere in the runner (confirmed for Phase 13's `stock_movements` precedent too).

- **D-14-06:** Accept the existing full-scan-per-run mechanism as-is for `pos_transactions`/`pos_transaction_lines`. No watermark/incremental cursor is built. Rationale: this is a one-time cutover migration with a bounded rehearsal/cutover window, not a continuous sync; `legacy_id_map` already makes re-runs idempotent (rows created since the last run get picked up naturally, already-migrated rows are skipped by lookup).

### Payment/cash detail scope, incl. new additional_fees column

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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Target schema (availments/availment_items)
- `apps/dgfy-migration-runner/src/migrations/schema/20260713120000-create-availment-checkout.cjs` — base `availments`/`availment_items` table definitions (all columns, FKs, enums).
- `apps/dgfy-migration-runner/src/migrations/schema/20260714103000-add-availment-source-reference.cjs` — existing `source_reference` provenance column precedent to mirror for line-item provenance (SHM-04).
- `apps/dgfy-migration-runner/src/migrations/schema/20260715120000-create-availment-fulfillment.cjs` — `fulfillment_mode`/`fulfillment_status`/`fulfillment_stage` additive columns (recent precedent for additive-column migrations on `availments`).
- `apps/dgfy-api/src/modules/availments/usecases/availmentUseCases.js` — live availment creation/receipt use case; line ~1008 shows the hardcoded `service_fee_amount: '0.0000'` placeholder confirming the new system has no live fee computation today.

### Legacy source schema (pos_transactions/pos_transaction_lines)
- `backend/migrations/20260325000002-create-pos-transactions.cjs` — base `pos_transactions`/`pos_transaction_lines`/`pos_invoice_counters` tables.
- `backend/migrations/20260330000001-add-pos-terminal-shifts-and-cash-events.cjs` — adds `pos_transactions.shift_id` FK to legacy `pos_terminal_shifts` (D-14-01 unresolvable field).
- `backend/migrations/20260330000006-expand-pos-transactions-for-online-orders.cjs` — adds `order_source`, `fulfillment_status`, `location_id`, `store_customer_id`, `accepted_by`, delivery fields.
- `backend/migrations/20260330000007-create-store-customers-and-addresses.cjs` — `store_customer_id` FK constraint (D-14-01 unresolvable field; target `availments.customer_account_id` is an opaque cross-DB UUID with no analog).
- `backend/migrations/20260331000008-make-pos-cashier-nullable-for-online-store.cjs` — `cashier_id` nullability change.
- `backend/migrations/20260505000002-create-fnb-restaurant-mode-tables.cjs` — adds `fnb_check_id`/`fnb_table_id` (no inline FK; D-14-01 unresolvable fields).
- `backend/migrations/20260711000001-add-pickup-cash-collection-fields.cjs`, `backend/migrations/20260711000003-repair-pickup-cash-collection-columns.cjs` — `payment_collected_shift_id`/`payment_collected_terminal_id` (D-14-01 unresolvable fields).
- `backend/migrations/20260519000001-create-commerce-payment-sessions.cjs`, `backend/migrations/20260703000001-add-pos-payment-tender-fields.cjs` — `payment_status`/`reference`/`provider`/`checkout_url`, `cash_received`/`change_amount` (D-14-08 snapshot-only fields).
- `backend/migrations/20260328000001-add-pos-order-method-fees.cjs` — legacy `service_fee`/`delivery_fee` origin (D-14-09 `additional_fees` source columns).
- `backend/src/models/PosTransaction.js`, `backend/src/models/PosTransactionLine.js` — legacy Sequelize models for full current field list.

### Mapper/runner pattern to follow (Phase 3/13 precedent)
- `apps/dgfy-migration-runner/src/data/mappings.js` — mapper contract, `classifyMappingConflict()`, `MAPPING_REASON_CODES`, `OUT_OF_SCOPE_LEGACY_TABLES` (currently still lists `pos_transaction_lines` as out-of-scope "until Phase 14" — must be removed/updated by this phase). Existing `legacy_id_map` entity types: `account`, `business`, `business_membership`, `staff_account`, `account_staff_assignment`, `location`, `terminal_identity`, `product_folder`, `product`, `inventory_movement`, `product_embedding` — reuse `staff_account`/`terminal_identity`/`location` for D-14-02/D-14-03; no new entity types needed for D-14-01's snapshot-only fields.
- `apps/dgfy-migration-runner/src/data/legacySource.js` — confirms full unpaginated `SELECT * FROM <table>` read pattern (line ~199 for `stock_movements`), the direct precedent for D-14-06's full-scan decision.
- `apps/dgfy-migration-runner/src/metadata/dataState.js` — `markDataCheckpoint`/`getDataCheckpoint` (batch-completion marker, not a row cursor), `recordLegacyIdMap` (idempotency mechanism D-14-06 relies on).
- `apps/dgfy-migration-runner/src/data/apply.js` — `applyTenantEntityBatch` batch/checkpoint wiring to extend for the two new entity types (`availment`, `availment_item`).
- `apps/dgfy-migration-runner/src/data/verifyData.js` — `checkDataCounts()`, `checkOpenFindings()` + `EXPECTED_LOSSY_REASON_CODES`, and the `summarizeMovementTypeTotals()`/`buildProductReconciliation()` group-by-type-SUM precedent for VER-02's sum-by-type totals.

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` §"Sales History Migration" (SHM-01..04), §"Legacy Migration Scope & Schema Extension" (LDM-05), §"Migration Verification & Validation" (VER-01..03) — full acceptance criteria text.
- `.planning/ROADMAP.md` §"Phase 14: Sales History Migration & Full Verification" — the 5 success criteria this phase must satisfy.

### Prior-phase precedent docs
- `.planning/phases/13-product-inventory-migration/13-CONTEXT.md` — D-08 lossy-collapse-with-finding precedent (informs D-14-01's "no fabricated rows" reasoning), mapper/checkpoint pattern references.
- `.planning/phases/13.5-staff-authentication-model-correction/13.5-CONTEXT.md` — tenant-local-staff-first model; informs D-14-03's "credential/linkage gaps don't block sale fidelity" reasoning.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/dgfy-migration-runner/src/data/mappings.js`'s existing mapper functions (`product`, `inventory_movement`, `staff_account`, `location`, `terminal_identity`) are the direct pattern template for the new `pos_transaction`→`availment` and `pos_transaction_line`→`availment_item` mappers.
- `legacy_id_map` lookups for `staff_account`, `location`, `terminal_identity` — reuse directly for `cashier_id`/`location_id`/`terminal_id` resolution (D-14-02/D-14-03).
- `products.attributes`-style JSON-column precedent (Phase 12/13) — the pattern to follow for D-14-01's snapshot column.
- `availments.source_reference` (added Phase 9-adjacent, `20260714103000`) — the pattern to follow for SHM-04's line-item provenance columns.

### Established Patterns
- Mappers are pure functions with zero DB/SQL access; dry-run and apply both call the same mapper — new `pos_transaction`/`pos_transaction_line` mappers must follow the same shape.
- Checkpointing is per-`(run_scope, legacy_tenant_id, entity_type)` — `availment` and `availment_item` each need their own checkpoint rows, same as Phase 13's four new entity types.
- Lossy/unresolvable data gets a `finding` via `classifyMappingConflict()`/`MAPPING_REASON_CODES`, never a fabricated row or silent drop (Phase 13 D-08 precedent, reused here for D-14-02/D-14-03).

### Integration Points
- `product_id` FK resolution for `availment_items` depends on Phase 13's `legacy_id_map` (`item_id` → `product.id`) already being populated — this phase cannot run for a tenant until Phase 13/13.5 migration has completed for that tenant (ROADMAP Success Criterion 1's "migrated only for tenants where Product/Inventory migration has already completed").
- `OUT_OF_SCOPE_LEGACY_TABLES` in `mappings.js` currently lists `pos_transaction_lines` — this phase must remove it from that list as part of bringing the table in scope.

</code_context>

<specifics>
## Specific Ideas

No additional specific UI/behavior examples beyond the locked decisions above — this is a backend/data-migration phase with no user-facing surface, except for the `additional_fees` schema addition which anticipates (but does not build) a future live-checkout capability.

</specifics>

<deferred>
## Deferred Ideas

- **Live checkout write path for `availments.additional_fees`** — letting staff set/edit arbitrary fees (delivery, service, or other) at time of sale, including VAT/discount interaction and multi-fee support. This is a new capability for the POS Checkout domain (`apps/dgfy-api/src/modules/availments/usecases/availmentUseCases.js` and related checkout logic), not migration work. Phase 14 only adds the column and migrates legacy `delivery_fee`/`service_fee` data into it. Raised by the user while discussing payment/cash detail scope, prompted by discovering the new system has no live fee computation today (only a hardcoded `service_fee_amount: '0.0000'` placeholder in receipt printing).

### Reviewed Todos (not folded)
None — `todo.match-phase 14` returned zero matches.

</deferred>

---

*Phase: 14-Sales History Migration & Full Verification*
*Context gathered: 2026-07-15*

# Project Research Summary

**Project:** DGFY v2.1 Legacy Data Migration (Product/Inventory + Sales-History)
**Domain:** Legacy-to-new data migration engineering — product/inventory catalog + AI embeddings + POS sales-transaction history, single-tenant-at-a-time, "as if nothing happened" fidelity goal
**Researched:** 2026-07-14
**Confidence:** HIGH (stack, architecture, pitfalls all codebase-grounded) / MEDIUM-HIGH (features, general ETL best-practice claims are directional web corroboration only)

## Executive Summary

This milestone is not a greenfield migration project — it is an extension of a proven, already-shipped Phase 3 migration pattern (`apps/dgfy-migration-runner`: pure-function mappers, checkpoint/dry-run/apply/verify, `legacy_id_map`) into two new legacy table families: `items`/`item_folders`/`stock_movements`/8 satellite tables/`item_embeddings` → `products`/`product_folders`/`inventory_movements`/new `product_embeddings`, and `pos_transactions` → `availments` (with a new `source_system` provenance column). Zero new libraries, zero engine changes, and zero new architecture shape are required: MySQL 8.0 stays JSON-blob-plus-app-side-cosine-search for embeddings (no native `VECTOR` type until 9.0), and the target `products`/`product_folders`/`inventory_movements`/`availments` tables already exist (Phase 8/9) but are empty because `mappings.js`'s `OUT_OF_SCOPE_LEGACY_TABLES` blocklist and `legacySource.js`'s read scope both currently exclude these legacy sources.

The recommended approach is a two-wave build strictly following dependency order: Wave 0 (additive schema — `products` columns + `attributes` JSON, new `product_embeddings` table, a natural-key unique index on `inventory_movements`) → Wave 1 (catalog/inventory data path: folders → products → inventory_movements/embeddings) → re-rehearse and prove Wave 1 → Wave 2 (sales-history: `availments.source_system` column, then `pos_transactions` → `availments`, which has a real FK dependency on Wave 1's migrated products). This mirrors PROJECT.md's own phase framing (sales-history is "its own phase," sequenced after product/inventory) and the runner's actual constraint: `buildDryRunPlan()`/`runApplyTransformations()` are a single hard-coded per-tenant sequence, not a pluggable registry, so entity types must be added to both in lockstep.

The key risks are all fidelity risks in lossy N→M enum/schema collapses, not technical/library risks: legacy `items.category` (5 values) → `products.category` (3-value native ENUM, hard-fails on unmapped input, not soft-skips); `stock_movements.movement_type` (8 values) → `inventory_movements.movement_type` (5 values, with `loss_reason`/`weighted_average_cost` having no target column at all); multi-location stock/transfers having no location dimension in the new schema at all; a self-referential `product_composition` (BOM/recipe) table with zero settled decision; embeddings carrying no model-version provenance; and `pos_transactions` being a live, continuously-growing table with no watermark mechanism in the existing checkpoint pattern (which was only ever proven against small, largely-static Phase 3 tables). Every one of these is mitigable with the codebase's own existing idioms (frozen lookup tables + `classifyMappingConflict` findings, JSON snapshot columns already present, explicit out-of-scope declarations) — the risk is skipping the explicit-decision step and letting a mapping happen ad hoc.

## Key Findings

### Recommended Stack

No new libraries or engine changes. MySQL 8.0 (pinned), Sequelize `^6.37.8`, `mysql2` `^3.6.5`, and Umzug `^3.8.3` are all already sufficient — `JSON`/`TEXT` column types, additive `addColumn`/`createTable`, and upsert are already proven in this exact repo. The embeddings-storage pattern (JSON-stringified float array in a `JSON` column, app-side cosine similarity) is a direct port of `backend/src/services/embeddingService.js`'s already-production-proven approach, upgraded from `TEXT` to native `JSON` for free write-time validation.

**Core technologies:**
- MySQL 8.0 — no `VECTOR` type until 9.0 (an Innovation-track release, not LTS); native JSON storage is sufficient at this data scale (~23KB/vector, few hundred vectors/tenant)
- Sequelize `^6.37.8` + Umzug `^3.8.3` — additive, idempotent, `describeTable`-guarded migrations, same idiom as `20260714103000-add-availment-source-reference.cjs`
- `mappings.js` pure-function mapper pattern — zero I/O, `{operation, entity_type, target_payload, legacy_id_map_key, related_targets, findings}` contract, extend with 5 new exported functions, never edit the 7 existing ones

### Expected Features

**Must have (table stakes / MVP, v2.1):**
- ADR 0029 amendment removing `items`/`item_folders`/`stock_movements`/`pos_transactions` from `OUT_OF_SCOPE_LEGACY_TABLES` — hard blocker for everything else
- `products` schema extension (6 typed columns + `attributes` JSON), with the 1:1-vs-1:many satellite-table folding design documented before mapper code
- `item_folders` → `product_folders`, `items` → `products` (incl. 8 satellite tables folded into `attributes`), `stock_movements` → `inventory_movements` mappers
- Documented, reviewed 8→5 `movement_type` remapping decision, with findings for lossy collapses
- `item_embeddings` → new `product_embeddings` storage mapper (carry-over, same model/format, no re-embedding)
- `availments.source_system` additive column + `pos_transactions` → `availments` mapper (own phase, after Product/Inventory)
- Dry-run/apply/idempotency-retry/verify wiring for every new entity type; extended per-tenant verification (sum-by-type, not just row counts)
- Re-rehearsal against the disposable production-parity environment

**Should have (P2, cheap now / expensive later):**
- Line-item/movement-level `source_system` provenance tagging, not just header-level
- Human-readable per-tenant migration summary report
- Embedding-model metadata tagging on carried-over vectors

**Defer (v3+, explicitly out of scope):**
- Re-embedding through a newer model (separate AI-quality milestone)
- Raw-material-vs-finished-good distinction (deferred to unscoped IMS integration)
- FIFO batch/supplier/PO migration, live dual-write/CDC sync, full EAV schema — all explicitly rejected

### Architecture Approach

New mapper functions plug into the existing five-layer pipeline unchanged in shape: `legacySource.js` (new read functions, same tenant-scoped connection factory) → `mappings.js` (new pure-function mappers) → `dryRun.js`/`apply.js` (both must be extended in lockstep — no shared pluggable registry exists) → `verifyData.js` (new count + relationship checks) → new additive schema migration files. The `products`/`product_folders`/`inventory_movements`/`availments` tables already exist and are empty; only `product_embeddings` is genuinely new.

**Major components:**
1. `src/data/mappings.js` — add `mapLegacyItemFolderToProductFolder`, `mapLegacyItemToProduct`, `mapStockMovementToInventoryMovement`, `mapItemEmbeddingToEmbeddingRow`, and (Wave 2) `mapLegacyPosTransactionToAvailment`
2. `src/data/dryRun.js` + `src/data/apply.js` — extend the single hard-coded per-tenant sequence in lockstep: `product_folder → product → inventory_movement → product_embedding` (Wave 1), then `availment` (Wave 2, after products exist)
3. `src/migrations/schema/*.cjs` — additive-only: `products` ALTER, `product_embeddings` CREATE, `inventory_movements` natural-key index ALTER, `availments.source_system` ALTER (Wave 2, kept separate)
4. `src/data/verifyData.js` — extend with count and relationship checks (`products.folder_id`→`product_folders`, `inventory_movements.product_id`→`products`), reusing existing generic check functions

### Critical Pitfalls

1. **`products.category` ENUM collapse fails hard, not soft** — a native SQL ENUM with only 3 target values against 5 legacy values throws a raw MySQL truncation error mid-batch if unmapped. Prevention: frozen exhaustive lookup table + `CATEGORY_FALLBACK_APPLIED` finding on every fallback.
2. **`movement_type` 8→5 collapse silently conflates operationally distinct events**, and `loss_reason`/`weighted_average_cost` have no target column at all. Prevention: explicit frozen lookup table + fold detail into existing `before_snapshot`/`after_snapshot` JSON columns rather than discarding.
3. **Multi-location stock and inter-location transfers have no target in the new schema at all** (`products.stock_count` is a single scalar, no location dimension, no `transfer` movement type). Requires an explicit Key Decision in PROJECT.md before mapper code, not an implicit inference.
4. **`pos_transactions` is a live, continuously-growing table with no watermark mechanism** in the existing checkpoint pattern — without an explicit run-start watermark, dry-run/apply/verify race against a moving target and idempotent re-migration becomes non-reproducible.
5. **`attributes` JSON is many-to-one derived and must be fully recomputed-and-overwritten on every apply retry**, never read-modify-appended — the existing `legacy_id_map` idempotency guard protects entity identity, not nested JSON field growth.

## Implications for Roadmap

Based on combined research, the milestone naturally splits into 3 phases matching the dependency graph and PROJECT.md's own explicit phase framing.

### Phase 1: Scope Unblock + Schema Extension (Wave 0)
**Rationale:** Everything else is structurally blocked until the ADR amendment lands and target schema exists; this is pure additive DDL + governance, independently reviewable and low-risk.
**Delivers:** ADR 0029 amendment (remove `items`/`item_folders`/`stock_movements`/`pos_transactions` from `OUT_OF_SCOPE_LEGACY_TABLES`); `products` ALTER (6 typed columns + `attributes` JSON + `UNIQUE(business_id, sku_code)`); new `product_embeddings` CREATE; `inventory_movements` natural-key `UNIQUE(business_id, reference_type, reference_id)` index; `dgfyBusinessContract.js` updates.
**Addresses:** ADR amendment + schema-extension items from FEATURES.md P1 list.
**Avoids:** Pitfall 3 (no natural key for `products`/`inventory_movements` — closed here before any data path exists).

### Phase 2: Product/Inventory Migration (Wave 1)
**Rationale:** Depends on Phase 1's schema; must land and be re-rehearsed before Phase 3 because `availment_items.product_id` (if scoped) has a real FK dependency on migrated products existing in `legacy_id_map`.
**Delivers:** `item_folders`→`product_folders`, `items`→`products` (incl. 8 satellite tables folded into `attributes`, with the 1:1-vs-1:many shape decision made up front), `stock_movements`→`inventory_movements` (with the 8→5 remapping table designed as its own reviewed artifact before mapper code), `item_embeddings`→`product_embeddings` (with model-version metadata column, even if hardcoded). Extended verify (sum-by-type checks). Re-rehearsal against production-parity environment.
**Addresses:** FEATURES.md's full P1 catalog/inventory list.
**Avoids:** Pitfalls 1, 2, 3 (BOM), 5 (flat folder collisions), 6, 7, 10 — all flagged as "Product/Inventory Migration phase" in the pitfalls-to-phase mapping. Requires explicit design decisions (not implicit code) for multi-location stock and `product_composition` scope before mapper code is written.

### Phase 3: Sales-History Migration (Wave 2)
**Rationale:** Explicitly sequenced after Phase 2 per PROJECT.md ("its own phase"); has a hard FK dependency on migrated products if line items are in scope, and introduces genuinely new problems (live-growing table, dangling operational FKs) that Phase 3's small-table-oriented checkpoint pattern was never proven against.
**Delivers:** `availments.source_system` additive column; `pos_transactions`→`availments` mapper with an explicit per-field FK classification (resolvable / nulled-with-finding / opaque-snapshot) for `shift_id`/`terminal_id`/`fnb_check_id`/`fnb_table_id`; a persisted per-run watermark extending `dataState.js`'s checkpoint shape; extended verify + migration-map doc.
**Uses:** existing `legacy_id_map`/checkpoint mechanism, extended with a watermark field.
**Implements:** the `legacySource.js`/`mappings.js`/`dryRun.js`/`apply.js`/`verifyData.js` extension pattern from Phase 2, applied to a new entity type.
**Avoids:** Pitfalls 8 (no watermark → non-reproducible idempotent re-migration against a live table) and 9 (dangling operational FKs).

### Phase Ordering Rationale

- Schema must exist before any mapper can write to it (Phase 1 → Phase 2/3).
- Products must be migrated before sales-history line items can resolve their `product_id` FK (Phase 2 → Phase 3) — this is a real FK dependency, not just an organizational preference, and PROJECT.md already states this ordering explicitly.
- The runner's orchestration is a single hard-coded sequence per tenant (not independently pluggable pipelines), so Wave 1 and Wave 2 cannot be built in parallel even if team capacity allowed it — `dryRun.js`/`apply.js` would need conflicting simultaneous edits.
- Several critical pitfalls (category ENUM, movement-type collapse, multi-location stock, BOM/composition scope) require an explicit reviewed design decision *before* mapper code — these should be resolved in phase discussion/spec, not discovered mid-implementation, and are the primary reason Phase 2 needs a `--research-phase` / discuss-phase pass rather than jumping straight to planning.

### Research Flags

Phases likely needing deeper research or an explicit discuss-phase/spec pass during planning:
- **Phase 2 (Product/Inventory Migration):** highest research need — requires resolving the movement-type 8→5 mapping table, the multi-location stock-count derivation rule, and the `product_composition`/BOM scope decision, none of which are settled in PROJECT.md today. Needs its own short design pass before mapper code, per PITFALLS.md's explicit recommendation.
- **Phase 3 (Sales-History Migration):** needs research into watermark/checkpoint extension design (no existing precedent in this codebase for a continuously-growing source table) and the per-field FK classification for `pos_transactions`' ~15 FK-shaped fields. Also has one open scope question (`pos_transaction_lines`/`availment_items` in or out of scope) that changes whether this phase has a hard Phase-2 dependency at all.

Phases with standard patterns (skip deep research-phase, straightforward extension of proven idiom):
- **Phase 1 (Schema Extension):** mechanical, additive-only DDL following the exact `describeTable`-guarded pattern already used repeatedly in this repo; low ambiguity.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Corroborated against official MySQL reference manuals plus direct reads of already-shipped, production-proven code in this exact repo (`embeddingService.js`, existing migration files) |
| Features | MEDIUM-HIGH | Migration *pattern* (mappers/checkpoint/dry-run/apply/verify) is HIGH — proven in this repo's Phase 3. General ETL/embedding-drift best-practice claims are MEDIUM — cross-checked against a small number of web sources, not exhaustive |
| Architecture | HIGH | Every finding read directly from the current codebase (`apps/dgfy-migration-runner/src/**`, `schemaContracts/**`), not inferred from general patterns |
| Pitfalls | HIGH (codebase-grounded pitfalls) / LOW (general-ETL/embedding web corroboration) | Codebase-specific pitfalls (ENUM collisions, missing FK targets, checkpoint granularity) read directly from Sequelize models and migration files; general-pattern corroboration (offset pagination, embedding drift) is LOW-confidence web search only |

**Gaps to address during planning:**
1. Multi-location stock/transfer target design (Pitfall 2) — no non-lossy target exists in the new schema; needs an explicit Key Decision in PROJECT.md, not implicit code.
2. `product_composition` (BOM/recipe) in-scope/out-of-scope decision (Pitfall 4) — currently undecided anywhere in settled decisions; silence risks undetected data loss.
3. Whether `pos_transaction_lines`→`availment_items` is in scope for Phase 3 (Open Question 1 in ARCHITECTURE.md) — changes whether Phase 3 has a hard FK dependency on Phase 2 at all.
4. `item_location_stocks` mapping target (Open Question 2) — informs either `products.stock_count` or an opening-balance `inventory_movements` row; not a pure architecture-layer call.
5. `product_embeddings` cardinality — one row per product, or per product-per-model-version (affects the recommended unique constraint shape).
6. Voided `pos_transactions` (`status = 'voided'`) — whether these migrate into `availments` with a void marker or are excluded needs to be an explicit, documented decision.

## Sources

Aggregated from all four research files — primarily direct codebase reads (`apps/dgfy-migration-runner/src/**`, `backend/src/models/*.js` read-only reference, `.planning/PROJECT.md`, existing schema migration files), corroborated where noted against official MySQL 8.0/9.0/9.7 reference-manual pages and a small set of MEDIUM/LOW-confidence web sources on embedding-model versioning/drift and general ETL/pagination best practices. See individual STACK.md, FEATURES.md, ARCHITECTURE.md, and PITFALLS.md files for full source lists.

---
*Research synthesized for: DGFY v2.1 Legacy Data Migration milestone*
*Synthesized: 2026-07-14*

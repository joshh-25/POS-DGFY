# Phase 12: Scope Unblock + Schema Extension - Context

**Gathered:** 2026-07-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Removes the ADR-level and schema-level blockers preventing any legacy `items`/`item_folders`/`stock_movements`/`pos_transactions` mapper from being written, and creates the extended target schema — verified — before any mapper code starts. This phase is ADR text + additive schema migrations only (`apps/dgfy-migration-runner`'s scope-check code + `dgfy_business_*` migrations). No mapper code, no legacy `backend/` writes. Actual item→product/inventory data migration is Phase 13's job.

**Satisfies:** LDM-01, LDM-02, LDM-03, LDM-04 (LDM-05 is explicitly sequenced with Phase 14 per its own requirement text, not this phase).

</domain>

<decisions>
## Implementation Decisions

### Satellite-Table Folding & BOM Scope
- **D-01:** `product_composition`/BOM data IS in scope for migration (already locked by PIM-02's requirement text) — the open question was only about representation shape, now resolved.
- **D-02:** `attributes.composition` entries resolve their ingredient to the ingredient's migrated `products.id` via `legacy_id_map` (not a self-contained name/quantity snapshot). A composition entry whose ingredient hasn't migrated yet gets a `finding` logged — Phase 13's mapper/dependency-ordering concern, not this phase's schema concern.
- **D-03:** The 8 satellite tables (nutrition, allergens, physical properties, shelf life, packaging, QC, regulatory compliance, cost breakdown) plus composition/barcodes fold into `products.attributes` JSON **namespaced by domain** — one key per legacy satellite table (e.g. `attributes.nutrition`, `attributes.allergens`, `attributes.physicalProperties`, `attributes.compliance`, `attributes.costBreakdown`, `attributes.composition`, `attributes.barcodes`). Rejected: a flat merged object (field-name collision risk, harder to trace provenance).
- **D-04:** When a legacy item has no row in a given satellite table, the mapper **omits that key entirely** from `attributes` rather than including it as `null`/`{}`. "Key present" unambiguously means "legacy had this satellite row."

### `products` Typed Columns
- **D-05:** `sku_code` gets **no uniqueness constraint** — matches legacy `items.sku_code` exactly (plain index, `unique: false`, duplicates allowed). Legacy already permits duplicate SKUs; this phase doesn't tighten that behavior.
- **D-06:** `cost_per_unit` is `DECIMAL(14,4)` — matches the existing `products.base_price` convention (Phase 8), not legacy's narrower `DECIMAL(10,4)`. Strict superset of legacy's range, no precision loss, keeps all money-shaped columns on `products` consistent.
- **D-07:** `vat_type` is `ENUM('vatable', 'vat_exempt', 'zero_rated')`, `defaultValue: 'vatable'`, `allowNull: false` — reuses legacy's `items.vat_type` enum verbatim. No `vat_type` concept exists anywhere in `dgfy-api` yet; this is genuinely new ground for the target schema, and legacy's 3-value BIR-aligned enum is the correct starting point (1:1 mapping, no lossy collapse).
- **D-08:** `senior_pwd_discount_eligible` (BOOLEAN), `description` (TEXT), `unit_of_measure` (STRING) port directly from legacy's identically-named/typed columns — no open questions raised on these.

### `product_embeddings`
- **D-09:** One row per product, **unique `product_id`** — matches legacy `item_embeddings`' existing strict 1:1 shape (legacy has never had more than one embedding per item, no model-version field exists there today). No per-model-version dimension added now: PIM-06 requires vectors to carry over as-is with no re-embedding, and EMB-01 (embedding-model metadata tagging — the only reason a version dimension would matter) is already deferred to v2.x.

### `inventory_movements` Natural Key
- **D-10:** The natural-key unique index is `(business_id, reference_type, reference_id)` per LDM-04. Existing Phase 8/9 organic movements (restock/loss/adjustment) are **left untouched** — they never populate `reference_type`/`reference_id` today (confirmed: not referenced anywhere in `inventoryMovementUseCases.js`), and MySQL's unique index treats NULL tuples as distinct, so no collision risk and no retrofit needed. Migrated rows populate `reference_type='stock_movement'` / `reference_id=<legacy stock_movements.id>` and get idempotency protection; this phase does not touch Phase 8/9 application code.

### ADR 0029 Amendment Scope
- **D-11:** Amend **both** ADR 0029 and `docs/database/dgfy-data-migration-map.md` Section 10 ("Explicit Exclusions") — Section 10 explicitly states it mirrors `OUT_OF_SCOPE_LEGACY_TABLES`, so leaving it unedited after the ADR amendment would create an immediately-stale doc. Move `items`, `item_folders`, `stock_movements`, `pos_transactions` out of the exclusion list/array in both docs plus `apps/dgfy-migration-runner/src/data/mappings.js`'s `OUT_OF_SCOPE_LEGACY_TABLES`, noting they're now covered starting Phase 13.
- **Note for planning:** `item_folders` is named by LDM-01 but is **not actually present** in the current `OUT_OF_SCOPE_LEGACY_TABLES` array (verified via direct read of `mappings.js`) — confirm during planning whether this is a stale requirement reference or whether `item_folders` is gated some other way before treating its "removal" as a no-op.

### Claude's Discretion
- Exact migration file naming/wave sequencing for the additive schema changes.
- `product_embeddings` vector storage column type/format (legacy stores JSON-stringified float array in `TEXT`) — no existing embedding infra in `dgfy-api` to match against; default to porting the same TEXT-JSON-string shape unless research finds a reason not to.
- Whether/how to add a traceability pointer back to the legacy `embedding_id` on `product_embeddings` rows.

### Folded Todos
- **"Wrap compliance verification and state writes in one transaction"** (`.planning/todos/pending/2026-07-13-wrap-compliance-verification-and-state-writes-in-one-transac.md`) — user explicitly chose to fold this into Phase 12 scope despite it being outside the phase's ADR/schema domain (touches `apps/dgfy-api/src/modules/compliance/usecases/complianceUseCases.js:307-320` and `complianceModeStateRepository.js`, not migration-runner code). Problem: `complianceUseCases.js` calls `recordVerification` and `upsertState` as two independent, non-transactional writes — a crash/race between them can leave a compliance review recorded without `compliance_mode_state.state` actually demoted (or vice versa). Solution already scoped in the todo: add a single `recordVerificationAndState()` repository method wrapping both writes in one `sequelize.transaction()` with a row lock, mirroring the pattern in `apps/dgfy-api/src/modules/shifts/repositories/shiftRepository.js` (used for Phase 8's CR-02/CR-03 lock-race fixes). Marked in STATE.md as "required before the milestone ships, not closed by any planned future phase" — planning should treat this as an additional, separately-scoped plan/wave within Phase 12, not blended into the schema-extension work.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & Requirements
- `.planning/ROADMAP.md` §"Phase 12: Scope Unblock + Schema Extension" — goal, dependencies, success criteria (lines 428-440).
- `.planning/REQUIREMENTS.md` §"v2.1 Requirements" → "Legacy Migration Scope & Schema Extension" (LDM-01..LDM-04) — the requirement text this phase satisfies.
- `.planning/PROJECT.md` §"Current Milestone: v2.1 Legacy Data Migration" — milestone framing, deferred raw-material-vs-finished-good distinction.

### ADR & Migration-Scope Contract
- `docs/architecture/adr/0029-catalog-inventory-pos-storefront-ownership-boundaries.md` — the ADR LDM-01 amends; currently states `items`/`stock_movements`/`pos_transactions` stay unchanged/excluded "in this phase" (needs updating to reflect this milestone unblocking them).
- `apps/dgfy-migration-runner/src/data/mappings.js` — exports `OUT_OF_SCOPE_LEGACY_TABLES` (the actual enforcement array; `item_folders` is named by LDM-01 but not currently present in this array — verify during planning) and `classifyOutOfScopeRecord()`.
- `docs/database/dgfy-data-migration-map.md` §10 "Explicit Exclusions (ADR 0029)" (lines 268-280) — mirrors `OUT_OF_SCOPE_LEGACY_TABLES`; must be amended alongside the ADR per D-11.

### Existing Target Schema (Phase 8/9 — what this phase extends)
- `apps/dgfy-api/src/models/Tenant/Product.js` — current `products` model (category ENUM, inventory_mode, stock_count, base_price; no `attributes` JSON yet) that the 6 typed columns + `attributes` column extend.
- `apps/dgfy-api/src/models/Tenant/InventoryMovement.js` — current `inventory_movements` model (append-only, DB-level trigger backstop) that LDM-04's natural-key index extends.
- `apps/dgfy-migration-runner/src/migrations/schema/20260712100000-create-commerce-foundation.cjs` — the original Phase 8 migration these schema extensions must follow as additive migrations against.

### Legacy Source Schema (what the 6 typed columns + satellites port from)
- `backend/src/models/Item.js` — legacy `items` table; `sku_code`, `description`, `unit_of_measure`, `cost_per_unit`, `vat_type`, `senior_pwd_discount_eligible` are already identically named/typed here (lines 10-111).
- `backend/src/models/ItemEmbedding.js` — legacy `item_embeddings` table (strict 1:1 via `unique: true` on `item_id`, vector stored as JSON-stringified-float-array `TEXT`).
- `backend/src/models/index.js` (lines 242-260) — `Item.hasOne`/`hasMany` associations enumerating the satellite tables (`ItemNutrition`, `ItemAllergen`, `ItemPhysicalProperties`, `ItemShelfLife`, `ItemPackaging`, `ItemQualityControl`, `ItemRegulatoryCompliance`, `ItemCostBreakdown`, `ProductComposition`, `ItemBarcode`, `ItemLocationStock`) that fold into `attributes` JSON per D-03.

### Folded Todo
- `.planning/todos/pending/2026-07-13-wrap-compliance-verification-and-state-writes-in-one-transac.md` — full problem/solution detail for the folded compliance-transaction todo (D-Folded above).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/dgfy-api/src/models/Tenant/InventoryMovement.js`'s existing JSON columns (`before_snapshot`/`after_snapshot`) — established precedent for `DataTypes.JSON` on `dgfy_business_*` tables; the new `products.attributes` column follows the same pattern (also used by `Availment.js`, `ComplianceEvidence.js`, `ComplianceModeState.js`, `Receipt.js`).
- `apps/dgfy-api/src/modules/shifts/repositories/shiftRepository.js` — the transaction+row-lock pattern to mirror for the folded compliance-todo's `recordVerificationAndState()` method (already used for Phase 8's CR-02/CR-03 fixes).

### Established Patterns
- Additive-migration-only discipline (no `sync({ alter: true })`) — every prior phase's schema work (Phase 2, Phase 8) followed this; this phase's `products`/`inventory_movements`/`product_embeddings` changes must too.
- Cross-database FK convention: fields pointing at `dgfy_core` (e.g. `business_id`) are opaque `CHAR(36)` UUIDs, never real SQL foreign keys, since `dgfy_core` and `dgfy_business_*` are separate databases.

### Integration Points
- `apps/dgfy-migration-runner`'s schema-migration command applies the additive migrations to `dgfy_business_*`; its verification command (already extended through Phase 6) must be able to confirm the new columns/table/index exist per ROADMAP success criteria #2-4.
- `mappings.js`'s `isInScope()` gate (currently checks `OUT_OF_SCOPE_LEGACY_TABLES`) is the literal code path LDM-01 unblocks — every future mapper calls through this.

</code_context>

<specifics>
## Specific Ideas

No specific UI/UX ideas — this is a schema-and-ADR-only phase. The concrete decisions are captured above (namespaced JSON attributes, matched-to-legacy typed columns, 1:1 embeddings, untouched organic inventory_movements, dual ADR+migration-map amendment).

</specifics>

<deferred>
## Deferred Ideas

None raised beyond the folded todo (which was explicitly pulled *into* scope, not deferred).

### Reviewed Todos (not folded)
None — the only matched todo was folded in (see Decisions § Folded Todos).

</deferred>

---

*Phase: 12-Scope Unblock + Schema Extension*
*Context gathered: 2026-07-14*

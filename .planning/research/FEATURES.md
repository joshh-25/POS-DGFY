# Feature Research

**Domain:** Legacy-to-new data migration engineering — product/inventory catalog + AI embeddings + POS sales-transaction history, single-tenant-at-a-time, "as if nothing happened" fidelity goal
**Researched:** 2026-07-14
**Confidence:** MEDIUM-HIGH — the migration *pattern* (mappers, checkpoints, dry-run/apply/verify) is HIGH confidence because it's already proven and code-grounded in this exact repo (Phase 3); the *general ETL/embeddings-migration best-practice* claims are MEDIUM confidence, cross-checked against a small number of current web sources, not exhaustively verified against a large corpus — treat as directional, not authoritative, for anything not already grounded in this codebase.

## Milestone Note

This supersedes the prior `.planning/research/FEATURES.md` (v2.0 Commerce Domain, researched 2026-07-12), which covered *building* the products/product_folders/inventory_movements and availments/payments/receipts schemas fresh, empty of real data. This research covers the current v2.1 Legacy Data Migration milestone: *populating* those already-built, already-proven-empty schemas from real legacy data — `items`/`item_folders`/`stock_movements`/satellite tables/`item_embeddings` → `products`/`product_folders`/`inventory_movements`/embeddings storage, and `pos_transactions` → `availments` with a new `source_system` provenance field. No new API surface, no new frontend — this is exclusively migration-runner mapper/schema work following the proven Phase 3 pattern.

## Grounding note: this is not a greenfield ETL problem

DGFY already has a working, tested, code-reviewed answer to "what does a legacy-to-new migration look like here" — Phase 3's `apps/dgfy-migration-runner/src/data/mappings.js`, `dryRun.js`, `apply.js`, `verifyData.js`, plus a durable checkpoint/ID-map mechanism, applied to Accounts/Businesses/Tenancy. Every "table stakes" item below is really "does the Phase 3 pattern already cover this, or does Product/Inventory/Sales-History data introduce a genuinely new requirement the pattern hasn't had to handle yet." Two categories emerge:

- **Already solved by the existing pattern** (reuse as-is): pure-function mappers with zero I/O, structured `{operation, findings}` result shape, stable `reason_code` taxonomy, deterministic `legacy_id_map`, dry-run/apply/verify as three passes over the same mapper functions, idempotent re-run via checkpoint state.
- **Genuinely new for this milestone** (the pattern has never had to do this before): a JSON `attributes` folding-column design (Phase 3 only ever inserted flat typed columns), a currently-**excluded** legacy table set that must be *removed* from the exclusion list, sales-history volume at a different order of magnitude than accounts/tenants, and a brand-new `source_system` provenance field that Phase 3 never needed because it only ever migrated from one source.

## Feature Landscape

### Table Stakes (Users Expect These)

Features/behaviors any migration whose explicit goal is data fidelity ("as if nothing happened") cannot skip. "Users" here means both the business owner (whose sales history and stock must be intact) and DGFY's own operators (who must be able to trust and re-run the migration).

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Remove `items`/`item_folders`/`stock_movements`/`pos_transactions` from `OUT_OF_SCOPE_LEGACY_TABLES` | `apps/dgfy-migration-runner/src/data/mappings.js` currently hard-blocklists exactly these tables (ADR 0029, Phase 3 explicit exclusion) — the milestone cannot begin until this list and its governing ADR are updated | LOW | Mechanical but load-bearing: `isInScopeLegacyTable()` and `classifyOutOfScopeRecord()` gate every mapper call; leaving the old list in place means new mappers silently never fire. Must be a deliberate, documented decision (new ADR or ADR 0029 amendment), not a quiet edit. |
| Field-level type coercion (DECIMAL precision, ENUM domain, nullable-vs-required) | Legacy `items.current_stock`/`cost_per_unit` are `DECIMAL(24,12)`/`DECIMAL(10,4)`; target `products.stock_count`/`base_price` are `DECIMAL(24,12)`/`DECIMAL(14,4)` — different precision/scale on the money column, and `items` has no direct `base_price` (legacy uses `default_sale_price`, a "last-used" price, not a set price) | MEDIUM | Every mapper must make an explicit, documented decision per field, not just copy-cast. `default_sale_price` → `base_price` is a genuine semantic gap (legacy field is derived/last-used; target field is presented as authoritative) that needs a stated fallback rule (e.g., null if never sold, explicit finding raised). |
| Category/enum remapping with an explicit, auditable mapping table | Legacy `items.category` has 5 raw-material-centric values (`raw_material`, `packaging`, `product`, `supplies`, `service`); target `products.category` has 3 values (`food`, `service`, `retail`). Legacy `stock_movements.movement_type` has 8 values (`production_consumption`, `purchase_receipt`, `return`, `transfer`, `calculated_loss`, `adjustment`, `production_output`, `goods_issue`); target `inventory_movements.movement_type` has only 5 (`restock`, `loss`, `adjustment`, `sale`, `booking`), and `sale`/`booking` are explicitly documented as reserved/unwired stubs no existing usecase writes to | HIGH | This is the single highest-risk mapping in the milestone. A naive collapse (e.g., `purchase_receipt`→`restock`, everything else→`adjustment`) silently destroys movement-type fidelity, which directly contradicts the "as if nothing happened" goal for inventory history. PROJECT.md's own decision — "legacy `category` treated as generic sellable products for migration purposes, raw-material-vs-finished-good distinction deferred" — is the right MVP cut for `products.category`, but `stock_movements.movement_type` has no equivalent stated decision yet and needs one before mapping starts. Recommend: define the 8→5 (or 8→N, if the enum needs extending) mapping explicitly in a migration-map doc (mirroring `docs/database/dgfy-data-migration-map.md`'s existing "Operation and severity taxonomy" pattern) before writing the mapper, and raise a `finding` for any legacy movement type that doesn't have a lossless target equivalent. |
| Orphan/FK handling via the existing `findings[]` + `skip`/`conflict` taxonomy | Legacy `items.folder_id` can reference a missing/soft-deleted `item_folders` row; `stock_movements.item_id` can reference an item that failed to migrate; `item_embeddings.item_id` requires the parent item to already have a mapped `legacy_id_map` entry | LOW-MEDIUM | Directly reuses the existing `MAPPING_REASON_CODES` pattern (`LOCATION_NOT_MAPPED` is the closest existing precedent — same shape needed for `PRODUCT_FOLDER_NOT_MAPPED`, `PRODUCT_NOT_MAPPED` for orphaned stock movements/embeddings). No new mechanism required, only new reason codes and new call sites. Migration order matters: `item_folders` before `items` before `stock_movements`/`item_embeddings`, exactly mirroring the existing "migrate locations before terminal identities" ordering constraint already documented in `mappings.js`. |
| Provenance/source tracking via a new `source_system` field on `availments` | PROJECT.md explicitly scopes this: `pos_transactions` → `availments` with a new `source_system` provenance field. No current Availment row has any such field — Phase 9's Availment schema was built assuming all availments originate from the new DGFY checkout flow | MEDIUM | Requires an additive migration on `dgfy_business_*.availments` (new nullable-with-default column, e.g. `source_system ENUM('dgfy_native','legacy_migration')` defaulting to `dgfy_native` for non-migrated rows) plus every migrated row explicitly tagged `legacy_migration`. This is the single field that makes "as if nothing happened" honest rather than deceptive — it lets the business (and DGFY support) distinguish "this sale really happened in the new system" from "this sale is carried-over history," which matters for any future reconciliation, refund, or audit question. Should also carry the legacy `pos_transaction_id`/`invoice_number` for traceability, not just a boolean/enum flag — reuse the existing `legacy_id_map_key` pattern rather than inventing a second provenance mechanism. |
| Idempotent re-migration via the existing checkpoint/dry-run/apply/verify passes | Every one of Phase 3's success criteria (dry-run, apply, idempotency-retry, verify) is a hard requirement PROJECT.md re-states for this milestone ("proven via re-rehearsal") — a migration that can't be safely re-run after a partial failure is not production-usable for a live cutover | MEDIUM | Directly reuses `apply.js`'s checkpoint mechanism and `legacy_id_map` deterministic-ID pattern — this is the strongest "already solved" item in the whole list. The only new work is wiring new entity types (`product`, `product_folder`, `inventory_movement`, `item_embedding`, `availment` from `pos_transactions`) into the existing checkpoint state machine, not building a new one. Watch for the append-only-table wrinkle: `inventory_movements` is append-only (BEFORE-triggers enforce no UPDATE/DELETE per the Phase 8 schema comment) — re-running apply on a partial failure must never attempt to re-insert already-migrated movement rows (would double stock history), so idempotency here means "skip if `legacy_id_map` entry exists," not "upsert." |
| Deterministic ID mapping (`legacy_id_map`) reused across all new entity types | Every downstream reference (`inventory_movements.product_id`, `availments` line items referencing migrated products) needs the *new* auto-increment ID, not the legacy one, and that mapping must be stable across dry-run/apply/retry | LOW | Zero new mechanism — this is exactly what `legacy_id_map_key` already does for accounts/tenants/locations. Straightforward extension, not a new design problem. |
| `attributes` JSON folding-column design for 8 satellite tables | PROJECT.md's target: 6 universal fields promoted to typed `products` columns (`sku_code`, `cost_per_unit`, `vat_type`, `senior_pwd_discount_eligible`, `description`, `unit_of_measure` — all already flat columns on legacy `items`, so this promotion is a direct copy, not a derivation), everything else category-specific folded into one `products.attributes` JSON column | MEDIUM-HIGH | The satellite tables are not uniform in cardinality: `ItemNutrition`/`ItemCostBreakdown`/`ItemPhysicalProperties`/`ItemShelfLife`/`ItemPackaging`/`ItemQualityControl`/`ItemRegulatoryCompliance` are 1:1 with an item (fold cleanly into flat sub-objects), but `ItemBarcode` is 1:many (an item can have multiple barcodes across different symbologies/scopes/packaging levels) — folding this into a single JSON column means the mapper must produce an *array* under `attributes.barcodes`, not a flat key. Get this shape decision documented before writing the mapper; a schema-shape decision made ad-hoc per satellite table risks an inconsistent `attributes` contract that's expensive to fix after real data has been migrated into it. |
| New embeddings storage table/column + carry-over migration | `item_embeddings` (AI vector search data) must migrate alongside products — no target schema for this exists yet anywhere in `apps/dgfy-api` or the migration-runner's schema migrations as of this milestone's start | LOW-MEDIUM | Legacy `item_embeddings.vector` is already stored as a `TEXT` column holding a JSON-stringified float array (not a native vector/BLOB type), so the migration is a straightforward carry-over: create the new table/column with the same storage shape, copy the string, remap `item_id`→`product_id` via `legacy_id_map`. Because it's a like-for-like copy of the exact same OpenAI-model-produced vectors (not a model upgrade), there's no embedding-space-drift problem to solve here (see embedding-drift research: incompatibility only arises when the *model* changes between old and new vectors — that's not the case here). Do still record the embedding model name/version as metadata alongside the vector (even if legacy didn't), since every reviewed embeddings-versioning source flags "no model metadata on stored vectors" as the single most common cause of undetectable future drift. |
| Pre/post-migration record-count and checksum verification, tenant-scoped | Phase 3's `verify.js` and the release-evidence tooling already do exactly this for Accounts/Businesses/Tenancy — extending it to Products/Inventory/Sales-History is what actually proves "as if nothing happened," not just "the migration ran without throwing" | MEDIUM | Reuse `verify.js`'s pattern directly. New verification surface needed: per-tenant product/folder/movement/embedding/availment counts matching source-minus-skipped-minus-orphaned, plus a spot-check on aggregate sums (e.g., total legacy `stock_movements` quantity by type vs. total migrated `inventory_movements` quantity by mapped type) — a pure row-count match can hide a category-remapping bug that a sum-by-type check would catch. |

### Differentiators (Genuine Value Beyond Minimum Fidelity)

Not required to hit "as if nothing happened," but meaningfully improve the migration's trustworthiness or the business's post-migration position, at acceptable cost given the sub-100-tenant scale.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| `source_system` provenance carried at the line-item/movement level too, not just on `availments` | Knowing "this whole sale was migrated" is table stakes; knowing "this specific inventory movement or availment line came from legacy `stock_movements` row #4821" is what makes a future dispute/audit/refund investigation actually resolvable, not just labeled | LOW-MEDIUM | Cheap to add now (the `legacy_id_map` mechanism already tracks this at the entity level) but expensive to retrofit after the fact once real tenant data has been migrated without it. Worth doing proactively given how small the marginal cost is on top of table-stakes provenance. |
| Aggregate historical-sales continuity check surfaced as a human-readable report, not just pass/fail verification | A business owner (or DGFY support fielding "where did my March sales go") benefits from a migration report that states, in plain terms, "347 of 350 legacy transactions migrated; 3 skipped (reason: X)" rather than a binary verify-pass | LOW-MEDIUM | Directly extends the existing `reports/` JSON+summary pattern already built for Phase 3's dry-run/apply/verify — no new reporting mechanism, just new report sections. High trust-building value for a milestone whose entire premise is "prove real tenants didn't lose their history." |
| Embedding-model metadata tagged on carry-over, even though legacy never had it | Sets up the *next* AI-search milestone (whenever DGFY next upgrades its embedding model) to know which vectors are safe to keep and which need re-embedding, without having to guess by creation date | LOW | Directly informed by embedding-versioning research: "every vector needs metadata: model name, version, creation timestamp, preprocessing config" is treated as a near-universal best practice across every source reviewed, precisely because its absence is what makes future drift silently undetectable. Cheap now, expensive to reconstruct later. |
| A dedicated, versioned "legacy movement-type mapping table" doc (8→N) as a first-class artifact, not an inline code comment | Makes the highest-risk mapping decision in the milestone (stock_movements category collapse) reviewable and auditable independent of reading mapper source, mirroring how `docs/database/dgfy-data-migration-map.md` already documents Phase 3's mapping rules | LOW | Matches the project's own established documentation pattern (the "Operation and severity taxonomy" section already exists for exactly this purpose); this milestone's version just needs a category-remapping table added to it or a sibling doc. |

### Anti-Features (Commonly Requested, Often Problematic For This Milestone)

Things that sound like they belong in a "genuinely required vs nice-to-have" migration but would blow the scope, timeline, or risk profile of a fidelity-focused, sub-100-tenant migration.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|------------------|-------------|
| Recomputing/re-deriving current stock levels from migrated movement history instead of carrying over `items.current_stock` directly | Feels "more correct" to derive stock from the ledger rather than trust a possibly-stale cached counter | Legacy `stock_movements` movement-type semantics don't map 1:1 onto the new 5-value enum (see Table Stakes); deriving a fresh stock count from a lossy re-categorized ledger risks producing a *different* stock number than what the business actually sees in their legacy system today — directly violating "as if nothing happened" | Carry over `items.current_stock` as the authoritative `products.stock_count` value directly (source of truth for "what does the business see today"); migrate `stock_movements` as history/audit trail, not as the thing stock_count is derived from during this migration |
| Re-embedding all products through the current/latest embedding model during migration | Feels like a natural "upgrade while we're at it" opportunity since the data is already being touched | Turns a data-fidelity migration into an AI-quality project with its own evaluation/regression-testing surface (does search quality change? does it need a golden-set comparison per the embedding-drift research?) — disproportionate scope for a milestone whose explicit goal is fidelity, not improvement, and risks conflating two failure modes (migration bugs vs. model-quality regressions) during rehearsal | Carry over `item_embeddings` vectors as-is (same model, same format, zero drift risk since nothing about the model changed); treat "should we re-embed with a newer model" as an explicit, separate, future AI-quality milestone with its own evaluation harness |
| Building a generic, fully-normalized EAV (entity-attribute-value) schema for the 8 satellite tables instead of one `attributes` JSON column | Feels more "proper" relationally, and avoids ever having to touch schema again for a new category-specific field | Directly contradicts PROJECT.md's explicit target design (one `attributes` JSON column) and reintroduces exactly the category-sprawl complexity (8 separate tables) this milestone is trying to collapse away; EAV also loses MySQL's native JSON querying/indexing ergonomics for no fidelity benefit at this data volume | Follow the already-decided `attributes` JSON design; if a specific attribute later needs to be queried/indexed heavily, promote just that one field to a typed column later — don't pre-build generality nobody asked for |
| Live dual-write / real-time sync keeping legacy `pos_transactions` and new `availments` continuously in lockstep during a migration window | Sounds safer than a point-in-time batch migration — "nothing is ever behind" | Massively increases complexity (bidirectional consistency, conflict resolution, ongoing operational burden) for a milestone whose own constraints already say legacy stays live and unmodified ("No legacy edits except approved seams") and whose commerce schemas are currently empty of real production traffic (sub-100 users, still pre-cutover) — there's no live traffic yet that needs dual-write continuity | Point-in-time batch migration (dry-run → apply → verify), re-run via idempotent checkpoint/re-rehearsal as needed, exactly as Phase 3 already proved for Accounts/Businesses/Tenancy — this milestone doesn't need a different migration *shape*, just new mappers |
| Attempting the raw-material-vs-finished-good product distinction as part of this migration | It's visible right there in the legacy `category` enum (`raw_material`, `packaging`, `product`, `supplies`) and might feel incomplete to gloss over | PROJECT.md explicitly defers this to a "future, not-yet-scoped DGFY↔IMS integration contract" — attempting it now means designing a contract that doesn't exist yet, blocking this milestone on undefined future integration work | Treat all in-scope legacy items as generic sellable `products` regardless of legacy category, exactly as already decided; let the future IMS-integration milestone own the raw-material distinction when that contract exists |
| Migrating `fifo_batches`/supplier/purchase-order-linked satellite data (batch-level FIFO cost tracking, `SupplierItem`, `POLineItem`) alongside the item catalog | These tables are adjacent to `items` in the legacy schema and touch cost/inventory, so it's tempting to fold them in "while we're here" | Explicitly out of scope per PROJECT.md ("Comprehensive Inventory / external IMS integration — contract not yet defined technically"); these are procurement/supply-chain concerns, not the Product/Inventory/Sales-History fidelity gap this milestone was scoped to close | Migrate only `items`/`item_folders`/`stock_movements`/the 8 listed satellite tables/`item_embeddings`/`pos_transactions`, exactly as PROJECT.md's target-features list states; leave FIFO batch/supplier/PO data as a future, separately-scoped IMS-integration concern |

## Feature Dependencies

```text
Existing foundation (v1.0/v2.0, already built and proven)
    Phase 3 migration pattern (mappings.js, dryRun/apply/verifyData.js, checkpoint, legacy_id_map)
        └──enables──> every new mapper in this milestone (same pattern, new entity types)
    Phase 8 products/product_folders/inventory_movements schema (empty of real data)
        └──is the target of──> Product/Inventory migration
    Phase 9 availments/payments/receipts schema (empty of real data)
        └──is the target of──> Sales-History migration

Remove items/item_folders/stock_movements/pos_transactions from OUT_OF_SCOPE_LEGACY_TABLES (ADR 0029 amendment)
    └──blocks──> every new mapper below (mappers can't fire against a still-blocklisted source table)

products schema extension (add `attributes` JSON column)
    └──requires──> a documented satellite-table folding design (1:1 vs 1:many shape decision)
    └──blocks──> item_folders → product_folders mapper (folders must exist before items reference them)
        └──blocks──> items → products mapper (6 universal fields + attributes JSON)
            └──blocks──> stock_movements → inventory_movements mapper (needs mapped product_id)
            └──blocks──> item_embeddings → new embeddings storage mapper (needs mapped product_id)

stock_movements → inventory_movements category-remapping decision (8 legacy types → 5 target types)
    └──must be resolved before──> stock_movements mapper is written (highest-risk mapping in milestone)

availments.source_system schema addition (new nullable column, additive migration)
    └──blocks──> pos_transactions → availments mapper (mapper needs the column to exist to tag rows)

pos_transactions → availments mapper
    └──requires──> products already migrated (availment line items reference product_id)
    └──requires──> availments.source_system column exists
    └──is its own phase per PROJECT.md──> sequenced after Product/Inventory migration, not parallel to it

Verification/reporting extension (per-tenant counts, sum-by-type checks, human-readable report)
    └──requires──> all new mappers to exist first (verify checks the output of apply)
    └──enhances──> re-rehearsal proof (PROJECT.md's stated validation mechanism)

Re-rehearsal against disposable production-parity environment
    └──requires──> all of the above (this is the milestone's stated proof mechanism, not a separate feature)
```

### Dependency Notes

- **The ADR 0029 amendment is a hard blocker, not a formality:** `isInScopeLegacyTable()` in `mappings.js` currently returns `false` for `items`, `item_folders`, `stock_movements`, and `pos_transactions` by name. New mappers targeting these tables will silently produce `classifyOutOfScopeRecord()` skip results until this list (and its governing ADR) is explicitly updated — this must be the first concrete change in the milestone, not something discovered mid-implementation.
- **`item_folders` must migrate before `items`, which must migrate before `stock_movements`/`item_embeddings`:** identical ordering constraint to the existing Phase 3 pattern (locations before terminal identities) — `folder_id`/`product_id` FK resolution requires the parent already have a `legacy_id_map` entry.
- **The `attributes` JSON folding design must be decided before the `items`→`products` mapper is written, not discovered while writing it:** because `ItemBarcode` is 1:many while the other 7 satellite tables are 1:1, an ad-hoc per-table decision risks an inconsistent `attributes` shape that's expensive to change after real tenant data is migrated into it.
- **The stock_movements category-remapping decision (8→5) is the highest-risk, most schedule-relevant dependency in the milestone:** it blocks the inventory movement mapper entirely, and getting it wrong directly contradicts the "as if nothing happened" goal — this deserves its own short design pass (a mapping table, reviewed, before code) rather than being resolved inline in the mapper.
- **`source_system` schema addition blocks the sales-history mapper, and is explicitly scoped as its own phase in PROJECT.md, sequenced after Product/Inventory:** `availments` line items reference `product_id`, so `pos_transactions`→`availments` cannot run correctly until products exist in the target schema — this is a real, not just organizational, dependency.
- **Verification/reporting extension depends on every other mapper existing:** it's the last piece to build, mirroring Phase 3's dry-run→apply→verify ordering, and directly enables the milestone's stated re-rehearsal proof mechanism rather than being a separate deliverable.

## MVP Definition

Given the milestone's explicit goal ("as if nothing happened," proven via re-rehearsal against a live production-parity environment with 26 real tenants), MVP here means complete fidelity for the in-scope tables, not partial coverage plus polish.

### Launch With (v2.1 — required for milestone completion)

- [ ] ADR 0029 amendment removing `items`/`item_folders`/`stock_movements`/`pos_transactions` from `OUT_OF_SCOPE_LEGACY_TABLES` — hard blocker for everything else
- [ ] `products` schema extension: 6 universal typed columns + `attributes` JSON column, with the 1:1-vs-1:many satellite-table folding design documented before mapper code is written
- [ ] `item_folders` → `product_folders` mapper (must land before the items mapper)
- [ ] `items` → `products` mapper, including all 8 satellite tables folded into `attributes`
- [ ] Documented, reviewed 8-legacy-type → 5-target-type `stock_movements`→`inventory_movements` category-remapping decision, with `findings` raised for any lossy collapse
- [ ] `stock_movements` → `inventory_movements` mapper, idempotency-safe against the append-only target table (skip-if-mapped, never re-insert)
- [ ] `item_embeddings` → new embeddings storage mapper (carry-over, same model/format, no re-embedding)
- [ ] `availments.source_system` additive schema column
- [ ] `pos_transactions` → `availments` mapper (its own phase, sequenced after Product/Inventory migration per PROJECT.md), tagging every migrated row `legacy_migration` and carrying the legacy transaction reference
- [ ] Dry-run / apply / idempotency-retry / verify for every new mapper, reusing the existing checkpoint and `legacy_id_map` mechanisms exactly as Phase 3 established
- [ ] Extended per-tenant verification: record counts + sum-by-type checks (not just row counts) for products, inventory movements, embeddings, and availments
- [ ] Re-rehearsal against the disposable production-parity environment, against real legacy data volume, per PROJECT.md's stated validation mechanism

### Add After Validation (v2.x)

- [ ] Line-item/movement-level `source_system`/legacy-reference tagging beyond the availment header (cheap now, but not required for "as if nothing happened" at the header level — add if support/audit workflows show it's needed)
- [ ] Human-readable, plain-language migration summary report per tenant (extends the existing JSON+summary report pattern; nice-to-have on top of the pass/fail verify output)
- [ ] Embedding-model metadata tagging (model name/version/timestamp) on carried-over vectors — doesn't block this migration's fidelity goal, but cheap to add now and expensive to reconstruct later

### Future Consideration (v3+, explicitly deferred)

- [ ] Re-embedding products through a newer/updated embedding model — separate AI-quality milestone with its own evaluation harness, not this migration's concern
- [ ] Raw-material-vs-finished-good product distinction — deferred to a not-yet-scoped DGFY↔IMS integration contract per PROJECT.md
- [ ] FIFO batch/supplier/purchase-order data migration (`fifo_batches`, `SupplierItem`, `POLineItem`) — Comprehensive Inventory/IMS integration, contract not yet defined, explicitly out of scope per PROJECT.md
- [ ] Live dual-write/real-time sync between legacy and new sales systems — no live traffic exists yet that needs it; point-in-time batch migration is the correct shape at this stage
- [ ] Full normalized EAV schema for item satellite data — explicitly rejected in favor of the already-decided `attributes` JSON design

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| ADR 0029 amendment (unblock in-scope tables) | HIGH (blocks everything) | LOW | P1 |
| `products.attributes` schema extension + folding design | HIGH | MEDIUM-HIGH | P1 |
| `item_folders` → `product_folders` mapper | HIGH | LOW | P1 |
| `items` → `products` mapper (incl. satellite folding) | HIGH | MEDIUM-HIGH | P1 |
| `stock_movements` category-remapping decision (8→5) | HIGH (fidelity risk) | MEDIUM | P1 |
| `stock_movements` → `inventory_movements` mapper | HIGH | MEDIUM-HIGH | P1 |
| `item_embeddings` → embeddings storage mapper (carry-over) | MEDIUM | LOW-MEDIUM | P1 |
| `availments.source_system` schema addition | HIGH | LOW | P1 |
| `pos_transactions` → `availments` mapper | HIGH | HIGH | P1 |
| Idempotent dry-run/apply/verify wiring for all new entity types | HIGH (proof requirement) | MEDIUM | P1 |
| Extended verification (sum-by-type, not just row counts) | HIGH (fidelity proof) | MEDIUM | P1 |
| Re-rehearsal against production-parity environment | HIGH (milestone's proof mechanism) | MEDIUM (infra already proven) | P1 |
| Line-item-level provenance tagging | MEDIUM | LOW-MEDIUM | P2 |
| Human-readable per-tenant migration report | MEDIUM | LOW-MEDIUM | P2 |
| Embedding-model metadata tagging | LOW (now) / HIGH (later, if skipped) | LOW | P2 |
| Re-embedding through newer model | LOW (at this stage) | HIGH | P3 |
| Raw-material-vs-finished-good distinction | LOW (at this stage) | HIGH | P3 |
| FIFO batch/supplier/PO migration | LOW (at this stage) | HIGH | P3 |
| Live dual-write/CDC sync | LOW (no live traffic yet) | HIGH | P3 |

**Priority key:**
- P1: Required for this milestone's stated goal (data fidelity, proven via re-rehearsal) — not shippable without these
- P2: Should have, cheap now / expensive later — add during this milestone if schedule allows, otherwise immediately after
- P3: Explicitly deferred per PROJECT.md's Out of Scope / Deferred sections — future milestone

## Migration Pattern Comparison

Not a competitor analysis in the traditional sense — this section compares standard data-migration *shapes* against what this milestone should (and already does) use, since DGFY already made this architectural choice in Phase 3 and this milestone should follow it, not re-litigate it.

| Pattern | Description | Fit for this milestone | Our Approach |
|---------|-------------|------------------------|--------------|
| Big-bang cutover (migrate everything in one pass, switch traffic immediately) | Common for small, low-risk datasets | Explicitly rejected at the project level — "Big-bang production cutover" is listed Out of Scope in PROJECT.md; full cutover requires rehearsals and abort thresholds | Not used |
| Continuous dual-write / CDC (keep legacy and new systems in sync in real time during a transition window) | Common when live traffic must never see a gap | Disproportionate here — legacy stays live and authoritative until cutover is separately scheduled (Phase 7, currently paused); no live new-system traffic exists yet that needs sync | Not used (see Anti-Features) |
| Point-in-time batch ETL with dry-run/apply/verify and idempotent checkpointing | Standard for one-time historical-data backfills where the source system keeps running unmodified | Exact fit — matches PROJECT.md's constraints (legacy stays live, no legacy edits, idempotency/dry-run/checkpoint required) and is already proven in this exact codebase for Accounts/Businesses/Tenancy | **This is the pattern** — extend Phase 3's mappers/dryRun/apply/verifyData to the new entity types, no new migration shape needed |
| Schema-on-read / EAV for heterogeneous category-specific attributes | Common when attribute sets are unbounded and unknown at design time | Attribute sets here are bounded and known (8 specific satellite tables); EAV would trade away MySQL JSON's simpler querying for generality nobody asked for | Rejected in favor of the already-decided single `attributes` JSON column (see Anti-Features) |
| Embedding re-generation on migration (re-embed through current model) | Common when a migration coincides with a model/version upgrade | Not applicable here — same model, same vector format, migrating within the same system, not upgrading — re-embedding research confirms drift risk only arises when the *model* changes | Carry-over copy, not regeneration (see Table Stakes / Anti-Features) |

## Sources

- `apps/dgfy-migration-runner/src/data/mappings.js` — existing Phase 3 mapper pattern, `OUT_OF_SCOPE_LEGACY_TABLES`, `MAPPING_REASON_CODES`, `legacy_id_map_key` mechanism (read in full, HIGH confidence — primary source, this exact codebase)
- `apps/dgfy-migration-runner/src/migrations/schema/20260712100000-create-commerce-foundation.cjs` — target `products`/`product_folders`/`inventory_movements` schema definitions, including the append-only trigger comment and `movement_type` enum (read in full, HIGH confidence)
- `apps/dgfy-migration-runner/src/migrations/schema/20260713120000-create-availment-checkout.cjs` (referenced via `apps/dgfy-api/src/models/Tenant/Availment.js`) — target `availments` schema, no existing `source_system` field (HIGH confidence)
- `backend/src/models/Item.js`, `StockMovement.js`, `PosTransaction.js`, `ItemEmbedding.js`, `ItemNutrition.js`, `ItemCostBreakdown.js`, `ItemBarcode.js` — legacy source schemas, field-by-field (read in full, HIGH confidence — primary source)
- `.planning/PROJECT.md` — v2.1 milestone scope, target features, deferred items, constraints (HIGH confidence — primary source)
- [About Vector Database: Handling updates to the embedding model (Version drift)](https://aboutvectordatabase.com/learn/handling-updates-to-embedding-model-version-drift/) — MEDIUM (single-search web source, directionally consistent with other results in the same search)
- [Mixpeek: Embedding Portability and Versioning](https://mixpeek.com/guides/embedding-portability-versioning) — MEDIUM (vendor guide, cross-consistent with other embedding-drift sources found in the same search)
- [TianPan.co: Embedding Models in Production — Selection, Versioning, and the Index Drift Problem](https://tianpan.co/blog/2026-04-09-embedding-models-production-versioning-index-drift) — MEDIUM (independent blog, corroborates "tag vectors with model metadata" recommendation)
- [Fivetran: The Ultimate Guide to Data Migration Best Practices](https://www.fivetran.com/learn/data-migration-guide) — LOW-MEDIUM (general ETL vendor content, used only for high-level framing, not for any specific claim above)
- [Datafold: Overcoming Legacy Data Migration Challenges with Confidence](https://www.datafold.com/blog/legacy-data-migration/) — LOW-MEDIUM (general ETL vendor content, used only for high-level framing)

---
*Feature research for: DGFY v2.1 Legacy Data Migration milestone (Product/Inventory + Sales-History data migration)*
*Researched: 2026-07-14*

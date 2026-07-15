# Pitfalls Research

**Domain:** Legacy product-catalog / inventory-movement / sales-transaction data migration into a live, already-shipped multi-tenant schema (DGFY v2.1)
**Researched:** 2026-07-14
**Confidence:** HIGH (codebase-grounded — Sequelize models, migration schema files, and the existing `mappings.js`/`dataState.js` pattern were read directly) with LOW-confidence general-ETL/embedding corroboration from web search where noted.

This research is scoped to the two concrete v2.1 target features: `items`/`item_folders`/`stock_movements`/satellite tables/`item_embeddings` → `products`/`product_folders`/`inventory_movements`, and `pos_transactions` → `availments`. It assumes and does not re-litigate the settled decisions in `.planning/PROJECT.md` (5-value legacy `category` → 3-value `products.category` treated as generic sellable products; simpler 5-type `inventory_movements` taxonomy accepted as sufficient).

## Critical Pitfalls

### Pitfall 1: Category ENUM collapse fails hard, not soft

**What goes wrong:**
`products.category` is a native SQL `ENUM('food','service','retail')` (see `20260712100000-create-commerce-foundation.cjs`), not a `VARCHAR`. Legacy `items.category` has 5 values (`raw_material`, `packaging`, `product`, `supplies`, `service`). If the mapper doesn't have an explicit, exhaustive lookup table covering all 5 (plus any value from an older schema version some of the 26 real tenant DBs might still carry — the legacy `category` enum was changed at least once historically via `UPDATE items SET category = 'supplies' WHERE category = 'service'`), an unmapped or unexpected value doesn't get skipped gracefully — it throws a raw MySQL `Data truncated for column 'category'` error mid-batch INSERT, potentially aborting an entire apply run partway through a tenant.

**Why it happens:**
The existing `mappings.js` pattern (accounts/businesses/memberships) mostly maps optional/free-text fields, so its authors haven't needed an ENUM-to-ENUM mapping with a **smaller** target set before. It's easy to write `category === 'product' ? 'retail' : 'food'`-style ad hoc logic that silently mishandles anything outside the two cases considered.

**How to avoid:**
Build a single frozen `ITEM_CATEGORY_TO_PRODUCT_CATEGORY` lookup object (mirroring the `TENANT_STATUS_MAP` / `BUSINESS_MEMBERSHIP_ROLE_MAP` pattern already used in `mappings.js`) that explicitly lists all 5 legacy values and their target, with a documented fallback (e.g. default to `retail` per the "generic sellable product" decision) plus a `classifyMappingConflict` finding (new reason code, e.g. `CATEGORY_FALLBACK_APPLIED`) whenever the fallback path is hit — so it's visible in the migration report, not just correct by accident.

**Warning signs:**
Dry-run report shows zero `category`-related findings across 26 tenants with real, years-old legacy data — that absence is itself suspicious; it usually means the fallback path was never exercised, or is exercised but not being logged as a finding.

**Phase to address:**
Product/Inventory Migration phase — must be closed before any `products` insert is attempted, since it can abort mid-batch.

---

### Pitfall 2: Multi-location stock and inter-location transfers have no target in the new schema

**What goes wrong:**
Legacy `item_location_stocks` tracks per-location `quantity_on_hand` (unique per `item_id`+`location_id`), and `stock_movements` has `source_location_id`/`destination_location_id` plus a `transfer` movement type. The new `products.stock_count` is a single scalar per product (no location dimension at all), and `inventory_movements` has no location column and no `transfer`-equivalent in its 5-value `movement_type` ENUM (`restock`, `loss`, `adjustment`, `sale`, `booking`). For any tenant with more than one location that actually used per-location stock or transfers, there is no non-lossy target — this is bigger than the accepted "simpler taxonomy" gap in the settled decision and needs an explicit resolution, not an implicit one.

**Why it happens:**
The settled decision ("`inventory_movements`' simpler taxonomy... is intentionally treated as sufficient") is about movement *type* richness, not about the *location* dimension disappearing entirely. It's easy to read that decision as covering this case too and skip designing for it.

**How to avoid:**
Decide explicitly (before mapper code is written) whether migrated `products.stock_count` is: (a) summed across all legacy locations, (b) taken from a single "primary" location, or (c) something else — and record it as a Key Decision in `.planning/PROJECT.md`, not just infer it in code. Whatever is chosen, `transfer` movements should still be migrated as two `adjustment` rows (or dropped with an explicit `classifyMappingConflict` finding) rather than silently vanishing, so the historical movement count/sum is auditable.

**Warning signs:**
Migrated `products.stock_count` doesn't match legacy `items.current_stock` (or the sum of `item_location_stocks.quantity_on_hand`) for multi-location tenants — this is a natural verification assertion to add, and its absence during rehearsal is a red flag.

**Phase to address:**
Product/Inventory Migration phase — needs a design decision before mapper code, and a verification check after.

---

### Pitfall 3: `movement_type` N→M collapse silently conflates operationally distinct events

**What goes wrong:**
Legacy `stock_movements.movement_type` has 8 values (`production_consumption`, `purchase_receipt`, `return`, `transfer`, `calculated_loss`, `adjustment`, `production_output`, `goods_issue`) mapping onto the new 5 (`restock`, `loss`, `adjustment`, `sale`, `booking`). A naive mapping (e.g. anything stock-increasing → `restock`) conflates `purchase_receipt` (bought from supplier) with `production_output` (manufactured in-house) with `return` (customer/supplier return) — three financially and operationally different events that a business owner would expect to distinguish in a stock history view. Additionally, `loss_reason` (`waste`/`spoilage`/`damage`/`pilferage`) and `weighted_average_cost` (a per-movement cost snapshot) have **no target column at all** in `inventory_movements` and will be dropped unless explicitly folded into `before_snapshot`/`after_snapshot` JSON.

**Why it happens:**
Same failure mode as Pitfall 1 but for a bigger enum — 8→5 has more room for an implicit "close enough" mapping that nobody actually enumerated field-by-field.

**How to avoid:**
Build an explicit frozen lookup table for all 8 legacy values (again mirroring the existing `mappings.js` pattern), and use `inventory_movements.before_snapshot`/`after_snapshot` (already JSON columns on that table) to carry `loss_reason` and `weighted_average_cost` forward rather than discarding them — those two columns exist specifically to hold point-in-time detail, so use them.

**Warning signs:**
Post-migration, a tenant's inventory history in the new UI shows a wall of undifferentiated `restock` entries where the legacy system showed `purchase_receipt`/`production_output`/`return` — a UAT reviewer familiar with the old POS will notice this immediately.

**Phase to address:**
Product/Inventory Migration phase.

---

### Pitfall 4: Recursive product composition (BOM) graph has no settled target and risks silent, undetected data loss

**What goes wrong:**
`ProductComposition` (`product_composition` table) is a self-referential graph: `product_id` → `ingredient_id` (both FKs into `items`), with `composition_type` (`ingredient`/`packaging`) and `quantity_required`. This "recipe"/BOM feature is not mentioned anywhere in the v2.1 settled decisions (which only cover `items`/`item_folders`/`stock_movements`/satellite tables/`item_embeddings`). If the migration team doesn't explicitly decide "composition is dropped" (and log it as a finding per legacy item, not silently), any tenant that used recipe/composition data loses it with zero migration-report trace — indistinguishable from a bug.

**Why it happens:**
"Satellite tables" in the settled-decisions language is vague enough that a developer might assume `product_composition` is either in-scope (and get surprised there's no non-lossy target since the new schema has no BOM concept) or out-of-scope (and never write a finding for it, so its omission is undocumented).

**How to avoid:**
Explicitly decide and document whether `product_composition` is out-of-scope for v2.1 (mirroring the `OUT_OF_SCOPE_LEGACY_TABLES` pattern already used for `pos_transactions` etc. in Phase 3's `mappings.js`, which correctly emits a `classifyOutOfScopeRecord` finding rather than silently ignoring it) or folded into `products.attributes` as an opaque, unqueryable snapshot. Either is defensible; silence is not.

**Warning signs:**
No `product_composition` rows appear anywhere in dry-run/apply output (as skipped, out-of-scope, or migrated) — meaning the mapper never even looked at the table.

**Phase to address:**
Product/Inventory Migration phase — this decision belongs in phase discussion/spec, before mapper code.

---

### Pitfall 5: Flat `product_folders` unique constraint collides with legacy folder structure

**What goes wrong:**
`product_folders` has a `unique(business_id, name)` constraint and is explicitly flat, no `parent_id` nesting (per the D-14 comment in `20260712100000-create-commerce-foundation.cjs`). If any tenant's legacy `item_folders` has nested folders, or simply two folders with the same display name in different contexts, squashing to a flat namespace produces a real constraint violation on `apply` (not a soft skip) — and which folder "wins" needs to be deterministic and reported, not whichever row happens to be processed first in iteration order.

**Why it happens:**
Nested-to-flat folder collapsing is an easy detail to overlook because it only breaks on data that has the collision — which may not appear in every tenant, so it can pass rehearsal against some tenants and then break on a tenant with real duplicate-name folders.

**How to avoid:**
Before writing to `product_folders`, dedupe/rename collisions deterministically (e.g. suffix disambiguation) and emit a `classifyMappingConflict` finding for every rename, so it's visible and correctable rather than a mystery constraint-violation stack trace during apply.

**Warning signs:**
An `apply` run against one of the 26 real tenants throws a duplicate-key error on `product_folders` that didn't appear in `dry-run` (dry-run typically doesn't hit unique constraints the same way apply's actual `INSERT` does) — this exact "dry-run doesn't fully predict apply" gap has already bitten this project once (the MySQL `addIndex` DDL bug found last session was only caught during a real apply-equivalent step).

**Phase to address:**
Product/Inventory Migration phase.

---

### Pitfall 6: `item_embeddings` carries no model-version provenance — migrating it verbatim seeds a future silent search-quality regression

**What goes wrong:**
`ItemEmbedding` stores only `item_id` and a raw `vector` (`TEXT`, JSON-stringified array, comment says "OpenAI 1536-dim vector") — there is no `model_name`, `model_version`, or `dimension` column at all. If these vectors are migrated verbatim into whatever new embeddings storage v2.1 builds, and DGFY's product/AI system later regenerates embeddings for new products using a different model (a near-certainty over the platform's life), cosine-similarity search will silently mix vectors from two different semantic spaces. This doesn't error — it just makes search results for migrated (old) vs. newly-created (new) products subtly, inconsistently wrong, which is extremely hard to diagnose after the fact because there's no data trail pointing at "this vector is stale/mismatched."

**Why it happens:**
The legacy schema was built for a single model era and never anticipated migration to a system that might rotate embedding models. Vector data "just works" in isolation, so its lack of provenance metadata isn't visible until two model generations coexist.

**How to avoid:**
Add a `model_version` (or `embedding_source`) column to the new embeddings storage as part of this migration — even if the value is a hardcoded constant like `"openai-text-embedding-<version>-migrated-2026"` for every migrated row. This makes future model-rotation logic (re-embed anything not matching the current model version) possible; without it, there's no way to even identify which rows need re-embedding later.

**Warning signs:**
New embeddings storage schema has no version/model column — check this explicitly during phase spec/design review, since its absence won't surface as a bug until much later (when a second model is introduced).

**Phase to address:**
Product/Inventory Migration phase (embeddings ride along with product migration per the settled decision).

---

### Pitfall 7: Embedding staleness is invisible without a content-hash or timestamp comparison

**What goes wrong:**
`item_embeddings.updated_at` (Sequelize `timestamps: true`) is independent of `items.updated_at` — nothing enforces that an embedding was regenerated after its item's `name`/`description`/`category` last changed. Migrating embeddings verbatim (as the settled decision implies — "`item_embeddings` migrated alongside product data") carries forward any staleness that already existed in the legacy system, and once migrated, there's no automatic signal that a given migrated embedding no longer matches its migrated product's current content.

**Why it happens:**
Staleness is a pre-existing legacy-system property, not something the migration introduces — but migration is the one moment where it's cheap to detect (both `items` and `item_embeddings` are being read together) and expensive to ignore (once split across systems, cross-referencing is harder).

**How to avoid:**
During dry-run, compare `item_embeddings.updated_at` against the source item's last content-affecting update timestamp and emit a `stale_embedding` finding (informational, not necessarily a skip) for anything where the embedding predates the item edit — giving the team a concrete, sized backlog of "regenerate these N embeddings post-migration" rather than an unknown unknown.

**Warning signs:**
No staleness check exists anywhere in the dry-run report structure — this needs to be designed in, since it doesn't come for free from the "migrate embeddings alongside products" requirement.

**Phase to address:**
Product/Inventory Migration phase.

---

### Pitfall 8: Idempotent re-migration of `pos_transactions` against a table that never stops growing

**What goes wrong:**
The legacy system stays live throughout this milestone (explicit project constraint: "legacy stays live until replacement paths prove parity"). `pos_transactions` is very likely the single highest-row-count table per tenant across all 26 real tenants (every sale, void, and refund is logged). Without an explicit snapshot boundary captured at the *start* of a run (e.g. `SELECT MAX(pos_transaction_id)` recorded once, then only processing rows `<= watermark` for that run), every rehearsal or real cutover attempt sees a different "current" state of the table — dry-run, apply, and verify are no longer looking at the same data if any wall-clock time passes between them while the POS keeps taking live sales. This defeats the whole point of the existing dry-run → apply → verify idempotency contract, and makes rehearsal results non-reproducible (a rerun looks like it "found new data" when it actually just raced ahead of a moving target).

**Why it happens:**
The existing Phase 3 migration (accounts/businesses/tenancy) targets much lower-volume, much lower-churn tables (a handful of accounts/tenants/memberships change per rehearsal window). Sales transactions accrue continuously and in volume, so the "read legacy, migrate, done" mental model that worked for Phase 3 breaks down for this data.

**How to avoid:**
Capture and persist a per-run watermark (max legacy `pos_transaction_id` or a timestamp cutoff) at the start of each migration run scope, store it alongside the existing checkpoint row (`dataState.js`'s `markDataCheckpoint` already has a `run_scope` concept to extend), and have dry-run/apply/verify all bound their queries to that watermark rather than "everything currently in the table." A real cutover run picks a final watermark at the actual cutover moment (with legacy writes stopped or redirected, per the existing cutover-rehearsal constraints).

**Warning signs:**
Re-running dry-run twice in a row against the same tenant (with no new sales in between) produces a different row count or different findings — a very concrete, cheap smoke test to add to rehearsal.

**Phase to address:**
Sales-History Migration phase — this is the phase where table growth-during-migration first becomes a real problem at this project's scale (Phase 3's tables don't have this property).

---

### Pitfall 9: `pos_transactions`' operational FKs (`shift_id`, `terminal_id`, `fnb_check_id`, `fnb_table_id`) have no established or only a partial migration target

**What goes wrong:**
`pos_transactions.cashier_id` can be resolved through the ID map already populated by Phase 3 (legacy tenant `users` → `staff_accounts`). But `shift_id` references `shifts`/`cashier_sessions` — tables the Phase 3 `mappings.js` explicitly lists as `OUT_OF_SCOPE_LEGACY_TABLES` (`shifts`, `cashier_sessions`, `terminal_sessions`), meaning no `legacy_id_map` rows exist for them and never will unless a new mapper is written. `terminal_id` on `pos_transactions` is a free-text `STRING(100)`, not an FK — it may or may not match the `terminal_code` values already migrated via `mapTerminalRegistryEntryToTerminalIdentity` in Phase 3 (that mapper reads from `system_settings.pos_terminal_registry`, a different source than whatever free-text value ended up on individual transactions historically). `fnb_check_id`/`fnb_table_id` (dine-in/restaurant mode) have no migration target discussed at all. Naively carrying these values forward as-is on `availments` creates dangling references that look like FKs but aren't validated against anything.

**Why it happens:**
The settled decision only names `pos_transactions` → `availments` with a `source_system` field — it doesn't enumerate `pos_transactions`' ~15 FK-shaped fields individually, so it's easy to assume "the row maps over" without auditing which referenced entities actually have (or lack) a target.

**How to avoid:**
Before writing the `pos_transactions` → `availments` mapper, explicitly classify every FK-shaped field on `pos_transactions` into "resolvable via existing legacy_id_map" (e.g. `cashier_id`), "no target — null it out with a finding" (e.g. `shift_id`), or "carry forward as opaque snapshot text, not a live reference" (e.g. `terminal_id`, `fnb_table_label_snapshot`-style fields already do this correctly in the legacy schema itself — reuse that snapshot pattern rather than inventing new FK columns).

**Warning signs:**
Migrated `availments` rows have populated `shift_id`/`terminal_id`-equivalent columns that don't resolve to anything in the new schema, and nothing in the migration report flagged this as an intentional decision.

**Phase to address:**
Sales-History Migration phase.

---

### Pitfall 10: `attributes` JSON blob is many-to-one derived — retried `apply` must fully recompute it, never append to it

**What goes wrong:**
The planned `products.attributes` JSON column is meant to absorb everything category-specific: `packaging_specs` (JSON), `wizard_metadata` (JSON), `product_composition` rows (if not dropped per Pitfall 4), and possibly per-location `item_location_stocks` detail (per Pitfall 2's resolution). All of these are **many-to-one** relative to a single `items` row — several satellite rows feed into one `attributes` blob. The existing idempotency primitive in `dataState.js` (`recordLegacyIdMap`) is a clean "look up before insert, one row maps to one row" pattern that works perfectly for `mappings.js`'s existing 1:1 entity mappers. It does not, by itself, protect against a **retried apply re-deriving the same JSON blob and appending to an array field inside it** (e.g. a `composition` array inside `attributes` growing to double length on a second apply run for the same product) — because the idempotency guard is keyed on "does a target row exist," not on "is this specific nested JSON field already populated."

**Why it happens:**
The project's idempotency pattern was designed and proven against simple scalar-column entities (Phase 3). JSON-column aggregation from multiple satellite sources is a new shape of problem this pattern hasn't been exercised against yet.

**How to avoid:**
Treat `attributes` construction as a pure function of "all currently-known satellite rows for this item" and always **fully replace** the column value on every apply run (recompute-and-overwrite, not read-modify-append), the same way the existing `mappings.js` mapper functions are documented as pure, side-effect-free transforms. Never structure the mapper as "fetch existing `attributes`, merge in new data" — that read-modify-write shape is exactly what breaks idempotent retries.

**Warning signs:**
Running `apply` twice in a row against the same tenant produces a different (larger) `attributes` payload the second time for any product — this is a concrete, cheap regression test to add (mirroring the "idempotent reruns" verification already proven in Phase 2/Phase 3).

**Phase to address:**
Product/Inventory Migration phase.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|-----------------|------------------|
| Fold `loss_reason`/`weighted_average_cost`/composition/per-location detail into `attributes`/`before_snapshot`/`after_snapshot` JSON instead of typed columns | Ships faster, matches "attributes JSON for everything category-specific" decision | Unqueryable at scale without deliberately promoting fields to MySQL generated columns (see Sources) — reporting/analytics features later need real SQL work to unlock this data again | Acceptable for v2.1 if the specific fields are genuinely long-tail and not needed for near-term reporting; not acceptable for fields the roadmap already knows will need filtering/sorting soon (e.g. category-derived facets) |
| Hardcode a single embedding `model_version` constant for all migrated rows instead of inspecting actual generation metadata | No new metadata to infer or backfill | If the legacy system silently changed embedding models at some point in its history (undetectable from the stored data itself), some migrated rows get a wrong/misleading version tag | Acceptable only if a spot-check confirms the legacy system only ever used one embedding model in production — verify before assuming |
| Skip `product_composition`/multi-location stock migration entirely for v2.1, defer to a later milestone | Matches "already-settled, don't re-litigate" instinct and unblocks the rest of the migration faster | Silent feature loss for tenants that relied on recipes or multi-branch stock — support burden later when a vendor asks "where did my recipe go" | Acceptable only if explicitly decided and logged as an out-of-scope finding per Pitfall 4/2 — never acceptable as an undocumented gap |
| Use offset-based `LIMIT`/`OFFSET` pagination for large `pos_transactions` batches instead of cursor-based | Simpler to write first | Skipped/duplicated rows against a live, actively-written table (see Sources) — directly undermines the idempotent re-migration goal this milestone is validating | Never acceptable for `pos_transactions`/`stock_movements` given they're read from a live production table during rehearsal and cutover; acceptable for one-shot bounded reads of small, mostly-static tables like `item_folders` |

## Integration Gotchas

Common mistakes integrating with the *existing* checkpoint/idempotent-retry pattern (`dataState.js`, `mappings.js`) when extending it to these new entities.

| Integration Point | Common Mistake | Correct Approach |
|--------------------|-----------------|-------------------|
| `legacy_id_map` (`recordLegacyIdMap`) | Assuming it protects many-to-one JSON aggregation (Pitfall 10) the same way it protects 1:1 entity inserts | Use it only for the entity-identity mapping (e.g. `items.item_id` → `products.id`); build a separate, explicitly-idempotent "recompute and overwrite" step for the derived `attributes` blob |
| `markDataCheckpoint` (`run_scope`, `legacy_tenant_id`, `entity_type`) | Reusing the exact same checkpoint shape for `pos_transactions` without adding a watermark/cursor field, since the existing shape (`last_processed_legacy_id`, `records_processed`) was built for smaller, largely-static tables | Extend the checkpoint concept with an explicit run-start watermark (Pitfall 8) rather than assuming "process everything not yet in the ID map" is safe for a continuously-growing table |
| `OUT_OF_SCOPE_LEGACY_TABLES` list in `mappings.js` | Forgetting that `items`, `stock_movements`, and `pos_transactions` are *currently* listed as out-of-scope from Phase 3 — v2.1 must explicitly remove them from that list (and add new entries for whatever satellite tables v2.1 itself decides to skip, e.g. possibly `product_composition`) | Update `OUT_OF_SCOPE_LEGACY_TABLES` deliberately as part of this milestone's first plan, with a comment explaining the scope change, so the manifest stays an accurate source of truth |
| `classifyMappingConflict` reason codes (`MAPPING_REASON_CODES`) | Inventing ad hoc skip/error messages for the new category/movement-type/embedding pitfalls instead of adding new frozen reason codes | Add new entries to `MAPPING_REASON_CODES` (e.g. `CATEGORY_FALLBACK_APPLIED`, `NO_LOCATION_TARGET`, `STALE_EMBEDDING`, `COMPOSITION_OUT_OF_SCOPE`) so findings stay structurally consistent with the existing report tooling |
| Destructive-op / pending-migration schema gate (Phase 1/2 hardening) | Assuming the schema-migration DDL bugs already found and fixed (MySQL `addIndex` `type:` vs `using:`) can't recur — new schema-extension migrations (adding `attributes`, `sku_code`, etc. columns, and any new generated/functional indexes on `attributes`) are exactly the kind of DDL work that bug class hit before | Re-run the same DDL smoke pattern (idempotent-rerun + information_schema fingerprint check) that caught the original bug, specifically against the new v2.1 schema-extension migration file(s) |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|-----------------|
| Reading `stock_movements`/`pos_transactions` in one unbounded `SELECT *` per tenant during dry-run | Dry-run against a real tenant with years of history runs very slowly or exhausts memory; migration-runner's JSON reports (`checksum.js`, report writers) balloon in size | Batch reads with cursor-based pagination (PK range chunks), and never embed full row payloads (especially embedding vectors) verbatim into human-readable dry-run/apply report JSON — summarize/truncate | Breaks first on the tenant(s) with the longest operational history among the 26 real tenants — likely the ones already used for rehearsal |
| Full-vector `item_embeddings.vector` (≈23KB TEXT per row) included in migration reports or checksums | Report files become unexpectedly large; checksum computation over full vector payloads adds needless CPU/time per row | Hash or omit vector content from dry-run/apply summary reports; only the fact "N embeddings migrated for tenant X" and any staleness findings need to appear in human-facing output | Noticeable once report generation is timed/reviewed at real multi-tenant scale, not during small synthetic test fixtures |
| Reading from a live legacy production database during business hours for the highest-volume tables | Migration reads compete with real POS traffic for MySQL connections/IO on the legacy database, risking latency for actual in-progress sales | Prefer running large-table reads (`stock_movements`, `pos_transactions`) off-peak or against a read replica/point-in-time snapshot if available, matching the "explicit snapshot boundary" principle from Pitfall 8 | Only becomes visible under real tenant load, which is exactly the condition next real rehearsal/cutover will hit — likely invisible in low-traffic rehearsal windows |
| Unindexed/un-promoted JSON `attributes` fields used in later reporting or filtering (dogfooding the Pitfall 10/technical-debt gap) | Slow queries once product-catalog features (search/filter by category-specific fields) are built on top of migrated data | Identify up front which `attributes` fields are likely to need filtering soon and promote those specific ones to MySQL generated+indexed columns rather than leaving the whole blob opaque | Breaks once catalog UI/reporting features that filter on category-specific attributes are built in a later milestone — not this one, but the schema choice made now determines the cost then |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Carrying forward `pos_transactions` PII (`customer_name`, `customer_phone`, `customer_email`, `buyer_tin`, `buyer_address`, `delivery_address`/coordinates) into `availments` without the same explicit allow-list discipline Phase 3 used for terminal identities | Broader PII surface migrated than strictly needed; harder to reason about retention/consent obligations across 26 real tenants' real customer data | Reuse the Phase 3 pattern (`mapTerminalRegistryEntryToTerminalIdentity`'s explicit field-by-field allow-list, never reading secret/unlisted fields) for the `pos_transactions` → `availments` mapper — build `target_payload` from an explicit allow-list, not a spread/passthrough of the whole legacy row |
| Embedding vector data treated as inert/non-sensitive | Vectors can leak information about product descriptions/names (embedding inversion is a known research risk); migrating and exposing them in reports without the same access controls as the source data underestimates this | Apply the same access-control assumptions to migrated embedding storage as the source `item_embeddings` table had — don't widen exposure (e.g. via debug endpoints or verbose reports) as a side effect of migration |
| Fiscal/compliance-sensitive fields on `pos_transactions` (`fiscal_document_hash`, `fiscal_void_event_hash`, `fiscal_document_snapshot`) carried into `availments` without preserving their integrity semantics | If `source_system` provenance isn't tied tightly enough to the original fiscal document hash chain, downstream fiscal/compliance verification could be ambiguous about which system originated a receipt | Treat fiscal snapshot/hash fields as immutable, opaque, provenance-tagged data — migrate them verbatim (not re-derived) and make `source_system` + original `invoice_number`/`fiscal_document_hash` jointly sufficient to prove chain of custody back to the legacy record |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-------------------|
| Migrated products all showing a generic `retail` category regardless of original raw-material/service distinction (per the settled decision) with no visual cue that they're migrated | Vendors browsing their catalog post-cutover see all old items lumped together, losing the mental model they had in the legacy system, and can't tell which products came from migration vs. were created fresh | Consider a lightweight provenance marker (e.g. `attributes.migrated_from_legacy: true` or similar) so a future catalog UI can optionally group/label migrated items, even if category itself stays simplified |
| Sales-history reports post-migration show a discontinuity or duplication around the cutover boundary if the watermark (Pitfall 8) isn't chosen carefully | Business owners reviewing historical sales reports across the cutover date see gaps or double-counted transactions | Verify the watermark boundary is exact and reconciled (one system's data ends exactly where the other's begins) before considering sales-history migration complete |

## "Looks Done But Isn't" Checklist

- [ ] **`products.category` mapping:** Often "done" after handling the 2-3 most common legacy values seen in test fixtures — verify all 5 legacy `ENUM` values (`raw_material`, `packaging`, `product`, `supplies`, `service`) have an explicit mapping entry and a finding on fallback.
- [ ] **`inventory_movements` migration:** Often "done" once counts match — verify migrated `created_at` uses the *original* legacy `stock_movements.timestamp`, not the migration run's wall-clock time, and that summed migrated movements reconcile against each product's final `current_stock`.
- [ ] **`item_embeddings` migration:** Often "done" once vector bytes round-trip correctly — verify a model-version/provenance field exists on the new storage and a staleness check ran against `items.updated_at`.
- [ ] **`pos_transactions` → `availments` idempotent re-migration:** Often "done" after one clean dry-run/apply/verify pass — verify a *second* full re-run against the same tenant (with zero new legacy sales in between) produces zero new inserts and zero changed findings; then verify a second re-run *with* new legacy sales in between only picks up the new rows, not a re-scan of everything.
- [ ] **`attributes` JSON population:** Often "done" once the JSON looks right on first apply — verify a second `apply` run against the same tenant doesn't grow/duplicate any array fields inside `attributes`.
- [ ] **Schema-extension migration for `products.attributes`/`sku_code`/etc.:** Often "done" once `migrate` succeeds once — verify idempotent re-run (already the project's own bar for schema migrations) and that no `addIndex` `type:`/`using:`-class DDL bug was reintroduced (this bug class has already occurred once in this repo).
- [ ] **Sales-history scope decision (voided transactions):** Often "done" without an explicit call — verify whether `pos_transactions.status = 'voided'` rows are migrated into `availments` (with an equivalent void marker) or excluded, and that this is a documented decision, not an accidental side effect of the mapper's filter logic.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|----------------|------------------|
| Category ENUM insert failure mid-batch (Pitfall 1) | LOW | Fix the lookup table, re-run `apply` — the existing lookup-before-insert idempotency guard means already-migrated rows in the same batch aren't re-processed; only the previously-failing rows need to succeed on retry |
| Discovered post-hoc that multi-location stock/transfers were silently collapsed wrong (Pitfall 2) | MEDIUM | Since `dgfy_*` schemas are additive/beside-legacy and legacy stays live, the authoritative source data still exists — a corrective re-derivation pass can recompute `products.stock_count`/`inventory_movements` from legacy `item_location_stocks`/`stock_movements` again as long as the legacy tables haven't been archived yet |
| `attributes` JSON duplication from a non-idempotent retry (Pitfall 10) | LOW–MEDIUM | Because `attributes` should be a pure recompute (once fixed per the prevention strategy), a corrective migration run that overwrites `attributes` from scratch for affected products resolves it without needing per-row manual repair |
| Embedding model-version ambiguity discovered late (Pitfall 6/7) | MEDIUM–HIGH | Requires a bulk re-embedding pass against whichever embedding provider is current, gated by a newly-added version column retrofitted onto already-migrated rows — cost scales with catalog size across all 26 tenants, so cheaper to prevent than to fix |
| Non-reproducible sales-history re-migration due to missing watermark (Pitfall 8) | MEDIUM | Retrofit a watermark onto existing checkpoint rows using the max `dgfy_id` already recorded in `legacy_id_map` for that entity type as a proxy boundary, then re-verify going forward — doesn't require re-deriving already-migrated data, just closes the gap for future runs |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|-------------------|----------------|
| Category ENUM collapse fails hard (1) | Product/Inventory Migration phase | Dry-run against all 26 real tenants shows an explicit finding (or none) for every one of the 5 legacy category values; apply never throws a truncation error |
| Multi-location stock/transfer has no target (2) | Product/Inventory Migration phase | Migrated `products.stock_count` reconciles against legacy `current_stock`/summed `item_location_stocks` for every multi-location tenant in rehearsal |
| `movement_type` N→M collapse drops detail (3) | Product/Inventory Migration phase | `loss_reason`/`weighted_average_cost` appear in migrated `before_snapshot`/`after_snapshot`, not silently dropped; report shows the full 8→5 mapping exercised |
| Recursive composition (BOM) has no target (4) | Product/Inventory Migration phase (spec/design step, before mapper code) | Every `product_composition` row for a migrated tenant appears in the report as either migrated or an explicit out-of-scope finding — never absent |
| Flat `product_folders` collide with nested legacy structure (5) | Product/Inventory Migration phase | `apply` against a tenant with duplicate/nested folder names produces zero unhandled unique-constraint errors; renames are logged as findings |
| No embedding model-version provenance (6) | Product/Inventory Migration phase | New embeddings storage schema includes a model-version column populated on every migrated row |
| Embedding staleness invisible (7) | Product/Inventory Migration phase | Dry-run report includes a sized "N stale embeddings" finding per tenant |
| Idempotent re-migration vs. a growing `pos_transactions` table (8) | Sales-History Migration phase | Two consecutive dry-runs against the same tenant with no new legacy sales in between produce identical results; a dry-run with new sales in between only reports the delta |
| Dangling operational FKs on `availments` (`shift_id`/`terminal_id`/`fnb_*`) (9) | Sales-History Migration phase | Every FK-shaped field on `pos_transactions` has a documented resolution (resolved / nulled-with-finding / snapshot-text) before the mapper is written |
| `attributes` JSON non-idempotent aggregation (10) | Product/Inventory Migration phase | Two consecutive `apply` runs against the same tenant produce byte-identical `attributes` JSON for every product |

## Sources

- Direct codebase inspection (HIGH confidence — this is the authoritative source for this project-specific research): `apps/dgfy-migration-runner/src/data/mappings.js`, `apps/dgfy-migration-runner/src/metadata/dataState.js`, `apps/dgfy-migration-runner/src/migrations/schema/20260712100000-create-commerce-foundation.cjs`, `apps/dgfy-migration-runner/src/migrations/schema/20260713120000-create-availment-checkout.cjs`, `backend/src/models/Item.js`, `backend/src/models/StockMovement.js`, `backend/src/models/PosTransaction.js`, `backend/src/models/ItemLocationStock.js`, `backend/src/models/ItemEmbedding.js`, `backend/src/models/ProductComposition.js`, `.planning/PROJECT.md`.
- [MySQL :: Indexing JSON documents via Virtual Columns](https://dev.mysql.com/blog-archive/indexing-json-documents-via-virtual-columns/) — LOW confidence (general web search, not project-specific), corroborates the JSON-attributes queryability tradeoff in Pitfall 10 and the Technical Debt table.
- [MySQL 8.4 Reference Manual — Secondary Indexes and Generated Columns](https://dev.mysql.com/doc/refman/8.4/en/create-table-secondary-indexes.html) — LOW confidence, same corroboration.
- [I Updated My Embedding Model and My RAG Broke: A Post-Mortem](https://decompressed.io/learn/rag-observability-postmortem) — LOW confidence, corroborates Pitfall 6 (silent semantic-space mismatch across embedding model versions).
- [Migrating vector embeddings in production without downtime](https://medium.com/google-cloud/migrating-vector-embeddings-in-production-without-downtime-8a0464af6f55) — LOW confidence, corroborates the re-embed-before-cutover practice referenced in Pitfall 6's prevention strategy.
- [Paginating large datasets in production: Why OFFSET fails and cursors win](https://blog.sentry.io/paginating-large-datasets-in-production-why-offset-fails-and-cursors-win/) — LOW confidence, corroborates Pitfall 8's offset-vs-cursor pagination risk against a live table.
- [Understanding Idempotency: A Key to Reliable and Scalable Data Pipelines](https://airbyte.com/data-engineering-resources/idempotency-in-data-pipelines) — LOW confidence, general corroboration of the checkpoint/watermark pattern recommended in Pitfall 8.
- Project session history (`.planning/` commit log, referenced in git status): the MySQL `addIndex` `type:` vs `using:` DDL bug found and fixed during last session's live rehearsal is cited directly as precedent in the Integration Gotchas table — this is a HIGH-confidence, already-proven-real project fact, not a hypothetical.

---
*Pitfalls research for: Legacy product-catalog, inventory-movement, and sales-transaction data migration (DGFY v2.1)*
*Researched: 2026-07-14*

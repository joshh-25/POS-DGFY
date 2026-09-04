---
status: amended
authority_level: authoritative
owner: architecture
date: 2026-09-03
last_reviewed: 2026-09-04
review_by: 2027-03-03
applies_to: inventory, pos, storefront, vouchers, fnb, dgfy
topic: item_multi_category_membership
---

# ADR 0080: Item Multi-Category Membership

> Strictness tiers per [ADR 0039](0039-adr-lifecycle-strictness-tiers-and-amendment-path.md):
> Clauses below are tagged `binding`, `default`, or `snapshot`. `binding` is a system invariant
> and needs a superseding ADR to change; `default` is amendable in place; `snapshot` records a
> point-in-time fact. Untagged clauses are `default`.

## Context

#1318 asks that one catalog item be assignable to more than one merchant-defined
category/folder, so the same item can appear in every relevant storefront/admin category without
duplicating the item record. Today `items.folder_id` (a scalar, nullable foreign key into
`item_folders`) is the *only* membership record, and it is not merely a filter — it is a
denormalized display key baked directly into row projections
(`storeRepository.js`'s `folder_name`, `posRepository.js`'s `resolveReportItemCategory`,
`itemRepository.js`'s list projection) and it is the sole input to three money-adjacent
resolutions: affiliate category commission rate, voucher folder scope, and F&B folder-inherited
modifier group inheritance.

[ADR 0029](0029-catalog-inventory-pos-storefront-ownership-boundaries.md) Decision 2 `[binding]`
puts categories squarely inside Catalog's ownership. This ADR's own scope (a purely additive
Catalog-owned join table) is `within-existing-boundary` per
`ARCHITECTURE_GOVERNANCE.md` step 1; the wider program of opting individual surfaces into the
union (POS listings, storefront listings, IMS authoring) is `cross-boundary` and is exactly the
gap governance step 3 names: *"new cross-boundary decision with no ADR covering it: create an
ADR."* This ADR is written before any consumer opts in, precisely so each later phase does not
re-litigate the tiebreak this ADR settles once.

`items.folder_id` must stay **nullable** — [ADR 0049](0049-batch-menu-import-async-extraction.md)'s
menu-categories amendment depends on `NULL` continuing to mean "uncategorized, importer lacked
`categories:manage`," and `itemRepository.js`/`itemGroupingService.js` already set it to `NULL` on
folder delete with no replacement. A `NOT NULL` constraint would also be a destructive migration
against a column with existing NULLs, which ADR 0029's Rollout Policy 3 forbids.

## Decisions

1. **`items.folder_id` is the primary category and the single tiebreak.** Every resolution that
   produces money, or that produces a number a merchant reconciles as money, reads
   `items.folder_id` and only `items.folder_id`, named exhaustively so this is checkable rather
   than aspirational: affiliate category commission rate resolution
   (`affiliateCommissionAccrual.js`'s `resolveCategoryRateBps`, and its storefront/POS
   `folder_id_snapshot` callers), voucher folder scope resolution
   (`voucherFolderScope.js`, `voucherRepository.js`'s `listItemFolderLinksForItems`, and every
   voucher use case that consumes them), F&B folder-inherited modifier group resolution
   (`fnbRepository.js`'s `listFolderModifierGroups`/`effectiveFnbModifierGroups.js`, inheriting
   [ADR 0019](0019-food-and-beverage-mode-full-service-restaurant.md)'s "Folder-Scoped Modifier
   Inheritance" section), and POS report category grouping and filtering
   (`posRepository.js`'s `resolveReportItemCategory` and its `filters.category_id` filter).
   Widening any of these to read the union instead requires a superseding ADR — not a dated
   amendment on this one. `[binding]`

2. **`item_folder_memberships` holds secondary memberships only.** `items.folder_id` is never
   mirrored into it and never derived from it — the two cannot desynchronize from each other
   because nothing ever copies one into the other. An item's full category set is
   `{items.folder_id} ∪ {memberships}`, de-duplicated at read time
   (`new Set([primary, ...secondaryIds].filter(Boolean))`), which makes an accidental overlap
   between the primary and a membership row harmless rather than a correctness bug. `[binding]`

3. **`items.folder_id` stays nullable.** `NULL` continues to mean "uncategorized" and remains
   reachable, preserving ADR 0049's `categories_skipped` import path. An item with a `NULL`
   primary and one or more non-empty memberships is legal and reads as categorized via its
   memberships alone. `[default]`

4. **Opt-in per surface.** A surface reads the union of primary and memberships only after an
   explicit, shipped phase says so. The default for any surface not yet named in a shipped phase
   is primary-only — this Phase 257 PR ships the schema, model, and the list/replace membership
   API with **zero** of the existing ~34 item→folder read sites changed; every one keeps
   compiling and behaving byte-identically, because nothing they read was touched. `[default]`

5. **Grouping surfaces render an item once per section it belongs to.** Where a surface's job is
   to group items under their category for browsing (the F&B storefront menu's section grouping,
   the services storefront's category grouping), and that surface has opted into the membership
   union per Decision 4, it renders the item once per section, keyed by a composite
   `{sectionId}:{itemId}` so React (or an equivalent list renderer) keys stay unique. This is the
   directly-requested product behavior in #1318 ("appear in every relevant storefront ... category
   without duplicating the item record" — read as *the record*, not *the rendered card*).
   **Cross-sell/"related items" and single-label surfaces** (a details-page breadcrumb, a promo
   entry's category label, a services catalog card's category label) render the primary only —
   unioning there degrades relevance (a much larger, less relevant related-items set) or is simply
   inapplicable (one card has one label), and neither case is what #1318 asks for. `[default]`

6. **A membership cap of 10 per item, ordered by a stable `sort_order`.** Bounds storefront/POS
   rail fan-out from an item with an unreasonably large membership set; enforced in
   `itemRepository.replaceItemFolderMemberships` before any row is written. `[default]`

## Consequences

1. **Zero read-site migration risk in this PR.** Because Decision 4 makes opt-in explicit and this
   PR opts in no surface, every one of the ~34 existing item→folder read sites across
   `apps/dgfy-api`, `packages/web-core`, and `apps/dgfy-storefront` is unaffected — verified
   path-by-path against the read-site inventory this ADR's implementation plan produced, not
   assumed from the additive-schema argument alone.
2. **Six existing write paths need no change, ever, for this feature to work.** Because
   memberships are secondary-only (Decision 2) rather than a mirror of the primary,
   `itemRepository.createItem`/`updateItem`/`deleteFolder`, `itemGroupingService`'s AI
   bulk-grouping and its own `deleteFolder`, and `menuImportCategoryService` all keep writing only
   `items.folder_id`, exactly as they do today. A mirrored design would have required all six to
   maintain a second copy in lockstep, in exactly the class of code (`SET NULL` on folder delete,
   bulk AI grouping, async menu import) where drift is hardest to notice.
3. **POS reports stay primary-only permanently, by design, not as a temporary gap.** A revenue
   report that counted one sale line under two categories would double-count revenue; a merchant
   reconciling a report against actual receipts must never see that. Reports are explicitly
   excluded from any future widening under Decision 1 unless a superseding ADR says otherwise.
4. **A merchant deleting a folder sees an under-count of affected items** until a later phase adds
   a second "N items also list this as a secondary category" line to the existing pre-delete
   warning — `ON DELETE CASCADE` on `item_folder_memberships.folder_id` still removes the
   memberships correctly; only the operator-facing warning under-counts in this PR.
5. **Widening Decision 1's three named resolutions is deliberately expensive.** Each requires its
   own superseding ADR (voucher folder scope: an amendment to
   [ADR 0066](0066-voucher-sale-time-price-resolution.md) Decision 11; F&B modifier inheritance: an
   amendment to ADR 0019's Folder-Scoped Modifier Inheritance section defining multi-folder
   precedence and `is_required_override` conflict resolution, given its snapshot-immutability
   constraint into already-accepted orders; affiliate category rate: recommended never widened at
   all, since `DgfyAffiliateCategoryRate`'s unique `(tenant_id, enrollment_id, folder_id)` scoping
   and its "no `folder_id = 0` all-categories sentinel" design show the existing intent is to
   refuse ambiguous payout configuration rather than silently pick a tiebreak).

## Validation

1. `npm run check:tenant-schema-coverage` passes with `item_folder_memberships` registered in
   `REQUIRED_TENANT_SCHEMA_TABLES`.
2. Characterization tests assert `resolveCategoryRateBps`, `resolveVoucherScopeItemIds`, and
   `resolveEffectiveFnbModifierGroups` produce identical output with and without membership rows
   present for the same item — the executable form of Decision 1, and the single highest-value
   test in this phase.
3. `itemRepository.replaceItemFolderMemberships` rejects an inactive or soft-deleted folder id,
   silently drops any id equal to the item's own primary (Decision 2's disjointness), and rejects
   a request exceeding the Decision 6 cap.
4. A legacy single-folder item with zero membership rows behaves identically before and after this
   PR on every one of the ~34 existing read sites.

## Amendments

### 2026-09-04: POS/IMS catalog-filter matching widens to the membership union (Phase 286, #1318)

Decision 4 requires an explicit, shipped phase before any surface reads the membership union.
This amendment is that phase for exactly one surface class: the folder/category **filter chips**
merchants use to browse the catalog in POS and IMS — not the storefront grouping surfaces Decision
5 already covers, and not any of Decision 1's `[binding]` money-adjacent resolvers.

- **Selecting a category in a POS or IMS catalog filter surfaces items whose SECONDARY category
  matches, not just their primary.** An item matches a selected folder when
  `items.folder_id` equals it, **or** the item has an `item_folder_memberships` row for it —
  the same union Decision 2 already defines, read (not written) by one more class of surface.
  `[default]`
- **This is filter *matching*, not grouping render.** Unlike Decision 5's storefront section
  grouping, a filter chip is a single-select control: choosing one category still returns each
  matching item exactly once (deduplicated at the `item_id` level), never once per matched
  category. Decision 5's `{sectionId}:{itemId}` composite-key rendering is a distinct mechanism for
  a distinct surface shape and stays scoped to F&B menu sections and services categories only —
  this amendment does not extend it to POS/IMS filter chips. `[default]`
- **Decision 1's `[binding]` list is completely untouched.** Affiliate category commission,
  voucher folder scope, F&B folder-inherited modifier groups, and POS sales reports all keep
  reading `items.folder_id` and only `items.folder_id` — unchanged, and not widened by this
  amendment. POS reports in particular (`posRepository.js`'s `buildReportInclude` and
  `normalizeReportLineRows`) are a different code path from the catalog-*listing* functions this
  amendment touches (`getItems`, `listCatalog`); Consequences item 3's "primary-only permanently"
  guarantee for reports is unaffected.
- **Implementation.** `itemRepository.getItems()`'s and `posRepository.listCatalog()`'s own
  `folder_id` query-param filters widen to an `item_id IN (...)` union query against
  `item_folder_memberships` when the requested folder has secondary members. Because POS's and
  IMS's browse UIs (`TerminalOperationsWorkspace.jsx`, `ItemsPage.jsx`) fetch their working item set
  once and filter client-side rather than re-querying per folder-chip click, `listCatalog()` and
  `getItems()` also attach each returned item's `secondary_folder_ids` so
  `posCatalogWorkflow.js`'s `filterCatalogByFolder`/`filterAvailableCatalogFolders`,
  `TerminalOperationsWorkspace.jsx`'s category-chip match, and `ItemsPage.jsx`'s
  `doesItemMatchFolder` (opt-in via a `matchSecondary` flag, default `false`) can widen the same
  way without a second round trip per click. `SkupervisorPOSCheckoutTerminal.jsx` already re-queries
  `listCatalog()` per folder-chip selection, so the backend widening alone covers it.
  `doesItemMatchFolder`'s `matchSecondary` flag is deliberately opt-in rather than the function's
  new default: two of its other callers (`folderCounts`'s per-folder item-count badge, and
  `handleDragEnd`'s drag-to-reassign "already in this folder" skip check) must stay primary-only —
  widening the count would conflate primary and secondary counts in a badge Consequences item 4
  reserves for a later, separate "N items also list this as a secondary category" line, and
  widening the drag guard would silently no-op a drag-to-set-primary-folder action for an item that
  is already only a secondary member of the drop target.
- **Degrades safely.** On a tenant where `item_folder_memberships` isn't available yet, every one
  of these call sites falls back to exactly the pre-amendment primary-only behavior — no new
  failure mode, matching Decision 4's existing per-surface opt-in default.

## References

1. [ADR 0029](0029-catalog-inventory-pos-storefront-ownership-boundaries.md) — Decision 2
   `[binding]`, Catalog owns categories; this ADR's join table is Catalog-owned and purely
   additive under it. Rollout Policy 3 (no destructive migrations) is why `items.folder_id` stays
   nullable rather than becoming `NOT NULL`.
2. [ADR 0049](0049-batch-menu-import-async-extraction.md) — the menu-categories amendment whose
   `categories_skipped`/`NULL folder_id` import path Decision 3 preserves.
3. [ADR 0019](0019-food-and-beverage-mode-full-service-restaurant.md) — "Folder-Scoped Modifier
   Inheritance" section; the money-adjacent, snapshot-immutable resolution Decision 1 pins to the
   primary and Consequences item 5 names as the required amendment route for any future widening.
4. [ADR 0066](0066-voucher-sale-time-price-resolution.md) — Decision 11, folder scope resolved and
   snapshotted at redemption; the required amendment route for widening voucher scope to the union.
5. [ADR 0036](0036-affiliates-program-commission-and-cashout.md) — the affiliate commission program
   whose category rate resolution Decision 1 pins to the primary permanently (Consequences item 5).
6. [ADR 0039](0039-adr-lifecycle-strictness-tiers-and-amendment-path.md) — strictness tiers used
   throughout this ADR's clauses.
7. Issue #1318 — item multi-category membership; #1082 — pricelist/category filtering and the
   existing `item_folders` model; #619 — merchant-curated Featured Products, confirmed unaffected
   (no `items.is_featured` column or read path exists as of this ADR).
8. `docs/ops/TENANT_SCHEMA_SYNC_RESIDUAL_RISK_TRACKER.md` — the #860/#639 tenant-schema-drift
   crash-loop class this ADR's implementation registers `item_folder_memberships` against.

---
status: reference
owner: engineering
last_reviewed: 2026-09-04
related_adr: docs/architecture/adr/0080-item-multi-category-membership.md (2026-09-04 Amendment --
  the new decision point this phase's diff implements: POS/IMS catalog-filter matching widens to
  the item_folder_memberships union; Decision 1's [binding] money-adjacent resolvers, and Decision
  5's storefront grouping-surface composite rendering, are both untouched by this phase)
declaration_id: 2026-09-04-pos-ims-catalog-filter-secondary-categories
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.09.04
verification_evidence: apps/dgfy-api/tests/posRepository.catalogFolderWidening.test.js -- actually executed (Jest), new, 4 passing (widens the folder_id filter to the membership union when secondary members exist; stays primary-only when no secondary members exist; attaches secondary_folder_ids to every returned item even without a folder_id filter; degrades to primary-only without throwing when ItemFolderMembership is unavailable on this tenant),apps/dgfy-api/tests/inventoryItemRepository.test.js -- actually executed (Jest), 4 new cases added to the existing suite (same four shapes as posRepository's, against getItems), full file 90 passing zero regressions,apps/dgfy-api/tests/itemFolderMemberships.repository.test.js -- actually executed (Jest), unchanged, 8 passing regression-clean (Phase 257/268's own membership-repository tests, confirming this phase's read-only consumption doesn't disturb the write-side contract),apps/dgfy-api/tests/posRepository.catalogImages.test.js -- actually executed (Jest), unchanged, 8 passing regression-clean (confirms the new attachSecondaryFolderIds step composes correctly with the existing image/override/barcode pipeline and the pre-existing catch-all dbStore.get(name) => {} test-mock convention used throughout this suite),apps/dgfy-api/tests/posRepository.locationStockFallback.test.js -- actually executed (Jest), unchanged, regression-clean,packages/web-core/src/features/pos/utils/__tests__/posCatalogWorkflow.test.js -- actually executed (Vitest, run from apps/dgfy-ims per docs/architecture/frontend-split-sync.md -- packages/web-core tests do not run from apps/dgfy-pos despite that app owning the build), new case added (widens folder matching to secondary category memberships, legacy payload with no secondary_folder_ids field keeps its old primary-only behavior), full file 6 passing,full packages/web-core/src/features/pos/ suite -- actually executed (Vitest), 189 files / 1190 tests all passing zero regressions (covers TerminalOperationsWorkspace.jsx's widened folder:<id> chip match inline in its filteredItems memo -- no dedicated unit test exists for that ~9000-line component, this full-suite run is the regression evidence for it),full packages/web-core/src/features/inventory/ suite -- actually executed (Vitest), 9 files / 68 tests all passing zero regressions (covers ItemsPage.jsx's doesItemMatchFolder matchSecondary opt-in flag -- no dedicated unit test exists for that component either, same regression-evidence caveat),node --check on every changed apps/dgfy-api .js file (itemRepository.js, posRepository.js -- dgfy-api has no build step so this is its Tier 0 equivalent per .agents/skills/implement/SKILL.md),npm run build:pos -- OK, a real Vite build, Tier 0 compiler check for the POS frontend,npm run build:skupervisor -- OK, a real Vite build, Tier 0 compiler check for the IMS frontend (also consumes packages/web-core's pos and inventory feature trees),npm run check:architecture -- OK, zero new allowlist entries,npm run check:adr -- OK, validates the new ADR 0080 Amendments block and its status:amended frontmatter transition,npm run check:compliance -- confirmed to fail first (listing exactly the four sensitive files below), then pass once this declaration was added
rollback_note: No schema change and no migration in this phase -- item_folder_memberships and its model already existed from Phase 257/268; this phase only adds new read-time query logic (an item_id IN (...) union against existing rows) and a new response-only field (secondary_folder_ids) to two already-existing catalog-listing functions, plus corresponding client-side match-widening in three frontend files. Rollback is a plain revert of this PR's diff -- no data was written or migrated, no existing field's meaning changed, no existing response field was removed or renamed, and every widened code path has an explicit, tested primary-only fallback for a tenant where the membership model is unavailable, so a revert is safe at any time with no follow-up cleanup.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-04T11:14:51.000Z
preflight_request_ref: NOT-EXECUTED-1318-POS-IMS-CATALOG-FILTER-SECONDARY-CATEGORIES
---

# POS/IMS catalog filters widen to secondary categories (Phase 285, #1318)

## Compliance Impact Classification

Major. The floor is mechanical, confirmed live against `scripts/check-compliance-impact.js`
against this diff -- run before this declaration existed, it failed and listed:

- `apps/dgfy-api/src/modules/pos/repositories/posRepository.js` -- matches the `modules/pos/` rule
  -> `surfaces: pos,terminal`, floor `major`.
- `packages/web-core/src/features/pos/components/TerminalOperationsWorkspace.jsx`,
  `packages/web-core/src/features/pos/utils/posCatalogWorkflow.js`,
  `packages/web-core/src/features/pos/utils/__tests__/posCatalogWorkflow.test.js` -- all three match
  the frontend `features/pos/` rule -> same surfaces/floor.

Not `regulatory`: nothing here touches `modules/compliance/`, `routes/compliance.js`,
`compliancePolicy.js`, or a tenant-admin surface -- this is a catalog-*browse* filter widening, not
a change to who may authenticate, authorize, or configure anything.

`apps/dgfy-api/src/modules/inventory/repositories/itemRepository.js` and
`packages/web-core/src/features/inventory/pages/ItemsPage.jsx` were also changed in this PR (the
IMS half of the same widening) but matched **no** compliance-sensitive rule -- confirmed live,
`check:compliance` never listed either file. No `modules/inventory/` or `features/inventory/` rule
exists in `COMPLIANCE_SENSITIVE_RULES`. Declared here anyway for completeness of the change record,
not because the tool requires it.

## Affected Surfaces

1. `apps/dgfy-api/src/modules/pos/repositories/posRepository.js` --
   - `listCatalog()`'s `folder_id` query-param filter widens from an exact `where.folder_id = X`
     match to `where.folder_id = X OR item_id IN (item_folder_memberships matching folder X)`, only
     when that folder actually has secondary members (an empty membership result leaves the
     pre-existing exact-match behavior in place, unchanged). Built as a `where[Op.and]` array entry
     rather than reusing `where[Op.or]` (already claimed by the search-term block above it in the
     same function), so both conditions combine correctly with `AND` semantics regardless of
     whether a search term is also present.
   - New `attachSecondaryFolderIds(items)` helper attaches each returned item's
     `secondary_folder_ids: number[]` (empty array when the tenant has no memberships or the model
     is unavailable). Scoped to `listCatalog()` only -- `applyCatalogOverrides()`'s other caller
     (`findSellableItemsByIds`, used to build a cart from item ids, not to browse/filter) is
     unchanged and explicitly out of this phase's scope per the dispatch brief.
2. `packages/web-core/src/features/pos/utils/posCatalogWorkflow.js` -- `filterCatalogByFolder` and
   `filterAvailableCatalogFolders` (both consumed by `usePosCatalogWorkflow.js`, which feeds
   `POSCheckoutTerminalView.jsx`'s folder-chip filter) widen their per-item match to check
   `item.secondary_folder_ids` in addition to `item.folder_id`. A legacy payload with no
   `secondary_folder_ids` field at all (any response predating this phase, or from a code path this
   phase didn't touch) degrades to exactly the old primary-only match -- pinned by this phase's own
   new test case.
3. `packages/web-core/src/features/pos/components/TerminalOperationsWorkspace.jsx` -- the
   `filteredItems` memo's inline `folder:<id>` chip-match branch widens the same way, reading
   `item?.secondary_folder_ids`. The `name:<slug>` fallback branch (items with no real `folder_id`
   at all) is unaffected -- there is no secondary-category data to widen it with.
4. `apps/dgfy-api/src/modules/inventory/repositories/itemRepository.js` (not compliance-sensitive,
   listed for completeness) -- `getItems()`'s `folder_id` query-param filter widens the same way as
   `listCatalog()`'s (the `'null'`/`'none'` "uncategorized" sentinel stays primary-only -- memberships
   never apply to uncategorized). A new `attachSecondaryFolderIds` attaches `secondary_folder_ids`
   to every item in the non-dropdown list response (the `fields: 'dropdown'` fast path is unchanged
   -- it's used for SKU-suggestion seeding, not catalog browsing).
5. `packages/web-core/src/features/inventory/pages/ItemsPage.jsx` (not compliance-sensitive, listed
   for completeness) -- `doesItemMatchFolder` gains an opt-in `matchSecondary` flag (default
   `false`, so every existing call keeps its exact prior behavior unless it explicitly asks
   otherwise). Only the two folder-chip browse-filter call sites (`filteredItems`'s `matchesFolder`)
   pass `{ matchSecondary: true }`. Deliberately **not** passed at the other two call sites that
   share this function: `folderCounts` (the per-folder item-count badge on each `FolderCard`) and
   `handleDragEnd` (the drag-and-drop "already in this folder, skip reassignment" guard) -- widening
   either would be a real functional regression, not just an inconsistency: the count would conflate
   primary and secondary membership counts in a badge ADR 0080's Consequences item 4 reserves for a
   later, separate "N items also list this as a secondary category" line, and the drag guard would
   silently no-op a drag-to-set-primary-folder action for an item that is already only a secondary
   member of the drop target.

## What this phase deliberately does NOT do

1. **No new route, no new permission check.** Both `GET /pos/catalog` and `GET /items` already
   existed and already sit behind their existing `checkPermission` gates; this phase only widens
   what an already-authorized read returns/matches against.
2. **No write path.** `item_folder_memberships` rows are never created, updated, or deleted by this
   phase -- `itemRepository.replaceItemFolderMemberships` (Phase 257/268) remains the only writer,
   completely untouched here. This phase is a pure read/match-time consumer of rows that already
   exist.
3. **POS sales reports are untouched, and stay primary-only permanently by ADR 0080 Consequences
   item 3.** `posRepository.js`'s `buildReportInclude()` and `normalizeReportLineRows`'s folder
   check are a different code path from `listCatalog()` (catalog *listing*, not reporting) and were
   not read, let alone modified, by this phase.
4. **None of ADR 0080 Decision 1's `[binding]` resolvers are touched.** Affiliate category
   commission rate resolution, voucher folder scope resolution, and F&B folder-inherited modifier
   group resolution all keep reading `items.folder_id` and only `items.folder_id` -- confirmed by
   grep, none of `affiliateCommissionAccrual.js`, `voucherFolderScope.js`, `voucherRepository.js`,
   `fnbRepository.js`, or `effectiveFnbModifierGroups.js` appear in this PR's diff.
5. **Storefront view-models and `storeRepository.js`/`storeUseCases.js` are untouched.** That surface
   is a parallel, separately-scoped piece of the same #1318 program (C1/C2 in the wave plan) and is
   explicitly out of scope for this phase.
6. **No `{sectionId}:{itemId}` composite-key multi-render was added anywhere in POS/IMS.** ADR 0080
   Decision 5's grouping-surface rendering mechanism is not extended to POS/IMS filter chips by this
   amendment -- a filter chip is a single-select control, and a matching item is still returned/
   rendered exactly once, never once per matched category.

## Compliance Preconditions

1. **No unauthenticated or newly-authorized access path is introduced.** Confirmed above -- zero new
   routes, zero permission-check changes, on either the POS or IMS catalog-listing endpoints.
2. **Every widened match degrades safely to the pre-amendment primary-only behavior**, not a hard
   failure, whenever `item_folder_memberships` is unavailable on a given tenant (unmigrated) or a
   test/legacy payload carries no `secondary_folder_ids` field at all. Pinned by dedicated test
   cases in both `posRepository.catalogFolderWidening.test.js` and
   `inventoryItemRepository.test.js` ("degrades to primary-only, without throwing, when
   ItemFolderMembership is unavailable on this tenant").
3. **No money-adjacent resolution is widened.** See "What this phase deliberately does NOT do" item
   4 above -- Decision 1's `[binding]` list is unaffected in both code and in the new ADR 0080
   Amendments block, which explicitly restates rather than silently relies on that boundary.

## Verification Evidence

See the `verification_evidence` front matter key for the full list. Summary:

- `apps/dgfy-api/tests/posRepository.catalogFolderWidening.test.js` (new) and 4 new cases in
  `apps/dgfy-api/tests/inventoryItemRepository.test.js` -- actually executed (Jest), all passing.
- `apps/dgfy-api/tests/itemFolderMemberships.repository.test.js`,
  `apps/dgfy-api/tests/posRepository.catalogImages.test.js`,
  `apps/dgfy-api/tests/posRepository.locationStockFallback.test.js` -- actually executed (Jest),
  unchanged, zero regressions. (`apps/dgfy-api/tests/securityTransport.middleware.test.js` was also
  checked but is unrelated and DB-dependent -- one pre-existing, unrelated failure in that file
  traced to no live MySQL connection in this environment (`/health` endpoint), not to this diff; not
  claimed as passing evidence here.)
- New case in `packages/web-core/src/features/pos/utils/__tests__/posCatalogWorkflow.test.js` --
  actually executed (Vitest, run from `apps/dgfy-ims` per `docs/architecture/frontend-split-sync.md`
  -- `packages/web-core` tests do not run from `apps/dgfy-pos` despite that app owning the build).
- Full `packages/web-core/src/features/pos/` suite (189 files / 1190 tests) and full
  `packages/web-core/src/features/inventory/` suite (9 files / 68 tests) -- actually executed
  (Vitest), all passing, zero regressions. This is the regression evidence for
  `TerminalOperationsWorkspace.jsx` and `ItemsPage.jsx`'s inline widened-match logic, neither of
  which has a dedicated isolated unit test (both are large, pre-existing components with no test
  file of their own before this phase) -- stated as a known gap, not hidden.
- `node --check` on every changed `apps/dgfy-api` `.js` file (`itemRepository.js`,
  `posRepository.js` -- its own `build` script is a no-op, so this is the real Tier 0 check for that
  app per `.agents/skills/implement/SKILL.md`).
- `npm run build:pos` and `npm run build:skupervisor` -- both OK, real Vite builds, the Tier 0
  compiler check for both affected frontend apps.
- `npm run check:architecture` -- OK, zero new allowlist entries.
- `npm run check:adr` -- OK, validates the new ADR 0080 Amendments block.
- `npm run check:compliance` -- confirmed to **fail** first (listing exactly the four sensitive
  files named above), then **pass** once this declaration was added.

## Residual Risks

1. **`TerminalOperationsWorkspace.jsx`'s and `ItemsPage.jsx`'s widened match logic has no dedicated
   unit test**, only full-suite regression coverage (see above) -- both components are large enough
   (thousands of lines) that adding an isolated test harness for either was judged out of proportion
   for this phase; a future phase touching either file's test coverage should consider adding one.
2. **The widened `item_id IN (...)` union query is unverified against a real MySQL query planner** --
   no local MySQL reachable in this environment, same honesty framing as this repository's other
   recent declarations for `posRepository.js`/`itemRepository.js`. The mocked-`dbStore` unit tests
   exercise the query-construction and match-widening logic directly; the actual SQL execution plan
   is not exercised here.
3. **IMS's own frontend widening (`itemRepository.js` attaching `secondary_folder_ids`,
   `ItemsPage.jsx`'s `doesItemMatchFolder`) was not named in this phase's original dispatch brief**,
   which scoped IMS to backend-only (`itemRepository.js`'s `folder_id` query-param path). Investigation
   found that path is not actually reachable from IMS's live browse UI --
   `useInventoryItems(buildItemsListParams(...))` never sends a `folder_id` query param;
   `ItemsPage.jsx` fetches its full item set once and filters client-side via `doesItemMatchFolder`
   instead. Widening only the backend query-param path would have been a no-op for real IMS users,
   so this phase extended scope to `ItemsPage.jsx` to actually deliver the stated product outcome for
   IMS merchants. Flagged here rather than silently expanding scope without a record of why.

## Preflight Reconciliation

`POST /api/v1/compliance/preflight` has not been executed against a live environment --
`preflight_request_ref` is declared `NOT-EXECUTED-1318-POS-IMS-CATALOG-FILTER-SECONDARY-CATEGORIES`.
Per `docs/compliance/request-time-preflight-protocol.md`'s "Where live preflight actually runs" and
the pr-reviewer/AGENTS.md rule confirmed at #884: this is expected, not a review finding, on a PR
targeting `develop`. The continuous `compliance-preflight-sweep.yml` (#1163/#1248) reconciles this
after merge.

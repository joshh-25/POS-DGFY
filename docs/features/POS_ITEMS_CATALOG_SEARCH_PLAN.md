---
status: reference
authority_level: reference
owner: pos
last_reviewed: 2026-09-05
applies_to: pos_items_catalog_search
topic: pos_items_catalog_search
---

# POS Items Catalog Search Plan

## Objective and execution constraints

Fix eligible items appearing in Sell search but missing from Items management.
Use only `C:/xampp/htdocs/POS-DGFY` on `POS-Development`. No PR, push, deployment,
new worktree, or production data changes. Physical iMin validation is excluded
by user instruction on 2026-09-05. Browser verification remains required.
Phase 296 is completed; Phases 297-298 remain planned.

## Confirmed evidence and limits

Items calls `fetchPosCatalog({ limit: 200 })`, then searches that subset locally.
Sell passes search and selected location to the API. The repository applies
name/SKU search before its limit (maximum 500), while the use case filters POS
visibility after the repository returns. Items also supports barcode and primary
category-name search, which the current API search does not provide.

Run `node scripts/reproduce-pos-items-search-gap.cjs`: the current Items predicate
returns no match from 200 rows; the complete 601-row fixture finds item 601,
Tomato Meatballs. Modeled API name/SKU filtering also finds 601. This diagnostic
executes the source Items predicate, not the API or browser. It confirms a local
defect, not the production screenshot's exact cause. Retire this baseline when
Phase 297 replaces the predicate, replacing it with behavioral regression tests.

The focused application-layer test
`apps/dgfy-api/tests/posCatalogSearchGap.phase296.test.js` executes the real
`buildListPosCatalogUseCase` with a controlled repository fixture. It proves that
the Items-style empty search is capped before item 601, the Sell-style `meat`
search returns item 601, and post-limit `pos_visible` filtering can hide all 200
returned rows while eligible rows remain beyond the limit. The running local HTTP
endpoint returned 401 without credentials, confirming its authentication guard;
no tenant data was inspected or changed.

## Phase 296 - Reproduce and define the contract

Status: completed (2026-09-05).

- Completed: source trace, executable 601-row frontend-predicate reproduction,
  and application-layer API-use-case reproduction with a controlled fixture.
- Freeze name/SKU/primary-barcode/primary-category-name search, primary and
  secondary category filtering, legacy category fallback, and stock semantics.
  Preserve service/always-available behavior and the existing positive minimum
  threshold, falling back to 5. Do not invent a stock-policy change.
- Acceptance: two focused use-case diagnostics pass and demonstrate truncation
  plus the post-limit visibility gap. Production verification is unavailable and
  is not claimed; it is not a production-access requirement.

## Phase 297 - Implement complete querying

Status: planned. Depends on Phase 296 acceptance.

- Add opt-in server pagination with an unchanged legacy `data` array and additive
  metadata. Validate page, page size, search, category, stock and location inputs.
- Apply authorization, active/deleted state, POS visibility, search, category and
  location-aware stock filtering before pagination and total counting. Use stable
  name/item-ID ordering. Avoid duplicate rows from category/barcode joins.
- Preserve existing callers and search capabilities. Do not fetch the full catalog
  or increase limits as the fix. Use bound query values and existing tenant scope.
- Connect Items to server results/counts; reset page on filter changes; ignore stale
  requests; retain editor drafts independently of the current result page. Preserve
  search/filter state during realtime refresh, and distinguish failures, an empty
  catalog, and no matching results.
- Acceptance: records beyond 200 and 500 are discoverable and pageable; correct
  counts and filters; Sell/scanner compatibility; hidden rows consume no slots.

## Phase 298 - Verify and close

Status: planned. Depends on Phase 297 acceptance.

- Test >500 rows, duplicate names, hidden/inactive/deleted rows, barcode/category
  search, secondary membership, stock thresholds, services/always-available,
  tenant/location isolation, empty pages, and invalid query inputs.
- Browser-test rapid search, combined filters, page changes, request errors,
  edit/refresh behavior, and desktop/tablet layouts on local POS.
- Run focused API/UI tests, POS build, architecture and applicable documentation,
  compatibility and compliance checks. Amend ADR 0080 for changed documented
  client-filtering behavior; no architecture exception or migration is assumed.
- Record commands, results, changed files, limitations, and local commit IDs.
  Mark completed only after acceptance passes. Physical APK evidence is not required.

## Implementation files

- `packages/web-core/src/features/pos/components/TerminalOperationsWorkspace.jsx`
- `packages/web-core/src/features/pos/services/posService.js`
- `packages/web-core/src/features/pos/hooks/usePosCatalogWorkflow.js`
- `packages/web-core/src/features/pos/utils/posCatalogWorkflow.js`
- `apps/dgfy-api/src/validators/posValidator.js`
- `apps/dgfy-api/src/modules/pos/controllers/posHandlers.js`
- `apps/dgfy-api/src/modules/pos/usecases/posUseCases.js`
- `apps/dgfy-api/src/modules/pos/repositories/posRepository.js`

## Governing references

Read `docs/START_HERE.md`, `docs/architecture/ARCHITECTURE_BOUNDARIES.md`,
`docs/architecture/ARCHITECTURE_GOVERNANCE.md`, and the ADR index first.
Decisions follow ADR 0029 `0029-catalog-inventory-pos-storefront-ownership-boundaries.md`,
ADR 0055 `0055-tenant-scoped-pos-catalog-realtime-invalidation.md`, and
ADR 0080 `0080-item-multi-category-membership.md` under `docs/architecture/adr/`.
These keep stock ownership unchanged, refresh authoritative and tenant scoped,
and category membership behavior intact. No new exception/allowlist is planned.

Current phase: 296 completed. Next eligible phase: 297, pending approval.
The authoritative sequence is [the phase ledger](IMPLEMENTATION_PHASE_LEDGER.md).

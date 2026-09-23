# Continue Phase Handoff

Last updated: 2026-09-14  
Repository: `C:\xampp\htdocs\POS-DGFY`  
Branch: `POS-Development`

## Current status

The latest approved request is implemented: clicking **All Items/All categories** now displays
items in the saved category order (`ItemFolder.sort_order`) in POS and Storefront. Phase 344 is
still `in_progress` only because authenticated visual acceptance has not been completed. No
commit, PR, deployment, or production-data change was made.

The worktree is heavily dirty with unrelated Phase 333-350 changes and temporary/untracked files.
Preserve them. Do not run `git reset`, `git checkout`, or broad cleanup commands.

## Architecture and boundaries

- `apps/dgfy-api` is the tenant-scoped Sequelize/MySQL backend; `apps/dgfy-migration-runner`
  owns migrations; `apps/dgfy-pos`, `apps/dgfy-storefront`, and `apps/dgfy-ims` are separate
  frontend apps; `packages/web-core` is the shared frontend trunk consumed through `file:`
  dependencies.
- New catalog/back-office work belongs in POS/shared web-core until the dedicated Back Office
  ships. Do not move this work to IMS/SKUpervisor. Storefront is the public catalog surface.
- An item has one primary category in `Item.folder_id`. Additional memberships are represented by
  `item_folder_memberships` and `secondary_folder_ids`. `ItemFolder.sort_order` is the persisted
  category arrangement.
- Per ADR 0080, flat **All** surfaces render each item once using its primary category. A selected
  category filter may match primary or secondary membership.

## Changes already made

### Phase 344 POS Items UI

- Applied the Stitch `POS Items Catalog - Main Panel Only` presentation to the POS management route:
  `http://localhost:5174/?view=items#/terminal`.
- Updated the POS-only tabs, search/filter card, Add/Import actions, compact table, category/stock/
  profit columns, dynamic terminal currency formatting, and Edit/Delete area. The non-POS card
  presentation remains unchanged.
- POS category cards support whole-card drag reordering, keyboard activation, control-button
  isolation, and a visible cursor. The POS selling folder strip uses the saved order and refreshes
  after category-order invalidation.
- The old `Inventory item synced from IMS` helper copy is not part of the current POS item row.
- `Import Menu` remains an intentional feature-flagged action. Current POS local flags are in
  `apps/dgfy-pos/.env.local` (`VITE_MENU_PDF_IMPORT_ENABLED` and
  `VITE_MENU_IMPORT_BATCH_ENABLED`); remove it only in a separately scoped request.

### Category-first ordering

- POS Terminal: `usePosCatalogWorkflow` sorts the unfiltered catalog client-side after category
  metadata loads, including offline snapshots. A selected category keeps its existing behavior.
- POS Items Catalog: `posRepository.listCatalogPage` requests category ordering only for the
  unfiltered management catalog. The API orders before pagination so category groups cannot split
  incorrectly across pages. The internal `order_by_category` flag is not a public client query.
- Storefront: F&B, Retail, and Simple use the shared catalog presentation; Services uses its own
  service presentation. Their unfiltered **All** views use primary category order. Explicit price
  ascending/descending sorts remain price-first; selected category tabs keep their existing sort.
- Missing, invalid, or unassigned categories sort last. Ties use item/service name, then ID, then
  original position for stability. Valid sort order `0` is preserved.
- No schema, migration, catalog mutation, inventory-ownership, membership, permission, or deploy
  behavior was changed.

## Important decisions and risks

- Do not sort the paginated POS management result only in React; the backend must order before page
  slicing, which is why `listCatalogPage` passes the internal flag to `listCatalog`.
- Do not use secondary categories to duplicate items in flat **All** lists. Secondary memberships
  remain for category-specific matching/grouping only.
- `posRepository.js` already contains unrelated dirty changes from other phases. Review/stage only
  the category-order hunks if a future commit is requested.
- Repository-wide API lint currently has a pre-existing unrelated error at
  `apps/dgfy-api/src/modules/pos/services/posTerminalDeviceEnrollmentService.js:740`
  (`no-useless-assignment`). The changed repository file itself lints cleanly.

## Remaining work

1. Use the existing authenticated local browser session, if available, to visually verify:
   - POS Terminal **All Items** order.
   - POS Items Catalog **All categories** order across multiple pages.
   - Storefront **All** order in F&B/Retail/Simple and Services modes.
   - category reorder followed by refresh/reload, unassigned items last, and price-sort behavior.
2. The previous browser check reached the exact POS route but was locked at sign-in. Do not request,
   enter, or transmit credentials through tools; record the visual gate as pending if still locked.
3. After authenticated visual evidence passes, update `docs/features/IMPLEMENTATION_PHASE_LEDGER.md`
   to mark Phase 344 completed and reconcile the next eligible phase from the ledger. Do not mark
   Phase 344 complete based on unit tests/builds alone.

## Relevant files

Authoritative context:

- `AGENTS.md`
- `docs/START_HERE.md`
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
- `docs/architecture/adr/0029-catalog-inventory-pos-storefront-ownership-boundaries.md`
- `docs/architecture/adr/0055-tenant-scoped-pos-catalog-realtime-invalidation.md`
- `docs/architecture/adr/0080-item-multi-category-membership.md`
- `docs/features/IMPLEMENTATION_PHASE_LEDGER.md` (Phase 344)

Implementation:

- `packages/web-core/src/features/pos/utils/posCatalogWorkflow.js`
- `packages/web-core/src/features/pos/hooks/usePosCatalogWorkflow.js`
- `packages/web-core/src/features/pos/components/TerminalOperationsWorkspace.jsx`
- `apps/dgfy-api/src/modules/pos/repositories/posRepository.js`
- `apps/dgfy-storefront/src/app/pages/StorefrontCatalogRouteContainer.jsx`
- `apps/dgfy-storefront/src/modes/fnb/storefront/model/fnbStorefrontViewModel.js`
- `apps/dgfy-storefront/src/modes/fnb/storefront/model/buildFnbCatalogPresentation.js`
- `apps/dgfy-storefront/src/modes/services/storefront/model/servicesStorefrontViewModel.js`
- `apps/dgfy-storefront/src/modes/services/storefront/components/StorefrontServicesCatalog.jsx`

Regression coverage:

- `packages/web-core/src/features/pos/utils/__tests__/posCatalogWorkflow.test.js`
- `packages/web-core/src/features/pos/hooks/__tests__/usePosCatalogWorkflow.test.jsx`
- `apps/dgfy-api/tests/posRepository.catalogFolderWidening.test.js`
- `apps/dgfy-api/tests/posRepository.catalogPagination.test.js`
- `apps/dgfy-storefront/src/modes/fnb/storefront/model/buildFnbCatalogPresentation.test.js`
- `apps/dgfy-storefront/src/modes/services/storefront/model/servicesStorefrontViewModel.test.js`

## Validation commands and results

Run from the repository root with PowerShell:

```powershell
Set-Location apps/dgfy-api
npm test -- --runTestsByPath tests/posRepository.catalogFolderWidening.test.js tests/posRepository.catalogPagination.test.js
npx eslint src/modules/pos/repositories/posRepository.js

Set-Location ../dgfy-pos
npm test -- ../../packages/web-core/src/features/pos/utils/__tests__/posCatalogWorkflow.test.js ../../packages/web-core/src/features/pos/hooks/__tests__/usePosCatalogWorkflow.test.jsx ../../packages/web-core/src/features/pos/__tests__/categoryPlacement.behavior.test.jsx
npm run lint
npm run build

Set-Location ../dgfy-storefront
npm test -- src/modes/fnb/storefront/model/buildFnbCatalogPresentation.test.js src/modes/fnb/storefront/model/fnbStorefrontViewModel.test.js src/modes/services/storefront/model/servicesStorefrontViewModel.test.js
npm run lint
npm run build

Set-Location ../dgfy-ims
npm run build
```

Last recorded results: API 2 suites/14 tests passed; POS/web-core 3 files/26 tests passed;
Storefront 3 files/31 tests passed; POS, Storefront, and IMS production builds passed; POS and
Storefront lint passed with no errors; changed API lint passed; `git diff --check` passed. Storefront
lint still reports existing warnings. Full API lint is blocked only by the unrelated error noted
above.


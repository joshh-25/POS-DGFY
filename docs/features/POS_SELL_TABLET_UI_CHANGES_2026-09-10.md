---
status: reference
authority_level: reference
owner: pos-platform
last_reviewed: 2026-09-10
applies_to: apps/dgfy-pos and packages/web-core POS sell surface
topic: pos_sell_tablet_ui_changes
---

# POS Sell Tablet UI Changes — 2026-09-10

## Purpose

This document records the tablet-only POS Sell UI work completed on
`codex/pos-frontend-changes-sell-tablet`. The objective is to bring the tablet
catalog and current-sale experience closer to the established PC layout while
preserving the existing POS checkout behavior, business rules, and non-tablet
surfaces.

This is a release/change record, not a replacement for the POS architecture or
hardware-parity contracts.

## Scope and boundaries

### Included

- POS Sell catalog cards and their tablet grid sizing.
- Tablet catalog pagination controls and page navigation behavior.
- Tablet current-sale action grouping, labels, and touch targets.
- Tablet drawer-authorization dialog button sizing.
- Tablet takeout order-notes width.
- Tablet collapsed-sidebar logo crop.
- Post-checkout Order Preview focus behavior.
- Contract and behavior tests for the affected UI.

### Explicitly excluded

- API, database, migration, inventory, payment, receipt-data, and hardware
  command behavior changes.
- POS transaction-history filtering and presentation changes that were already
  present in the worktree but are outside the Sell tablet scope.
- Storefront, IMS, registration, services-catalog, and unrelated generated
  artifacts.
- `apps/dgfy-api/src/services/csvExportService.js`.
- `packages/web-core/src/features/pos/components/POSTransactionHistoryPanel.jsx`.
- `packages/web-core/src/features/pos/__tests__/posTransactionHistory.contract.test.js`.
- The unrelated history-filter hunk in
  `terminalResponsiveScroll.contract.test.js`.
- The unrelated history-source hunk in
  `terminalViewModeContracts.test.js`.
- Untracked folders and files such as `apps/dgfy-web/`, `apps/store/`,
  `dist-apps/`, `local-db-backups/`, `output/pdf/`, and unrelated API,
  migration, and storefront work.

## User-facing behavior

### 1. Catalog cards match the PC geometry on tablet

The standalone DGFY POS tablet catalog now uses the PC card presentation and
media sizing. The tablet catalog defaults to four products per row, with the
available width calculated so four cards fit with the existing catalog gap.
The calculated page size is also aligned to the four-column tablet grid.

Mobile behavior remains separate, and the shared catalog still retains its
existing non-standalone/tablet behavior.

### 2. Pagination is compact and keyboard-friendly on tablet

The standalone POS tablet footer keeps only the previous and next arrow
controls plus the current-page input. Numbered page buttons and the `Go to` /
`Page` labels are hidden in this mode to reduce visual noise and preserve room
for the catalog summary.

The page input accepts digits, commits on Enter or when focus leaves the
control, synchronizes with the active page, and clamps values to the valid page
range. The accessible input label remains available through `aria-label`.

### 3. Current-sale actions reuse PC grouping and preserve tablet touch sizing

When parked-sale controls are available, tablet actions use the same six-column
grouping and ordering as PC:

1. `Print Order` and `Checkout` occupy the top row.
2. `Park Sale`, `Open Cash Drawer`, and `Split Payment` occupy the lower row.

Tablet-specific sizing remains applied through the tablet action-grid styles.
`Open Cash Drawer` now keeps its full label on one line and exposes an explicit
accessible label in tablet mode. The operator-facing label is intentionally
`Open Cash Drawer`, not a shortened `Open Cash` variant.

### 4. Drawer-authorization buttons have balanced tablet targets

The tablet drawer-authorization dialog gives `Cancel` and `Authorize & Open
Drawer` equal flexible sizing with a minimum touch height while keeping the
desktop dialog behavior unchanged.

### 5. Takeout order notes use the available tablet width

For tablet checkout confirmation, the takeout `Order Notes (Global)` field
spans the full details row. This tablet-only rule avoids the narrow field shown
in the previous layout. Desktop and non-takeout layouts retain their existing
grid placement.

### 6. Collapsed tablet sidebar logo no longer shows an extra vertical artifact

The collapsed logo crop is narrowed by one pixel so the horizontal DGFY logo
does not expose the first vertical stroke of the adjacent wordmark beside the
intended location-pin mark.

### 7. Order Preview opens with a stable focus target

After checkout, the Order Preview title receives initial focus, while the close
button uses a visible focus ring only for keyboard-visible focus. This prevents
the close `X` button from appearing selected merely because the dialog opened,
while preserving keyboard navigation feedback.

## Implementation map

### Catalog and pagination

- `packages/web-core/src/features/pos/components/POSCheckoutTerminal.jsx`
  - PC-equivalent standalone POS card and image classes on tablet.
- `packages/web-core/src/features/pos/components/POSCheckoutTerminalView.jsx`
  - Four-column tablet grid, compact pagination, typed-page handling wiring,
    and tablet drawer-dialog button sizing.
- `packages/web-core/src/features/pos/utils/posCatalogWorkflow.js`
  - Four-column tablet constant, fitted card width, and tablet page-size
    calculation.
- `packages/web-core/src/features/pos/utils/__tests__/posCatalogWorkflow.test.js`
  - Grid measurement and four-column/page-size coverage.
- `packages/web-core/src/features/pos/__tests__/posCatalogCardPresentation.contract.test.js`
  - PC-equivalent tablet card/media presentation coverage.
- `packages/web-core/src/features/pos/__tests__/terminalResponsiveScroll.contract.test.js`
  - Compact tablet pagination and drawer-dialog layout coverage.

### Current sale, takeout, logo, and focus

- `packages/web-core/src/features/pos/components/PosCurrentSaleActions.jsx`
  - PC grouping parity, full drawer label, and tablet label accessibility.
- `packages/web-core/src/index.css`
  - Tablet touch-target sizing without replacing the PC action grouping.
- `packages/web-core/src/features/pos/__tests__/posCurrentSaleActions.behavior.test.jsx`
  - Action order, grouping, and label behavior coverage.
- `packages/web-core/src/features/pos/components/FnbWorkflowPanel.jsx`
  - Tablet takeout notes full-row placement.
- `packages/web-core/src/features/pos/components/PosCheckoutDetailsSlot.jsx`
  - Passes tablet viewport context to the F&B details slot.
- `packages/web-core/src/features/pos/components/POSCheckoutConfirmDialog.jsx`
  - Supplies the existing tablet viewport state to checkout details.
- `packages/web-core/src/features/pos/__tests__/posWorkflowPanel.contract.test.jsx`
  - Takeout tablet-vs-desktop width coverage.
- `packages/web-core/src/features/pos/components/TerminalWorkspaceSidebar.jsx`
  - Corrected collapsed logo crop width.
- `packages/web-core/src/features/pos/components/POSCheckoutTerminalReceiptDialogs.jsx`
  - Order Preview initial focus and keyboard-visible close-button focus.
- `packages/web-core/src/features/pos/__tests__/terminalViewModeContracts.test.js`
  - Receipt-dialog focus contract coverage.

## Architecture and compatibility assessment

- Architecture classification: `no-architecture-impact`.
- ADR impact: none; no ownership, API, persistence, checkout, payment, or
  hardware contract was changed.
- The change stays within the shared POS presentation and pure catalog-layout
  utility boundary. It does not move feature ownership between apps.
- The tablet-specific behavior is gated by the existing standalone POS and
  viewport flags. Desktop and mobile paths remain intentionally separate.
- No backend payloads, API routes, database writes, permissions, checkout
  calculations, or drawer commands were changed.

The implementation follows the POS UI parity direction in
`docs/features/POS_HARDWARE_UI_PARITY_CONTRACT.md` and keeps POS sales
execution within the POS boundary described by ADR 0029.

## Verification evidence

The local audit performed for this branch covered:

- Targeted POS/web-core regression suite: 7 files, 98 tests passed.
- POS production build from `apps/dgfy-pos`: passed.
- POS lint for affected source and test files: passed, with only existing
  warnings (React version detection and pre-existing unused sidebar variables).
- `git diff --check`: passed.
- Tablet shell smoke at `1024x600`: page title `DGFY POS`, nonblank body,
  `<main>` present, and zero alert elements.
- The local browser session is login-gated, so authenticated catalog, checkout,
  drawer, and Order Preview interactions were not available in that smoke
  session. Static contract tests cover those affected render states.

One repository Tier 0 check remains environment-blocked: the app-version bump
checker cannot run because the root `madge` dependency is not installed. This
change does not alter app versions.

## Atomic commit and delivery plan

The intended history is split by behavior so the branch remains bisectable:

1. `feat(pos): optimize tablet sell catalog and pagination`
2. `feat(pos): align tablet sell controls and takeout layout`
3. `fix(pos): improve tablet post-checkout focus`
4. `docs(pos): document tablet sell tablet UI changes`

Only the files and hunks listed in the included scope are eligible for these
commits. No unrelated worktree file is part of the delivery set.

The branch was fast-forwarded from `16e30a22a` to the fetched
`origin/develop` tip `ca4aa82bb` before delivery preparation. The requested
remote branch did not exist at audit time, so it had no same-branch commits to
be behind. After the commits are created, the branch can be pushed as a new
remote branch with:

```text
git push -u origin codex/pos-frontend-changes-sell-tablet
```

## Rollback

Rollback is a normal Git revert of the tablet-sell commits. There are no schema
or data migrations associated with this UI-only change. If the tablet layout
causes a regression, revert the relevant atomic commit while retaining any
independent documentation or fixes that remain valid.

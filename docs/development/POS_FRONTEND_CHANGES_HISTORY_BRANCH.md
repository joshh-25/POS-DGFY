# POS Frontend Changes — History Branch

Status: complete, committed, and pushed; ready for pull request
Branch: `codex/pos-frontend-changes-history`
Comparison base: `origin/develop` (`ea06c1a56`)
Audit date: 2026-09-19
Push status: pushed at `edfa8f8232f0f09534b9249d46542c276225a3f7`

## Executive Summary

This branch contains the POS frontend work requested during the checkout, catalog, terminal, and
transaction-history responsive UI pass. The implementation is frontend-only and is committed in
atomic POS-focused commits. It covers responsive behavior for desktop, tablet portrait, tablet
landscape, and mobile layouts; stable dialog and sheet presentation; transaction-history controls;
shared pagination; terminal controls; and the no-hardware cash-drawer fallback.

The implementation/compliance delta from the current PR comparison base is 105 files, with 6,234
insertions and 1,141 deletions. This document is included in the pushed branch and records the final
handoff inventory.
The unrelated backend file `apps/dgfy-api/src/services/csvExportService.js` is intentionally outside
this branch's scope and is not present in the pushed branch diff.

## Commit Inventory

The branch currently contains these nine commits after the comparison base:

| Commit | Subject | Scope |
| --- | --- | --- |
| `b9f9a15c0` | `docs(pos): declare frontend history responsive changes` | Adds the compliance impact declaration required by the repository hook. |
| `6719e949e` | `feat(pos): add shared pagination control` | Adds the reusable pagination primitive and focused tests. |
| `dc10eaef3` | `feat(pos): refine checkout and catalog workflows` | Refines checkout/catalog behavior, responsive presentation, app integration, and contracts. |
| `160fb973d` | `fix(pos): stabilize history and terminal responsive layouts` | Completes history, terminal, operational-panel, and responsive layout changes. |
| `1963b6c99` | `chore(pos): bump frontend app versions` | Bumps app manifests/lockfiles to satisfy the blocking shared-web-core version gate. |
| `a125ae286` | `docs(pos): document history branch changes` | Records the complete scope, push inventory, exclusions, rollback boundary, and audit evidence for this branch. |
| `72a5858a3` | `chore(sync): synchronize POS branch with develop` | Synchronizes the branch with the current develop baseline before the final POS push. |
| `5e390ff4b` | `fix(pos): stabilize availability badge in tablet portrait` | Keeps the tablet-portrait availability state readable without changing other viewports. |
| `edfa8f823` | `fix(pos): refine tablet portrait catalog badges` | Enlarges tablet-portrait catalog cards/images and keeps availability badges on one line. |

No commit was created for the excluded API file. The complete POS change set and this documentation
are present on the remote branch at `edfa8f823`.

## Functional Changes

### Checkout and payment presentation

- Stabilized checkout confirmation, receipt, payment, split-payment, parked-sale, item-options, and
  current-sale action presentation across responsive POS layouts.
- Reworked mobile checkout sheet behavior so expand/collapse uses a stable height/transform flow
  instead of a shrinking-then-growing jump.
- Preserved the intended slide-up/slide-down transition while avoiding teleporting content and
  unintended animation in mobile checkout surfaces.
- Kept receipt actions, payment controls, discount presentation, and confirmation guards wired to the
  existing workflow contracts.
- Preserved unsupported cash-drawer behavior: the action remains available and reports the honest
  no-hardware outcome instead of disappearing or falsely claiming success.
- Removed the no-longer-needed hardware capability dependency from the affected POS hardware path
  while keeping the fallback behavior covered by tests.

### Catalog and responsive tablet layout

- Adjusted POS catalog sizing and spacing for tablet portrait and tablet landscape layouts to reduce
  excessive whitespace while keeping cards and controls readable.
- Preserved catalog image loading and fallback behavior while updating responsive loading contracts.
- Added and aligned catalog pagination behavior through the shared pagination control.
- Kept catalog workflow state, page-size handling, item options, and category/card presentation
  covered by contract tests.

### Transaction history

- Added responsive history behavior for desktop, tablet portrait, tablet landscape, and mobile.
- Applied the mobile-style history presentation to tablet portrait where requested.
- Kept the filter and calendar dialogs centered and appropriately sized in tablet portrait instead of
  using the narrow mobile sheet proportions.
- Added the darker tablet-portrait overlay for filter/calendar dialogs without changing other views.
- Made the calendar cancel action reddish consistently.
- Added mobile pagination bottom spacing so controls sit slightly above the device safe-area/home
  indicator.
- Reduced excessive spacing in history filter controls and kept filter buttons at consistent widths.
- Removed the sticky hover appearance that made a hovered history control look permanently selected
  after clicking.
- Restored the tablet-landscape action column and aligned its action icons with the other values in
  the same column rather than centering them against the wrong header position.
- Used eye-style view actions consistently in the history surfaces where the history UI calls for a
  view affordance.
- Preserved transaction query, void, pagination, filter, calendar, and row-action contracts.

### Terminal shell and operational workspaces

- Corrected responsive top-bar spacing, including the gap between text-size controls and
  notifications, across POS views.
- Preserved text-size control behavior and updated the associated CSS/layout contracts.
- Updated terminal lock/company selection presentation and tests for the custom selector behavior.
- Preserved notification and terminal view-mode behavior across responsive breakpoints.
- Applied the shared pagination control to POS operational panels including audit, cashier history,
  F&B, pricelist, voucher, and terminal operations surfaces.
- Kept operational workspace scroll and panel layout behavior aligned with the tablet/mobile viewport
  classifier.

### Shared UI and app integration

- Added `packages/web-core/Components/ui/pagination.jsx`, a reusable controlled pagination control
  with page-size, previous/next, page indicator, and go-to-page behavior.
- Added focused pagination tests and wired the component through POS consumers.
- Refined the shared dialog component used by POS responsive surfaces.
- Added the POS Vite configuration needed for the shared source-tree integration.
- Updated the POS E2E login fixture for the current company-selection flow.
- Bumped `dgfy-ims` and `dgfy-pos` from `1.9.3` to `1.9.4` and `dgfy-storefront` from `1.10.3`
  to `1.10.4`, including their lockfiles. This is release metadata only: no Storefront source
  behavior changed. The repository's blocking `check-app-version-bump.js` treats `packages/web-core`
  as a declared file dependency of all frontend apps, so all three consumers require a SemVer
  increase even though the reachability shadow audit found the changed POS modules are not reachable
  from Storefront.

## Responsive Behavior Matrix

| View | Verified behavior |
| --- | --- |
| Desktop | Full terminal shell, catalog/history workspace, table actions, filter/calendar dialogs, and operational panels remain available with desktop spacing. |
| Tablet portrait | History uses the mobile-style list behavior where requested; filter/calendar dialogs are centered and larger; overlay is darker; catalog spacing is tightened; mobile pagination/spacing behavior is preserved where applicable. |
| Tablet landscape | History table remains wide enough to show the action column; action controls align with their column values; top-bar and panel spacing remain balanced. |
| Mobile | Checkout/history sheets use stable slide transitions; filter controls remain horizontally scrollable; history pagination has a small bottom inset; hover does not remain stuck as selection; terminal controls remain usable. |

## Compliance and Safety

- Added [`2026-09-18-pos-frontend-history-responsive.md`](../compliance/impact-declarations/2026-09-18-pos-frontend-history-responsive.md).
- Updated the existing [`2026-09-09-pos-frontend-terminal-followup.md`](../compliance/impact-declarations/2026-09-09-pos-frontend-terminal-followup.md) evidence on the branch.
- The declaration classifies this as a major POS/terminal frontend change because it touches
  checkout, transaction evidence, operator controls, and responsive terminal behavior.
- No backend routes, fiscal calculations, payment settlement, tax rules, receipt persistence, tenant
  schemas, permissions, authentication, or migrations were changed by this branch delta.
- The pre-commit compliance hook passed for every sensitive commit after the declaration was added.
- The prohibited-commit-marker audit returned no markers in the POS files staged for this branch.

## Local Audit Evidence

| Check | Result |
| --- | --- |
| POS subtree plus pagination tests | PASS — 201 test files, 1,304 tests |
| `npm run lint` in `apps/dgfy-pos` | PASS |
| `npm run build` in `apps/dgfy-pos` | PASS |
| `npm run build` in `apps/dgfy-ims` | PASS |
| `npm run smoke:pos-terminal-ui` | PASS — desktop 1440×960, tablet 820×1180, mobile 390×844; no terminal console or HTTP errors |
| `npm run check:compliance` | PASS |
| `npm run check:compliance -- --staged` during sensitive commits | PASS |
| `node scripts/check-app-version-bump.js --staged` | PASS — all changed app consumers had a SemVer increase |
| `git diff --check` | PASS |
| `npm run lint:docs` and strict ADR check through pre-commit | PASS |

The smoke run also recorded the expected local sales-handoff fallback: the local Skupervisor origin
was unavailable for the direct `/sales` request, but the POS direct handoff completed and the smoke
script reported `passed: true`. This is not a POS terminal failure.

The earlier full IMS suite was not used as the branch gate because it covers unrelated IMS areas. In
that audit, the POS failures were stale contracts and were corrected; the remaining non-POS failure
was `packages/web-core/src/features/inventory/__tests__/externalProductLookup.contract.test.js`,
which is outside this POS scope. The complete POS subtree audit passed independently.

Build output retained two existing warnings: one Vite dynamic/static import warning for
`utils/imageEncoding/rolloutFlag.js`, and large generated chunks above the configured 1,100 kB
warning threshold. Neither warning failed the build or originated from a POS runtime error.

## Complete Push Inventory

The following files are included in the branch delta and are the files to push with this branch.

### App manifests and POS integration

- `apps/dgfy-ims/package.json`
- `apps/dgfy-ims/package-lock.json`
- `apps/dgfy-pos/package.json`
- `apps/dgfy-pos/package-lock.json`
- `apps/dgfy-pos/tests/e2e/fixtures/login.js`
- `apps/dgfy-pos/vite.config.js`
- `apps/dgfy-storefront/package.json` — version metadata required by the shared dependency gate only
- `apps/dgfy-storefront/package-lock.json` — version metadata required by the shared dependency gate only

### Compliance documentation

- `docs/compliance/impact-declarations/2026-09-09-pos-frontend-terminal-followup.md`
- `docs/compliance/impact-declarations/2026-09-18-pos-frontend-history-responsive.md`
- `docs/development/POS_FRONTEND_CHANGES_HISTORY_BRANCH.md` — this document

### Shared UI

- `packages/web-core/Components/ui/dialog.jsx`
- `packages/web-core/Components/ui/pagination.jsx`
- `packages/web-core/Components/ui/__tests__/pagination.test.jsx`

### POS components

- `packages/web-core/src/features/pos/components/AuditWorkspacePanel.jsx`
- `packages/web-core/src/features/pos/components/CashierHistoryPanel.jsx`
- `packages/web-core/src/features/pos/components/FnbWorkflowPanel.jsx`
- `packages/web-core/src/features/pos/components/ItemOptionsDialog.jsx`
- `packages/web-core/src/features/pos/components/POSCheckoutConfirmDialog.jsx`
- `packages/web-core/src/features/pos/components/POSCheckoutTerminal.jsx`
- `packages/web-core/src/features/pos/components/POSCheckoutTerminalReceiptDialogs.jsx`
- `packages/web-core/src/features/pos/components/POSCheckoutTerminalView.jsx`
- `packages/web-core/src/features/pos/components/POSTransactionHistoryPanel.jsx`
- `packages/web-core/src/features/pos/components/PosCurrentSaleActions.jsx`
- `packages/web-core/src/features/pos/components/PosTextSizeControl.jsx`
- `packages/web-core/src/features/pos/components/PricelistManagementPanel.jsx`
- `packages/web-core/src/features/pos/components/SkupervisorPOSCheckoutTerminal.jsx`
- `packages/web-core/src/features/pos/components/SkupervisorPOSTransactionHistoryPanel.jsx`
- `packages/web-core/src/features/pos/components/TerminalLockDrawer.jsx`
- `packages/web-core/src/features/pos/components/TerminalOperationsPanels.jsx`
- `packages/web-core/src/features/pos/components/TerminalOperationsWorkspace.jsx`
- `packages/web-core/src/features/pos/components/TerminalPageLayout.jsx`
- `packages/web-core/src/features/pos/components/VoucherManagementPanel.jsx`

### POS hooks, pages, utilities, and hardware fallback

- `packages/web-core/src/features/pos/hardware/usePosHardware.js`
- `packages/web-core/src/features/pos/hardware/__tests__/usePosHardware.test.jsx`
- `packages/web-core/src/features/pos/hooks/usePosCatalogWorkflow.js`
- `packages/web-core/src/features/pos/hooks/usePosCheckoutWorkflow.js`
- `packages/web-core/src/features/pos/hooks/usePosHistoryVoidWorkflow.js`
- `packages/web-core/src/features/pos/hooks/__tests__/usePosCatalogWorkflow.test.jsx`
- `packages/web-core/src/features/pos/hooks/__tests__/usePosCheckoutWorkflow.test.jsx`
- `packages/web-core/src/features/pos/pages/TerminalPage.jsx`
- `packages/web-core/src/features/pos/utils/posCatalogWorkflow.js`
- `packages/web-core/src/features/pos/utils/posHistoryQuery.js`
- `packages/web-core/src/features/pos/utils/posOrderHistoryLoader.js`
- `packages/web-core/src/features/pos/utils/posTabletViewport.js`
- `packages/web-core/src/features/pos/utils/posTerminalLayout.js`
- `packages/web-core/src/features/pos/utils/__tests__/posCatalogWorkflow.test.js`
- `packages/web-core/src/features/pos/utils/__tests__/posTabletViewport.test.js`

### POS behavior and contract tests

- `packages/web-core/src/features/pos/__tests__/POSCheckoutConfirmDialog.behavior.test.jsx`
- `packages/web-core/src/features/pos/__tests__/TerminalLockDrawer.dgfy.test.jsx`
- `packages/web-core/src/features/pos/__tests__/itemsPagination.contract.test.js`
- `packages/web-core/src/features/pos/__tests__/posCatalogCardPresentation.contract.test.js`
- `packages/web-core/src/features/pos/__tests__/posCatalogPerformance.contract.test.js`
- `packages/web-core/src/features/pos/__tests__/posCurrentSaleActions.behavior.test.jsx`
- `packages/web-core/src/features/pos/__tests__/posHistoryQuery.test.js`
- `packages/web-core/src/features/pos/__tests__/posItemOptions.contract.test.js`
- `packages/web-core/src/features/pos/__tests__/posModePresentationMatrix.behavior.test.jsx`
- `packages/web-core/src/features/pos/__tests__/posParkedSale.contract.test.js`
- `packages/web-core/src/features/pos/__tests__/posPrinterAvailabilityAndReceiptView.contract.test.js`
- `packages/web-core/src/features/pos/__tests__/posSplitPaymentUi.contract.test.js`
- `packages/web-core/src/features/pos/__tests__/posTabletViewport.contract.test.js`
- `packages/web-core/src/features/pos/__tests__/posTextSizeControl.test.jsx`
- `packages/web-core/src/features/pos/__tests__/posTextSizeCss.contract.test.js`
- `packages/web-core/src/features/pos/__tests__/posTextSizeIntegration.contract.test.js`
- `packages/web-core/src/features/pos/__tests__/posTextSizeLayout.contract.test.js`
- `packages/web-core/src/features/pos/__tests__/posTransactionHistory.behavior.test.jsx`
- `packages/web-core/src/features/pos/__tests__/posTransactionHistory.contract.test.js`
- `packages/web-core/src/features/pos/__tests__/posWorkflowPanel.contract.test.jsx`
- `packages/web-core/src/features/pos/__tests__/terminalLockDrawer.contract.test.jsx`
- `packages/web-core/src/features/pos/__tests__/terminalNotificationPopover.contract.test.js`
- `packages/web-core/src/features/pos/__tests__/terminalResponsiveScroll.contract.test.js`
- `packages/web-core/src/features/pos/__tests__/terminalViewModeContracts.test.js`

### Shared POS styling

- `packages/web-core/src/index.css`

## Excluded Files

The following file was intentionally excluded from this POS branch and must not be added to its PR:

- `apps/dgfy-api/src/services/csvExportService.js` — unrelated backend CSV export import change.

It was not staged or included in any commit. The current branch worktree is clean, and the file is not
part of `origin/develop...codex/pos-frontend-changes-history`.

## Rollback and Handoff

To roll back the POS branch as a unit, revert the POS commits in reverse order, including the
compliance declaration and this documentation as appropriate. Do not revert the unrelated API change.

Before opening or updating the PR, confirm:

1. The current branch is `codex/pos-frontend-changes-history`.
2. The nine commits listed above are present locally and remotely.
3. The excluded API file is not in the branch diff.
4. The local audit commands in this document still pass if any additional edits are made.
5. The PR targets `develop` and uses `Refs #1798` for the related POS tablet verification issue;
   the issue remains open because deployed QA evidence is outside this implementation PR.

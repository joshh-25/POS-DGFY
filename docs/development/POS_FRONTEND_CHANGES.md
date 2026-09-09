---
status: reference
authority_level: reference
owner: pos
date: 2026-09-09
last_reviewed: 2026-09-09
applies_to: pos_frontend
topic: pos_frontend_branch_change_inventory
---

# POS Frontend Change Inventory

## Purpose

This document records the POS frontend work currently present in the local branch
'codex/services-storefront-next-followup'. It is a branch snapshot and an audit
inventory, not a replacement for an ADR, API contract, or governed feature document.
The governed architecture and ADR documents listed below take precedence if a future
change conflicts with this record.

The documented feature snapshot consists of the following three local commits:

| Commit | Conventional Commit | Scope | Files | Diff |
|---|---|---:|---:|---:|
| 6bab3628f | style(pos): refine terminal catalog presentation | Catalog and terminal presentation | 25 | +981 / -312 |
| bb03fc154 | fix(pos): harden checkout payment workflows | Checkout, payment, discount, settlement, and receipt workflows | 31 | +806 / -434 |
| 67170d806 | style(pos): normalize operational workspace presentation | Operational workspaces, mode panels, reports, history, printing, and hardware formatting | 39 | +240 / -212 |
| **Total** |  |  | **95** | **+2,027 / -958** |

The three commits are local only. They have not been pushed by this documentation task.
The documentation commit, if created separately, is not part of the 95-file feature
snapshot.

## Scope and safety boundary

### Included

- POS frontend code and POS tests under packages/web-core/src/features/pos.
- Catalog browsing and presentation, terminal layout, current-sale interaction,
  checkout/payment workflows, discount and split-tender behavior, operational panels,
  receipts/printing, history/reporting, and POS utility formatting.
- Responsive and accessibility contract corrections that protect the POS UI behavior.

### Not included

- No backend, migration, tenant-schema, or new API endpoint changes are in these three
  POS commits.
- No public Services storefront booking, fulfillment, tracking, or storefront-route
  implementation is included in these three commits.
- The branch still has service-related ancestors and unrelated dirty/unmerged work in
  the working tree. Those are intentionally excluded from this POS inventory and must
  not be included in a POS-only push.
- The POS-side ServicesWorkflowPanel and related POS mode presentation are included
  because they are POS screens. That does not mean the public Services storefront flow
  was changed.

The changed code lives in the shared packages/web-core frontend trunk. This means the
package can be consumed by more than one frontend application, but the feature commits
themselves contain only POS feature paths. The production build evidence below was run
for apps/dgfy-pos; a release owner should still run the required application matrix
before promoting a branch that combines this work with other frontend changes.

### Branch status at audit time

- Current local branch: codex/services-storefront-next-followup.
- Compared with the fetched origin/develop, the branch was **709 commits behind and
  6 commits ahead** before this documentation commit. The six commits ahead were the
  three POS commits plus three service-related commits already in the branch history.
- No remote branch named codex/services-storefront-next-followup was found during the
  audit.
- The POS path was clean after the three feature commits:
  git status --short -- packages/web-core/src/features/pos returned no output, and
  git diff HEAD --name-only -- packages/web-core/src/features/pos returned no output.
- The rest of the worktree contains existing user changes, including non-POS and
  unresolved paths. They were preserved.

Because the branch is substantially behind develop and its history is mixed, it is
not the safest branch to push as a POS-only branch. The safer release inventory is to
start a fresh branch from the current origin/develop and cherry-pick only the three
POS commits, plus this documentation commit if the documentation is intended to ship.

## Governing references

The implementation and this inventory were checked against:

- [docs/START_HERE.md](../START_HERE.md) for repository documentation routing.
- [docs/architecture/ARCHITECTURE_BOUNDARIES.md](../architecture/ARCHITECTURE_BOUNDARIES.md)
  for application and backend-layer boundaries.
- [docs/architecture/ARCHITECTURE_GOVERNANCE.md](../architecture/ARCHITECTURE_GOVERNANCE.md)
  for architecture-impact classification and evidence expectations.
- [docs/architecture/adr/0029-catalog-inventory-pos-storefront-ownership-boundaries.md](../architecture/adr/0029-catalog-inventory-pos-storefront-ownership-boundaries.md)
  for catalog identity, POS sales execution, and storefront presentation ownership.
- [docs/architecture/adr/0031-pos-terminal-pairing-and-shift-safe-navigation.md](../architecture/adr/0031-pos-terminal-pairing-and-shift-safe-navigation.md)
  for terminal identity, cashier access, and shift-safe navigation.
- [docs/architecture/adr/0051-pos-employee-credit-tender-and-ledger.md](../architecture/adr/0051-pos-employee-credit-tender-and-ledger.md)
  for employee-credit payment behavior.
- [docs/architecture/adr/0055-tenant-scoped-pos-catalog-realtime-invalidation.md](../architecture/adr/0055-tenant-scoped-pos-catalog-realtime-invalidation.md)
  for tenant-scoped catalog data and invalidation boundaries.
- [docs/architecture/adr/0063-pos-split-tender-and-manual-walk-in-payment-recording.md](../architecture/adr/0063-pos-split-tender-and-manual-walk-in-payment-recording.md)
  for split tender and manual walk-in payment recording.
- [docs/architecture/adr/0065-pos-shared-parked-sales-and-cashier-handoff.md](../architecture/adr/0065-pos-shared-parked-sales-and-cashier-handoff.md)
  for parked-sale ownership and cashier handoff.
- [docs/architecture/adr/0070-downpayment-authorization-across-workflow-modes.md](../architecture/adr/0070-downpayment-authorization-across-workflow-modes.md)
  for downpayment authorization and workflow-mode behavior.
- [docs/architecture/adr/0073-pos-cashier-attendance-breaks-and-register-operator-sessions.md](../architecture/adr/0073-pos-cashier-attendance-breaks-and-register-operator-sessions.md)
  for current POS operator-session behavior.
- [docs/architecture/adr/0077-pos-cheque-tender-method-scoped-supersession.md](../architecture/adr/0077-pos-cheque-tender-method-scoped-supersession.md)
  for cheque tender behavior.

No new architecture phase is created by this document. It records already committed
work and introduces no new runtime behavior; the continuous phase ledger therefore does
not need a new entry.

## Change summary by functional area

### 1. Catalog and terminal presentation

Commit 6bab3628f improves the catalog and terminal shell without moving catalog or
inventory ownership into POS:

- Added a responsive catalog page-size control with an Auto mode and explicit page
  options.
- Added bounded page-jump input and visible page-number controls, including clamping to
  valid pages and a compact maximum visible-page set.
- Improved catalog search, category-strip scrolling, barcode scanning layout, and touch
  behavior for narrow screens.
- Added safer responsive image handling: mobile-safe sources, source-set suppression in
  mobile-safe mode, placeholder/error fallback behavior, loading priorities, and a
  session-scoped image-failure cache.
- Improved wrapping and truncation for imageless catalog names, item names, prices,
  quantity controls, service labels, badges, and item-option content.
- Refined current-sale and item-option layout, parked-sale action ordering, terminal
  dialogs, sidebar panels, and responsive page surfaces.
- Replaced the POS text-size select presentation with a custom accessible button/listbox
  control supporting Normal, Large, and Extra large preferences, Escape handling, and
  outside-click dismissal.
- Added tests for catalog card presentation, performance/image behavior, item options,
  mobile focus/zoom, mode presentation, text-size behavior/layout/CSS/integration,
  terminal scrolling, and terminal view contracts.

### 2. Checkout, payments, discounts, settlement, and receipts

Commit bb03fc154 hardens the sales-completion path:

- Standardized POS monetary display around the peso glyph ₱ in checkout, payment,
  settlement, and related receipt-facing surfaces. Existing numeric calculations remain
  numeric; this is presentation and formatting normalization.
- Reworked the checkout confirmation surface for mobile sheets and desktop panels with
  bounded horizontal/vertical scrolling and overscroll containment.
- Improved payment-method layout, payment totals, discount selection, statutory and
  commercial discount controls, employee selection/approval, promo/affiliate behavior,
  and selected-state clearing.
- Improved split-tender dialogs and workflows, including manual tender support,
  validation, paid/remaining/change summaries, tender detail presentation, and amount
  arithmetic formatting.
- Refined balance settlement, downpayment settings, refund, bill-request, parked-sales,
  and receipt-dialog presentation.
- Refined employee-credit management, payment, and report panels while preserving the
  employee-credit behavior covered by its ADR.
- Added or updated tests for checkout confirmation, bill requests, discounts,
  downpayments, employee credit, split tender, receipt contracts, terminal settlement,
  downpayment visibility, parked sales, and checkout utility formatting.

### 3. Operational workspace and mode consistency

Commit 67170d806 normalizes the broader POS operating experience:

- Refined terminal operations, transaction history, cashier history, audit workspace,
  reports/analytics, and terminal-lock surfaces.
- Refined mode-specific panels for F&B, counter, services, hospitality, and F&B
  modifiers. Mode-specific terminology and controls remain isolated so F&B/service
  concepts do not leak across the wrong POS mode.
- Refined online-order details, online-order receipts, order previews, and the
  Skupervisor POS parallels.
- Refined affiliates, delivery-pricing settings, pricelist management, voucher
  management, and voucher form modeling.
- Refined receipt printing, shift-close summaries, Z-reading, and order-ticket-related
  presentation.
- Standardized currency labels and tenant-symbol fallback behavior in operational
  panels.
- Refined iMin hardware bridge formatting, incoming-queue formatting, history search,
  and void-audit utilities.
- Added or updated tests for cashier history, close-report payment breakdown, delivery
  campaigns, incoming queue view modes, always-available behavior, audit/void behavior,
  workflow-panel contracts, terminal locking, history search, and iMin order-ticket
  formatting.

## End-to-end POS behavior map

The changes can be reviewed in this order:

1. **Terminal entry and shell** — terminal lock/pairing and operator-session surfaces
   establish the POS context; responsive shell and dialog containers keep controls
   usable at the available viewport size.
2. **Catalog discovery** — search, categories, barcode scanning, page size, page jump,
   pagination, image fallback, and text-size controls determine how a cashier finds an
   item or service.
3. **Current sale** — selecting an item opens the appropriate options flow, supports
   quantity changes and service/item customization, and exposes park, clear, and related
   sale actions with responsive ordering.
4. **Checkout preparation** — the checkout surface summarizes the current sale and
   allows discounts, employee-credit behavior, downpayment settings, and payment-method
   selection.
5. **Payment completion** — split tender, manual tender, cheque, settlement, change,
   validation, and checkout confirmation use consistent totals and presentation.
6. **Receipt and follow-up** — receipt dialogs, order preview, printing, transaction
   history, cashier history, and audit/report surfaces use the normalized currency and
   responsive workspace patterns.
7. **Mode-specific operation** — F&B, counter, services, and hospitality panels expose
   their own operational controls while sharing the POS shell and presentation rules.

## UI/UX and frontend contract standards applied

### Typography and text behavior

- POS hierarchy uses the existing strong heading/label treatment, with constrained
  wrapping and line clamping where card width is limited.
- Item and service names are allowed to wrap without overflowing quantity or price
  controls.
- User-controlled POS text size is exposed through an accessible custom listbox rather
  than an unstyled native select-like control.
- Operational labels, payment totals, and status text use consistent weight and spacing
  across the POS workspaces.

### Responsive behavior

- Narrow screens use bounded scroll regions and mobile sheets where dialogs would
  otherwise exceed the viewport.
- Horizontal category strips and catalog viewports support touch interaction without
  creating page-level overflow.
- Images use responsive loading/fallback rules and avoid downloading inappropriate
  source variants in mobile-safe mode.
- Dialogs and panels contain their scroll area, preserving access to primary actions.

### Accessibility and interaction behavior

- Custom controls expose labels, expanded state, and listbox semantics where applicable.
- Escape and outside-click behavior closes transient controls consistently.
- Buttons and controls preserve keyboard-accessible focus and explicit action semantics.
- Contract tests pin the expected classes, roles, labels, layout states, and mode-specific
  copy so future visual cleanup does not silently remove behavior.

### Currency and visual consistency

- POS monetary presentation uses ₱ in the affected checkout and operational surfaces,
  with locale-aware numeric formatting where the component already supports it.
- Some operational panels use a tenant currency-symbol fallback while retaining the peso
  default used by the local POS experience.
- POS surface colors continue to use the existing POS blue/slate/cyan/emerald/amber/
  rose visual language. These are POS surface choices; they do not replace the separate
  Services storefront palette or any storefront theme contract.

## Data, ownership, and persistence notes

- Catalog identity and inventory truth remain outside POS, consistent with ADR 0029.
  POS consumes catalog information for sales execution and presentation.
- The commits use existing frontend data and API contracts; they do not add an endpoint,
  migration, tenant-schema change, or backend controller.
- The catalog image-failure cache is browser sessionStorage state used to avoid
  repeatedly requesting a source that failed during the current session. It is not a
  server-side catalog update and does not replace the catalog image source of truth.
- Existing POS workflows for parked sales, employee credit, split tender, downpayments,
  cheque tender, operator sessions, and hardware formatting were refined in their
  current boundaries; no ownership transfer was introduced.
- Service-related controls in the POS mode panel are POS operational presentation only.
  They must not be read as changes to Ralph's Laundry, Ralph's Salon, or any other
  public service storefront flow.

## Exhaustive changed-file manifest

The following lists are the complete 95-file manifest for the three documented feature
commits. All paths are repository-relative and are under the shared POS feature trunk.

### Commit 6bab3628f — catalog and terminal presentation

#### Tests and contracts

~~~text
packages/web-core/src/features/pos/__tests__/posCatalogCardPresentation.contract.test.js
packages/web-core/src/features/pos/__tests__/posCatalogPerformance.contract.test.js
packages/web-core/src/features/pos/__tests__/posItemOptions.contract.test.js
packages/web-core/src/features/pos/__tests__/posMobileFocusZoom.contract.test.js
packages/web-core/src/features/pos/__tests__/posModePresentationMatrix.behavior.test.jsx
packages/web-core/src/features/pos/__tests__/posTextSizeControl.test.jsx
packages/web-core/src/features/pos/__tests__/posTextSizeCss.contract.test.js
packages/web-core/src/features/pos/__tests__/posTextSizeIntegration.contract.test.js
packages/web-core/src/features/pos/__tests__/posTextSizeLayout.contract.test.js
packages/web-core/src/features/pos/__tests__/terminalResponsiveScroll.contract.test.js
packages/web-core/src/features/pos/__tests__/terminalViewModeContracts.test.js
packages/web-core/src/features/pos/utils/__tests__/posCatalogWorkflow.test.js
~~~

These tests lock catalog presentation, image/performance behavior, item options,
mobile focus/zoom, mode presentation, text-size control and layout, responsive scrolling,
terminal view modes, and catalog workflow utilities.

#### Components, hooks, services, and utilities

~~~text
packages/web-core/src/features/pos/components/ItemOptionsDialog.jsx
packages/web-core/src/features/pos/components/POSBarcodeScanner.jsx
packages/web-core/src/features/pos/components/POSCheckoutTerminalView.jsx
packages/web-core/src/features/pos/components/PosCurrentSaleActions.jsx
packages/web-core/src/features/pos/components/PosTextSizeControl.jsx
packages/web-core/src/features/pos/components/ServiceOptionsModal.jsx
packages/web-core/src/features/pos/components/TerminalPageDialogLayer.jsx
packages/web-core/src/features/pos/components/TerminalPageLayout.jsx
packages/web-core/src/features/pos/components/TerminalSidebarPanel.jsx
packages/web-core/src/features/pos/hooks/usePosCatalogWorkflow.js
packages/web-core/src/features/pos/services/posCatalogImageFailureStore.js
packages/web-core/src/features/pos/utils/posCatalogWorkflow.js
packages/web-core/src/features/pos/utils/posTerminalLayout.js
~~~

These files implement the catalog controls, responsive terminal/catalog layout,
current-sale presentation, item/service option surfaces, text-size control, image
fallback state, and catalog workflow helpers described above.

### Commit bb03fc154 — checkout and payment workflows

#### Tests and contracts

~~~text
packages/web-core/src/features/pos/__tests__/POSCheckoutConfirmDialog.behavior.test.jsx
packages/web-core/src/features/pos/__tests__/billRequestDialog.behavior.test.jsx
packages/web-core/src/features/pos/__tests__/discountQuantityEmployeeDropdown.contract.test.js
packages/web-core/src/features/pos/__tests__/discountTypeCards.contract.test.js
packages/web-core/src/features/pos/__tests__/downpaymentSettingsPanel.behavior.test.jsx
packages/web-core/src/features/pos/__tests__/employeeCredit.contract.test.js
packages/web-core/src/features/pos/__tests__/employeeCreditManagementPanel.behavior.test.jsx
packages/web-core/src/features/pos/__tests__/employeeCreditPaymentPanel.behavior.test.jsx
packages/web-core/src/features/pos/__tests__/itemDiscountEligibility.contract.test.js
packages/web-core/src/features/pos/__tests__/posParkedSalesDialog.contract.test.js
packages/web-core/src/features/pos/__tests__/posSplitPaymentManualTender.behavior.test.jsx
packages/web-core/src/features/pos/__tests__/posSplitPaymentUi.contract.test.js
packages/web-core/src/features/pos/__tests__/receiptContractConformance.contract.test.js
packages/web-core/src/features/pos/__tests__/terminalBalanceSettlement.behavior.test.jsx
packages/web-core/src/features/pos/__tests__/terminalDownpaymentVisibility.behavior.test.jsx
packages/web-core/src/features/pos/utils/__tests__/posCheckoutTerminalUtils.test.js
~~~

These tests cover checkout confirmation, bill requests, discounts, downpayments,
employee credit, discount eligibility, parked sales, split/manual tender, receipt
contracts, settlement, downpayment visibility, and checkout formatting utilities.

#### Components and utilities

~~~text
packages/web-core/src/features/pos/components/BalanceSettlementDialog.jsx
packages/web-core/src/features/pos/components/BillRequestDialog.jsx
packages/web-core/src/features/pos/components/DownpaymentSettingsPanel.jsx
packages/web-core/src/features/pos/components/EmployeeCreditManagementPanel.jsx
packages/web-core/src/features/pos/components/EmployeeCreditPaymentPanel.jsx
packages/web-core/src/features/pos/components/EmployeeCreditReportPanel.jsx
packages/web-core/src/features/pos/components/POSCheckoutConfirmDialog.jsx
packages/web-core/src/features/pos/components/POSCheckoutTerminal.jsx
packages/web-core/src/features/pos/components/POSCheckoutTerminalReceiptDialogs.jsx
packages/web-core/src/features/pos/components/POSDiscountWorkspace.jsx
packages/web-core/src/features/pos/components/POSParkedSalesDialog.jsx
packages/web-core/src/features/pos/components/POSRefundWorkflowDialog.jsx
packages/web-core/src/features/pos/components/POSSplitPaymentDialog.jsx
packages/web-core/src/features/pos/components/POSSplitPaymentWorkflow.jsx
packages/web-core/src/features/pos/utils/posCheckoutTerminalUtils.js
~~~

These files implement the checkout shell, payment confirmation, discount workspace,
split payments, settlements, refunds, downpayments, employee credit, parked sales,
bill requests, receipt dialogs, and checkout formatting/validation behavior.

### Commit 67170d806 — operational workspace presentation

#### Tests and contracts

~~~text
packages/web-core/src/features/pos/__tests__/cashierHistoryPanel.test.jsx
packages/web-core/src/features/pos/__tests__/closeReportPaymentBreakdown.test.jsx
packages/web-core/src/features/pos/__tests__/deliveryCampaignPanel.behavior.test.jsx
packages/web-core/src/features/pos/__tests__/incomingQueueViewMode.behavior.test.jsx
packages/web-core/src/features/pos/__tests__/posAlwaysAvailable.contract.test.js
packages/web-core/src/features/pos/__tests__/posAuditWorkspace.contract.test.js
packages/web-core/src/features/pos/__tests__/posVoidAudit.test.js
packages/web-core/src/features/pos/__tests__/posWorkflowPanel.contract.test.jsx
packages/web-core/src/features/pos/__tests__/terminalLockDrawer.contract.test.jsx
packages/web-core/src/features/pos/utils/__tests__/iminHardwareBridge.orderTicket.test.js
packages/web-core/src/features/pos/utils/__tests__/posHistorySearch.test.js
~~~

These tests cover history, close-report breakdowns, delivery campaigns, incoming queue
view modes, always-available behavior, audit/void behavior, workflow-panel contracts,
terminal locking, hardware order tickets, and history search.

#### Components and utilities

~~~text
packages/web-core/src/features/pos/components/AffiliatesWorkspacePanel.jsx
packages/web-core/src/features/pos/components/AuditWorkspacePanel.jsx
packages/web-core/src/features/pos/components/CashierHistoryPanel.jsx
packages/web-core/src/features/pos/components/CounterWorkflowPanel.jsx
packages/web-core/src/features/pos/components/FnbModifierPickerDialog.jsx
packages/web-core/src/features/pos/components/FnbWorkflowPanel.jsx
packages/web-core/src/features/pos/components/HospitalityPosPanel.jsx
packages/web-core/src/features/pos/components/OnlineOrderDetailsModal.jsx
packages/web-core/src/features/pos/components/OnlineOrderReceiptModal.jsx
packages/web-core/src/features/pos/components/OrderPreviewView.jsx
packages/web-core/src/features/pos/components/POSTransactionHistoryPanel.jsx
packages/web-core/src/features/pos/components/PosDeliveryPricingSettingsCard.jsx
packages/web-core/src/features/pos/components/PosFnbModifierManager.jsx
packages/web-core/src/features/pos/components/PosReportsAnalyticsWorkspace.jsx
packages/web-core/src/features/pos/components/PricelistManagementPanel.jsx
packages/web-core/src/features/pos/components/ReceiptPrintView.jsx
packages/web-core/src/features/pos/components/ServicesWorkflowPanel.jsx
packages/web-core/src/features/pos/components/ShiftCloseSummaryPrintView.jsx
packages/web-core/src/features/pos/components/SkupervisorPOSCheckoutTerminal.jsx
packages/web-core/src/features/pos/components/SkupervisorPOSTransactionHistoryPanel.jsx
packages/web-core/src/features/pos/components/TerminalOperationsWorkspace.jsx
packages/web-core/src/features/pos/components/VoucherManagementPanel.jsx
packages/web-core/src/features/pos/components/ZReadingPrintView.jsx
packages/web-core/src/features/pos/components/voucherFormModel.js
packages/web-core/src/features/pos/utils/iminHardwareBridge.js
packages/web-core/src/features/pos/utils/incomingQueueOrderFormatting.js
packages/web-core/src/features/pos/utils/posHistorySearch.js
packages/web-core/src/features/pos/utils/posVoidAudit.js
~~~

These files cover operational workspaces, mode panels, online-order surfaces,
transaction/cashier history, reports, audit, pricing, affiliates, vouchers, receipts,
shift close, Z-reading, Skupervisor parallels, hardware formatting, queue formatting,
history search, and void-audit behavior.

## Validation evidence

Validation was run against the POS scope before the commits were recorded:

| Check | Command or scope | Result |
|---|---|---|
| POS unit/component/contract suite | From apps/dgfy-ims: npx vitest run --maxWorkers=1 ../../packages/web-core/src/features/pos | **PASS — 189 test files passed; 1,169 tests passed** |
| POS application lint | npm --prefix apps/dgfy-pos run lint | **PASS** |
| POS production build | From apps/dgfy-pos: $env:GOMAXPROCS='1'; npx vite build --minify=false | **PASS — 2,976 modules transformed** |
| Architecture guardrails and controller boundaries | npm run check:architecture | **PASS — ArchitectureGuardrails: 53 modules / 549 files; ControllerBoundary: 93 controller files** |
| Compliance checks | npm run check:compliance | **PASS** |
| Whitespace/error check | git diff --check -- packages/web-core/src/features/pos | **PASS** |
| Commit-marker safety scan | Repository marker scan across the POS paths | **No matches** |

### Build caveat

The normal optimized Vite build previously hit a Windows esbuild virtual-memory
allocation failure while the machine had approximately 1 GB available. The documented
successful build intentionally used a single worker and --minify=false to reduce peak
memory. This proves the application can transform and bundle the POS code under the
available local resources, but it is not equivalent to a successful minified production
build. The release pipeline or a machine with adequate memory should run the normal
production build before release approval.

### Validation not performed in this audit

- No browser-driven end-to-end walkthrough was run as part of this documentation task.
- No GitHub push, PR update, merge, deployment, or production verification was performed.
- No POS backend/API contract change was introduced, so backend and migration checks
  were not part of these three commits; the repository-wide compliance/architecture
  checks above still passed.

## POS-only release inventory and exclusions

### Files/commits intended for a POS-only follow-up branch

The POS feature payload is:

~~~text
6bab3628f style(pos): refine terminal catalog presentation
bb03fc154 fix(pos): harden checkout payment workflows
67170d806 style(pos): normalize operational workspace presentation
~~~

The 95 paths listed in the exhaustive manifest are the files associated with those
commits. If this documentation is also required in the pushed branch, include the
separate documentation commit that adds this file.

### Explicitly excluded service ancestry

These commits are present in the current branch history but are not part of the POS-only
payload:

~~~text
768d83c21 fix(pos-services): add service catalog image upload support
18257a373 fix(pos-services): expose service activity in POS
8cc5a1653 style(pos-services): normalize service image model files
~~~

They contain service-specific paths under packages/web-core/src/features/services and
service-catalog/POS service integration. They must not be bundled into a POS-only
cherry-pick or push merely because they are ancestors of the current branch.

### Explicitly excluded working-tree changes

The working tree also contains existing non-POS changes and unresolved/unmerged paths
across areas such as backend/API, migration runner, registration, storefront, and shared
service code. This document does not enumerate those as POS changes. They were not
staged, overwritten, resolved, reset, or pushed by this task.

## Recommended inspection and release procedure

Use these read-only commands to inspect the exact commits without touching the dirty
working tree:

~~~powershell
git status --short --branch
git show --stat --oneline 6bab3628f
git show --stat --oneline bb03fc154
git show --stat --oneline 67170d806
git show --name-only --format=fuller 6bab3628f
git show --name-only --format=fuller bb03fc154
git show --name-only --format=fuller 67170d806
git diff --name-only origin/develop...67170d806 -- packages/web-core/src/features/pos
git rev-list --left-right --count origin/develop...HEAD
~~~

For a safe POS-only branch, after confirming the current worktree is protected, use a
fresh branch based on the current origin/develop, then cherry-pick only the three POS
commits and the documentation commit if desired. Do not use a hard reset or checkout on
the current dirty branch. After the cherry-pick, verify:

~~~powershell
git rev-list --left-right --count origin/develop...HEAD
git diff --name-only origin/develop...HEAD
git status --short
~~~

The resulting diff should contain only packages/web-core/src/features/pos/** plus the
explicit POS documentation file. If service, backend, migration, registration, or
storefront paths appear, stop and remove them from the release inventory before pushing.

## Maintenance notes

- Update this document when the documented POS commits are amended, replaced, or
  cherry-picked into a new release branch.
- Do not claim that the whole mixed branch is POS-only; only the three listed commits are
  the POS feature payload documented here.
- Run the POS test suite, POS lint, application build, architecture checks, compliance
  checks, and the repository's required PR checks again on the final branch that will be
  pushed.
- Keep public Services storefront changes documented separately so POS operational
  screens and storefront booking/fulfillment flows remain independently reviewable.

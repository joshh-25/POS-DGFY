---
status: reference
authority_level: reference
owner: pos
last_reviewed: 2026-06-24
applies_to: pos, storefront, skupervisor
topic: recent_pos_storefront_changes
---

# Important POS Changes

This document only lists the important changes recently made to the POS, Storefront, and Skupervisor workflow.

## Shift Management

- The POS now requires an open cashier shift before sales can be made.
- If no shift is open, the cashier must open a shift first.
- Opening a shift requires an opening cash amount.
- Closing a shift now uses a custom popup modal instead of the browser confirmation box.
- After closing a shift, POS sale actions are blocked until a new shift is opened.

## POS Lock

- The POS terminal stays locked after refresh.
- The cashier must log in again to unlock the terminal.
- The locked POS screen now blurs the catalog, header, and sidebar.

## Receipt

- The receipt now shows item, unit price, quantity, and total.
- The `PHP` text was removed from receipt amounts.
- Extra receipt text like `Unit`, `units`, and `Course` was removed.
- Long item names now split into two lines.
- The receipt preview `X` button was removed.
- The `Close` button was moved to the top-right.
- The `Print` button was moved to the bottom-right.
- Receipt preview and print now support `80mm (3 1/8 inches)` paper width.
- Receipt preview and print now support `57mm (2 1/4 inches)` paper width.
- SKUpervisor receipt preview and print now use the same paper width selection.

## DGFY Account Popup

- The POS DGFY account prompt now has an `X` dismiss button.
- The cashier can close the prompt without sending a link code or creating a DGFY account.

## Discount

- The discount section now supports preset discounts and manual discounts.
- The manual discount type is now shown as `Discount Type`.
- Discount type choices are `No Manual Discount`, `Percentage`, and `Manual Amount`.
- Percentage discount uses a percentage value.
- Manual amount discount uses a fixed amount.
- Preset discounts and manual discounts cannot be combined.
- Backend validation was added for discount mode.

## Storefront

- Storefront checkout was fixed after placing an order.
- When ordering again after going back, the customer now returns to fulfillment instead of jumping directly to payment.
- Old checkout state is cleared when starting a new cart flow.

## POS Sidebar

- The `scroll for more terminal tools.` text was removed.

## POS Frontend Ownership

- POS shell ownership was migrated into `frontend/src/features/pos/components`.
- `TerminalPageLayout.jsx`, `TerminalLockDrawer.jsx`, and `TerminalWorkspaceSidebar.jsx` are now feature-owned files.
- `frontend/apps/pos/src/components/*` now keeps only thin compatibility wrappers for those three migrated POS shell files.
- POS shell contract tests were updated to read the new feature-owned paths instead of the old app-owned paths.

## Hardware Warning

- The POS device bridge status warning was silenced when the local hardware bridge is not running.
- The `You are offline. Online queue refresh and online-order actions are paused until connection is restored.` banner was removed from the POS shell.
- The `Legacy POS access used` popup was hidden from the POS terminal flow.
- The `Terminal unlocked` popup was hidden from the POS terminal flow.

## POS Items

- POS `Items` is now an IMS-backed item-management view instead of a disconnected POS-only list.
- The view shows IMS items with POS visibility enabled.
- Creating an item from POS now creates it in IMS first, then applies POS/storefront visibility on the same item record.
- Barcode generation for POS-created items now runs from the saved IMS `item_id`.
- `SKU` remains a business reference code and is not the same as the IMS `item_id`.
- The POS `Edit Item` modal now supports updating item name, category, stock quantity, price, cost, and description on the same IMS-backed record.
- The POS `Edit Item` modal now supports item image upload, and the uploaded image is written back to the shared IMS-backed record.
- The POS item row layout was compacted and rebalanced for denser item management without changing the IMS source-of-truth contract.

## POS History And Offline Sync

- Offline checkout transactions now appear directly inside POS `History` instead of a separate visible sync queue workspace for cashiers.
- Pending offline transactions stay local until the cashier explicitly clicks the history sync action.
- POS no longer auto-syncs queued offline checkout records as soon as the device reconnects.
- History now supports pending-sync receipt preview from local checkout snapshots even before the transaction is replayed to the server.
- Pending offline receipts are viewable, but print remains disabled until the transaction is synced server-side.
- The `Sync Pending Transactions` action in History is now the cashier-facing control for replaying offline checkout transactions.

## POS Reports

- `Sales Today` was removed as a separate POS workspace and its daily-record responsibilities were merged into `Reports & Analytics`.
- Daily report now carries the former `Sales Today` records inside the report workspace:
  - business date / selected daily range
  - transaction count
  - gross sales
  - net sales
  - discounts
  - refunds / voids
  - VAT
  - service fees
  - POS profit/loss
  - payment breakdown
  - order-method breakdown
  - cashier summary
  - shift summary
- POS reports now read across the POS reporting scope instead of being silently narrowed to only the active terminal/location in the frontend request layer.
- Clicking `Daily Report`, `Monthly Report`, `Yearly Report`, `Sales Comparison`, or `POS Profit/Loss` now also updates the report period automatically.
- Report tab/filter changes no longer hard-refresh the whole content area.
- The existing report data remains visible during background refresh and shows a lighter in-place update state instead of a blocking full-panel reload.

## POS Settings

- POS `Settings` inside the POS surface now includes three shared tabs: `Profile Setting`, `POS Setup`, and `Storefront`.
- `POS Setup` in POS now reuses the same shared tenant settings contract as IMS instead of a reduced POS-only form.
- The POS `POS Setup` tab now edits shared receipt metadata fields:
  - registered name
  - business name
  - business style
  - taxpayer type
  - TIN / branch
  - business address
  - PTU number
  - MIN number
  - accreditation number
  - fiscal buyer details requirement
  - receipt footer message
- The POS `POS Setup` tab now edits shared terminal policy fields:
  - terminal registry entries
  - terminal registry mode
  - strict shift location binding
- Terminal registry entries now support terminal-level passwords used by POS unlock.
- Active terminal registry entries are now limited to one active terminal per store location.
- The POS `POS Setup` tab now edits shared cashier defaults and checkout presets:
  - petty cash symbol
  - petty cash amount
  - default wait time
  - low stock alert threshold
  - POS open status
  - POS discount presets
- Saving from POS `POS Setup` now writes to the same settings keys read by IMS and receipt rendering, so POS and IMS stay synchronized on the same tenant configuration.

## POS Terminal Unlock

- DGFY account sign-in and company selection now act as the first step only.
- POS now continues into a terminal unlock step that requires:
  - a registered terminal from POS Setup
  - the terminal password configured for that terminal
  - opening cash for the shift
- Terminal unlock now validates against the shared POS terminal registry before the POS session starts.
- Terminal password hashes are stored in shared tenant settings and are not sent back to the POS UI in plaintext.
- POS unlock now opens the shift immediately using the terminal's assigned store location, so the terminal starts in a ready-to-sell state after successful unlock.

## Planned Onboarding Direction

- The intended onboarding flow is now documented as:
  - `DGFY account`
  - `Create Business Account`
  - `Settings-based POS setup`
  - `Finish tenant onboarding`
  - `POS becomes fully functional`
- POS should not feel like a second business-access login wall after company creation.
- The tenant should enter onboarding automatically after successful business creation and session handoff.
- `POS Setup` should live in Settings as part of tenant onboarding, not as a disconnected POS-only registration step.
- POS should stay limited or blocked for full selling use until the required POS setup fields are completed.
- Terminal unlock and shift open remain operational controls and should stay separate from tenant onboarding.
- Any item or shared catalog data created or edited from POS must continue to sync to the IMS-backed shared item records.
- IMS remains the source of shared item, cost, and inventory metadata; POS remains the source of sales transactions.
- `tenant_pos_enabled` remains a capability switch, while POS readiness/onboarding completion is a separate tenant setup state.

## Main Files Changed

- `frontend/src/features/pos/components/POSCheckoutTerminal.jsx`
- `frontend/src/features/pos/components/POSTransactionHistoryPanel.jsx`
- `frontend/src/features/pos/components/PosReportsAnalyticsWorkspace.jsx`
- `frontend/src/features/pos/components/ReceiptPrintView.jsx`
- `frontend/src/features/pos/components/SkupervisorPOSCheckoutTerminal.jsx`
- `frontend/src/features/pos/pages/TerminalPage.jsx`
- `frontend/src/features/pos/components/TerminalPageLayout.jsx`
- `frontend/src/features/pos/components/TerminalSidebarPanel.jsx`
- `frontend/src/features/pos/components/TerminalWorkspaceSidebar.jsx`
- `frontend/apps/store/src/StorefrontApp.jsx`
- `frontend/src/features/pos/services/posService.js`
- `backend/src/modules/pos/repositories/posRepository.js`
- `backend/src/validators/posValidator.js`
- `backend/src/modules/pos/usecases/posUseCases.js`

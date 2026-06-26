---
status: reference
authority_level: reference
owner: pos
last_reviewed: 2026-06-26
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
- Locking the terminal no longer always means restarting the whole shift flow:
  - if the current shift is still open, `Lock Terminal` now performs an operational relock only
  - reopening that locked terminal requires the terminal password only
  - reopening that locked terminal does not require opening cash again
- Closing the shift now returns the POS to a locked terminal state.
- After shift close, the next unlock returns to the full shift-start flow and requires opening cash again.

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
- Saving from the terminal registry header now persists only terminal-registry settings:
  - `pos_terminal_registry`
  - `pos_terminal_registry_mode`
  - `pos_terminal_location_binding_enforced`
- Saving terminal-registry changes no longer hard-refreshes the whole Settings workspace.
- Terminal password save behavior now persists correctly to the shared registry contract and updates the local `has_password` UI state after save.
- The POS `POS Setup` tab now edits shared cashier defaults and checkout presets:
  - petty cash symbol
  - petty cash amount
  - default wait time
  - low stock alert threshold
  - POS open status
  - POS discount presets
- Saving from POS `POS Setup` now writes to the same settings keys read by IMS and receipt rendering, so POS and IMS stay synchronized on the same tenant configuration.

## POS-First Tenant Onboarding

- New DGFY business registration now hands off directly into the POS surface instead of returning the operator to a separate IMS-first onboarding entry point.
- The guided setup handoff now uses:
  - `/terminal?setup_flow=tenant_onboarding&setup_step=profile`
- New-tenant POS entry is now enforced in this order:
  - `Create DGFY Account`
  - `Create Business Account`
  - `Automatically Go Inside POS`
  - `Profile Setting`
  - `Storefront Setup`
  - `POS Setup`
  - `Complete All Required Fields`
  - `Navigate Inside Full POS`
- During this guided flow, POS treats tenant setup as a gated sequence for the tenant master admin instead of a soft reminder only.
- The POS now owns the guided tenant-onboarding modal for this surface; it does not reuse the IMS/SKUpervisor onboarding modal UI.
- Profile Setting is the first step and reuses the business/account identity already supplied during registration.
- Profile Setting readiness is satisfied by the registered tenant/company name from the shared company/settings payload.
- Storefront Setup is the second step and uses the real Storefront fields inside POS Settings.
- Storefront Setup readiness currently requires:
  - company cover image
  - company profile icon
- POS Setup is the third step and focuses on terminal readiness before selling.
- POS Setup readiness is evaluated from the shared tenant settings contract and currently requires:
  - at least one active terminal registry entry with:
    - assigned store location
    - configured terminal password
- POS Setup readiness no longer requires business address; the business name comes from registration.
- If no registered terminal exists yet, POS does not show the open-shift modal during onboarding. The tenant must create/configure a terminal in `Settings > POS Setup` first.
- The onboarding modal exposes the required fields inside the modal itself:
  - Storefront step: cover image and profile icon uploads backed by shared Storefront settings
  - POS Setup step: terminal registry creation/update with store assignment and terminal password
- The modal navigation now uses strict onboarding labels:
  - `Back`
  - `Next Step`
  - `Finish Setup`
  - `Skip for Now`
- Step circles are clickable only for the current step and completed prior steps.
- All onboarding entry points now use the same centralized setup-flow resolver for:
  - step order
  - previous/next step navigation
  - settings tab routing
  - sidebar `Settings` entry routing while onboarding is active
- Onboarding restriction now follows live setup readiness state, not only the `setup_flow` URL query:
  - reopening POS without the onboarding query no longer bypasses the gated setup state
  - reopening `Continue onboarding` now restores the correct guided step and settings tab
- Until the guided setup is complete, the rest of the POS workspaces are intentionally restricted so the tenant finishes setup in sequence.
- Completion of all three setup stages removes the guided setup query state and returns the tenant to normal full POS navigation.
- This flow reuses the shared onboarding and shared settings backend contracts; it does not create a POS-only onboarding store.
- The onboarding modal runtime bug caused by an undefined step-count constant was fixed, so the guided setup modal now renders correctly in the live POS surface.

## POS Terminal Unlock

- POS terminal login is now a split two-stage flow:
  - DGFY account sign-in first
  - company selection second
  - terminal unlock third
- The first step now accepts only the DGFY account email and password.
- Company selection no longer appears before successful DGFY sign-in.
- After successful DGFY sign-in, POS loads the accessible companies for that account.
- After company selection, POS continues into a dedicated terminal unlock modal.
- The shift-start terminal unlock step requires:
  - a registered terminal from POS Setup
  - the terminal password configured for that terminal
  - opening cash for the shift
- Terminal unlock now validates against the shared POS terminal registry before the POS session starts.
- Terminal password hashes are stored in shared tenant settings and are not sent back to the POS UI in plaintext.
- POS unlock now opens the shift immediately using the terminal's assigned store location, so the terminal starts in a ready-to-sell state after successful unlock.
- When more than one active registered terminal exists, the unlock UI now makes it explicit that multiple terminals are available and the cashier can switch the selected terminal before unlock.
- Terminal unlock diagnostics now distinguish DGFY credential failure from terminal-password failure more clearly:
  - DGFY login failure remains an account-auth error
  - terminal password failure is now surfaced as a terminal unlock error instead of a generic email/password error
- The current intended operator sequence is:
  - DGFY sign-in
  - select accessible company
  - continue to terminal unlock
  - enter terminal password
  - if no active shift exists, enter opening cash and open the shift
  - if an active shift was only relocked, resume with terminal password only
- POS UI smoke coverage was updated to validate the current DGFY-first terminal login surface instead of the older direct-terminal-login copy.

## Onboarding And Unlock Separation

- Tenant onboarding and cashier terminal unlock are now treated as separate responsibilities.
- Tenant onboarding is the tenant-master-admin setup sequence for shared tenant readiness.
- Terminal unlock remains the cashier/operator control for:
  - registered terminal identity
  - terminal password validation
  - shift opening when required
- Closing a shift does not send the operator back to DGFY account sign-in.
- Locking an already open-shift terminal now returns to terminal unlock only.
- Full DGFY sign-in remains the outer account-authentication boundary, while terminal unlock remains the POS device/session boundary.

## Main Files Changed

- `frontend/src/features/pos/components/POSCheckoutTerminal.jsx`
- `frontend/src/features/pos/components/POSTransactionHistoryPanel.jsx`
- `frontend/src/features/pos/components/PosReportsAnalyticsWorkspace.jsx`
- `frontend/src/features/pos/components/ReceiptPrintView.jsx`
- `frontend/src/features/pos/components/SkupervisorPOSCheckoutTerminal.jsx`
- `frontend/src/features/pos/pages/TerminalPage.jsx`
- `frontend/src/features/pos/components/TerminalPageLayout.jsx`
- `frontend/src/features/pos/components/TerminalLockDrawer.jsx`
- `frontend/src/features/pos/components/PosTenantSetupModal.jsx`
- `frontend/src/features/pos/components/TerminalSidebarPanel.jsx`
- `frontend/src/features/pos/components/TerminalWorkspaceSidebar.jsx`
- `frontend/src/features/pos/components/TerminalOperationsWorkspace.jsx`
- `frontend/apps/store/src/StorefrontApp.jsx`
- `frontend/src/features/pos/services/posService.js`
- `frontend/src/features/pos/utils/setupFlow.js`
- `frontend/src/features/pos/utils/__tests__/setupFlow.test.js`
- `frontend/src/features/pos/utils/terminalUnlockDiagnostics.js`
- `frontend/src/features/pos/utils/__tests__/terminalUnlockDiagnostics.test.js`
- `backend/src/modules/pos/repositories/posRepository.js`
- `backend/src/validators/posValidator.js`
- `backend/src/modules/pos/usecases/posUseCases.js`

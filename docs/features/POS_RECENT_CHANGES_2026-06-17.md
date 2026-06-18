---
status: reference
authority_level: reference
owner: pos
last_reviewed: 2026-06-17
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

## Hardware Warning

- The POS device bridge status warning was silenced when the local hardware bridge is not running.

## Main Files Changed

- `frontend/src/features/pos/components/POSCheckoutTerminal.jsx`
- `frontend/src/features/pos/components/ReceiptPrintView.jsx`
- `frontend/src/features/pos/pages/TerminalPage.jsx`
- `frontend/src/features/pos/components/TerminalPageLayout.jsx`
- `frontend/src/features/pos/components/TerminalWorkspaceSidebar.jsx`
- `frontend/apps/store/src/StorefrontApp.jsx`
- `backend/src/validators/posValidator.js`
- `backend/src/modules/pos/usecases/posUseCases.js`

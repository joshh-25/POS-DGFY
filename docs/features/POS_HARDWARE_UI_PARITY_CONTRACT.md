---
status: authoritative
owner: pos-platform
last_reviewed: 2026-06-19
applies_to: standalone_hardware_pos_ui
topic: pos_hardware_ui_parity_contract
---

# POS Hardware UI Parity Contract

## Goal

Define the cashier UX contract that the standalone hardware POS must preserve from the current web POS. This document governs operator flow and user-visible behavior. It does not require the hardware app to share browser components or render the hosted POS.

## Source Of Truth

The current web POS flow remains the source-of-truth cashier journey for:

- screen order
- labels and operator-facing terms
- navigation sequence
- validation semantics
- checkout semantics
- history semantics
- sync-state semantics
- hardware status semantics

## Required Screens

1. Splash / runtime readiness
2. Cashier login / unlock
3. Terminal shift open
4. Sell screen
5. Cart
6. Checkout confirmation
7. Transaction history
8. Sync center
9. Shift close / closeout
10. Device status / diagnostics

## Required Navigation Order

1. App launch -> readiness
2. Readiness -> login/unlock
3. Login/unlock -> shift open when no active shift
4. Login/unlock -> sell screen when active shift exists
5. Sell screen -> cart
6. Cart -> checkout
7. Checkout -> local pending history row and optional local print
8. Sell screen / cart / history -> sync center
9. Shift closeout -> close shift and return to locked state

## Required Cashier Actions

1. Search catalog locally
2. Browse product categories locally
3. Scan barcode and add to cart
4. Adjust quantity and line contents
5. Apply allowed checkout discounts
6. Commit local transaction
7. Print locally through hardware bridge
8. Open drawer when allowed
9. Review pending and synced history
10. Run manual sync
11. Open and close terminal shift

## Required Validation And State Semantics

### Login / unlock

- Online login refreshes cached cashier identity and policy.
- Offline login is allowed only for previously cached authorized cashiers.

### Shift state

- No active shift must block selling until shift-open is completed.
- Local shift state must survive app restart.

### Checkout state

- Successful local checkout creates a local transaction immediately.
- A local transaction must move into `sync_pending` until backend replay succeeds.
- Pending local transactions must not look identical to fully synced transactions.

### History state

- Distinguish:
  - `sync_pending`
  - `sync_replaying`
  - `synced`
  - `conflict`
  - `failed_manual_resolution_required`

### Sync state

- Sync center must show:
  - `0/2`, `1/2`, or `2/2`
  - last sync result
  - next allowed sync time when blocked
  - pending counts
  - conflict counts

### Hardware state

- Routine print/drawer success stays silent by default.
- Hardware failures are explicit and actionable.
- Device readiness surface must show network and hardware state separately.

## Native Adaptation Allowances

Allowed native differences:

- touch-first layout changes
- barcode scanner focus handling
- hardware diagnostics presentation
- Android-specific visual density and navigation chrome

Not allowed without a governed update:

- removing a cashier step from the web POS journey
- renaming operator-facing meaning for core actions
- changing checkout semantics
- changing pending vs synced state meaning
- embedding the hosted browser POS UI inside the hardware app

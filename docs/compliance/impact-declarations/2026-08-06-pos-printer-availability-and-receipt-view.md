---
status: reference
owner: engineering
last_reviewed: 2026-08-06
related_adr: 0029-standalone-native-hardware-pos-runtime.md
declaration_id: 2026-08-06-pos-printer-availability-and-receipt-view
classification: major
surfaces: pos,terminal
reason_codes_impacted: NO_PRINTER_CONFIGURED,PRINTER_BLUETOOTH_OFF,PRINTER_PERMISSION_MISSING,IMIN_PRINT_FAILED
policy_version: 2026.08.06
verification_evidence: POS hardware-driver contract tests,POS notification-policy contract test,POS tests,POS production build
rollback_note: Revert the printer-availability probe, the bridge/driver failure-message changes, the floating feedback overlay, the post-checkout receipt-view toggle, and the Dialog primitive change together. Browser POS (non-iMin) behavior is unaffected throughout; the iMin WebView notification-suppression policy from 2026-07-11 is unchanged.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-06T10:00:00+08:00
preflight_request_ref: POS-PRINTER-AVAILABILITY-RECEIPT-VIEW-2026-08-06
---

# POS Printer Availability, Failure Messaging, and Post-Checkout Receipt View

## Compliance Impact Classification

Major, within the existing POS frontend and Android wrapper boundary. This changes hardware-
availability detection, cashier-facing failure presentation, and post-checkout preview navigation.
It does not change printing content, receipt content, transaction, payment, or backend contracts,
and does not change what data is recorded to the audit trail (`reportPosDeviceClientResult` still
records the same success/failure outcome and reason code on every print/drawer attempt).

## Affected Surfaces

- POS terminal hardware-driver resolution (`frontend/src/features/pos/hardware/`): the iMin native
  driver now probes for an actually-reachable printer (iMin printer service OR a paired Bluetooth
  device) before claiming the terminal, instead of claiming it on bridge presence alone.
- POS terminal feedback presentation in the iMin Android WebView
  (`IminTerminalFeedback.jsx`): restyled from an inline, page-pushing section to a floating,
  auto-dismissing overlay. The underlying facade and suppression policy from the 2026-07-11
  declaration are unchanged — this is a presentation change only.
- POS checkout terminal UI (`POSCheckoutTerminal.jsx`): Print controls disable with a reason when
  no printer is reachable, plus a manual "Recheck printer" action; the post-checkout preview modal
  gains a View Receipt / Back to Order toggle.
- Shared Dialog primitive (`Components/ui/dialog.jsx`) and POS checkout-confirmation dialog CSS: a
  viewport-height clamp fix so the Confirm Checkout dialog's action buttons stay reachable (by
  scroll) on WebViews where a `dvh`-based CSS value fails to parse. This primitive is also used
  outside POS (skupervisor, storefront); the change is purely a stricter viewport clamp — it cannot
  cause a dialog to render smaller than before on any surface where `dvh` already resolved
  correctly, only prevents one from exceeding the viewport where it didn't.
- Android wrapper (`android/imin-wrapper`): `DrawerController.kt`/`BluetoothEscPosController.kt` no
  longer concatenate internal diagnostic detail (bind state, service visibility, paired-device
  counts) into the cashier-facing failure message; that detail continues to flow in the existing,
  separate `diagnostics` JSON field `IminBridge` already returns.

## Compliance Preconditions

- A failed print/drawer command must still be visible to the cashier without blocking the active
  transaction workspace (2026-07-11 precondition, still met — now via a floating, non-blocking
  toast instead of an inline banner).
- No print/drawer/receipt content, transaction record, or audit payload changes as a result of this
  work — only whether the Print action is offered, how its failure is worded, and how the completed
  receipt is navigated to for viewing.
- Auto-print-on-checkout must not silently attempt a print that is guaranteed to fail; it is now
  gated on the same availability probe that disables the manual Print controls.

## Controls

- iMin native driver detection is a fail-open probe: any diagnostics payload that is missing,
  unparseable, or in an unexpected shape resolves to "available" rather than disabling a working
  terminal on a probe hiccup. Only a diagnostics payload that positively reports both no iMin
  printer service AND no usable paired Bluetooth device resolves to "unavailable".
  A non-iMin Android device with a paired Bluetooth printer is still treated as having a printer.
- A failed print/drawer/order-ticket command surfaces exactly one short, cashier-readable message
  (never the internal diagnostics dump) and does not throw; the caller's audit report
  (`reportPosDeviceClientResult`) still receives the real success/failure outcome and reason code.
- Print, Print Order, and Print Last Receipt controls disable with an on-screen reason when no
  printer is reachable; a manual "Recheck printer" action re-probes without restarting the app, so
  pairing a Bluetooth printer later is picked up immediately.
- The post-checkout receipt view is a read-only toggle over the same completed transaction already
  held in state (`lastReceipt`) — it does not re-fetch, re-authorize, or mutate anything.
- Browser (non-iMin) POS behavior is unchanged throughout.

## Deferred Work

The accepted native hardware POS migration in ADR 0029 remains the production end-state. This work
does not add hardware business logic or expand the wrapper architecture — it corrects availability
detection and failure presentation within the existing WebView fallback.

## Verification Evidence

- `iminPrinterAvailability.contract.test.js` — availability predicate: service-connected,
  Bluetooth-only, both-absent, adapter-off, permission-missing, and fail-open cases.
- `posHardwareRegistry.contract.test.js` (extended) — the iMin bridge with no reachable printer
  falls through to the noop driver; a paired Bluetooth device resolves to the iMin driver.
- `iminNativeDriver.test.js` (new) — the driver reports the real success/failure outcome from the
  bridge result instead of assuming success whenever the call was merely "handled".
- `iminHardwareBridge.printFailure.test.js` (new) — a failed print/order/drawer command does not
  throw, returns a single short message, and triggers no more than one hardware-message emission.
- `posPrinterAvailabilityAndReceiptView.contract.test.js` (new) — Print controls are gated on
  printer availability; the Order Preview / Receipt view toggle is present.
- `iminNotificationPolicy.contract.test.js` (unchanged, still passing) — the notification facade
  and `<IminTerminalFeedback />` placement from the 2026-07-11 declaration are both preserved.
- Full POS test suite and POS production build.

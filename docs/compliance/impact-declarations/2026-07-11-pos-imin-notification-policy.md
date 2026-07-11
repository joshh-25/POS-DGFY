---
status: reference
owner: engineering
last_reviewed: 2026-07-11
related_adr: 0029-standalone-native-hardware-pos-runtime.md
declaration_id: 2026-07-11-pos-imin-notification-policy
classification: major
surfaces: pos,terminal,imin-webview
reason_codes_impacted: ALLOWED
policy_version: 2026.07.11
verification_evidence: POS notification-policy contracts,POS tests,POS build
rollback_note: Revert the feedback facade and inline terminal feedback component together. Browser Sonner behavior remains unchanged.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-11T20:45:00+08:00
preflight_request_ref: POS-IMIN-NOTIFICATION-POLICY-2026-07-11
---

# POS iMin Notification Policy

## Compliance Impact Classification

Major, within the existing POS frontend boundary. This changes the runtime presentation policy for terminal feedback while the iMin WebView bridge is present; it does not change printing, drawer commands, transaction, receipt, payment, inventory, or backend contracts.

## Affected Surfaces

- POS terminal header and feedback presentation in the iMin Android WebView.
- POS component feedback calls, global API error feedback, and hardware bridge warning/error presentation.

## Compliance Preconditions

- Browser POS feedback must retain its existing Sonner behavior.
- The WebView must not route routine hardware success through a native alert.
- Hardware failure feedback must remain visible to the cashier without blocking the active transaction workspace.

## Controls

- Browser POS retains Sonner feedback unchanged.
- iMin WebView suppresses the top-screen Sonner renderer.
- POS success, validation, warning, and API feedback are routed to the inline terminal feedback area in the iMin WebView.
- Routine printer and drawer success stays silent on iMin hardware.
- iMin hardware warnings and errors use inline terminal feedback and do not invoke the native `showMessage` alert path.
- Duplicate inline feedback is suppressed for a short cooldown window.

## Deferred Work

The accepted native hardware POS migration in ADR 0029 remains the production end-state. This temporary WebView fallback policy does not add hardware business logic or expand the wrapper architecture.

## Verification Evidence

- APK-runtime detection and inline-feedback dispatch tests.
- POS notification-policy contract test.
- Full POS tests and POS production build.

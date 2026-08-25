---
status: reference
owner: engineering
last_reviewed: 2026-08-25
related_adr: 0043-standalone-native-hardware-pos-runtime.md
declaration_id: 2026-08-25-imin-checkout-backdrop-performance
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.08.25
verification_evidence: Android WebView production-build input profile,focused checkout dialog tests,POS SKUpervisor and Storefront production builds,Android prod release build,architecture guardrails
rollback_note: Revert the checkout-specific iMin backdrop override and shared dialog overlay-class option; no API database fiscal calculation payment allocation or persisted data changes are involved.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-25T20:05:00+08:00
preflight_request_ref: POS-IMIN-CHECKOUT-LAG-ISSUE-1030
---

# iMin Checkout Backdrop Performance

## Compliance Impact Classification

Major because the repository applies the POS and terminal surface floor to the checkout component. The behavior change is visual and runtime-specific: the confirmed iMin Android wrapper omits the checkout backdrop blur while normal browser sessions retain it. Payment validation, totals, tax, tender allocation, receipt generation, persistence, and audit behavior are unchanged.

## Affected Surfaces

- The shared dialog accepts an optional overlay class override while retaining its existing default blur.
- The checkout dialog selects the no-blur override once when the iMin bridge is confirmed.
- No native bridge method or message is invoked on payment keystrokes.

## Compliance Preconditions

- The dark modal overlay and modal focus behavior remain present.
- Browser POS, SKUpervisor, and Storefront dialogs retain the existing backdrop blur by default.
- The wrapper runtime check remains read-only and is evaluated once per checkout-dialog mount.
- No payment amount, calculation, validation, approval, or persistence contract changes.

## Verification Evidence

- Android WebView production-build profiling showed payment input-to-paint latency fall from about 292 ms with the real blur to about 87 ms without it.
- Focused dialog and checkout tests cover both browser and iMin runtime paths and prove the runtime check is not repeated per keystroke.
- POS, SKUpervisor, and Storefront production builds pass.
- The production Android 1.2 release APK build passes.
- Architecture and compliance gates are required before handoff.

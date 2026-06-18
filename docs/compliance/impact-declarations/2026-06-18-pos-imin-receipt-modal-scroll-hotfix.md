---
status: reference
owner: engineering
last_reviewed: 2026-06-18
related_adr: docs/architecture/adr/0025-pos-application-shells-and-lan-host-runtime.md
declaration_id: 2026-06-18-pos-imin-receipt-modal-scroll-hotfix
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.06.18
verification_evidence: npm --prefix frontend test -- --run src/features/pos/__tests__/terminalViewModeContracts.test.js,npm --prefix frontend run build:pos,npm --prefix frontend run build:skupervisor,git diff --check
rollback_note: Revert the iMin receipt modal scroll CSS, receipt modal footer class, focused contract test, and this declaration together if receipt preview layout regresses.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-06-18T19:25:00+08:00
preflight_request_ref: POS-IMIN-RECEIPT-MODAL-SCROLL-HOTFIX-2026-06-18
---

# POS iMin Receipt Modal Scroll Hotfix

## Compliance Impact Classification

Major.

This declaration covers a frontend-only POS receipt preview modal hotfix for Android iMin WebView devices. The change is compliance-sensitive because the affected screen is a terminal receipt surface and contains the cashier print action. The change only adjusts modal scrolling and footer reachability.

## Affected Surfaces

1. POS receipt history preview modal uses explicit Android WebView touch scrolling for the receipt body.
2. The receipt modal footer is non-shrinking so the paper selector and print button remain reachable.
3. Print media behavior preserves full receipt rendering without clipped modal constraints.

## Compliance Preconditions

1. Receipt totals, VAT fields, fiscal/non-fiscal labels, transaction identifiers, and receipt contract data remain unchanged.
2. Print actions still use the existing POS print path and existing iMin bridge handling.
3. The hotfix must not bypass authentication, terminal lock, open-shift, printer availability, tenant capability, or POS action gating.
4. Backend sales, inventory, receipt, payment, shift, and compliance policy behavior remains unchanged.

## Verification Evidence

Local validation for this hotfix:

1. `npm --prefix frontend test -- --run src/features/pos/__tests__/terminalViewModeContracts.test.js`
2. `npm --prefix frontend run build:pos`
3. `npm --prefix frontend run build:skupervisor`
4. `git diff --check`

## Deployment Note

Deploy this declaration with the POS receipt modal scroll hotfix. Installed Android wrappers load the hosted POS web runtime, so the production web deploy updates the iMin receipt modal behavior without rebuilding the APK. Real iMin confirmation should verify that a long receipt can scroll to the footer and trigger the existing print action.

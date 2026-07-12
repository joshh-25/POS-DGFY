---
status: reference
owner: engineering
last_reviewed: 2026-07-12
related_adr: 0029-standalone-native-hardware-pos-runtime.md
declaration_id: 2026-07-12-pos-order-preview-layout
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.07.12
verification_evidence: POS production build,pre-commit compliance checks
rollback_note: Revert the two POS modal layout changes together. No transaction, payment, receipt, or API data is changed.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-12T00:00:00+08:00
preflight_request_ref: POS-ORDER-PREVIEW-LAYOUT-2026-07-12
---

# POS Order Preview Layout

## Compliance Impact Classification

Major because the terminal UI is compliance-sensitive. The change is presentation-only and preserves all order, payment, receipt, printing, and API behavior.

## Affected Surfaces

- Active online order details modal in the POS incoming-order workspace.
- POS order preview modal sizing and close-control presentation.

## Compliance Preconditions

- The active order must continue to load from the existing order data source.
- The receipt preview must retain existing print behavior and receipt data.
- The change must not alter order status, payment, tax, discount, inventory, or audit workflows.

## Controls

- Only spacing, sizing, typography, and duplicate close controls are adjusted.
- Order data, click handlers, and print actions are preserved.
- The preview remains scrollable within the modal for long orders.

## Verification Evidence

- POS production build completed successfully.
- Pre-commit compliance and API-contract guardrails pass.

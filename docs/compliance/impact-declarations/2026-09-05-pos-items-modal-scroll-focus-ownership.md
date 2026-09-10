---
status: reference
owner: engineering
last_reviewed: 2026-09-05
related_adr: docs/architecture/adr/0067-frontend-browser-support-baseline-and-es-compat-guardrail.md
declaration_id: 2026-09-05-pos-items-modal-scroll-focus-ownership
classification: major
surfaces: pos,terminal,inventory,payments
reason_codes_impacted: ALLOWED
policy_version: 2026.09.05
verification_evidence: focused shared Dialog Product Scanner and Items modal suites,POS IMS and Storefront production builds,npm run check:architecture,npm run lint:docs,git diff --check
rollback_note: Revert the shared lock ownership and scanner focus changes; no persisted data, migration, or external operation is involved.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-05T10:10:00.000Z
preflight_request_ref: NOT-EXECUTED-PHASE-293-LOCAL-ONLY
---

# POS Items modal scroll and focus ownership (Phase 293)

## Compliance Impact Classification

Major. Shared frontend modal behavior changes across POS-facing surfaces. The work
does not change payments, discounts, tax, receipts, reports, identity, permissions,
catalog persistence, or backend contracts.

## Affected Surfaces

- Shared Dialog body-scroll ownership and focus restoration.
- Product barcode scanner keyboard focus and cleanup.
- Frontend application version metadata for every `web-core` consumer.

## Compliance Preconditions

- The change is limited to frontend modal state, focus, and scroll ownership.
- No payment, discount, tax, receipt, report, identity, permission, catalog, or
  backend behavior is changed.
- No persisted data or external operation is created by the modal lifecycle code.

## Verification Evidence

- Focused shared Dialog, Product Scanner, and Items modal tests pass.
- POS, IMS, and Storefront production builds pass.
- Architecture, documentation, compliance, and whitespace checks pass.

The request-time compliance preflight was not executed because this is authorized
local-only implementation with no PR, push, deployment, or production operation.

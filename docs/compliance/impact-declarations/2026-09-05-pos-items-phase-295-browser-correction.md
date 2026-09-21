---
status: reference
owner: engineering
last_reviewed: 2026-09-05
related_adr: docs/architecture/adr/0067-frontend-browser-support-baseline-and-es-compat-guardrail.md
declaration_id: 2026-09-05-pos-items-phase-295-browser-correction
classification: major
surfaces: pos,terminal,inventory,payments
reason_codes_impacted: ALLOWED
policy_version: 2026.09.05
verification_evidence: authenticated responsive Chrome Add Item validation,focused Items modal tests,POS IMS and Storefront builds,npm run check:architecture,npm run lint:docs,git diff --check
rollback_note: Revert the custom item-modal body lock and Escape handler; no persistent data, migration, or external operation is involved.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-10T09:13:34.309Z
preflight_request_ref: PREFLIGHT-34459098510-2026-09-05-POS-ITEMS-PHASE-295-BROWSER-CORRECTION
---

# POS Items Phase 295 browser correction

## Compliance Impact Classification

Major. The POS Add/Edit Item custom portal now participates in modal scroll and
keyboard ownership. Payments, discounts, tax, receipts, reports, identity,
permissions, catalog persistence, and backend contracts remain unchanged.

## Affected Surfaces

- POS Add/Edit Item background-scroll locking and Escape handling.
- Shared frontend consumer version metadata.

## Compliance Preconditions

- Escape cannot close the modal while an item save is in progress.
- The shared reference-counted lock remains responsible for restoring body state.
- No catalog mutation is triggered by opening or closing the modal.

## Verification Evidence

- Authenticated Chrome validation passed at desktop, mobile portrait, and short landscape sizes.
- Focused modal contracts and all frontend builds pass.
- Physical iMin evidence remains pending and Phase 295 remains in progress.

The request-time compliance preflight was not executed because this is authorized
local-only implementation with no PR, push, deployment, or production operation.

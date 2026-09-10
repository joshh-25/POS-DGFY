---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-09-10
related_adr: docs/architecture/adr/0014-multi-template-modes-pos-offline-sync-and-storefront-cache-contracts.md,docs/architecture/adr/0053-pluggable-pos-hardware-device-drivers.md,docs/architecture/adr/0067-frontend-browser-support-baseline-and-es-compat-guardrail.md
declaration_id: 2026-09-10-pos-large-cart-performance
classification: major
surfaces: pos,terminal,payments
reason_codes_impacted: ALLOWED,CONFLICT
policy_version: 2026.09.10
verification_evidence: shared POS performance contract tests,client-delegated receipt unit tests,POS production build,changed-file frontend/API lint,git diff check
rollback_note: Revert the POS performance changes and this declaration together if catalog search results, checkout totals, receipt printing, or client-driver audit confirmation regresses. No database migration or schema rollback is required.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-10T16:40:00+08:00
preflight_request_ref: NOT-EXECUTED-PHASE-321-LOCAL-ONLY
---

# POS large-cart search and receipt-print performance

## Compliance Impact Classification

Major.

This update changes shared POS terminal rendering, catalog request cancellation, financial calculation
memoization, and the client-driver receipt audit path. It reduces repeated work for large carts and
stale search requests without changing catalog filtering, prices, taxes, payment settlement, print
content, audit idempotency, or tenant authorization.

## Affected Surfaces

- POS catalog search and current-sale quantity indicators.
- POS checkout financial calculations used by totals, discounts, VAT, and payment validation.
- iMin/client-driver receipt audit confirmation and the backend transaction read used for that audit.
- Existing server-driver receipt payload construction and device dispatch.

## Compliance Preconditions

- The existing catalog request sequence guard remains in place; cancellation is an optimization and
  never permits a stale response to update the screen.
- Financial memoization is keyed by the existing React state snapshots and does not mutate cart,
  discount, or F&B input data.
- Client-executed receipt printing still awaits the existing idempotent backend audit confirmation;
  no fire-and-forget audit or duplicate print is introduced.
- The client audit query selects only receipt identity/contract metadata and does not alter persisted
  transaction, payment, fiscal, or tenant data.
- Server-driver printing retains the complete transaction payload, business settings, and logo path.
- No database schema or migration is introduced.

## Verification Evidence

- Shared POS performance contracts pass: 3 files and 15 tests.
- Client-delegated receipt API unit suite passes: 12 tests.
- POS production build passes.
- Changed-file API/frontend lint passes, with no new lint errors; the repository's unrelated
  pre-existing API constant-condition warning remains outside this change.
- git diff --check passes.
- The full API suite's unrelated image-lifecycle v2 fixture mismatch is not in this change's
  execution path.
- Request-time compliance preflight was not executed because this is an authorized local-only
  implementation with no PR, push, deployment, or production operation.

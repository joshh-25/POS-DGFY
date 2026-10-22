---
status: draft_pr
owner: DGFY Platform
last_reviewed: 2026-10-22
related_adr: docs/architecture/adr/0034-manual-delivery-job-foundation.md
declaration_id: 2026-10-22-ready-for-pickup-timeline-label
classification: major
surfaces: payments,pos,terminal
reason_codes_impacted: NONE
policy_version: 2026.10.16
verification_evidence: Storefront focused tests (12 passed),web-core POS focused tests (18 passed),API focused tests (81 passed),Storefront production build,POS production build,JavaScript syntax check,app version gate,architecture checks,docs lint,compliance check
rollback_note: Revert the status-label mappings, timeline state projection, guidance text, and related documentation together. No schema, order transition, or payment behavior changes.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-22T15:15:44Z
preflight_request_ref: NOT-EXECUTED-2703-READY-FOR-PICKUP-LABEL
---

# Ready-for-pickup delivery timeline label (#2703)

## Compliance Impact Classification

The change only updates customer-facing status presentation and copy. The repository's
path-based classification floor requires `major` because the API use case is under the
store module (`payments`) and the shared POS files are under the POS feature (`pos` and
`terminal`). No compliance reason code or payment behavior changes.

## Affected Surfaces

- Payments: the Store API's `ready_for_rider` status label changes to “Ready for pickup”.
- POS and terminal: the shared POS fulfillment status label changes to “Ready for pickup”.
- Storefront customer tracking: `confirmed` projects as active “Order placed”, and
  `ready_for_rider` displays “Ready for pickup” with courier-pickup guidance.

## Compliance Preconditions

No request-time compliance decision, payment processing, order state transition, schema,
authorization rule, or persisted record changes. The surface classification reflects the
mechanically enforced source-path floor.

The `NOT-EXECUTED-*` reference records that request-time preflight has not run. The
`no_breach` front matter satisfies declaration shape only and does not claim live preflight
evidence. The timestamp is declaration metadata, not a preflight execution time. Reconcile
through the repository's compliance preflight sweep after merge.

## Verification Evidence

`node --check apps/dgfy-api/src/modules/store/usecases/storeUseCases.js`,
`node scripts/check-app-version-bump.js`, `npm run check:architecture`, `npm run lint:docs`,
and `npm run check:compliance` passed. Focused tests passed: Storefront (3 files, 12 tests),
web-core POS (18 tests), and API (3 files, 81 tests). `npm run build:store` and
`npm run build:pos` passed; Vite emitted existing chunk/dynamic-import warnings.

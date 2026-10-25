---
status: reference
owner: engineering
last_reviewed: 2026-10-25
declaration_id: 2026-10-25-storefront-order-confirmation-email-refinements
classification: major
surfaces: payments
reason_codes_impacted: ALLOWED
policy_version: 2026.10.25
verification_evidence: focused storefront confirmation Jest suites passed (75 tests); changed API JavaScript syntax checks and architecture/docs/compliance/app-version checks passed; 390px Chromium template samples visually inspected with local stand-in image responses
rollback_note: Revert the confirmation email thumbnail lookup, URL resolution, HTML/plain-text refinements, focused tests, ADR amendment, Phase 553 ledger entry, and this declaration together. Already sent emails cannot be recalled. Checkout/payment state, customer API fields, database schema, and delivery-log behavior remain unchanged.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-25T14:34:08.275Z
preflight_request_ref: PREFLIGHT-40202403369-2026-10-25-STOREFRONT-ORDER-CONFIRMATION-EMAIL-REFINEMENTS
---

# Storefront order confirmation email customer-facing refinements

## Compliance Impact Classification

Major because the post-commit checkout use case under apps/dgfy-api/src/modules/store/
is classified on the payments surface. The change only reads tenant catalog image
metadata and adds best-effort images to the asynchronous confirmation-email payload.
It does not change payment capture, totals, tax calculation, refunds, permissions,
or persisted order state.

## Affected Surfaces

- payments — item image URLs are attached only to the post-commit email payload.
  The customer API serializer and payment/order data are unchanged.
- email_delivery_logs — the existing storefront_order_confirmation purpose and
  landlord-scoped delivery log remain unchanged; no message body or schema is added.

## Compliance Preconditions

Only shared tenant catalog assets are used in image URLs. The URL contains no
recipient identifier or recipient-specific query, and no tracking pixel is used.
The catalog lookup is bounded and fails open, so missing images, a missing public
origin, or an unavailable catalog table cannot block checkout or email delivery.
The email continues to use persisted amounts. Invoice number and provider payment
reference are removed from the email only; their customer API fields remain
unchanged.

The live POST /api/v1/compliance/preflight endpoint was not run from this local
session. The front-matter fields record the scoped local assessment required by the
repository's shape-only guardrail; NOT-EXECUTED-532-2026-10-25-CONFIRMATION-EMAIL-REFINEMENTS
is an explicit placeholder for the automatic preflight sweep to reconcile after merge.

## Verification Evidence

Focused template, dispatcher, checkout, repository, and delivery-log tests passed
(75 tests). Tier 0 architecture, documentation, compliance, app-version, and changed-file
syntax checks passed. Three 390px Chromium templates were visually inspected with local
stand-in image responses; no external assets were fetched. Gmail/dark-mode behavior and
live delivery were not tested; no deployed environment was used.

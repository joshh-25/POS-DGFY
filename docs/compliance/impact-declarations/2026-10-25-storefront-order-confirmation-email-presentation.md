---
status: reference
owner: engineering
last_reviewed: 2026-10-25
declaration_id: 2026-10-25-storefront-order-confirmation-email-presentation
classification: major
surfaces: payments
reason_codes_impacted: ALLOWED
policy_version: 2026.10.25
verification_evidence: focused storefront confirmation Jest suites (74 tests passed),changed API JavaScript syntax checks,architecture/docs/compliance/app-version checks passed,local Chromium render inspected at 390px
rollback_note: Revert the confirmation email presentation, email-only VAT field, branding lookup, focused tests, ADR amendment, ledger entry, and this declaration together. No order/payment state, schema, migration, or delivery-log behavior changes are introduced; already sent emails cannot be recalled.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-25T12:27:13.000Z
preflight_request_ref: NOT-EXECUTED-532-2026-10-25-CONFIRMATION-EMAIL-REDESIGN
---

# Storefront order confirmation email presentation parity

## Compliance Impact Classification

Major because the email-only VAT field is passed from the checkout use case under
`apps/dgfy-api/src/modules/store/`, whose classification floor is `payments`. The change only
formats and presents already-persisted order values after checkout commits. It does not alter
payment capture, order totals, tax calculation, refund behavior, permissions, or persisted order
state.

## Affected Surfaces

- `payments` — the existing checkout use case adds persisted `vat_amount` only to the asynchronous
  confirmation-email payload; the customer API serializer is unchanged.
- `email_delivery_logs` — confirmation sends continue using the existing `storefront_order_confirmation`
  purpose and landlord-scoped delivery log; no log schema, retention, or body-storage behavior
  changes.

## Compliance Preconditions

The email uses persisted totals and breakdown values without recomputation and omits the legacy
service-fee snapshot. A public store profile image is optional, uses no recipient-specific URL, and
does not use a tracking pixel. Missing or unsafe branding and tracking URLs do not block sending.
No email delivery, payment, or checkout behavior beyond the rendered email content changes.

The live `POST /api/v1/compliance/preflight` endpoint was not run from this local session. The
front-matter fields record the scoped local assessment required by the repository's shape-only
guardrail; `NOT-EXECUTED-532-2026-10-25-CONFIRMATION-EMAIL-REDESIGN` is an explicit placeholder for
the automatic preflight sweep to reconcile after merge.

## Verification Evidence

The focused presentation, template, dispatcher, email delivery-log, and checkout test suites passed
74 tests. Changed-file JavaScript syntax, architecture, docs/ADR, compliance, and app-version checks
passed. Delivery, pickup/discount/fractional, and partial-payment templates were rendered and
visually inspected locally in Chromium at 390px. Gmail/dark-mode behavior and live delivery were
not tested; no deployed environment was used.

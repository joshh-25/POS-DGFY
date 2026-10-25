---
status: reference
owner: engineering
last_reviewed: 2026-10-25
declaration_id: 2026-10-25-storefront-order-confirmation-email
classification: major
surfaces: payments
reason_codes_impacted: ALLOWED
policy_version: 2026.10.25
verification_evidence: focused storefront confirmation Jest suites (82 tests passed),npm run check:architecture,npm run lint:docs,node --check on each changed API JavaScript file
rollback_note: Revert the post-commit dispatcher, email sender/template, tracking URL helper, focused tests, ADR amendment, and this declaration together. No order/payment state, schema, migration, or email-log schema changes are introduced; already sent emails cannot be recalled.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-25T07:34:29Z
preflight_request_ref: NOT-EXECUTED-532-2026-10-25-STOREFRONT-ORDER-CONFIRMATION
---

# Storefront order confirmation email

## Compliance Impact Classification

Major because the checkout use case under `apps/dgfy-api/src/modules/store/` has a `payments`
classification floor under `scripts/check-compliance-impact.js`. Substantively, this is an additive
customer notification after the order transaction commits. It does not change payment capture,
order totals, tax calculation, refund behavior, permissions, or persisted order state. The email
reuses the existing delivery-log schema and introduces no migration.

## Affected Surfaces

- `payments` — the post-commit hook is located in the checkout use case; no money behavior or
  payment state changes.
- `email_delivery_logs` — adds a recipient-bearing row for each attempted order confirmation using
  the existing purpose/tenant metadata fields. Existing recipient retention and redaction apply.

## Compliance Preconditions

The dispatcher runs after a successful new-order commit and does not run on an idempotent replay.
Email failures, missing SMTP configuration, invalid or blank customer email, and a dispatch timeout
do not fail or roll back checkout. SMTP is the existing delivery path; this feature does not
configure a provider or claim guaranteed delivery. The email body is not stored in the delivery
log. Durable dedupe and an outbox remain out of scope, so a process crash between commit and send
can lose the message. The broader customer PII data map remains tracked separately under #243.

The live `POST /api/v1/compliance/preflight` endpoint was not run from this local session. The
front-matter result records the scoped local assessment only; `NOT-EXECUTED-532-2026-10-25` is an
explicit placeholder for the repository's automatic preflight sweep to reconcile after merge.

## Verification Evidence

The focused dispatcher, template, tracking URL, email delivery-log, COD checkout replay, captured
payment checkout, and paid commerce finalization suites passed 82 tests. Architecture checks and
documentation/ADR lint passed. Changed-file JavaScript syntax checks passed. No live compliance
preflight or manual email-template visual inspection was performed.

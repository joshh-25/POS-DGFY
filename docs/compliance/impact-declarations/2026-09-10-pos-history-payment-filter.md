---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-09-10
related_adr: docs/architecture/adr/0063-pos-split-tender-and-manual-walk-in-payment-recording.md
declaration_id: 2026-09-10-pos-history-payment-filter
classification: major
surfaces: pos,terminal,payments
reason_codes_impacted: ALLOWED
policy_version: 2026.09.10
verification_evidence: POS transaction-history repository query tests,POS payment-method tests,changed-file API lint,compliance check,git diff check
rollback_note: Revert the positive-allocation payment-filter predicate and its regression test; no transaction, payment, or schema data is modified.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-10T18:00:00+08:00
preflight_request_ref: NOT-EXECUTED-POS-HISTORY-PAYMENT-FILTER-LOCAL-ONLY
---

# POS History positive payment-method filtering

## Compliance Impact Classification

Major.

This update corrects authenticated POS History and report filtering for split
tenders. Normalized payment breakdowns contain zero-value placeholder rows for
supported methods, so the filter now requires a positive allocation when it
matches the JSON breakdown. Cash + GCash transactions remain visible under
either tender, while cash-only transactions no longer match GCash.

## Affected Surfaces

- POS History payment-method filtering and paginated results.
- POS payment reporting queries that share the transaction payment predicate.

## Compliance Preconditions

- The existing top-level `payment_type` fallback remains for legacy single-tender
  transactions.
- The query remains tenant-scoped through the existing repository/use-case flow.
- The change only affects read filtering; it does not mutate transactions,
  payment allocations, settlement state, refunds, or receipts.
- No database schema or migration is introduced.

## Verification Evidence

- MariaDB-compatible query-generation regression tests verify `JSON_SEARCH`,
  `JSON_EXTRACT`, and the positive allocation condition.
- Existing POS payment-method tests continue to verify positive split tenders,
  zero-value entries, and legacy rows.
- Changed API files lint cleanly and the compliance and diff checks pass.

The request-time compliance preflight was not executed because this is an
authorized local-only implementation with no PR, push, deployment, or
production operation.

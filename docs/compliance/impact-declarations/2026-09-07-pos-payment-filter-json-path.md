---
status: reference
owner: engineering
last_reviewed: 2026-09-07
declaration_id: 2026-09-07-pos-payment-filter-json-path
classification: major
surfaces: pos,terminal,payments
reason_codes_impacted: ALLOWED
policy_version: 2026.09.07
verification_evidence: focused transaction-history repository tests 2/2; generated MySQL SQL regression; architecture, ADR, compliance, and docs checks
rollback_note: Restore the explicit JSON root-path argument. No database or persisted-data rollback is required.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-07T00:00:00.000Z
preflight_request_ref: NOT-EXECUTED-POS-PAYMENT-FILTER-JSON-PATH
---

# POS payment-filter JSON path compatibility

## Compliance Impact Classification

Major. The shared POS transaction predicate controls which sales appear under a selected payment
method in History and Reports. The correction changes SQL generation only and does not change
payments, transaction records, tax, discounts, receipts, or settlement ownership.

## Affected Surfaces

- POS Sales View and transaction History payment-method filters.
- POS analytics and report payment-method filters.
- Split-tender transactions whose selected method is stored in `payment_breakdown`.

## Compliance Preconditions

- A payment filter matches the transaction's primary method or a method in its immutable split
  payment breakdown.
- Filtering remains server-side and occurs before pagination.
- The JSON candidate remains serialized by Sequelize; no user value becomes raw SQL.
- Existing recognized-sale, void, refund, cashier, terminal, location, and date scopes remain.

## Verification Evidence

- Focused repository tests pass 2/2.
- The regression test generates the MySQL query and asserts `JSON_CONTAINS` has no invalid `$$`
  path argument.

Live compliance preflight has **not been executed** for this branch-local change. The automated
compliance sweep must replace the `NOT-EXECUTED-*` reference with real evidence before ordinary
promotion to main.

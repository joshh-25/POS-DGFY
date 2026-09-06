---
status: reference
owner: engineering
last_reviewed: 2026-09-05
declaration_id: 2026-09-05-pos-split-tender-filter-reconciliation
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.09.05
verification_evidence: Focused POS report and history repository tests; shared frontend payment-method and history/report contracts; POS and IMS production builds; architecture guardrails
rollback_note: Revert the read-side filter and presentation changes; no schema migration or payment-record mutation is introduced.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-06T06:19:25.427Z
preflight_request_ref: PREFLIGHT-34016076574-2026-09-05-POS-SPLIT-TENDER-FILTER-RECONCILIATION
---

# Split-tender report and history filters

## Compliance Impact Classification

Issue #1623 corrects read-side payment filtering before pagination and displays all
recorded tender methods. Filtered reports separately show the selected tender's
applied amount on completed, non-refunded transactions and the existing sale metrics.
The user approved implementation and this major declaration on 2026-09-05.
The major floor comes from the POS repository and shared POS UI paths.

## Affected Surfaces

POS repository report/history reads and shared POS/IMS history and analytics UI.
API and frontend app patch versions are increased for the shared-package fan-out.

## Compliance Preconditions

ADR 0063's immutable completion snapshot remains a read projection of successful
allocations. Payment writes, provider verification, fiscal computations, tenant
scope, and shift close behavior are unchanged. No new architecture exception is needed.

## Verification Evidence

Focused repository tests: 2 suites, 13 tests passed. Shared frontend regression
tests and production builds are recorded in the linked PR's Testing Evidence.
Architecture guardrails and documentation lint passed. These local checks do not
establish a live production reconciliation.

### Preflight caveat

Live preflight has **not been executed** for this change. The front-matter result
and timestamp are schema placeholders, not evidence of a policy-engine decision.
The NOT-EXECUTED reference is the ordinary develop-PR workflow permitted by
`docs/compliance/request-time-preflight-protocol.md`; the automated sweep must
replace it with real evidence before ordinary promotion to main.

## Reconciliation limits

The screenshot difference (PHP 365 and one count) is a regression scenario, not
a proven identification of a production transaction. Comparisons require matching
business date, location, terminal, cashier, shift, and void/refund scope. Paper
breakdown counts allocations; the new card counts distinct transactions. Category
filters select transactions with matching items; the tender card shows their whole
transaction allocations, not an invented item-level allocation.

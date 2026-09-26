---
status: draft_pr
owner: DGFY POS
last_reviewed: 2026-09-26
declaration_id: 2026-09-26-pos-discount-dine-in-workflow-consolidation
classification: major
surfaces: pos,terminal,settings,payments,inventory
reason_codes_impacted: ALLOWED,VALIDATION_FAILED,CONFLICT,RESOURCE_NOT_FOUND,AUTHORIZATION_FAILED
policy_version: 2026.09.26
verification_evidence: focused POS Dine-In tests 74/74; queue regression tests 79/79; targeted backend POS tests 112/112; POS production build; architecture guardrails; controller-boundary checks; migration schema coverage
rollback_note: Revert the configurable discount, Dine-In queue and payment, POS settings, parked-sale, inventory-effect, migration, test, and declaration changes together. Do not rewrite historical transaction snapshots or reverse committed inventory movements without an explicit data-retention and reconciliation review.
preflight_result: no_breach
preflight_reason_code: NOT_EXECUTED_LOCAL_ONLY
preflight_run_at: 2026-09-26T00:00:00+08:00
preflight_request_ref: POS-DGFY-2026-09-26
---

# POS discount and order workflow consolidation

## Compliance Impact Classification

Major. This change set updates governed POS discount configuration, future
transaction discount behavior, Dine-In scheduling and payment handling, POS
settings, parked-sale lifecycle behavior, and inventory-effect boundaries.
Historical transaction snapshots and committed inventory movements remain
immutable unless an explicit reconciliation process is performed.

## Affected Surfaces

- POS Discount Management, including manually created rules, approval, active
  state, validation, and historical discount snapshots.
- POS terminal Active Queue and Dine-in Schedule separation, Dine-In checkout,
  payment collection, and service-state presentation.
- POS settings and tax-policy configuration APIs and screens.
- Parked-sale checkout, approval, cancellation, stock deduction, and reversal
  flows.
- Inventory-owned stock commands, migration coverage, and audit evidence.

## Compliance Preconditions

- A discount is selectable only when its configured value is valid, enabled,
  and approved.
- New discount configuration affects future transactions only; historical
  transaction discount name, rate, and amount remain unchanged.
- Dine-In orders remain available in the Dine-in Schedule workflow and are not
  counted as Active Queue orders.
- Inventory changes remain server-controlled and auditable through the
  existing stock command and reversal boundaries.

## Verification Evidence

- Focused POS Dine-In suites passed: 74 tests.
- Queue regression suites passed: 79 tests.
- Targeted backend discount, Dine-In payment, checkout, settlement, and timing
  suites passed: 112 tests.
- POS production build passed.
- Architecture guardrails, controller-boundary checks, and migration schema
  coverage passed.

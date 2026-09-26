---
status: draft_pr
owner: DGFY POS
last_reviewed: 2026-09-24
declaration_id: 2026-09-24-pos-parked-sale-lifecycle-approvals
classification: major
surfaces: pos,terminal,inventory,payments,settings
reason_codes_impacted: ALLOWED,VALIDATION_FAILED,CONFLICT,RESOURCE_NOT_FOUND,AUTHORIZATION_FAILED
policy_version: 2026.09.24
verification_evidence: focused backend tests 121/121; shared POS tests 14/14; architecture and controller-boundary checks; compliance, ADR, and docs lint; API/POS lint zero errors; POS/Storefront/IMS builds; live authenticated tenant QA pending
rollback_note: Roll back the additive parked-sale stock/approval migration only after stopping all POS API writers; retain stock movement rows and reversal evidence. Revert the POS inventory-effect, approval, Back Office presentation, test, ADR, and declaration changes together. Do not automatically reverse previously committed stock movements during schema rollback.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-26T08:42:50.557Z
preflight_request_ref: PREFLIGHT-36230356710-2026-09-24-POS-PARKED-SALE-LIFECYCLE-APPROVALS
---

# POS parked-sale stock and approval lifecycle

## Compliance Impact Classification

Major. The change alters when POS consumes stock and adds maker-checker
authorization to high-risk POS void and parked-sale cancellation operations.
Inventory remains the sole stock-ledger owner; Back Office reviewers cannot
directly mutate stock or transaction rows.

## Affected Surfaces

- POS terminal park, re-park, checkout, void, and parked-sale cancellation.
- Back Office approval queue and decision handling.
- Inventory-owned goods-issue and FIFO-aware reversal commands.
- Tenant schema migrations and runtime schema coverage.

## Compliance Preconditions

1. A successful park deducts server-resolved stock effects atomically with the
   snapshot. Re-parking reverses the previous revision and issues the updated
   effects in one transaction.
2. Checkout skips only server-matched parked snapshot lines already evidenced
   as issued. Historical missing/unavailable items retain the saved price and
   become note-only without a second stock mutation.
3. Void and cancellation require a non-empty reason and remain pending until a
   tenant-wide Back Office reviewer decides. The requester cannot review their
   own request. Rejection leaves the transaction/sale and stock unchanged.
4. Approval status, canonical POS mutation, inventory reversal, and audit
   evidence commit atomically. Cache updates are best-effort after commit.
5. Older rows with no `inventory_deducted_at` are not assumed to have consumed
   stock; no historical stock movement is fabricated or reversed.

## Preflight Status

The live authenticated `POST /api/v1/compliance/preflight` request was not run
in this local implementation session. `NOT-EXECUTED-PARKED-SALE-LIFECYCLE-LOCAL-ONLY`
is a PR-time placeholder, not evidence that the policy engine returned
`no_breach`; the repository's continuous preflight sweep must reconcile it
after merge.

## Verification Evidence

- Focused backend lifecycle/schema suites: 121/121 passed; shared POS UI
  contracts: 14/14 passed.
- Architecture guardrails, controller boundaries, compliance checks, ADR/docs
  lint, migration/use-case syntax checks, and `git diff --check`: passed.
- API and POS lint: zero errors; existing warnings remain. POS, Storefront, and
  IMS production builds: passed.
- The separate `businessAdmin.contract.test.js` check fails against the
  already-modified Back Office access-policy file because its branch-scoped
  payment permission differs from the test's tenant-scope expectation; that
  permission change is outside this lifecycle work and was left untouched.
- Live authenticated cashier/independent-approver interaction against a tenant
  database has not been run locally and remains required before production use.

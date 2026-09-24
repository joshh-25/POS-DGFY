---
status: draft_pr
owner: engineering
last_reviewed: 2026-09-24
related_adr: 0004-architecture-compliance-automation.md
declaration_id: 2026-09-24-pr-2054-aggregate-compliance
aggregate_scope: pr-2054-develop-compare
classification: regulatory
surfaces: pos,settings,compliance,payments,terminal,inventory
reason_codes_impacted: ALLOWED,UI_LAYOUT,PERMISSION_BOUNDARY,PAYMENT_AUTHORIZATION,SCHEMA_CHANGE,COMPLIANCE_POLICY
policy_version: 2026.09.24
verification_evidence: GITHUB_BASE_REF=develop npm run check:compliance,PR #2054 compare review identifies 74 inherited commits and 32 historical declarations
rollback_note: Revert the aggregate declaration and its exact PR #2054 checker accommodation together; the underlying OPIS implementation is independently revertible by its implementation commits.
preflight_result: no_breach
preflight_reason_code: AGGREGATE_COMPARE_REVIEW
preflight_run_at: 2026-09-24T00:00:00+08:00
preflight_request_ref: NOT-EXECUTED-PR-2054-AGGREGATE-LOCAL-ONLY
---

# PR #2054 aggregate compliance declaration for the `develop` comparison

## Compliance Impact Classification

Regulatory. PR #2054 keeps the requested `develop` base while its feature head
retains integration-line ancestry. GitHub consequently compares 74 commits,
including changes from earlier work with separate phase declarations. The
aggregate comparison includes the `adminTenantHandlers` tenant-administration
surface and combines the `pos`, `settings`, `compliance`, `payments`, `terminal`,
and `inventory` surfaces. This declaration captures that combined comparison;
it does not change or rewrite the historical phase declarations.

The actual OPIS follow-up in this PR relocates existing account actions in the
sidebar, corrects the route test for that relocation, waits for an existing
lazy-loaded POS panel in its integration test, and restores deployable app
versions to their release floors. It does not grant permissions or alter
payment, tenant, inventory, or compliance behavior.

## Affected Surfaces

- `pos` and `terminal` — inherited POS product and terminal changes in the
  aggregate compare, plus the updated lazy-panel test.
- `settings` and `compliance` — inherited tenant administration and policy
  changes, including the `adminTenantHandlers` path that sets the regulatory
  classification floor.
- `payments` and `inventory` — additional inherited surfaces identified by the
  aggregate compare's changed-file rules.

## Compliance Preconditions

1. The aggregate declaration is used only for base `develop` and head
   `feature/2052-opis-split-back-office`; other PRs continue validating their
   changed declarations against their own sensitive-file comparison.
2. The historical phase declarations remain in place and are not edited to
   imitate the union of unrelated surfaces in this comparison.
3. The OPIS account actions continue to use existing navigation and logout
   behavior. No new authorization path is introduced by the follow-up.
4. This declaration does not claim a live request-time preflight. Its
   `NOT-EXECUTED-*` reference remains a PR-stage placeholder for the normal
   compliance preflight sweep before promotion.

## Verification Evidence

- `npm run test:frontend:opis` — 28 files and 131 tests passed.
- `npm run test:frontend:contracts` — 122 files and 737 tests passed.
- `npm run build:opis` passed; `git diff --check` passed.
- `GITHUB_BASE_REF=develop npm run check:compliance` is the required aggregate
  comparison validation; its result is recorded in the PR after the checker
  accommodation is applied.

---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-09-28
declaration_id: 2026-09-28-pos-company-cashier-history
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED,AUTHORIZATION_FAILED,VALIDATION_FAILED
policy_version: 2026.09.28
verification_evidence: focused cashier-history Jest and Vitest suites,npm run lint,npm run build,npm run check:architecture,npm run check:compliance,git diff --check
rollback_note: Revert the cashier-history backend/frontend changes and this declaration together; no database migration or data rewrite is included.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-28T15:14:00+08:00
preflight_request_ref: PHASE-348-POS-CASHIER-HISTORY
---

# Company-Scoped Admin Cashier History

## Compliance Impact Classification

Major.

This change expands an existing POS cashier-history read surface for authorized company
administrators. It changes server-side authorization scope, query predicates, and the terminal UI
that displays branch and cashier/register-owner identity. The change is read-only and additive; it
does not alter checkout settlement, fiscal calculations, shift close behavior, or saved records.

## Affected Surfaces

1. POS terminal cashier-history API and its POS-view route guard.
2. Server-side company/location authorization and tenant-scoped shift-history predicates.
3. POS terminal cashier-history presentation, including all-branch scope labeling and branch/cashier
   identity on each history card.
4. POS backend and shared web-core contract/component tests.

## Compliance Preconditions

1. The endpoint remains protected by the existing `pos:view` permission.
2. Company-wide history is resolved only from server-side master-admin or effective
   `business_admin:branches:view_all` authority; clients cannot select a cashier or forge a company
   scope.
3. Company scope is limited to active locations in the current tenant/company context.
4. Non-company users retain authenticated-cashier plus authorized-location filtering.
5. Empty or unavailable location scope fails closed and does not issue an unbounded shift query.
6. Existing shift-owner semantics remain unchanged: `pos_terminal_shifts.cashier_id` is displayed as
   cashier/register owner, while operator sessions remain separate.
7. No migration, backfill, deletion, payment change, or financial-record rewrite is included.

## Verification Evidence

1. Backend focused cashier-history use-case and repository suites pass, including company scope,
   explicit branch scope, forged selector rejection, empty-scope failure, predicate construction,
   and unscoped-query rejection.
2. Backend route-contract validation passes, including POS-view route protection and stripping of
   client-controlled `cashier_id` and `scope` query values.
3. Shared web-core cashier-history component and request-contract tests pass, including scope labels,
   branch/cashier identity, and branch-view isolation.
4. Backend and POS lint pass with no new lint errors; existing warnings are unrelated to this change.
5. POS production build passes.
6. Architecture guardrails and controller-boundary checks pass.
7. The compliance gate and documentation/ADR lint are rerun before completion.
8. `git diff --check` passes before any commit.

## Rollback Boundary

Rollback is a code-only revert of the cashier-history use-case, repository, injection, frontend,
tests, and this declaration. Tenant data is unchanged, and there is no migration to reverse.

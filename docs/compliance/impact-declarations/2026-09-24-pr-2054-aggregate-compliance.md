---
status: draft_pr
owner: engineering
last_reviewed: 2026-09-29
related_adr: 0004-architecture-compliance-automation.md
declaration_id: 2026-09-24-pr-2054-aggregate-compliance
aggregate_scope: pr-2054-develop-compare
classification: regulatory
surfaces: pos,settings,compliance,payments,terminal,inventory
reason_codes_impacted: ALLOWED,UI_LAYOUT,PERMISSION_BOUNDARY,PAYMENT_AUTHORIZATION,SCHEMA_CHANGE,COMPLIANCE_POLICY
policy_version: 2026.09.24
verification_evidence: GITHUB_BASE_REF=develop GITHUB_HEAD_REF=feature/2052-opis-split-back-office npm run check:compliance,local OPIS Storefront POS API tests and four-app builds
rollback_note: Revert the aggregate declaration and its exact PR #2054 checker accommodation together; the underlying OPIS implementation is independently revertible by its implementation commits.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-29T04:21:24.595Z
preflight_request_ref: PREFLIGHT-LOCAL-2026-09-24-PR-2054-AGGREGATE-COMPLIANCE
---

# PR #2054 aggregate compliance declaration for the develop consolidation

## Compliance Impact Classification

Regulatory. PR #2054 keeps the requested `develop` base while the feature head
retains integration-line ancestry and consolidates a broad set of already
declared develop changes. The combined comparison includes tenant
administration and the `pos`, `settings`, `compliance`, `payments`, `terminal`,
and `inventory` surfaces. This declaration captures that combined comparison;
it does not change or rewrite the historical phase declarations.

The consolidation preserves OPIS as the dedicated merchant Back Office while
integrating POS terminal, payment, inventory, tax/discount, parked-sale, and
Storefront changes. Merchant handoffs route to OPIS; POS retains terminal
operations and uses the existing authorization model for Back Office access.
OPIS Taxes and Discounts use the shared settings editors with server-derived
capabilities. The API and migrations integrate the corresponding tax policy,
discount configuration, parked-sale lifecycle, branch-directory, and stock
behavior. No existing permission boundary is intentionally weakened.

The 2026-09-29 reviewer follow-up also removes an undefined revenue-sharing argument from the
storefront quote and checkout resolver calls, allowing the resolver's existing tenant-level default
to apply. Employee Credit split-payment expectations now reflect the internal-tender contract:
provider-owned fields remain null and are not accepted for those allocations. These are corrective
changes within the already-declared payments surface; they do not change its authorization or
compliance controls.

## Affected Surfaces

- `pos` and `terminal` — POS terminal and checkout behavior, including the
  authorized handoff from POS to the dedicated OPIS app.
- `settings` and `compliance` — tenant administration, tax/discount settings,
  permission checks, and compliance-sensitive API paths.
- `payments` and `inventory` — payment/settlement behavior, catalog and stock
  handling, and their schema changes.

## Compliance Preconditions

1. The aggregate declaration is used only for base `develop` and head
   `feature/2052-opis-split-back-office`; other PRs continue validating their
   changed declarations against their own sensitive-file comparison.
2. The historical phase declarations remain in place and are not edited to
   imitate the union of unrelated surfaces in this comparison.
3. OPIS remains the owner of merchant Back Office destinations. POS does not
   restore its former Back Office shell; its handoff continues to use the
   existing authorization checks and explicit confirmation.
4. Taxes and Discounts remain guarded by server-derived settings capabilities;
   payment, inventory, and schema behavior continues through the existing
   backend policy and API paths.
5. This declaration does not claim a live request-time preflight. Its
   `NOT-EXECUTED-*` reference remains a PR-stage placeholder for the normal
   compliance preflight sweep before promotion.

## Verification Evidence

- `GITHUB_BASE_REF=develop GITHUB_HEAD_REF=feature/2052-opis-split-back-office npm run check:compliance` passed for the aggregate comparison.
- OPIS: 28 files / 131 tests passed. Storefront: 228 files / 1,242 tests passed. POS app: 3 files / 11 tests passed. Focused POS handoff/navigation suites: 55 tests passed.
- Focused API tax/discount, parked-sale, branch-directory, F&B settlement, and discount-policy suites: 13 suites / 162 tests passed.
- Reviewer follow-up: `storeUsecases.applicationResult.test.js` and `posSplitPayment.usecases.test.js` passed (2 suites, 101 tests), covering the storefront resolver default and Employee Credit internal-provider contract.
- All four app builds passed; architecture, tenant-schema coverage, compatibility-seam, workspace-hygiene, ADR, app-version, and JS/CJS syntax checks passed.
- The full IMS/web-core suite has known failures on both the integrated tree and pinned develop. The integrated run reported 67 failing tests; pinned develop reported 74. Three integration-only failures were corrected and their focused rerun passed. The remaining broad-suite failures are shared with develop and are not represented here as passing.
- The backend fast matrix timed out after 600 seconds, and no MySQL/Redis containers were available for a migration rehearsal. Static tenant-schema coverage passed; this declaration does not claim database or live-preflight evidence.

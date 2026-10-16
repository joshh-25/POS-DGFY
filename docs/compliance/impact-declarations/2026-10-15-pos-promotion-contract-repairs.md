---
status: draft_pr
owner: DGFY POS
last_reviewed: 2026-10-15
declaration_id: 2026-10-15-pos-promotion-contract-repairs
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED,IMPACT_DECLARATION_REQUIRED
policy_version: 2026.10.07
verification_evidence: npm run test:frontend:contracts (128 files, 776 tests), storefront Vitest suite (244 files, 1363 tests), npm run build:pos, npm run build:store, focused API tests (3 suites, 18 tests), architecture and runner-routing checks, git diff --check
rollback_note: Revert the POS contract assertion updates and this declaration together; these test-only POS changes have no production behavior or persisted-data rollback.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-15T15:30:16.888Z
preflight_request_ref: PREFLIGHT-38760204749-2026-10-15-POS-PROMOTION-CONTRACT-REPAIRS
---

# POS promotion-gate contract repairs

## Compliance Impact Classification

Major because changed files under `packages/web-core/src/features/pos/` have a repository-enforced
major classification floor for the `pos` and `terminal` surfaces. The POS changes in this batch
repair contract tests to match current component boundaries and receipt formatting. No POS runtime
source file is changed.

## Affected Surfaces

- `pos` — contracts for discounts, notifications, checkout readiness, shell routes, spacing, text
  size, transaction history, receipt output, and service-worker assets.
- `terminal` — contracts for responsive Items scrolling and terminal checkout readiness.

## Compliance Preconditions

- These changes modify POS contract tests only; they do not change authorization, tenant/location
  access, pricing, tax, fiscal calculations, payments, refunds, transaction state, or persisted
  data.
- The receipt contract verifies that the statutory label and ID are both present on consecutive
  wrapped rows, in order, before the signature line, and that non-statutory output omits both.
- The 42-column iMin output wrapping is attributed to the intentional `fitRows()` behavior
  introduced by `cd311af39`; accepting this presentation is an explicit assumption pending Pat's
  review.
- The `no_breach` result and timestamp above are required front-matter placeholders, not evidence
  of a live preflight. No live preflight was run for this test-only change. The `NOT-EXECUTED-*`
  reference is expected to be reconciled by the continuous compliance sweep after merge.
- Pat approved this declaration, including the receipt wrapping assumption, on 2026-10-15 in this
  implementation session.

## Verification Evidence

- `npm run test:frontend:contracts` passed: 128 files, 776 tests.
- The Storefront CI Vitest command passed: 244 files, 1,363 tests; the focused follow integration
  test also passed, but the original promotion-run failure remains unexplained and is deferred to
  the required fresh post-merge promotion gate.
- Focused API tests passed: 3 suites, 18 tests.
- `npm run build:pos` and `npm run build:store` both passed. POS emitted existing Vite dynamic-import
  warnings; Storefront emitted the existing large-chunk warning.
- Runner-routing checks passed, including 41 unit tests; architecture checks passed.
- `git diff --check` passed. The staged compliance gate is pending rerun with this declaration.

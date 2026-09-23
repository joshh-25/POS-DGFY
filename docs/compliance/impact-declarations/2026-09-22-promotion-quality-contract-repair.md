---
status: draft_pr
owner: engineering
last_reviewed: 2026-09-22
related_issue: https://github.com/Sieitzz/dgfy-platform/issues/2018
declaration_id: 2026-09-22-promotion-quality-contract-repair
classification: major
surfaces: pos,terminal,infra
reason_codes_impacted: NONE
policy_version: 2026.09.22
verification_evidence: npm run check:runner-routing (36/36 passing),git diff --check,focused POS contract test deferred to CI because this worktree lacks Vitest dependencies
rollback_note: Revert the POS contract-test assertion, runner-routing scaffold comment, release-note amendment, and this declaration; no runtime application, API, schema, authorization, tenant-data, or production configuration behavior changes are involved.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-22T00:00:00.000Z
preflight_request_ref: PREFLIGHT-2018-PROMOTION-QUALITY-CONTRACT-REPAIR
---

# Promotion quality contract repair

## Compliance Impact Classification

Major by repository path policy: the changed POS contract test is under
`packages/web-core/src/features/pos/`, which carries the repository's mechanical major floor for
the `pos` and `terminal` surfaces. The test change only aligns an assertion with the existing
tablet-specific component contract. The workflow change restores required CI routing metadata.

This repair introduces no new reason code, validation path, authorization behavior, persistence,
fiscal calculation, tenant-data mutation, API contract, schema change, or production configuration
change.

## Affected Surfaces

- `pos`, `terminal` — the contract test now enables `isTabletViewport` when asserting the existing
  full-row takeout-notes layout.
- `infra` — the production alias job regains the required commented hosted-runner alternate
  immediately above its active self-hosted selection.

## Compliance Preconditions

1. The POS source component remains unchanged; this repair is test-only for the frontend behavior.
2. The test continues to assert both tablet and desktop layout behavior; it does not remove a
   behavioral check.
3. The workflow comment is contract metadata only and does not change the active runner class.
4. No backend, migration, authorization, persistence, fiscal, or tenant-data files are changed.

## Verification Evidence

- `npm run check:runner-routing` passes.
- `npm run test:runner-routing` passes all 36 tests.
- `git diff --check` passes.
- Focused Vitest execution is deferred to CI because this worktree does not contain the required
  app dependencies; the prior failing assertion and its corrected tablet condition are explicit.

## Residual Risks

The API quality job from the blocked promotion terminated after schema preparation without logs.
It must complete on the repaired candidate before the promotion can be considered green; this
declaration does not treat that inconclusive infrastructure result as a code fix.

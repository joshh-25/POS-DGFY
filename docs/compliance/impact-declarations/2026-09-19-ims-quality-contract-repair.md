---
status: draft_pr
owner: DGFY POS/settings
last_reviewed: 2026-09-19
related_issue: https://github.com/Sieitzz/dgfy-platform/issues/1982
declaration_id: 2026-09-19-ims-quality-contract-repair
classification: major
surfaces: pos,terminal,settings
reason_codes_impacted: ALLOWED
policy_version: 2026.09.19
verification_evidence: node --check (focused JavaScript contract tests),git diff --check,CI frontend-ims-quality run 35365557710 failure evidence
rollback_note: Revert the test-only contract alignment and this declaration; no runtime application or tenant data changes are involved.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-18T17:41:42.590Z
preflight_request_ref: PREFLIGHT-35375287730-2026-09-19-IMS-QUALITY-CONTRACT-REPAIR
---

# IMS quality contract repair

## Compliance Impact Classification

Major by repository path policy: the change updates POS, terminal, and Settings contract tests
under `packages/web-core`. It changes test expectations and source-file ownership assertions only;
it does not alter runtime behavior, backend authorization, persistence, fiscal behavior, or tenant
data.

## Affected Surfaces

- `pos` — POS item, image, customer-access, delivery-partner, and Settings contract coverage.
- `terminal` — terminal Settings integration selector coverage.
- `settings` — Settings deep-link integration coverage.

## Compliance Preconditions

1. The repair must remain test-only; no production component or service implementation is changed.
2. Contract assertions must continue to cover the current extracted component boundaries and
   observable behavior rather than weaken coverage by removing behavior checks.
3. Existing backend authorization, tenant scoping, persistence, and compliance lifecycle behavior
   remain unchanged.

## Verification Evidence

- The failed CI run established the incident: run `35365557710`, job `105667100664`, with setup,
  installation, and lint passing before 18 contract/integration failures.
- Focused JavaScript contract tests pass `node --check` locally.
- `git diff --check` passes.
- Full Vitest execution is deferred to CI because this worktree does not contain the required Vite,
  Vitest, and React Vite-plugin dependencies.
- The develop backport preserves the same test-only contract alignment and does not change runtime
  application behavior, backend authorization, persistence, or tenant data.

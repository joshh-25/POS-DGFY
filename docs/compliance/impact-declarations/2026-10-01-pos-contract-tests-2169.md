---
status: draft_pr
owner: DGFY POS
last_reviewed: 2026-10-01
related_adr: docs/architecture/adr/0071-frontend-split-into-three-apps.md
declaration_id: 2026-10-01-pos-contract-tests-2169
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.10.01
verification_evidence: npm run test:frontend:contracts (137 files, 796 passed),focused contract and behavior suites (5 files, 44 passed),npm run build:ims,architecture and docs checks,git diff --check
rollback_note: Revert this declaration with the three POS/web-core contract test updates and candidate release-note amendment. The change updates test expectations only; it does not change runtime code, API behavior, permissions, persisted data, or migrations.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-01T02:16:02.359Z
preflight_request_ref: PREFLIGHT-LOCAL-1790820853542-2026-10-01-POS-CONTRACT-TESTS-2169
---

# Frozen Candidate POS Contract Test Repair (#2168)

## Compliance Impact Classification

Major, as required by the repository's path-based floor for the changed
`packages/web-core/src/features/pos/__tests__/` contract files. This PR changes test
assertions to match the current accessible labels and layout contracts. It does not
change POS or terminal runtime behavior, authorization, payment or fiscal logic, API
contracts, or persistent state. The inventory wizard test adjustment is also test-only.

## Affected Surfaces

- `pos` and `terminal` — shared POS frontend contract tests only; no runtime files change.

## Compliance Preconditions

1. The changed POS/terminal files are tests; no component, service, route, permission, or
   compliance policy implementation changes are included.
2. The updated assertions describe existing accessible labels and layout behavior and do not
   loosen payment, fiscal, authorization, tenant, or inventory enforcement.
3. No API, database schema, migration, seed, production tenant data, or persistent state is
   changed.
4. No production deployment or live tenant qualification is claimed by this declaration.

## Verification Evidence

- `npm run test:frontend:contracts` passed: 137 files, 796 tests.
- Focused contract and related behavior suites passed: 5 files, 44 tests.
- SKUpervisor build, architecture checks, documentation lint, app-version validation, and
  `git diff --check` passed. IMS lint reported existing warnings and no errors.

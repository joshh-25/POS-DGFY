---
status: reference
owner: engineering
last_reviewed: 2026-10-16
related_adr: none
declaration_id: 2026-10-16-pos-terminal-branch-scope-and-permission-scroll
classification: major
surfaces: pos,terminal,settings,permissions
reason_codes_impacted: ALLOWED,VALIDATION_FAILED,TERMINAL_DEVICE_MISMATCH
policy_version: 2026.10.16
verification_evidence: apps/dgfy-api/tests/posBranchDirectory.usecase.test.js,packages/web-core/src/features/pos/__tests__/terminalLocationScope.integration.test.jsx,packages/web-core/Components/users/__tests__/PermissionMatrix.scroll.test.jsx,npm run build,git diff --check
rollback_note: Revert the branch-scoped terminal lookup and permission-panel overflow changes together with their regression tests.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-16T17:45:00+08:00
preflight_request_ref: POS-TERMINAL-BRANCH-SCOPE-PERMISSION-SCROLL-2026-10-16
---

# POS Terminal Branch Scope and Permission Matrix Usability

## Compliance Impact Classification

Major.

This declaration covers POS terminal availability, branch-scoped shift recovery, and permission-matrix usability. It does not change tax calculation, payment authorization, fiscal document issuance, compliance lifecycle state, or customer data retention.

## Affected Surfaces

- POS branch terminal directory and shift-opening readiness.
- POS terminal setup and shift-location selection.
- Back Office user permission matrix accordions.

## Compliance Preconditions

1. A shift or operator session must be matched by both branch/location and terminal identity.
2. A terminal assigned to another branch must not be presented as an available terminal for the selected branch.
3. Permission changes must remain explicit and auditable; the change only makes long permission groups scrollable when expanded.
4. No permission or shift state is persisted by the new UI behavior without the existing user action and API validation.

## Verification Evidence

- `npm test -- --runTestsByPath tests/posBranchDirectory.usecase.test.js`
- `npx vitest run ../../packages/web-core/Components/users/__tests__ ../../packages/web-core/src/features/pos/__tests__/terminalLocationScope.integration.test.jsx --reporter=verbose`
- `npm run build` for `apps/dgfy-api`, `apps/dgfy-opis`, `apps/dgfy-pos`, and `apps/dgfy-ims`
- `git diff --cached --check`

---
status: draft_pr
owner: DGFY POS/settings
last_reviewed: 2026-09-19
related_adr: docs/architecture/adr/0071-frontend-split-into-three-apps.md
declaration_id: 2026-09-19-pos-cashier-access-removal
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.09.19
verification_evidence: focused_POS_settings_contract_tests,npm_run_build_pos,git_diff_check
rollback_note: Revert the POS cashier-access settings changes and this declaration; the existing server-side user removal contract and historical records remain unchanged.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-26T08:42:50.557Z
preflight_request_ref: PREFLIGHT-36230356710-2026-09-19-POS-CASHIER-ACCESS-REMOVAL
---

# POS cashier access removal

## Compliance Impact Classification

Major. The change touches `packages/web-core/src/features/pos/`, which the
repository classification matrix places on the `pos` and `terminal` major
floor. It restores the merchant-facing cashier access removal control in the
extracted POS Settings workspace and keeps the existing server-side soft-delete
and permission checks as the authority.

## Affected Surfaces

- `pos` — cashier access management in POS Settings.
- `terminal` — cashier assignment and permission presentation for registered terminals.

## Compliance Preconditions

1. Removal is available only to a master admin or user with `users:delete`.
2. The existing API prevents self-removal, master-admin removal, and other
   unauthorized company membership changes.
3. Removal is confirmed in the UI and only removes company access; historical
   sales, shifts, and attendance records are retained.
4. No database schema, migration, payment, fiscal, or credential authority
   changes are included.
5. This is local implementation evidence only; no production deployment or
   live-tenant qualification is claimed.

## Verification Evidence

- The focused POS guardrail suite passed: 6 files and 137 tests.
- `npm run build:pos` passed with the shared POS bundle.
- `git diff --check` passed for the implementation files.

Live request-time compliance preflight was not executed. The required
`NOT-EXECUTED-PHASE-430-LOCAL-ONLY` placeholder records that this is a local
checkpoint and must be reconciled before governed promotion.

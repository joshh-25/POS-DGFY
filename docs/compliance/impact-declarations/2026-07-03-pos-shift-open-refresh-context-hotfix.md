---
status: reference
owner: engineering
last_reviewed: 2026-07-02
related_adr: 0031-pos-terminal-pairing-and-shift-safe-navigation.md
declaration_id: 2026-07-03-pos-shift-open-refresh-context-hotfix
classification: major
surfaces: pos,terminal
reason_codes_impacted: none
policy_version: 2026.07.03
verification_evidence: npm run check:architecture,npm run check:compliance,npm run lint:docs,npm test -- --run src/features/pos/__tests__/terminalViewModeContracts.test.js src/features/pos/__tests__/terminalSessionSource.contract.test.js,npm run build:pos,git diff --check
preflight_result: no_breach
preflight_reason_code: POS_SHIFT_OPEN_REFRESH_CONTEXT_HOTFIX
preflight_run_at: 2026-07-03T01:15:00+08:00
preflight_request_ref: POS-SHIFT-OPEN-REFRESH-CONTEXT-HOTFIX-2026-07-03
rollback_note: Revert the frontend refresh-context hotfix and release manifest; no backend, database, payment, fiscal, or authorization contract changes are introduced.
---

# POS Shift Open Refresh Context Hotfix

## Compliance Impact Classification
Major. The touched files are under the POS terminal frontend surface, but the change is limited to frontend state refresh after an already successful shift-open mutation.

## Affected Surfaces
- POS Open Shift modal state after a successful shift-open request.
- POS terminal unlock flow when opening a shift during unlock.
- Active shift display and checkout availability after shift open.

## Compliance Preconditions
- Backend POS authorization, permission, terminal registry, terminal-location binding, location grant, compliance gate, idempotency, and open-shift checks are unchanged.
- The hotfix must not infer tenant, company, terminal, location, or user authority from frontend state.
- The refresh must use the same terminal and location that were already validated for the successful shift-open request.
- Fiscal receipt issuance, numbering, payment handling, stock movement, void, return, Z-reading, and eSales behavior remain unchanged.
- No database migration, payment routing, PayMongo, QR Ph, settlement, or billing behavior is included.

## Verification Evidence
- Targeted POS frontend contract tests for terminal view mode and terminal session source.
- POS production build.
- Architecture checks.
- Compliance impact and API contract checks.
- Documentation lint.
- Whitespace check.

## Rollback
Revert the POS frontend refresh-context hotfix and this release evidence, rebuild POS, rerun targeted POS tests plus release gates, and redeploy through the signed controller. No database rollback is required.

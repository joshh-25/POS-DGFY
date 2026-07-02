---
status: reference
owner: engineering
last_reviewed: 2026-07-02
related_adr: 0031-pos-terminal-pairing-and-shift-safe-navigation.md
declaration_id: 2026-07-02-pos-logical-terminal-shift-open
classification: major
surfaces: pos,terminal,settings,users
reason_codes_impacted: POS_OPERATOR_IDENTITY_INVALID,POS_OPERATOR_PROFILE_INACTIVE,TERMINAL_ID_REQUIRED_FOR_ENFORCED_REGISTRY,TERMINAL_ID_NOT_REGISTERED,TERMINAL_HOME_LOCATION_REQUIRED,LOCATION_SCOPE_DENIED
policy_version: 2026.07.02
verification_evidence: npm run check:architecture,npm run check:compliance,npm run lint:docs,npm --prefix backend test -- --runInBand tests/posUsecases.applicationResult.test.js,npm --prefix frontend exec vitest run src/features/pos/__tests__/TerminalLockDrawer.dgfy.test.jsx src/features/pos/__tests__/terminalPairing.contract.test.js src/features/pos/__tests__/terminalViewModeContracts.test.js src/features/pos/utils/__tests__/setupFlow.test.js src/features/pos/__tests__/posSettingsCashier.contract.test.js,npm --prefix frontend run build:pos,git diff --check
preflight_result: no_breach
preflight_reason_code: POS_LOGICAL_TERMINAL_SHIFT_OPEN
preflight_run_at: 2026-07-02T00:00:00+08:00
preflight_request_ref: POS-LOGICAL-TERMINAL-SHIFT-OPEN-2026-07-02
rollback_note: Revert the logical-terminal route, use-case, frontend, and ADR changes together; no database migration is introduced.
---

# POS Logical Terminal Shift Open

## Compliance Impact Classification
Major. The change removes physical-device pairing as a normal blocker for POS shift opening and checkout, replacing it with explicit DGFY identity, accepted membership, tenant-local authorization, POS permission, terminal registry, location grant, and open-shift checks.

## Affected Surfaces
- POS terminal unlock and shift opening.
- POS checkout authorization.
- POS onboarding and terminal registry copy.
- DGFY company access and tenant-local cashier/admin authorization.
- POS reconciliation test fixtures for active logical terminal registry state.

## Compliance Preconditions
- Operators authenticate through DGFY or an explicitly allowed legacy grace path.
- Accepted company membership and active tenant-local authorization profile remain required.
- Shift open and checkout require `pos:transact`.
- Selected terminals must be active, registered, and assigned to a valid tenant location.
- User location grants must allow the selected terminal location.
- Checkout still requires an open shift owned by the authenticated operator.
- Physical-device pairing endpoints may remain for compatibility, but missing or stale pairing cookies must not block otherwise authorized shift opening or checkout.
- Fiscal receipt issuance, numbering, totals, payment handling, and audit rules remain unchanged.

## Verification Evidence
- Targeted backend terminal, shift, checkout, identity, location, and POS reconciliation fixture tests.
- Targeted frontend DGFY drawer, terminal onboarding, shift-open copy, and settings tests.
- POS production build.
- Documentation lint, architecture guardrails, and compliance gates.

## Rollback
Revert this logical-terminal change as one slice with its ADR/API/UAT updates. Existing terminal registry settings are reused and no database migration rollback is required.

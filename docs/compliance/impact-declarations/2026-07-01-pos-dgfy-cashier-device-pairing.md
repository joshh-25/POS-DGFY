---
status: reference
owner: engineering
last_reviewed: 2026-07-01
related_adr: 0031-pos-terminal-pairing-and-shift-safe-navigation.md
declaration_id: 2026-07-01-pos-dgfy-cashier-device-pairing
classification: major
surfaces: pos,terminal,settings,users
reason_codes_impacted: POS_TERMINAL_PAIRING_REQUIRED,POS_TERMINAL_PAIRING_INVALID,POS_LOCAL_CASHIER_CREATION_RETIRED,POS_SETUP_INCOMPLETE
policy_version: 2026.07.01
verification_evidence: npm --prefix backend test -- --runInBand --runTestsByPath tests/posTerminalPairingUseCase.test.js tests/posTerminalRegistrySecrets.test.js tests/posSetupCashierUseCase.test.js tests/cashierPosPermissions.test.js tests/dgfyAuthUseCases.test.js,npm --prefix backend test -- --runInBand --runTestsByPath tests/posTerminalReadiness.usecase.test.js tests/posTerminalPairingService.test.js tests/posTerminalPairingCookie.test.js tests/settingsValidator.terminalRegistry.test.js,npm --prefix frontend test -- --run Components/users/__tests__/UserInvitationModal.dgfy.test.jsx src/features/pos/utils/__tests__/setupFlow.test.js src/features/pos/__tests__/posSettingsCashier.contract.test.js src/features/pos/__tests__/terminalPairing.contract.test.js src/features/pos/__tests__/terminalViewModeContracts.test.js src/features/pos/__tests__/posDgfyAdminBypass.contract.test.js,npm --prefix frontend run build,npm run lint:docs,npm run check:architecture,npm run check:compliance
preflight_result: no_breach
preflight_reason_code: POS_DGFY_DEVICE_PAIRING
preflight_run_at: 2026-07-01T21:30:00+08:00
preflight_request_ref: POS-DGFY-CASHIER-DEVICE-PAIRING-2026-07-01
rollback_note: Revert the DGFY cashier invitation and versioned device-pairing slice together; no database migration is introduced.
---

# POS DGFY Cashier and Device Pairing

## Compliance Impact Classification
Major. The change replaces POS credential and device-pairing boundaries but does not alter fiscal document generation, numbering, totals, or lifecycle rules.

## Affected Surfaces
- POS onboarding, terminal setup, unlock, and settings.
- DGFY cashier invitation with assigned-location grants.
- Cashier default micro-permissions and shift-close authorization.
- Versioned, administrator-enrolled terminal device pairing.
- Canonical multi-location setup and multiple terminals per location.

## Compliance Preconditions
- Cashiers authenticate through DGFY and must have an accepted, active company membership.
- Cashier invitations use the fixed least-privilege POS permission profile and require at least one valid active location grant.
- Only a current master administrator may enroll a physical device for an active, location-bound terminal.
- Pairing is revalidated against terminal ID, location, active state, and pairing version on every protected POS request.
- Terminal registry or location changes rotate pairing and invalidate stale device tokens.
- Cashiers cannot adjust drawers, close the fiscal day, void transactions, access eSales, or view management reports through default role permissions.
- Fiscal receipt issuance, numbering, totals, payment handling, and audit rules remain unchanged.

## Verification Evidence
- Targeted backend pairing, registry, invitation, readiness, permission, cookie, and validator suites pass.
- Targeted frontend invitation, onboarding readiness, pairing, navigation, and administrator-bypass suites pass.
- Frontend production build passes.
- Documentation lint, architecture guardrails, and compliance gates pass.

## Rollback
Revert the DGFY invitation, cashier permission, terminal registry, and device-pairing changes as one slice. Existing settings storage is reused and no database migration rollback is required.

---
status: reference
owner: engineering
last_reviewed: 2026-07-01
related_adr: 0031-pos-terminal-pairing-and-shift-safe-navigation.md
declaration_id: 2026-07-01-pr25-pos-setup-cashier-ui-hotfix
classification: major
surfaces: pos,terminal,settings,users
reason_codes_impacted: POS_TERMINAL_PAIRING_REQUIRED,POS_SETUP_INCOMPLETE,POS_SETTINGS_ACCESS_PIN_REQUIRED,POS_CASHIER_LOGIN_REQUIRED
policy_version: 2026.07.01
verification_evidence: npm --prefix frontend test -- --run src/features/pos/__tests__/terminalViewModeContracts.test.js src/features/pos/__tests__/terminalPairing.contract.test.js src/features/pos/__tests__/posDgfyAdminBypass.contract.test.js src/features/pos/__tests__/posSettingsCashier.contract.test.js src/features/pos/__tests__/TerminalLockDrawer.dgfy.test.jsx src/features/pos/__tests__/terminalSessionSource.contract.test.js src/features/pos/utils/__tests__/setupFlow.test.js,npm --prefix frontend run build:pos,npm --prefix frontend run build:skupervisor,npm --prefix backend test -- --runInBand --runTestsByPath tests/posTerminalPairingService.test.js tests/posTerminalPairingUseCase.test.js tests/posTerminalPairingCookie.test.js tests/posDeviceShiftGuard.test.js,npm run check:architecture
preflight_result: no_breach
preflight_reason_code: POS_SETUP_CASHIER_UI_HOTFIX
preflight_run_at: 2026-07-01T14:54:00+08:00
preflight_request_ref: PR25-POS-SETUP-CASHIER-UI-HOTFIX-2026-07-01
rollback_note: Revert this hotfix slice and redeploy the prior master SHA; no database migration is introduced.
---

# PR25 POS Setup/Cashier UI Hotfix

## Compliance Impact Classification
Major.

## Affected Surfaces
- POS terminal setup and cashier unlock UI.
- POS setup cashier list/create APIs.
- POS cashier username/email login route.
- POS Settings access PIN verification and masked read model.
- Terminal pairing and shift-safe navigation contracts.

## Compliance Preconditions
- DGFY tenant context remains required for POS login and setup APIs.
- Cashier setup creates normal tenant users with the existing `cashier` role; it does not create a separate credential store.
- Terminal pairing remains HttpOnly cookie-bound and revalidated by the current terminal-pairing service.
- POS Settings access PIN stores only a hash and exposes only the configured/not-configured runtime indicator.
- No PayMongo/payment implementation is included.

## Verification Evidence
- `npm --prefix frontend test -- --run src/features/pos/__tests__/terminalViewModeContracts.test.js src/features/pos/__tests__/terminalPairing.contract.test.js src/features/pos/__tests__/posDgfyAdminBypass.contract.test.js src/features/pos/__tests__/posSettingsCashier.contract.test.js src/features/pos/__tests__/TerminalLockDrawer.dgfy.test.jsx src/features/pos/__tests__/terminalSessionSource.contract.test.js src/features/pos/utils/__tests__/setupFlow.test.js`
- `npm --prefix frontend run build:pos`
- `npm --prefix frontend run build:skupervisor`
- `npm --prefix backend test -- --runInBand --runTestsByPath tests/posTerminalPairingService.test.js tests/posTerminalPairingUseCase.test.js tests/posTerminalPairingCookie.test.js tests/posDeviceShiftGuard.test.js`
- `npm run check:architecture`

## Rollback
Revert the hotfix commit and redeploy the previous production SHA. This slice does not require migration rollback.

---
status: reference
owner: engineering
last_reviewed: 2026-07-05
related_adr: docs/architecture/adr/0007-dual-mode-pos-compliance-program.md
declaration_id: 2026-07-05-pos-cashier-onboarding-session-and-report-hardening
classification: major
surfaces: pos,terminal,settings
reason_codes_impacted: POS_CASHIER_GMAIL_PROVISIONING,POS_SETTINGS_ACCESS_PIN_REQUIRED,POS_TERMINAL_PAIRING_REQUIRED,POS_REPORT_NAVIGATION_ALLOWED
policy_version: 2026.07.05
verification_evidence: npm --prefix frontend test -- --run src/features/pos/__tests__/posSettingsCashier.contract.test.js src/features/pos/__tests__/terminalViewModeContracts.test.js src/features/pos/__tests__/terminalResponsiveScroll.contract.test.js,npm --prefix frontend test -- --run src/services/__tests__/browserSession.posBootstrap.test.js,npm run build:pos
rollback_note: Revert the POS onboarding/session/report hardening commit and redeploy the prior POS bundle; this slice introduces no schema migration.
preflight_result: no_breach
preflight_reason_code: POS_ONBOARDING_SESSION_REPORT_HARDENING
preflight_run_at: 2026-07-05T20:05:00+08:00
preflight_request_ref: POS-ONBOARDING-SESSION-REPORT-HARDENING-2026-07-05
---

# POS Cashier Onboarding, Session, and Report Hardening

## Compliance Impact Classification

Major. This slice changes POS onboarding, terminal/session behavior, settings-bound terminal registry flows, and POS workspace navigation. It does not change payment processing, fiscal computation formulas, compliance policy evaluation, or tax calculation rules. The classification remains `major` because the changed files touch the POS, terminal, and settings surfaces guarded by the repository compliance rules.

## Affected Surfaces

1. `frontend/src/features/pos/components/PosTenantSetupModal.jsx` and related backend user/settings flows now allow Gmail-first cashier provisioning during POS onboarding instead of requiring a pre-existing accepted DGFY cashier.
2. `frontend/src/services/browserSession.js` and its contract test now persist and restore standalone POS browser session state across refresh and hard refresh.
3. `frontend/src/features/pos/components/TerminalWorkspaceSidebar.jsx`, `TerminalPageLayout.jsx`, `TerminalPage.jsx`, and `TerminalOperationsWorkspace.jsx` now keep the sidebar fixed open on desktop, restore the Settings entry, and repair Report navigation/rendering, including MSME-admin report access.
4. `backend/src/modules/settings/repositories/settingsRepository.js` and `backend/src/modules/settings/usecases/posTerminalRegistrySecrets.js` remain inside the settings surface because terminal registry and settings-PIN related state continue to be stored and normalized there.

## Compliance Preconditions

1. No payment gateway, charge authorization, refund, or settlement flow is modified.
2. No VAT, service charge, DGFY fee, receipt numbering, or fiscal receipt calculation logic is modified by this slice.
3. Gmail-first cashier provisioning must still create normal DGFY/tenant identities under the existing role/permission model and must not bypass company access controls.
4. POS Settings PIN protection remains in effect for Settings-related tools and Items; only Report navigation is removed from that PIN gate.
5. Standalone POS session persistence remains browser-session scoped and must still clear on explicit logout or terminal lock/session clear.
6. The MSME admin report fix must only restore access to the existing Reports workspace; it must not broaden cashier access to admin-only views.

## Verification Evidence

- `npm --prefix frontend test -- --run src/features/pos/__tests__/posSettingsCashier.contract.test.js src/features/pos/__tests__/terminalViewModeContracts.test.js src/features/pos/__tests__/terminalResponsiveScroll.contract.test.js`
- `npm --prefix frontend test -- --run src/services/__tests__/browserSession.posBootstrap.test.js`
- `npm run build:pos`


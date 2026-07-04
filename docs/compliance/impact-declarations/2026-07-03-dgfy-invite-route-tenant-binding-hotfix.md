---
status: reference
owner: engineering
last_reviewed: 2026-07-03
related_adr: 0028-dgfy-account-company-switching.md
declaration_id: 2026-07-03-dgfy-invite-route-tenant-binding-hotfix
classification: major
surfaces: pos,terminal,settings
reason_codes_impacted: TENANT_CONTEXT_REQUIRED
policy_version: 2026.07.03
verification_evidence: npm run check:architecture,npm run check:compliance,backend tenantHandler focused test,frontend DGFY invitation modal test,frontend POS cashier contract test,POS build,IMS build
rollback_note: Revert DGFY route tenant binding and POS cashier invite location-source changes if production shows unexpected tenant binding or POS invite-location behavior.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-03T14:36:00+08:00
preflight_request_ref: DGFY-INVITE-ROUTE-TENANT-BINDING-HOTFIX-2026-07-03
---

# DGFY Invite Route Tenant Binding Hotfix

## Compliance Impact Classification

Major

## Affected Surfaces

- DGFY registered-account search used by IMS user invitations and POS cashier invitations.
- DGFY invitation creation used by IMS and POS setup.
- POS cashier invitation modal location-scope selection.
- Tenant middleware ordering for `/api/v1/dgfy` business routes.

## Compliance Preconditions

- DGFY account search still requires authenticated tenant access and `users:manage`.
- DGFY invitation creation still requires authenticated tenant access and `users:manage`.
- DGFY routes are bound to tenant context before authenticated tenant authorization runs.
- The tenant middleware recovers tenant context only from the signed tenant context cookie, explicit company token, or tenant-bound bearer token.
- The hotfix does not permit invite creation from email alone; the operator still selects a registered DGFY account returned by the account-search API.
- POS cashier invite location scope must be sourced from the active POS company locations, not from an unrelated ambient tenant fetch.
- No checkout, fiscal receipt, close-day/Z-reading, payment, or tax calculation behavior changes.
- No database migration or destructive data change is introduced.

## Verification Evidence

- `cmd /c npm --prefix backend test -- --runTestsByPath tests/tenantHandler.emailOtp.test.js`
- `cmd /c npm --prefix frontend test -- --run Components/users/__tests__/UserInvitationModal.dgfy.test.jsx src/features/pos/__tests__/posSettingsCashier.contract.test.js src/features/pos/__tests__/terminalViewModeContracts.test.js`
- `cmd /c npm run check:architecture`
- `cmd /c npm run check:compliance`
- `cmd /c npm --prefix backend run build`
- `cmd /c npm --prefix frontend run build:pos`
- `cmd /c npm --prefix frontend run build:skupervisor`

## Rollback Note

Revert `backend/src/server.js`, `backend/src/middleware/tenantHandler.js`, `backend/tests/tenantHandler.emailOtp.test.js`, `frontend/Components/users/UserInvitationModal.jsx`, `frontend/Components/users/__tests__/UserInvitationModal.dgfy.test.jsx`, `frontend/src/features/pos/components/TerminalOperationsWorkspace.jsx`, `frontend/src/features/pos/__tests__/posSettingsCashier.contract.test.js`, and this declaration if production shows unexpected tenant binding or POS invite-location behavior.

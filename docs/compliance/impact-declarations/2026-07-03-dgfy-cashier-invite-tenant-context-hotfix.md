---
status: reference
owner: engineering
last_reviewed: 2026-07-03
related_adr: 0028-dgfy-account-company-switching.md
declaration_id: 2026-07-03-dgfy-cashier-invite-tenant-context-hotfix
classification: major
surfaces: pos,terminal,settings
reason_codes_impacted: TENANT_CONTEXT_REQUIRED
policy_version: 2026.07.03
verification_evidence: npm run check:architecture,npm run check:compliance,backend tenantHandler focused test,frontend POS terminal view-mode contract test
rollback_note: Revert the DGFY tenant-context route recovery and cashier close-shift UI permission alignment if production shows unexpected tenant binding or POS shift authorization behavior.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-03T13:45:00+08:00
preflight_request_ref: DGFY-CASHIER-INVITE-HOTFIX-2026-07-03
---

# DGFY Cashier Invite Tenant Context Hotfix

## Compliance Impact Classification

Major

## Affected Surfaces

- DGFY account company-list requests used by IMS/POS authenticated tenant sessions.
- DGFY registered-account search used by IMS user invitations and POS cashier invitations.
- DGFY invitation creation used by IMS and POS setup.
- POS terminal close-shift UI permission gating for the default cashier role.

## Compliance Preconditions

- DGFY account search still requires authenticated tenant access and `users:manage`.
- DGFY invitation creation still requires authenticated tenant access and `users:manage`.
- The tenant middleware only recovers tenant context from the signed tenant context cookie or a tenant-bound bearer token.
- The hotfix does not permit invite creation from email alone; the registered DGFY account search and invitation handlers remain authoritative.
- The POS close-shift route still requires backend `pos:shift_close`; the UI now aligns with that backend permission and still allows `pos:close_day` users to close shifts.
- Fiscal close-day/Z-reading authority remains gated by `pos:close_day`.

## Verification Evidence

- `npm run check:architecture`
- `npm run check:compliance`
- `cmd /c npm --prefix backend test -- --runTestsByPath tests/tenantHandler.emailOtp.test.js`
- `cmd /c npm --prefix frontend test -- --run src/features/pos/__tests__/terminalViewModeContracts.test.js`

## Rollback Note

Revert `backend/src/middleware/tenantHandler.js`, `backend/tests/tenantHandler.emailOtp.test.js`, `frontend/src/features/pos/pages/TerminalPage.jsx`, `frontend/src/config/permissions_frontend.js`, `frontend/src/features/pos/__tests__/terminalViewModeContracts.test.js`, this declaration, and the cashier flow document if production shows unexpected DGFY tenant binding or POS shift authorization behavior.

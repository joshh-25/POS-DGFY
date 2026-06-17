---
status: reference
owner: engineering
last_reviewed: 2026-06-17
related_adr: docs/architecture/adr/0028-dgfy-account-company-switching.md
declaration_id: 2026-06-17-dgfy-company-access-hardening
classification: regulatory
surfaces: pos,terminal,tenant-registration,settings,compliance
reason_codes_impacted: IMPACT_DECLARATION_REQUIRED,DGFY_MEMBERSHIP_REQUIRED,LEGACY_GRACE_ALLOWED,LEGACY_GRACE_BLOCKED,POS_UNLOCK_ALLOWED,POS_UNLOCK_DENIED
policy_version: 2026.06.17
verification_evidence: npm run check:architecture,npm run lint:docs,git diff --check,npm --prefix backend test -- --runTestsByPath tests/dgfyAuthUseCases.test.js tests/dgfyLegacyLinkService.test.js tests/dgfyTenantSession.transport.test.js tests/auth.test.js,npm --prefix frontend test -- --run src/features/pos/__tests__/TerminalLockDrawer.dgfy.test.jsx Components/users/__tests__/UserInvitationModal.dgfy.test.jsx --testTimeout 20000,npm --prefix frontend run build:skupervisor,npm --prefix frontend run build:store,npm --prefix frontend run build:pos
rollback_note: Revert the DGFY-only invitation, legacy-linking, membership session, POS unlock drawer, audit-action migration, docs, and tests together; keep existing tenant-local legacy access available until a rollback decision is recorded.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-06-17T17:15:00+08:00
preflight_request_ref: DGFY-COMPANY-ACCESS-HARDENING-2026-06-17
---

# DGFY Company Access Hardening

## Compliance Impact Classification

Regulatory.

This declaration covers the DGFY company-access hardening slice that changes business identity, invitation, company membership, legacy grace linking, and POS unlock behavior. The change touches POS and tenant registration surfaces, so it is treated as regulatory even though it does not change fiscal receipt generation, tax computation, payment capture, or compliance mode state transitions.

## Affected Surfaces

1. DGFY account membership is the canonical source for new company access, company switching, invitation acceptance, and DGFY POS session creation.
2. Existing accepted tenant-local IMS/POS users without linked DGFY accounts remain eligible for legacy grace access until June 17, 2027.
3. Legacy link completion now writes membership, owner bootstrap state, email-to-tenant mapping, and audit evidence as one landlord transaction.
4. POS unlock now supports the DGFY account, accessible company, and terminal/counter selection path while preserving terminal registry enforcement.
5. DGFY account invitation search and business access endpoints are rate-limited and must not expose company tokens.
6. Business audit events now cover invitation, switch, leave, ownership transfer, legacy link, and POS unlock success/failure paths.

## Compliance Preconditions

1. Company tokens must not become credentials in DGFY flows; they may only preselect context after access is confirmed.
2. Tenant-local users remain authorization and audit actor profiles only; DGFY password hashes must not be copied into tenant schemas.
3. Legacy grace access applies only to accepted existing tenant-local users and must not reintroduce invite-link account creation.
4. POS DGFY unlock must still enforce accepted membership, POS permission, tenant activity, terminal registry policy, and terminal-location binding.
5. Hardware bridge warnings for printers, cash drawers, and iMin devices must remain separate from authentication failure unless a tenant policy explicitly requires hardware availability before unlock.
6. Fiscal receipt sequencing, payment capture, shift accounting, compliance gate refresh, and offline queue behavior are not intentionally changed by this slice.
7. Production readiness remains below 9/10 until seeded UAT proves IMS, POS, Storefront account, legacy migration, and rollback telemetry end to end.

## Verification Evidence

1. `npm run check:architecture`
2. `npm run lint:docs`
3. `git diff --check`
4. `npm --prefix backend test -- --runTestsByPath tests/dgfyAuthUseCases.test.js tests/dgfyLegacyLinkService.test.js tests/dgfyTenantSession.transport.test.js tests/auth.test.js`
5. `npm --prefix frontend test -- --run src/features/pos/__tests__/TerminalLockDrawer.dgfy.test.jsx Components/users/__tests__/UserInvitationModal.dgfy.test.jsx --testTimeout 20000`
6. `npm --prefix frontend run build:skupervisor`
7. `npm --prefix frontend run build:store`
8. `npm --prefix frontend run build:pos`
9. `npm run smoke:dgfy-access-ui` remains the rendered browser QA gate and requires local/staging IMS, POS, and Storefront account servers with seeded DGFY states.

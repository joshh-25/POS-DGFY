---
status: reference
owner: engineering
last_reviewed: 2026-06-15
related_adr: docs/architecture/adr/0007-dual-mode-pos-compliance-program.md
declaration_id: 2026-06-15-pos-metadata-terminal-unlock
classification: regulatory
surfaces: pos,terminal,settings,admin-tenants,compliance
reason_codes_impacted: ALLOWED,VALIDATION_FAILED,TENANT_CAPABILITY_DISABLED,POS_LOGIN_MULTIPLE_TENANTS,POS_LOGIN_TENANT_NOT_FOUND,POS_LOGIN_COMPANY_TOKEN_UNRESOLVED
policy_version: 2026.06.15
verification_evidence: npm run lint:docs,npm run check:architecture,npm run check:compliance,npm --prefix frontend test -- --run src/features/pos/utils/__tests__/terminalUnlockDiagnostics.test.js src/features/pos/__tests__/terminalSessionSource.contract.test.js src/features/pos/__tests__/terminalViewModeContracts.test.js,npm --prefix frontend run build:pos,git diff --check
rollback_note: Revert POS metadata admin/settings changes and terminal unlock diagnostics together, or deliberately split before deployment if only one stream should ship.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-06-15T12:00:00+08:00
preflight_request_ref: POS-METADATA-TERMINAL-UNLOCK-2026-06-15
---

# POS Metadata And Terminal Unlock Hardening

## Compliance Impact Classification

Regulatory.

This declaration covers two source-current POS changes that are expected to deploy together unless deliberately split before promotion:

1. POS receipt/configuration metadata governance.
2. Standalone POS terminal tenant-context login hardening.

The metadata stream is compliance-sensitive because receipt identity, PTU/MIN/accreditation references, buyer fiscal-detail requirements, and DGFY POS software identity influence POS receipt and fiscal-readiness presentation. The terminal unlock stream is security-sensitive because stale tenant context can send a valid account/password attempt to the wrong tenant database.

## Affected Surfaces

- Settings > POS Setup lets tenant admins edit tenant-reviewable receipt metadata, but those edits are stored in `pos_receipt_metadata_pending_changes` until platform admin approval.
- Tenant Settings no longer exposes DGFY POS software name, software version, or software serial number as tenant-editable fields.
- Tenant Manager exposes POS Metadata controls for platform-admin software identity updates and receipt metadata approval/rejection with a required reason.
- Platform-admin POS metadata operations persist audit rows in `tenant_admin_audit_logs` with `action = pos_metadata_update`.
- `POST /api/v1/auth/lookup` is the required pre-login tenant resolver for standalone POS unlock.
- Standalone POS sends `/auth/login` with the lookup-resolved company token, uses the current browser company token only when lookup confirms it belongs to the submitted email, and limits stale-token fallback to transient lookup outages.
- POS unlock diagnostics keep invalid credentials, missing email-to-tenant mapping, multiple tenant membership, POS capability disabled, POS permission denial, rate limiting, and optional device-bridge `503` distinct for operator troubleshooting.
- Standalone POS development auto-login is opt-in through `VITE_POS_DEV_AUTO_LOGIN=true` so local development does not silently bind all POS sessions to the legacy tenant.

## Compliance Preconditions

1. Fiscal/non-fiscal receipt classification must continue to come only from explicit server contract fields, not invoice number prefixes.
2. Tenant receipt metadata submissions must not become live until platform admin approval.
3. Platform-admin software identity writes and metadata reviews must require a reason and keep before/after audit evidence.
4. POS terminal login must not trust stale browser tenant context when `/auth/lookup` proves a different tenant, returns multiple tenants, returns no tenant, or rate-limits the request.
5. `/pos/device/status` `503` remains an optional hardware bridge availability issue and must not be classified as authentication failure.
6. These source-current changes are not production-live until a deployment records a new deployed SHA, POS asset identity, backend health, POS smoke, and relevant admin/cashier UAT evidence.

## Verification Evidence

Required validation for this branch:

1. `npm --prefix frontend test -- --run src/features/pos/utils/__tests__/terminalUnlockDiagnostics.test.js src/features/pos/__tests__/terminalSessionSource.contract.test.js src/features/pos/__tests__/terminalViewModeContracts.test.js`
2. `npm --prefix frontend run build:pos`
3. Backend POS metadata/settings/admin tests covering `posReceiptMetadataApprovalPolicy`, settings validation, tenant admin handlers, POS metadata use cases, and tenant admin audit actions.
4. `npm run lint:docs`
5. `npm run check:architecture`
6. `npm run check:compliance`
7. `git diff --check`

## Deployment Note

If the operator deploys from the current branch/worktree after this declaration, the POS metadata/configuration/compliance work and POS terminal unlock hardening will be promoted together. If only one stream is intended for release, split the branch or revert the other stream before running the deployment workflow.

---
status: reference
owner: engineering
last_reviewed: 2026-07-28
related_adr: docs/architecture/adr/0039-platform-admin-identity-and-page-rbac.md,docs/architecture/adr/0040-qa-landlord-invoicing-boundary.md
declaration_id: 2026-07-28-platform-admin-manual-review-and-qa-invoicing
classification: regulatory
surfaces: settings,compliance,tenant-registration,admin,api,invoicing,pos,terminal,docs
reason_codes_impacted: IMPACT_DECLARATION_REQUIRED,ALLOWED,VALIDATION_FAILED,TENANT_PENDING_APPROVAL,CSRF_TOKEN_REQUIRED
policy_version: 2026.07.28
verification_evidence: npm run lint:docs,npm run check:architecture,npm run check:compliance,git diff --check,npm --prefix backend test -- --runTestsByPath tests/platformAdminUsersUseCase.test.js tests/platformAdminRouteClassification.test.js tests/platformInvoiceUseCases.test.js tests/companyRegistrationStatusUseCase.test.js tests/registerCompanyRequestUseCase.autoApproval.test.js tests/productionEcosystemConfig.test.js,npm --prefix frontend test -- --run Pages/__tests__/RegisterCompanyLoginHandoff.test.jsx apps/store/src/__tests__/businessRegistrationApprovalHandoff.contract.test.js src/features/pos/__tests__/serviceWorkerCaching.contract.test.js,npm --prefix frontend run build:skupervisor,npm --prefix frontend run build:pos,npm --prefix frontend run build:store,local-migration-and-lifecycle-qa
rollback_note: Revert the platform-admin identity, manual-review registration, and QA invoice migrations, modules, routes, UI, tests, and ADRs together. Do not restore automatic public tenant activation or enable live invoicing/payment issuance as part of rollback.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-28T11:20:00+08:00
preflight_request_ref: PLATFORM-ADMIN-QA-INVOICING-2026-07-28
snapshot_commit: pending-local
---

# Platform Admin Manual Review and QA Invoicing

## Compliance Impact Classification

Regulatory. This slice changes the approval boundary between a public company-registration request and activation of a tenant database. It also introduces landlord-only QA invoices, cash-payment records, PDF artifacts, credit records, and replacements. The implementation is deliberately QA-only and must not be interpreted as authorization to issue live fiscal or tax documents.

## Affected Surfaces

1. Public company registration creates a pending application and must not disclose a usable tenant identifier before provisioning succeeds.
2. Platform Admin identities use database-backed, revocable sessions and page-level permissions enforced by the API.
3. Tenant approval is the only path that provisions a pending public registration; failures remain pending and retryable.
4. QA invoices are landlord records for approved and provisioned registrations only; they use TEST numbering/watermarking and have no live payment provider path.
5. Issued QA PDFs are private artifacts with a stored SHA-256 digest. Full credits append a correction record; replacements are new drafts rather than edits to issued originals.
6. Email delivery is refused unless a safe QA sink or allowlist is configured.

## Compliance Preconditions

1. No public registration may auto-provision or auto-activate a tenant.
2. Pending or rejected companies must not receive tenant/POS access, a company token, or a provisioned tenant database.
3. Page hiding and frontend state are not authorization; protected API routes must resolve live Platform Admin authority and permission grants.
4. QA invoices must keep `mode=qa`, TEST-only numbering/watermarks, and disabled live/online/recurring payment paths.
5. No live fiscal invoice, tax filing, payment-provider capture, or production email delivery is authorized by this declaration.
6. A rejected or fully credited original cannot be silently mutated into a replacement; the audit trail and immutable artifact remain available.

## Verification Evidence

1. `npm run lint:docs`
2. `npm run check:architecture`
3. `git diff --check`
4. Targeted backend tests: 32 passing assertions across Platform Admin, mandatory manual-review registration, invoice, applicant-status, and runtime-policy contracts.
5. Targeted frontend tests: 24 passing assertions across registration handoff, Storefront approval handoff, and POS service-worker recovery contracts.
6. SKUpervisor, POS, and Storefront production builds completed successfully.
7. Fresh local `sku_test` migration chain completed, followed by a real registration approval retry after tenant-schema isolation was corrected.
8. Local protected API QA completed draft, issued cash invoice with confirmed change, private PDF read (`%PDF`, 2,261 bytes), full credit, and a separate replacement draft.

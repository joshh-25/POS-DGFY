---
status: reference
owner: engineering
last_reviewed: 2026-06-16
related_adr: docs/architecture/adr/0017-customer-access-modes-and-inventory-display.md
declaration_id: 2026-06-16-storefront-access-mode-ceiling-ui
classification: regulatory
surfaces: admin-tenants,settings,storefront,compliance
reason_codes_impacted: ALLOWED,CUSTOMER_ACCESS_MODE_BLOCKED,VALIDATION_FAILED
policy_version: 2026.06.16
verification_evidence: npm exec vitest run src/pages/__tests__/TenantManager.capabilities.integration.test.jsx src/pages/__tests__/Settings.deepLinking.integration.test.jsx --pool=threads,npm --prefix frontend run build,npm run check:architecture,git diff --check
rollback_note: Revert the Tenant Manager platform-ceiling selector, tenant Settings request-ceiling copy, tests, and feature-doc update together; backend access-mode enforcement stays unchanged.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-06-16T22:40:00+08:00
preflight_request_ref: STOREFRONT-ACCESS-MODE-CEILING-UI-2026-06-16
---

# Storefront Access Mode Ceiling UI

## Compliance Impact Classification

Regulatory.

This declaration covers the Tenant Manager and tenant Settings UI correction for Storefront customer access modes. The change is compliance-sensitive because Tenant Manager and Settings are governed surfaces and the UI now distinguishes platform-admin ceiling, company-requested mode, and registration-readiness effective mode more clearly. It does not change backend checkout enforcement, payment authorization, stock deduction, fiscal receipt behavior, tenant lifecycle status, or the ADR 0017 access-mode policy.

## Affected Surfaces

- Tenant Manager now renders Platform max allowed as a compact platform-admin selector instead of a duplicate mode-card grid.
- Tenant Manager keeps the company-requested mode as the only storefront mode-card grid and continues to show requested, effective, platform max, registration max, and limitation copy.
- Tenant Settings now disables requested modes only above the platform-admin ceiling, so company admins can request Transaction when platform max is Transaction even if registration readiness still caps effective mode to Catalog.
- Tenant Settings copy now states that checkout follows the effective mode after registration readiness is applied.
- Feature documentation now reflects that tenant-requested mode and effective runtime mode are separate decisions.

## Compliance Preconditions

1. Platform max remains platform-admin controlled and tenant Settings must not write `platform_max_customer_access_mode`.
2. Backend runtime access policy remains the source of truth for quote, checkout, booking, and payment availability.
3. Registration readiness can still reduce effective mode below the requested mode until the tenant is raised to a transaction-capable stage.
4. Checkout remains blocked unless effective customer access mode is `transaction` and existing stock, branch, payment, compliance, and business-hours gates also pass.
5. Platform-admin changes still require the existing confirmation modal and audit reason flow.

## Verification Evidence

Validation performed for this declaration:

1. `cmd /c npm exec vitest run src/pages/__tests__/TenantManager.capabilities.integration.test.jsx src/pages/__tests__/Settings.deepLinking.integration.test.jsx --pool=threads`
   - Result: PASS, 2 files / 27 tests.
2. `cmd /c npm --prefix frontend run build`
   - Result: PASS, Vite production build completed.
3. `cmd /c npm run check:architecture`
   - Result: PASS, architecture guardrails and controller boundaries completed.
4. `git diff --check`
   - Result: PASS.

## Production Verification

This change is production-deployed at SHA `14de6e0f0d4497d7821e047704a66705b6164f29`. Deploy summary `/var/www/skupervisor/logs/deploy/deploy_20260616_021931.summary.txt` records backend, IMS, POS, Store, public endpoint, tenant-store asset integrity, frontend asset parity, tenant schema sync, permission backfill, Storefront discovery index reconciliation, PM2 reload, and `tenant_index_headroom_strict=0` report mode passing. Remote `HEAD`, `origin/master`, and `.deploy-state/last_deployed_commit` matched the deployed SHA at proof time.

Space Bar production proof after deployment still records requested customer access mode `transaction`, effective customer access mode `catalog`, and checkout disabled because registration stage `informal` allows up to catalog mode. That is expected under ADR 0017; the UI correction clarifies the ceiling model and does not bypass registration readiness.

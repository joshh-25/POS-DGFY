---
status: reference
owner: engineering
last_reviewed: 2026-06-25
related_adr: docs/architecture/adr/0013-tenant-onboarding-and-storefront-readiness.md,docs/architecture/adr/0014-mode-aware-csv-import-export.md,docs/architecture/adr/0017-storefront-gallery-and-access-mode.md,docs/architecture/adr/0019-food-and-beverage-mode.md
declaration_id: 2026-06-25-storefront-onboarding-fnb-import-hardening
classification: major
surfaces: settings,onboarding,storefront,inventory_csv,email,dgfy_account
reason_codes_impacted: ALLOWED,VALIDATION_FAILED
policy_version: 2026.06.25
verification_evidence: npm --prefix backend test -- --runTestsByPath tests/settingsStorefrontAsset.usecase.test.js tests/settingsValidator.singleSettingArray.test.js tests/settingsHandlers.transport.test.js tests/settingsUsecases.applicationResult.test.js tests/csvImportService.workflowMode.test.js tests/csvExportService.workflowMode.test.js tests/emailTemplates.companyApproved.test.js,npm --prefix frontend test -- --run src/features/onboarding/components/__tests__/OnboardingSetupModal.behavior.test.jsx src/features/settings/__tests__/StorefrontBusinessHoursScheduler.test.jsx src/pages/__tests__/Settings.deepLinking.integration.test.jsx src/features/settings/__tests__/WorkflowModeContext.publicRoutes.test.jsx apps/store/src/__tests__/normalizeStorefrontPageModel.test.js src/services/__tests__/dgfyAuthService.cookieSession.test.js,npm --prefix backend test -- --runTestsByPath tests/storefrontDiscoveryRepository.test.js,npm run build:skupervisor,npm run build:store,npm run qa:fnb-readiness,npm run check:architecture
rollback_note: Revert storefront gallery upload validation/cleanup, Settings gallery preview/save hardening, DGFY optional company-list hydration gating, workflow-mode resolved gating, business-hours day button handling, approval template cleanup, and F&B CSV import warning/count changes together if tenant Settings save or CSV import regressions appear.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-06-25T11:35:00+08:00
preflight_request_ref: STOREFRONT-FNB-HARDENING-2026-06-25
---

# Storefront, Onboarding, And F&B Import Hardening

## Compliance Impact Classification

Major.

This declaration covers a tenant-facing bug-fix slice for onboarding mode labels, Storefront gallery image uploads, Storefront business hours editing, company approval email copy, and Food & Beverage CSV import/export reliability.

The release does not change fiscal receipt issuance, POS checkout authorization, payment authorization, tenant capability enforcement, DGFY account authorization, or platform-admin approval policy. Storefront gallery cleanup is tenant-scoped and removes only omitted local `storefront-assets/<tenant>/...` paths after settings persistence succeeds. The remaining gallery audit script is dry-run by default and requires an explicit apply flag before removing invalid gallery rows.

## Affected Surfaces

1. Tenant Settings accepts uploaded Storefront gallery assets through the existing storefront asset upload path and persists gallery ordering/caption/alt text through `storefront_gallery_images`.
2. Storefront gallery settings now accept backend-local uploaded asset URLs and path-only entries while preserving external HTTP(S) gallery URLs.
3. Omitted tenant-owned Storefront gallery files are removed best-effort after a successful gallery settings save.
4. Tenant onboarding reminder/modal rendering waits for a resolved workflow mode so unresolved settings fetches do not display an incorrect default mode label.
5. Storefront business-hours day selection uses explicit buttons for per-day and all-days edits.
6. Company approval email output no longer renders the company token or security note.
7. Food & Beverage flat menu/beverage CSV rows use the faster bulk import path, and barcode alias sync failures after item persistence are reported as row warnings instead of failed item creates/updates.
8. Settings gallery uploads now prefer the durable local `path`, warn on expired signed Notion links, and surface more precise upload validation messages.
9. Public Storefront account-panel hydration waits for resolved DGFY account auth before calling optional company-list hydration, without relaxing backend authorization.
10. A tenant-scoped Storefront gallery audit script reports expired Notion URLs, invalid local paths, and empty gallery rows in dry-run mode by default.

## Compliance Preconditions

1. Gallery upload validation remains strict image-only validation.
2. Gallery cleanup must not delete external URLs, item gallery files, cover/profile files, or paths outside the current tenant's Storefront asset folder.
3. CSV imports must continue to revalidate rows server-side and preserve clear failed-row errors for actual item persistence failures.
4. Approval token removal applies only to the company approval message; reactivation, invitation, login, and Settings company-token flows are unchanged.
5. No deprecated or archived architecture docs were used for implementation decisions.
6. DGFY account-company routes remain protected; unauthenticated optional hydration should be avoided client-side rather than allowed server-side.

## Verification Evidence

Required validation for this branch:

1. `npm --prefix backend test -- --runTestsByPath tests/settingsStorefrontAsset.usecase.test.js tests/settingsValidator.singleSettingArray.test.js tests/settingsHandlers.transport.test.js tests/settingsUsecases.applicationResult.test.js tests/csvImportService.workflowMode.test.js tests/csvExportService.workflowMode.test.js tests/emailTemplates.companyApproved.test.js`
2. `npm --prefix frontend test -- --run src/features/onboarding/components/__tests__/OnboardingSetupModal.behavior.test.jsx src/features/settings/__tests__/StorefrontBusinessHoursScheduler.test.jsx src/pages/__tests__/Settings.deepLinking.integration.test.jsx src/features/settings/__tests__/WorkflowModeContext.publicRoutes.test.jsx apps/store/src/__tests__/normalizeStorefrontPageModel.test.js`
3. `npm run build:skupervisor`
4. `npm run build:store`
5. `npm run qa:fnb-readiness`
6. `npm run check:architecture`
7. `npm run check:compliance`
8. Guarded production deploy summary from `scripts/deploy-remote.sh --yes`
9. `node --check backend/scripts/audit-storefront-gallery-images.js`

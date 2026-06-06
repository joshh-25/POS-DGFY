# System Audit - 2026-06-02

Status: Open audit package
Audit owner: Codex-assisted repository audit
Audit date: 2026-06-02
Repository: SKU Inventory Manager

## Scope

This audit replaces the previous `System_Audit` content. The previous audit files were relocated to `docs/archive/system-audit-2026-03/` so this folder only contains the current strict audit set.

The audit looked across:

- Application security and session handling
- Dependency and supply-chain risk
- Release gates and production readiness
- Backend architecture and boundary governance
- Frontend contract coverage, performance, and maintainability
- Payment, webhook, and billing safety
- Tenant onboarding, invitations, and RBAC
- AI tool registry, AI safety, and LLM-specific controls
- Database/query scale risks and upload handling
- Regulatory and fiscal-readiness evidence
- Observability, SLOs, and operational evidence
- Documentation governance and ADR alignment

## Authority Used

Repo-governed docs were treated as the first source of truth:

- `docs/START_HERE.md`
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
- Relevant ADRs under `docs/architecture/adr/`

External references used as audit baselines:

- OWASP Application Security Verification Standard: https://owasp.org/www-project-application-security-verification-standard/
- OWASP API Security Top 10 2023: https://owasp.org/API-Security/editions/2023/en/0x11-t10/
- OWASP Top 10 for Large Language Model Applications: https://owasp.org/www-project-top-10-for-large-language-model-applications/
- NIST SP 800-218 Secure Software Development Framework: https://csrc.nist.gov/pubs/sp/800/218/final
- CISA Secure by Design: https://www.cisa.gov/resources-tools/resources/secure-by-design
- web.dev Core Web Vitals: https://web.dev/vitals/
- BIR revenue issuance index for RMO traceability: https://www.bir.gov.ph/index.php/revenue-issuances/revenue-memorandum-orders.html

## Evidence Commands

Commands executed during this audit:

- `npm run check:architecture` - passed.
- `npm run lint:docs` - passed.
- `npm run check:compliance` - passed.
- `npm run check:multi-location-rollout` - passed.
- `npm run ai:check` - passed with warning for orphan handler `get_job_order_details`.
- `npm --prefix frontend run build:all` - passed during dependency remediation verification.
- `npm run check:frontend-budgets` - failed after build because POS route chunks exceeded configured budgets.
- `npm run gate:release:local` - dependency audit gates passed; aggregate gate still failed on backend lint and frontend budget gates.
- `npm audit --json` - remediated on 2026-06-02; now passes with 0 vulnerabilities.
- `npm audit --omit=dev --json` - added as production dependency evidence; passes with 0 vulnerabilities.
- `npm --prefix backend audit --json` - remediated on 2026-06-02; now passes with 0 vulnerabilities.
- `npm --prefix backend audit --omit=dev --json` - added as production dependency evidence; passes with 0 vulnerabilities.
- `npm --prefix frontend audit --json` - remediated on 2026-06-02; now passes with 0 vulnerabilities.
- `npm --prefix frontend audit --omit=dev --json` - added as production dependency evidence; passes with 0 vulnerabilities.
- `npm outdated --json`, `cd backend; npm outdated --json`, `cd frontend; npm outdated --json` - showed outdated direct dependencies.
- `npm run test:frontend` - failed multiple contract/integration suites.
- `npm --prefix backend test -- --runTestsByPath tests/emailService.deliveryProvider.test.js tests/paypalWebhookVerification.test.js tests/paymentHandlers.publicRoutes.transport.test.js tests/paymentHandlers.simulateWebhook.test.js tests/paymentsRoutes.disabled.transport.test.js tests/tempFileService.local.test.js tests/tenantProvisioning.test.js` - passed 7 suites / 38 tests during dependency remediation verification.
- `npm --prefix frontend test -- --run src/services/__tests__/api.interceptor.test.js src/services/__tests__/adminService.interceptor.test.js src/services/__tests__/paymentService.disabled.test.js src/pages/__tests__/Settings.subscriptionVisibility.test.js src/pages/__tests__/Settings.subscriptionVisibility.component.test.jsx` - passed 5 files / 20 tests during dependency remediation verification.
- `npm --prefix backend test -- --runTestsByPath tests/rtr_verification.test.js` - passed 4 tests on 2026-06-03 after enforcing cookie-only refresh authority.
- `npm --prefix backend test -- --runTestsByPath tests/auth.test.js tests/token_refresh_race.test.js` - passed 16 tests on 2026-06-03 after updating refresh-token tests to the cookie/CSRF contract.
- `npm --prefix frontend run lint` - passed with zero warnings on 2026-06-03 after storefront lint cleanup.
- `npm --prefix frontend test -- --run apps/store/src/__tests__/discoveryFlow.integration.test.jsx apps/store/src/__tests__/profileLauncher.integration.test.jsx apps/store/src/__tests__/discoveryHeaderAccount.integration.test.jsx` - passed 3 files / 27 tests on 2026-06-03 after storefront lint cleanup.
- `npm --prefix frontend run build:store` - passed on 2026-06-03 after storefront lint cleanup.
- `npm --prefix backend test -- --runTestsByPath tests/paymongoWebhookSignature.test.js` - passed 1 suite / 9 tests on 2026-06-03 after PayMongo webhook fail-closed remediation.
- `npm --prefix backend test -- --testPathIgnorePatterns=^$ --runTestsByPath tests/billingFunnelTelemetry.usecases.legacy.test.js` - passed 1 legacy suite / 11 tests on 2026-06-03 after aligning stale registration telemetry fixtures to the current DGFY registration contract.
- `npm --prefix backend test -- --runTestsByPath tests/paymongoWebhookSignature.test.js tests/paymentHandlers.publicRoutes.transport.test.js tests/paymentHandlers.simulateWebhook.test.js tests/paymentsRoutes.disabled.transport.test.js tests/paypalWebhookVerification.test.js` - passed 5 suites / 24 tests on 2026-06-03 after PayMongo webhook fail-closed remediation.
- `npm --prefix frontend run build:all` - passed on 2026-06-03 before rerunning the local release gate.
- `npm run gate:release:local` - passed on 2026-06-03 after frontend build artifacts were refreshed.
- `npm --prefix backend test -- --runTestsByPath tests/settingsCompanyInfo.usecase.test.js tests/settingsHandlers.companyInfo.test.js tests/userManagementToolRegistry.test.js tests/aiTools.test.js tests/emailTemplates.invitation.test.js` - passed 5 suites / 33 tests on 2026-06-03 after legacy company-token invite-link removal.
- `npm --prefix backend test -- --runTestsByPath tests/authTenantIsolation.hardening.test.js tests/authUsecases.applicationResult.test.js tests/tenantHandler.emailOtp.test.js tests/emailOtpService.test.js` - passed 4 suites / 19 tests on 2026-06-03 after invitation token-only enforcement.
- `npm --prefix frontend test -- --run Pages/__tests__/AcceptInvite.test.jsx Components/users/__tests__/UserManagementModal.rbacContract.test.js` - passed 2 files / 6 tests on 2026-06-03 after invitation acceptance stopped forwarding URL company tokens.
- `npm --prefix backend test -- --runTestsByPath tests/productionEnvValidation.test.js tests/productionEnvGuard.test.js tests/hostingProfilePreflight.test.js` - passed 3 suites / 17 tests on 2026-06-03 after production env validation became fail-stop.
- `npm run check:production-env` - passed on 2026-06-03 with shared, VPS, and payment-enabled PayMongo fixture coverage.
- `npm --prefix backend test -- --runTestsByPath tests/commercePaymentValidator.test.js tests/commercePaymentReadiness.usecases.test.js tests/commercePaymentRefunds.usecases.test.js tests/commercePaymentSettlement.usecases.test.js tests/paymongoWebhookSignature.test.js tests/productionEnvValidation.test.js` - passed 6 suites / 31 tests on 2026-06-03 after applying the PayMongo QR Ph commerce-payment rollout and commerce production-env coverage.
- `npm --prefix backend run verify:commerce-payment-migration` - passed on 2026-06-03 after applying the commerce-payment migration contract verifier.
- `npm --prefix frontend test -- --run apps/store/src/__tests__/discoveryFlow.integration.test.jsx apps/store/src/__tests__/profileLauncher.integration.test.jsx apps/store/src/__tests__/discoveryHeaderAccount.integration.test.jsx` - passed 3 files / 27 tests on 2026-06-03 after PayMongo QR Ph Storefront integration.
- `npm --prefix frontend run build:all` - passed on 2026-06-03 after PayMongo QR Ph commerce-payment UI integration.
- `npm run gate:release:local` - passed on 2026-06-03 after applying PayMongo QR Ph commerce-payment work and rerunning release gates.
- `npm --prefix backend test` - timed out after 10 minutes during follow-up validation without current full-suite green evidence.
- `npm run test:frontend:contracts` - passed 10 files / 33 tests on 2026-06-03 after frontend contract remediation.
- `npm run test:frontend` - passed 92 files / 412 tests on 2026-06-03 after frontend contract remediation and deterministic one-worker runner configuration.
- `npm --prefix frontend run lint` - passed on 2026-06-03 after frontend contract remediation.
- `npm --prefix frontend run build:all` - passed on 2026-06-03 after frontend contract remediation.
- `npm run gate:release:local` - passed on 2026-06-03 for target SHA `bd968a74973f60a5ace83481d8813d8f68bd8818` after adding the frontend contract gate.
- `npm run test:backend:matrix` - passed on 2026-06-03 for target SHA `3ee0890f8a765a552546f9977c6197a2db9e5980`; artifact `.tmp/release-gates/3ee0890f8a765a552546f9977c6197a2db9e5980/backend-test-matrix/backend_test_matrix.json` records 274 active backend test files, 9 groups, schema preflight pass, per-chunk durations, statuses, and log paths.
- `npm run gate:release:local` - passed on 2026-06-04 Asia/Manila for target SHA `3ee0890f8a765a552546f9977c6197a2db9e5980`; artifact `.tmp/release-gates/3ee0890f8a765a552546f9977c6197a2db9e5980/local_readiness.json` records 15 gates passing, including `backend.test_matrix`, dependency audits, docs lint, architecture, compliance, production env, runtime doctor, backend lint, frontend lint, frontend contracts, frontend budgets, and scroll contracts.
- `node --test scripts/check-frontend-budgets.test.js` - passed 4 tests on 2026-06-04 after hardening the frontend budget gate artifact contract.
- `npm run check:frontend-budgets` - passed on 2026-06-04 after the gate executed `npm --prefix frontend run build:all`, validated fresh multi-app chunks, and wrote `.tmp/frontend-budgets/frontend_budget_report.json`.
- `npm run gate:release:local` - attempted again on 2026-06-04 after frontend budget hardening, but the tool run timed out after 20 minutes during `backend.test_matrix`; no current-SHA `local_readiness.json` was produced by that attempt.
- `npm --prefix backend test -- --runTestsByPath tests/itemHandlers.transport.test.js` - passed 7 tests on 2026-06-04 after updating stale inventory transport mocks for the storefront gallery use-case exports.
- `npm run gate:release:local` - passed on 2026-06-04 for target SHA `be59a6b55f4d6367acd124729b43fa4ee579d09b`; artifact `.tmp/release-gates/be59a6b55f4d6367acd124729b43fa4ee579d09b/local_readiness.json` records 15 gates passing, including `backend.test_matrix` with 275 active backend test files and the release-owned frontend budget report.
- `npm --prefix backend test -- --runTestsByPath tests/tenantHandler.emailOtp.test.js tests/dgfyTenantSession.transport.test.js tests/browserSessionCookies.test.js` - passed on 2026-06-05 after hardening `/api/v1/auth/refresh-token` to recover tenant context from the signed HttpOnly refresh cookie when a fresh DGFY-to-SKUpervisor browser session is missing the companion tenant-context cookie/header.
- `npm --prefix frontend test -- --run src/services/__tests__/api.interceptor.test.js` - passed 11 tests on 2026-06-05 after protected frontend API calls learned to preflight cookie-backed session refresh after hard reload.
- `npm --prefix backend test -- --runTestsByPath tests/auth.test.js` - passed 12 tests on 2026-06-05 after login and refresh responses returned `data.company.token` with the tenant access payload.
- `npm --prefix frontend test -- --run src/components/maps/__tests__/MapPinPicker.maplibre.test.jsx` - passed 4 tests on 2026-06-05 after the shared IMS MapLibre picker moved to the inline raster style contract and preserved coordinate fallback behavior during tile-resource failures.
- `npm --prefix frontend test -- --run src/features/onboarding/__tests__/OnboardingSetupModal.behavior.test.jsx src/pages/__tests__/Settings.deepLinking.integration.test.jsx` - passed 26 tests on 2026-06-05 proving onboarding and Settings still wire the shared MapLibre picker into location forms.
- Production deployment on 2026-06-05 deployed code target SHA `4f6eecd1778ae139e634d23821369f40f22dd5d0`; production deploy summary reported backend health, IMS, POS, Store, and Tenant Store public endpoints passed, tenant-store asset integrity passed, and frontend asset parity passed. A later docs-only release-state commit may advance repository HEAD without changing the runtime code bundle.
- `npm --prefix frontend exec vitest run apps/store/src/__tests__/discoveryFlow.integration.test.jsx apps/store/src/__tests__/discoveryMapDom.test.js apps/store/src/__tests__/storefrontMarkerPreview.test.js apps/store/src/__tests__/discoveryPresentation.test.js --pool=threads` - passed 4 files / 42 tests on 2026-06-06 after Storefront map/search viewport stabilization, geolocation scoping hardening, item-search storefront result coverage, popup offset consistency, and repeated-search refit regression coverage. npm printed the existing unknown `--pool` warning but executed the suites.
- `npm --prefix backend test -- --runTestsByPath tests/storefrontDiscoveryRepository.test.js tests/storefrontDiscoveryMapPins.usecase.test.js` - passed 2 suites / 19 tests on 2026-06-06 for the backend discovery contract supporting Storefront-first item results.
- `npm --prefix frontend run build:store`, `npm run check:architecture`, and `git diff --check` passed on 2026-06-06 after the Storefront map/search remediation. Local rendered Storefront route health also passed, but automated Browser text entry and screenshot capture were blocked by tooling, so production visual smoke remains required.

## Severity Model

Critical:
Blocks production or can directly expose sensitive data, allow payment abuse, bypass authentication, execute arbitrary code, or invalidate fiscal/compliance readiness.

High:
Material production risk, broken release gate, vulnerable direct dependency, major contract regression, or fail-open control.

Medium:
Scalability, maintainability, evidence, or operational gap that can become production-impacting but is not immediately exploitable from current evidence.

Low:
Hygiene, documentation, or follow-through item that should be tracked but does not currently block a release alone.

## Current Finding Index

- `1.1-Dependency_vulnerabilities_block_production.md`
- `1.2-Default_admin_credentials_remain_available.md`
- `1.3-Browser_localStorage_tokens_expose_sessions_to_xss.md` — remediated 2026-06-02 with ADR 0026 cookie-session contract and storage guards
- `1.4-PayMongo_webhook_signature_verification_can_fail_open.md` — remediated 2026-06-03 with fail-closed PayMongo signature verification and replay proof
- `1.5-Legacy_company_token_invite_links_still_exposed.md` — remediated 2026-06-03 with token-only invitation links and no company-token invite URL generation
- `1.6-Production_env_validation_logs_without_fail_stop.md` — remediated 2026-06-03 with centralized fail-stop production env validation and release/deploy gates
- `2.1-Local_release_gate_fails.md` — remediated 2026-06-03 with `npm run gate:release:local` passing for target SHA `9e778e3a631bada235e188d5cc0a4180af491259`
- `2.2-Frontend_contract_suite_fails.md` - remediated 2026-06-03 with `npm run test:frontend` and `npm run test:frontend:contracts` passing
- `2.3-Backend_full_test_gate_has_no_current_green_evidence.md` - remediated 2026-06-04 with `npm run test:backend:matrix` and `npm run gate:release:local` passing for target SHA `3ee0890f8a765a552546f9977c6197a2db9e5980`
- `2.4-Frontend_budget_gate_is_not_self_contained.md` - remediated 2026-06-04 with budget-owned builds, required multi-app artifact checks, freshness enforcement, report persistence, focused tests, and a current passing aggregate local release gate for target SHA `be59a6b55f4d6367acd124729b43fa4ee579d09b`
- `3.1-StorefrontApp_monolith_exceeds_codegen_threshold.md`
- `3.2-High_limit_queries_risk_slow_paths.md`
- `3.3-Bulk_image_upload_accepts_any_mime_at_transport_layer.md`
- `4.1-Mode_RBAC_generic_fallback_enabled_by_default.md`
- `4.2-Architecture_allowlist_debt_due_2026_06_30.md`
- `5.1-AI_tool_registry_has_orphan_handler.md`
- `5.2-AI_red_team_and_cost_abuse_gate_missing_current_evidence.md`
- `6.1-RMO_24_2023_fiscal_activation_needs_external_evidence.md`
- `6.2-Payment_live_canary_and_settlement_governance_missing.md` — still open after local PayMongo QR Ph commerce-payment integration; live provider canary, child-merchant webhook, payout/fee, and settlement evidence remain required
- `7.1-Observability_and_SLO_evidence_incomplete.md`
- `7.2-Release_evidence_depends_on_stale_or_bypassable_QA_paths.md`

## Remediation Order

1. Close remaining critical and high security findings: default admin credential path, token storage, webhook fail-open, invite token leakage, and production env fail-stop. Dependency vulnerabilities are resolved as of 2026-06-02.
2. Restore release gate integrity: backend lint, backend test evidence, frontend contract failures, frontend budget artifact self-containment, and the aggregate local release gate are remediated as of 2026-06-04 for target SHA `be59a6b55f4d6367acd124729b43fa4ee579d09b`.
3. Treat the June 5 tenant browser-session and MapLibre picker fixes as production-deployed at code SHA `4f6eecd1778ae139e634d23821369f40f22dd5d0`. The June 6 Storefront map/search remediation is locally validated but remains pending production deployment evidence; refresh no-staging parity, exact deployed SHA, health checks, and feature-specific smoke before declaring it live.
4. Reduce production performance risk: StorefrontApp decomposition, high-limit query review, upload transport validation.
5. Close governance debt: RBAC fallback removal, architecture allowlist removal plan, fiscal/payment evidence.
6. Add operational proof: SLO dashboards, alert evidence, AI adversarial/cost tests, release evidence that no longer depends on stale QA bypasses.

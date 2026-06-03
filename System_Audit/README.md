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
- `npm --prefix backend test` - timed out after 10 minutes during follow-up validation without current full-suite green evidence.

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
- `1.5-Legacy_company_token_invite_links_still_exposed.md`
- `1.6-Production_env_validation_logs_without_fail_stop.md`
- `2.1-Local_release_gate_fails.md`
- `2.2-Frontend_contract_suite_fails.md`
- `2.3-Backend_full_test_gate_has_no_current_green_evidence.md`
- `2.4-Frontend_budget_gate_is_not_self_contained.md`
- `3.1-StorefrontApp_monolith_exceeds_codegen_threshold.md`
- `3.2-High_limit_queries_risk_slow_paths.md`
- `3.3-Bulk_image_upload_accepts_any_mime_at_transport_layer.md`
- `4.1-Mode_RBAC_generic_fallback_enabled_by_default.md`
- `4.2-Architecture_allowlist_debt_due_2026_06_30.md`
- `5.1-AI_tool_registry_has_orphan_handler.md`
- `5.2-AI_red_team_and_cost_abuse_gate_missing_current_evidence.md`
- `6.1-RMO_24_2023_fiscal_activation_needs_external_evidence.md`
- `6.2-Payment_live_canary_and_settlement_governance_missing.md`
- `7.1-Observability_and_SLO_evidence_incomplete.md`
- `7.2-Release_evidence_depends_on_stale_or_bypassable_QA_paths.md`

## Remediation Order

1. Close remaining critical and high security findings: default admin credential path, token storage, webhook fail-open, invite token leakage, and production env fail-stop. Dependency vulnerabilities are resolved as of 2026-06-02.
2. Restore release gate integrity: backend lint, frontend budget artifacts, frontend contract failures, backend test evidence.
3. Reduce production performance risk: StorefrontApp decomposition, high-limit query review, upload transport validation.
4. Close governance debt: RBAC fallback removal, architecture allowlist removal plan, fiscal/payment evidence.
5. Add operational proof: SLO dashboards, alert evidence, AI adversarial/cost tests, release evidence that no longer depends on stale QA bypasses.

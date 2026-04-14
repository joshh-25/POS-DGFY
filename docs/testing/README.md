# Testing Docs

When to use:
1. Test/audit definitions and validation protocols
2. Measurement and telemetry verification rules
3. Production-readiness evidence

## Evidence Classification (Phase 65.2)

Use this table to avoid over-claiming what a green test run proves.

| Evidence type | Typical examples | What it proves | What it does not prove |
|---|---|---|---|
| Syntax / unit mocks | isolated use-case/service unit tests | Branch logic, error mapping, payload shaping | Real network/provider behavior, real user behavior |
| Transport/controller tests | handler transport contract tests | HTTP wiring, token/header forwarding, status/payload contracts | Provider reality, DB persistence parity in production |
| DB integration tests | `supertest` + real test DB suites | Route-level state transitions and telemetry persistence in controlled env | Production ingress parity, adoption/retention |
| Live sandbox tests (legacy/opt-in) | PayPal sandbox canary E2E suites | Real provider verification flow + backend transition contracts when payments are explicitly re-enabled | Production traffic behavior, customer engagement depth |
| Production evidence | reconciliation dashboards, longitudinal audits | Real-world behavior over time in deployed environment | Causal impact without controlled experiments |

## Claim Guardrail

Current approved claim language for subscription telemetry:
1. "Payment/subscription workflows are disabled by default; default quality gates validate the disabled contract."
2. "Legacy provider-specific billing telemetry checks exist as opt-in suites for explicitly re-enabled payment workflows."
3. "Selected backend-observed product usage events are recorded."

Disallowed claim language until production longitudinal evidence exists:
1. "This proves real-world engagement."
2. "This proves retention or adoption causality."

## POS UAT Signoff

Use this checklist for final cashier/admin acceptance before changing status from `in_progress`:

- `docs/testing/pos-e2e-uat-checklist.md`
- Canonical readiness state: `docs/testing/pos-readiness-status.md`
- Cross-app manual readiness runbook (IMS + POS + Store):
  - `docs/testing/manual-qa-readiness-runbook-pos-ims-store.md`

Historical note:
- Early exploratory Phase 32 Gemini QA artifacts were archived to `docs/archive/testing/2026-02/`.
- Legacy receive-token verification notes were archived to `docs/archive/testing/2026-02/receive-token-fix-evaluation.md`.
- Legacy SKU expansion manual walkthrough notes were archived to `docs/archive/testing/2026-03/sku-expansion-manual-test-runbook-2026-03-31.md`.
- Active POS readiness source of truth is `docs/testing/pos-readiness-status.md`; historical run logs remain evidence-only and must not be used as current behavior contracts.

## Compliance Activation Readiness E2E

For the guided compliance activation flow (Settings + POS blocker behavior), use:

Operational note:
1. Final Review documentary requirements are now completed in Settings > Compliance > Final review (upload or external URL). No repository edits are required for tenant activation paths.

1. Browser E2E (Chromium, desktop profile):
   - `npm --prefix backend run test:frontend-compliance-e2e`
2. Browser E2E matrix (Chromium, desktop + mobile profiles):
   - `npm --prefix backend run test:frontend-compliance-e2e:matrix`
3. Frontend component/integration coverage (compliance panel, settings remediation deep links, POS blocker contracts, admin review contracts):
   - `npm --prefix frontend test -- --run src/features/settings/__tests__/settingsDeepLink.contract.test.js src/pages/__tests__/Settings.deepLinking.integration.test.jsx src/features/compliance/__tests__/ComplianceProgramPanel.integration.test.jsx src/features/compliance/__tests__/complianceProgramContracts.test.js src/features/pos/__tests__/terminalViewModeContracts.test.js src/features/pos/__tests__/receiptContractConformance.contract.test.js src/pages/__tests__/TenantManager.complianceReviewContracts.test.js src/services/__tests__/complianceService.preflight.test.js`
4. Backend residual-risk hardening suites (transport security, documentary readiness, incident dispatch):
   - `npm --prefix backend test -- backend/tests/securityTransport.middleware.test.js backend/tests/complianceRepository.documentaryReadiness.test.js backend/tests/complianceSecuritySignal.usecase.test.js backend/tests/complianceSecurityIncidents.usecase.test.js backend/tests/rbacRouteCoverage.contract.test.js backend/tests/posOperationReplayParity.usecase.test.js`

Use `RUN_BROWSER_E2E=true` only for browser-driven suites. Default backend test runs stay fast and deterministic, while release/main and nightly workflows execute enforced browser journey gates.

## IMS -> POS -> Sales Journey E2E

For the end-to-end cashier/admin continuity path (create item -> POS-ready -> checkout -> POS history -> Sales export), use:

1. Browser E2E (Chromium, desktop profile):
   - `npm --prefix backend run test:frontend-ims-pos-sales-e2e`
2. Browser E2E matrix with keyboard/screen-reader accessibility pass (desktop + mobile):
   - `npm --prefix backend run test:frontend-ims-pos-sales-e2e:matrix`

CI enforcement policy:
1. `main` and `release/*` pushes run the core desktop journey as a release gate before build/deploy stages.
2. Nightly schedule runs the matrix journey (desktop + mobile) for drift detection.
3. Failure artifacts (trace/video/screenshot) are uploaded and retained for 14 days (release gate) and 21 days (nightly).

## Startup Regression Guard (PM2 + Local)

Before running manual UAT after backend changes:

1. Ensure `backend/.env` has `DB_AUTO_SYNC=false`.
2. Apply DB changes through migrations (`cd backend && npm run migrate`).
3. Run runtime doctor (`cd backend && npm run doctor:runtime`) and confirm healthy.
4. Restart backend (`pm2 restart sku-backend`).
5. Verify health endpoint returns `200` before opening POS flows:
   - `http://localhost:5000/health`
6. Verify token validation endpoint returns `200`:
   - `http://localhost:5000/api/v1/auth/validate-token/token-original`
7. Verify login transport contract uses header-based tenant selection:
   - Request header: `x-company-token: token-original`
   - Request body: `{ "email": "admin@test.com", "password": "Admin123!" }`
   - Expected: `200`
   - Note: sending `company_token` in body is invalid and returns `422`.
8. Verify runtime-sensitive read endpoints return `200` after migration/restart:
   - `http://localhost:5000/api/v1/compliance/profile`
   - `http://localhost:5000/api/v1/compliance/artifacts`
   - `http://localhost:5000/api/v1/compliance/peripherals`
   - `http://localhost:5000/api/v1/pos/incoming-orders`
   - `http://localhost:5000/api/v1/sales/transactions`
9. Verify store checkout validation path is fail-closed:
   - `POST /api/v1/store/checkout` should return `422` for invalid/out-of-stock payloads, not `500`.

This prevents transient startup-side `500` errors caused by runtime schema `alter` operations.

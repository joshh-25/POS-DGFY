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

This prevents transient startup-side `500` errors caused by runtime schema `alter` operations.

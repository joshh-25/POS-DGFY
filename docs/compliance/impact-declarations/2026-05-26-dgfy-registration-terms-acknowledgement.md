---
status: reference
owner: engineering
last_reviewed: 2026-05-26
related_adr: docs/architecture/adr/0022-global-dgfy-account-business-registration.md
declaration_id: 2026-05-26-dgfy-registration-terms-acknowledgement
classification: regulatory
surfaces: compliance,settings,user_registration,payments,storefront
reason_codes_impacted: VALIDATION_FAILED
policy_version: 2026.05.26
verification_evidence: npm run lint:docs,npm run check:architecture,npm run check:compliance,npm --prefix backend test -- --runTestsByPath tests/dgfyAuthUseCases.test.js tests/dgfyLegalUseCases.test.js tests/registerCompanyRequestUseCase.autoApproval.test.js,npm --prefix frontend test -- Pages/__tests__/RegisterCompanyLoginHandoff.test.jsx,npm run build:frontend,npm run build:skupervisor
rollback_note: Remove the frontend acknowledgement gates and relax backend terms validation only with explicit legal approval. The additive dgfy_legal_acknowledgements table can remain unused during rollback.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-05-26T00:00:00+08:00
preflight_request_ref: DGFY-REGISTRATION-TERMS-ACK-2026-05-26
---

# DGFY Registration Terms Acknowledgement

## Compliance Impact Classification

Regulatory.

This declaration covers required ToS/T&C acknowledgement for DGFY account registration and DGFY company registration. The change adds server-enforced, versioned acknowledgement evidence and marketplace-provider wording that identifies the merchant as seller of record while DGFY acts as an e-marketplace/platform service provider.

## Affected Surfaces

- Public DGFY account registration through `/api/v1/dgfy/auth/register`.
- Public DGFY legal terms metadata through `/api/v1/dgfy/legal-terms/current`.
- Public company registration through `/api/v1/admin/tenants/register`.
- Landlord legal acknowledgement persistence in `dgfy_legal_acknowledgements`.
- Registration UI copy that describes seller-of-record, licensed payment partner, disclosed platform fees, and seller net settlement.

## Compliance Preconditions

1. Registration mutations must reject missing, false, or stale acknowledgement before account or tenant creation.
2. Company registration acknowledgement must be checked before `company_registration` OTP consumption.
3. Product copy must not present DGFY as a wallet, points ledger, merchant cash-out provider, or reseller of merchant goods.
4. Acknowledgement records must store version, accepted timestamp, actor, request metadata, and text/hash snapshots.
5. Registration must fail closed if the current legal terms metadata cannot load or if legal acknowledgement persistence is unavailable.
6. Account creation plus acknowledgement evidence must be landlord-transactional; company tenant-row creation plus acknowledgement evidence must be landlord-transactional before provisioning.
7. Payment implementation remains governed separately; ADR 0012's DGFY convenience fee does not by itself prove provider payout or PayMongo split-settlement truth.

## Verification Evidence

- `npm run lint:docs`
- `npm run check:architecture`
- `npm run check:compliance`
- `npm --prefix backend test -- --runTestsByPath tests/dgfyAuthUseCases.test.js tests/dgfyLegalUseCases.test.js tests/registerCompanyRequestUseCase.autoApproval.test.js`
- `npm --prefix frontend test -- Pages/__tests__/RegisterCompanyLoginHandoff.test.jsx`
- `npm run build:frontend`
- `npm run build:skupervisor`

---
status: reference
owner: engineering
last_reviewed: 2026-10-01
declaration_id: 2026-10-01-business-registration-company-readiness
classification: regulatory
surfaces: settings,compliance,pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.10.01
verification_evidence: npm run check:compliance,npm run check:architecture,targeted landlord registration and materialization tests,affected frontend builds,migration upgrade and fresh-schema rehearsal
rollback_note: Revert the BRS registration/upload/review/materialization and Company workspace changes together; retain the landlord migration rollback procedure and preserve approved audit evidence before any rollback of stored data.
preflight_result: no_breach
preflight_reason_code: ONBOARDING_AND_REVIEW_ONLY
preflight_run_at: 2026-10-01T00:00:00+08:00
preflight_request_ref: BRS-EXECUTION-2026-10-01
---

# Business Registration and Company Readiness Compliance Impact

## Compliance Impact Classification

Regulatory. The change touches tenant registration, platform-admin review, and settings-authorized Company readiness surfaces, which are classified as compliance-sensitive by the repository guardrail.

## Affected Surfaces

- Landlord-scoped company registration legal acknowledgements, snapshots, and private upload metadata.
- IMS platform-admin review, private download, revoke, and audit actions.
- OPIS/POS Company readiness access and canonical settings links.
- POS delivery-provider payment breakdown across checkout, transaction history, reporting, Z-reading, and receipts.
- Approved tenant setup materialization for business profile, location, hours, and Storefront settings.

## Compliance Preconditions

1. Company registration remains landlord-scoped until explicit platform-admin approval.
2. Both legal acknowledgements are independently required and server-validated against the current legal-term versions.
3. Cashiers cannot access the Company workspace or its API; branch scope remains enforced for authorized managers.
4. Private originals never become public URLs or exposed storage keys, and review/download/revoke actions remain auditable.
5. Menu uploads remain staged review inputs; no catalog rows are created automatically.
6. POS checkout, fiscal receipt, payment, tax, and compliance-mode lifecycle contracts are unchanged.

## Verification Evidence

- `npm run check:compliance`
- `npm run check:architecture`
- Targeted legal, upload-validation, registration, business-admin, provisioning, and materialization tests.
- OPIS route/sidebar and Storefront registration tests.
- OPIS, Storefront, and IMS production builds.
- Landlord migration upgrade and disposable fresh-schema rehearsal.

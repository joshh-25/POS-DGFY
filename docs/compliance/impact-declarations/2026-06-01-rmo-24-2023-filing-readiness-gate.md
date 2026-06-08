---
status: reference
owner: engineering
last_reviewed: 2026-06-01
related_adr: docs/architecture/adr/0025-bir-rmo-24-2023-fiscal-document-and-accreditation-closure.md
declaration_id: 2026-06-01-rmo-24-2023-filing-readiness-gate
classification: regulatory
surfaces: compliance,settings,pos,terminal
reason_codes_impacted: RMO_FILING_EVIDENCE_REQUIRED,COMPLIANCE_PROFILE_INCOMPLETE,VERIFICATION_REQUIRED,FISCAL_TERMINAL_REGISTRATION_REQUIRED,FISCAL_TERMINAL_VERIFICATION_INCOMPLETE,FISCAL_REPRINT_REASON_REQUIRED,FISCAL_VOID_REASON_REQUIRED,ALLOWED
policy_version: 2026.06.01
verification_evidence: npm --prefix backend test -- --runInBand --testPathPattern="compliancePolicyEngine.test.js|complianceRepository.documentaryReadiness.test.js|complianceActivationReadiness.e2e.transport.test.js|posCheckoutFnbContracts.usecase.test.js|posHandlers.transport.test.js|posValidator.discountPolicy.test.js",npm --prefix frontend test -- --run src/features/pos/utils/__tests__/checkoutSurfaceContract.test.js src/features/pos/__tests__/receiptContractConformance.contract.test.js src/features/settings/__tests__/settingsDeepLink.contract.test.js src/features/pos/__tests__/checkoutSurfaceParity.contract.test.js,npm --prefix frontend run build:skupervisor,npm run lint:docs,npm run check:architecture,npm run check:compliance
rollback_note: Revert the RMO filing readiness profile fields, final-review requirements, policy-engine blockers, POS fiscal snapshot fields, fiscal terminal/eSales UI, POS fiscal lifecycle hardening, ADR/control-matrix docs, and tests as one slice. Do not activate tenants or delete uploaded filing evidence during rollback.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-06-01T10:39:00+08:00
preflight_request_ref: RMO-20260601
---

# RMO 24-2023 Filing Readiness Gate

## Compliance Impact Classification

Regulatory.

This slice changes compliance activation behavior. `compliant_active` is now blocked unless RMO 24-2023 filing evidence is represented in final review and marked ready by the compliance checklist.

## Affected Surfaces

1. Compliance policy engine adds `RMO_FILING_EVIDENCE_REQUIRED` and `control.rmo_filing_readiness`.
2. Compliance repository adds RMO final-review requirement codes and readiness aggregation.
3. Compliance use cases pass RMO filing readiness into checklist evidence.
4. Compliance profile validation accepts explicit RMO confirmation fields.
5. Settings > Compliance displays RMO final-review documents and profile confirmations.
6. POS checkout can persist fiscal buyer fields and server-owned fiscal document snapshots when the receipt contract is fiscal.
7. POS settings validation accepts structured seller/software identity fields used by fiscal document snapshots.
8. POS fiscal terminal registrations, operator-confirmed print/reprint events, fiscal void lifecycle with stock-return movements, fiscal event ledger sequence/hash chain, and eSales package generation/status tracking are internal runtime controls.
9. Settings > POS exposes fiscal terminal registration readiness, fiscal ledger integrity verification, and eSales reporting lifecycle screens for authorized operators.
10. Compliance docs add ADR 0025 and the RMO control matrix.

## Compliance Preconditions

1. The existing dual-mode lifecycle must remain unchanged: non-compliant and compliant-pending tenants issue only non-fiscal documents.
2. This slice must not activate any tenant automatically.
3. RMO filing evidence must be treated as verified documentary evidence, not a tenant self-attestation alone.
4. Missing RMO evidence must produce deterministic checklist blockers and keep activation disabled.
5. Non-fiscal POS operation must remain available while RMO evidence is incomplete.
6. Fiscal document snapshots are preparatory evidence only and must not be represented as final BIR approval.
7. Fiscal terminal registration verification is an internal control and does not replace external BIR approval evidence.
8. Browser print completion remains operator-attested; the web app records evidence after the print dialog is opened and confirmed, but cannot prove paper output from printer hardware.

## Verification Evidence

Initial focused evidence:

1. `npm --prefix backend test -- --runInBand --testPathPattern="compliancePolicyEngine.test.js|complianceRepository.documentaryReadiness.test.js|complianceActivationReadiness.e2e.transport.test.js"` -> PASS.
2. `npm --prefix frontend test -- --run src/features/compliance/__tests__/ComplianceProgramPanel.integration.test.jsx src/features/compliance/__tests__/complianceProgramContracts.test.js` -> PASS.
3. `npm run lint:docs` -> PASS.
4. `npm run check:architecture` -> PASS.
5. `npm --prefix backend test -- --runInBand --testPathPattern="compliancePolicyEngine.test.js|complianceRepository.documentaryReadiness.test.js|complianceActivationReadiness.e2e.transport.test.js|posCheckoutFnbContracts.usecase.test.js|posHandlers.transport.test.js|posValidator.discountPolicy.test.js"` -> PASS.
6. `npm --prefix frontend test -- --run src/features/pos/utils/__tests__/checkoutSurfaceContract.test.js src/features/pos/__tests__/receiptContractConformance.contract.test.js src/features/settings/__tests__/settingsDeepLink.contract.test.js src/features/pos/__tests__/checkoutSurfaceParity.contract.test.js` -> PASS.
7. `npm run check:compliance` -> PASS.
8. `npm --prefix frontend run build:skupervisor` -> PASS with existing Browserslist/chunk-size warnings.

## Rollback Constraints

Rollback must not delete uploaded final-review documents, audit logs, profile data, or evidence records. If a tenant reaches `compliant_active` under this policy, any return to non-fiscal behavior must use the governed downgrade paths in ADR 0011.

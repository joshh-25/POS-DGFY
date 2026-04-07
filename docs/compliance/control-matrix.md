---
status: reference
authority_level: reference
owner: compliance
last_reviewed: 2026-04-07
applies_to: ph_pos_dual_mode_runtime_and_ci
topic: compliance_control_matrix
related_adr: 0007-dual-mode-pos-compliance-program.md
---

# Compliance Control Matrix

## Scope
Code-level control mapping for BIR, NPC, and BSP controls across runtime, persistence, and CI guardrails.

## Regulatory Source Chain (2026-04-07 Refresh)
1. BIR RR 7-2024
   - https://bir-cdn.bir.gov.ph/BIR/pdf/RR%207-2024%20%28final%29.pdf
2. BIR RR 11-2025
   - https://bir-cdn.bir.gov.ph/BIR/pdf/RR%2011-2025%20Digest.pdf
3. BIR RR 26-2025
   - https://bir-cdn.bir.gov.ph/BIR/pdf/RR%20No.%2026-2025%20Digest.pdf
4. BIR RMO 24-2023
   - https://bir-cdn.bir.gov.ph/local/pdf/RMO%20No.%2024-2023%20Digest%20FINAL.pdf
5. BIR RMC 72-2025
   - https://www.bir-cdn.bir.gov.ph/BIR/pdf/RMC%20No.%2072-2025%20Digest.pdf
6. NPC Circular 2022-04 and current NPC operational updates
   - https://privacy.gov.ph/wp-content/uploads/2023/05/Circular-2022-04.pdf
   - https://privacy.gov.ph/
7. BSP OPS and PSOF/MORPS framework references
   - https://www.bsp.gov.ph/Regulations/Issuances/2019/c1049.pdf
   - https://www.bsp.gov.ph/Regulations/Issuances/2020/1089.pdf
   - https://www.bsp.gov.ph/Regulations/Issuances/2024/1191.pdf
   - https://www.bsp.gov.ph/PaymentAndSettlement/FAQ_OPS_Registration.pdf

## Control Map
| Control Domain | Control ID | Required Behavior | Reason Codes | Primary Code Owners | Evidence Tests |
|---|---|---|---|---|---|
| BIR | BIR-01 Mode lifecycle | One-time mode selection; irreversible compliant path | `LEGACY_MODE_SELECTION_REQUIRED`, `MODE_TRANSITION_NOT_ALLOWED` | `backend/src/modules/compliance/**`, `backend/migrations/20260406000001-*.cjs` | compliance usecase tests + migration tests |
| BIR | BIR-02 Non-fiscal vs fiscal contract | Non-compliant and compliant-pending emit non-fiscal; compliant-active can emit fiscal | `NON_COMPLIANT_FISCAL_DOCUMENT_BLOCKED`, `COMPLIANT_ACTIVATION_PENDING` | `backend/src/modules/compliance/policy/**`, `backend/src/modules/pos/usecases/posUseCases.js`, `frontend/src/features/pos/components/ReceiptPrintView.jsx` | POS checkout + receipt contract tests |
| BIR | BIR-03 Checklist-gated compliant activation | Profile/artifacts/peripherals/settings/readiness must pass before `compliant_active` | `COMPLIANCE_PROFILE_INCOMPLETE`, `COMPLIANCE_ARTIFACTS_INCOMPLETE`, `ACCREDITED_PERIPHERAL_REQUIRED`, `TERMINAL_DEVICE_MISMATCH` | `backend/src/modules/compliance/policy/compliancePolicyEngine.js`, `backend/src/modules/compliance/usecases/complianceUseCases.js` | compliance checklist tests |
| BIR | BIR-04 Verified-only trust model | Artifacts/peripherals only count when `verification_status=verified` and valid dates | `VERIFICATION_REQUIRED` | `backend/src/modules/compliance/usecases/complianceUseCases.js`, `backend/src/modules/compliance/policy/compliancePolicyEngine.js` | compliance policy tests |
| BIR | BIR-05 Terminal-bound peripheral enforcement | Required classes must match target terminal or explicit shared binding | `TERMINAL_DEVICE_MISMATCH` | `backend/src/modules/compliance/policy/compliancePolicyEngine.js` | terminal/peripheral matching tests |
| NPC | NPC-01 Profile tracking | DPO, DPS registration, and incident controls tracked in compliance profile | `COMPLIANCE_PROFILE_INCOMPLETE` | `backend/src/modules/compliance/policy/policyPacks.js`, `backend/src/modules/compliance/usecases/complianceUseCases.js` | checklist/profile tests |
| NPC | NPC-02 Auditability | Mode changes, verification actions, and blocked operations are audit logged | N/A (event log evidence) | `backend/src/modules/compliance/usecases/complianceUseCases.js`, `backend/src/models/Landlord/TenantComplianceAuditLog.js` | audit log persistence tests |
| BSP | BSP-01 Payment capability gate | Payment capability endpoints denied when OPS controls are not satisfied | `BSP_OPS_REGISTRATION_REQUIRED`, `BSP_PAYMENT_CONTROL_REQUIRED` | `backend/src/modules/compliance/policy/compliancePolicyEngine.js`, `backend/src/middleware/compliancePolicy.js`, `backend/src/routes/payments.js` | payment compliance gate tests |
| Engineering | ENG-01 Compliance-sensitive diff declaration | CI/pre-commit fail when sensitive changes lack high-quality declaration; computed classification floor cannot be bypassed | `IMPACT_DECLARATION_REQUIRED` | `scripts/check-compliance-impact.js`, `.husky/pre-commit`, `.github/workflows/ci.yml`, `docs/compliance/compliance-classification-matrix.md` | `npm run check:compliance` |
| Engineering | ENG-02 Request preflight | Feature requests must pass preflight classification before execution | `IMPACT_DECLARATION_REQUIRED` + downstream decision codes | `backend/src/routes/compliance.js`, `backend/src/modules/compliance/usecases/complianceUseCases.js`, `backend/src/validators/complianceValidator.js` | preflight contract tests |

## Ownership Notes
1. Product/API changes touching POS, payments, settings, compliance module, or compliance-related frontend routes require declaration and preflight.
2. Any cross-boundary change to controls requires ADR update (or new ADR) plus rollback notes.
3. Temporary exceptions require explicit allowlist entry, linked task ID, and removal date.

## Dirty Worktree Safety
1. Do not stage unrelated files when preparing compliance changes.
2. Use path-scoped review and verification (`git diff -- <path>`) for compliance-sensitive files.
3. Every declaration must describe only the surfaces touched by the staged diff.

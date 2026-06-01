---
status: reference
authority_level: reference
owner: compliance
last_reviewed: 2026-04-09
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
| BIR | BIR-01 Mode lifecycle | One-time mode selection; compliant path is guarded with controlled downgrade escape hatches (platform force + tenant one-per-cycle revert) | `LEGACY_MODE_SELECTION_REQUIRED`, `MODE_TRANSITION_NOT_ALLOWED` | `backend/src/modules/compliance/**`, `backend/migrations/20260406000001-*.cjs`, `backend/migrations/20260407000002-*.cjs`, `backend/migrations/20260422000001-*.cjs` | compliance usecase tests + migration tests |
| BIR | BIR-02 Non-fiscal vs fiscal contract | Non-compliant and compliant-pending emit non-fiscal; compliant-active can emit fiscal | `NON_COMPLIANT_FISCAL_DOCUMENT_BLOCKED`, `COMPLIANT_ACTIVATION_PENDING` | `backend/src/modules/compliance/policy/**`, `backend/src/modules/pos/usecases/posUseCases.js`, `frontend/src/features/pos/components/ReceiptPrintView.jsx` | POS checkout + receipt contract tests |
| BIR | BIR-03 Checklist-gated compliant activation | Profile/artifacts/peripherals/settings/readiness, documentary readiness, and encryption prerequisites must pass before `compliant_active`; checklist payload exposes deterministic guided metadata (`requirements`, `section_progress`, `activation_blockers`, documentary/evidence details) | `COMPLIANCE_PROFILE_INCOMPLETE`, `COMPLIANCE_SETTINGS_INCOMPLETE`, `COMPLIANCE_ARTIFACTS_INCOMPLETE`, `ACCREDITED_PERIPHERAL_REQUIRED`, `TERMINAL_DEVICE_MISMATCH`, `READINESS_TESTS_REQUIRED`, `COMPLIANT_MODE_FAIL_CLOSED`, `VERIFICATION_REQUIRED` | `backend/src/modules/compliance/policy/compliancePolicyEngine.js`, `backend/src/modules/compliance/usecases/complianceUseCases.js`, `backend/src/modules/compliance/repositories/complianceRepository.js` | `backend/tests/compliancePolicyEngine.test.js`, `backend/tests/complianceRepository.documentaryReadiness.test.js` |
| BIR | BIR-03c RMO 24-2023 filing readiness | `compliant_active` requires explicit RMO final-review evidence for control matrix, filing authority, receipt sample pack, fiscal integrity, and eSales/reporting rehearsal; missing evidence blocks activation | `RMO_FILING_EVIDENCE_REQUIRED` | `backend/src/modules/compliance/policy/compliancePolicyEngine.js`, `backend/src/modules/compliance/repositories/complianceRepository.js`, `frontend/src/features/compliance/components/ComplianceProgramPanel.jsx` | `backend/tests/compliancePolicyEngine.test.js`, `backend/tests/complianceRepository.documentaryReadiness.test.js`, `backend/tests/complianceActivationReadiness.e2e.transport.test.js`, `frontend/src/features/compliance/__tests__/ComplianceProgramPanel.integration.test.jsx` |
| BIR | BIR-03d RMO fiscal buyer and document snapshot | Fiscal checkout can persist buyer TIN/business style/address plus a server-owned fiscal document snapshot and SHA-256 hash; non-fiscal checkout remains unaffected | N/A (preparatory fiscal document integrity contract) | `backend/src/models/PosTransaction.js`, `backend/src/modules/pos/usecases/posUseCases.js`, `backend/migrations/20260601000001-add-rmo-fiscal-document-snapshot-fields.cjs` | `backend/tests/posCheckoutFnbContracts.usecase.test.js` |
| BIR | BIR-03e Fiscal terminal registration | Fiscal invoices require a verified terminal registration with MIN, machine serial, software serial, and PTU metadata; terminal registration changes are fiscal ledger events | `FISCAL_TERMINAL_REGISTRATION_REQUIRED`, `FISCAL_TERMINAL_VERIFICATION_INCOMPLETE` | `backend/src/models/PosFiscalTerminalRegistration.js`, `backend/src/modules/pos/usecases/posUseCases.js`, `backend/src/routes/pos.js` | `backend/tests/posCheckoutFnbContracts.usecase.test.js` |
| BIR | BIR-03f Fiscal event ledger and lifecycle | Fiscal issuance, print/reprint, void, Z-reading, governed reset, terminal registration, and eSales generation create append-only fiscal event hashes | `FISCAL_REPRINT_REASON_REQUIRED`, `FISCAL_VOID_REASON_REQUIRED` | `backend/src/models/PosFiscalEvent.js`, `backend/src/models/PosFiscalPrintEvent.js`, `backend/src/models/PosESalesReport.js`, `backend/src/modules/pos/usecases/posUseCases.js` | `backend/tests/posCheckoutFnbContracts.usecase.test.js` |
| BIR | BIR-03a Fiscal accumulator + Z snapshot evidence | Checkout increments non-resettable fiscal lifetime counter; close-day persists Z-reading snapshot with counter state (`z_counter`, `reset_counter`, lifetime total) | `COMPLIANT_MODE_FAIL_CLOSED` (checklist evidence blocker) | `backend/src/modules/pos/usecases/posUseCases.js`, `backend/src/modules/pos/repositories/posRepository.js`, `backend/src/models/PosZReadingSnapshot.js` | POS reconciliation + compliance readiness tests |
| BIR | BIR-03b X-reading + governed reset trail | X-reading route exposes intraday counters and totals; governed reset endpoint requires confirmation text and persists immutable reset event snapshots (`RST-*`) | N/A (audit/reporting contract) | `backend/src/modules/pos/usecases/posUseCases.js`, `backend/src/routes/pos.js` | POS handler transport tests |
| BIR | BIR-04 Verified-only trust model | Artifacts/peripherals only count when `verification_status=verified` and valid dates | `VERIFICATION_REQUIRED` | `backend/src/modules/compliance/usecases/complianceUseCases.js`, `backend/src/modules/compliance/policy/compliancePolicyEngine.js` | compliance policy tests |
| BIR | BIR-05 Terminal-bound peripheral enforcement | Required classes must match target terminal or explicit shared binding | `TERMINAL_DEVICE_MISMATCH` | `backend/src/modules/compliance/policy/compliancePolicyEngine.js` | terminal/peripheral matching tests |
| NPC | NPC-01 Profile tracking | DPO, DPS registration, and incident controls tracked in compliance profile | `COMPLIANCE_PROFILE_INCOMPLETE` | `backend/src/modules/compliance/policy/policyPacks.js`, `backend/src/modules/compliance/usecases/complianceUseCases.js` | checklist/profile tests |
| NPC | NPC-02 Auditability | Mode changes, verification actions, and blocked operations are audit logged | N/A (event log evidence) | `backend/src/modules/compliance/usecases/complianceUseCases.js`, `backend/src/models/Landlord/TenantComplianceAuditLog.js` | audit log persistence tests |
| NPC | NPC-03 Append-only compliance/security audit evidence | Compliance audit log updates/deletes are DB-trigger blocked; login/logout/sensitive auth actions are recorded as security audit events | `VERIFICATION_REQUIRED` (checklist evidence blocker when append-only enforcement missing) | `backend/migrations/20260408000003-harden-compliance-audit-immutability.cjs`, `backend/src/modules/auth/controllers/authHandlers.js`, `backend/src/modules/compliance/repositories/complianceRepository.js` | compliance checklist + auth/compliance tests |
| NPC | NPC-04 Mass-export breach signal readiness | Large report exports emit immutable security signal events; incident actions append immutable dispatch-attempt metadata (`target_configured`, `dispatch_reference`, delivery state) visible in admin review workflows | N/A (security signal evidence) | `backend/src/modules/reports/controllers/reportHandlers.js`, `backend/src/modules/compliance/usecases/complianceUseCases.js`, `frontend/Pages/admin/TenantManager.jsx` | report transport + compliance security signal/incident tests + admin contract tests |
| BSP | BSP-01 Payment capability gate | Payment capability endpoints denied when OPS controls are not satisfied | `BSP_OPS_REGISTRATION_REQUIRED`, `BSP_PAYMENT_CONTROL_REQUIRED` | `backend/src/modules/compliance/policy/compliancePolicyEngine.js`, `backend/src/middleware/compliancePolicy.js`, `backend/src/routes/payments.js` | payment compliance gate tests |
| BIR | BIR-06 Submission-ready books package mapping | Reports surface provides stable schema package for Sales Journal, Purchase Journal, and Inventory Book exports (`/reports/compliance-package`) plus documentary/evidence checksum manifest linkage for filing integrity | N/A (evidence/export contract) | `backend/src/services/reportService.js`, `backend/src/modules/reports/controllers/reportHandlers.js`, `backend/src/routes/reports.js` | report transport/usecase tests |
| BIR | BIR-06a Special discount identity export | Compliance books package exposes special discount beneficiary evidence (Senior/PWD/National Athlete with name/ID) via `special_discount_journal` | N/A (evidence/export contract) | `backend/src/modules/pos/usecases/posUseCases.js`, `backend/src/services/reportService.js` | report transport + compliance package contract tests |
| Engineering | ENG-01 Compliance-sensitive diff declaration | CI/pre-commit fail when sensitive changes lack high-quality declaration; computed classification floor cannot be bypassed | `IMPACT_DECLARATION_REQUIRED` | `scripts/check-compliance-impact.js`, `scripts/check-compliance-api-contracts.js`, `.husky/pre-commit`, `.github/workflows/ci.yml`, `docs/compliance/compliance-classification-matrix.md` | `npm run check:compliance` |
| Engineering | ENG-02 Request preflight | Feature requests must pass preflight classification before execution | `IMPACT_DECLARATION_REQUIRED` + downstream decision codes | `backend/src/routes/compliance.js`, `backend/src/modules/compliance/usecases/complianceUseCases.js`, `backend/src/validators/complianceValidator.js` | preflight contract tests |

## Ownership Notes
1. Product/API changes touching POS, payments, settings, compliance module, or compliance-related frontend routes require declaration and preflight.
2. Any cross-boundary change to controls requires ADR update (or new ADR) plus rollback notes.
3. Temporary exceptions require explicit allowlist entry, linked task ID, and removal date.

## Dirty Worktree Safety
1. Do not stage unrelated files when preparing compliance changes.
2. Use path-scoped review and verification (`git diff -- <path>`) for compliance-sensitive files.
3. Every declaration must describe only the surfaces touched by the staged diff.

# Compliance Controls Evidence Matrix

Last updated: 2026-04-09

## Scope
Checklist controls from `docs/compliance/DGFY Compliance Certification Checklist.md` are mapped to runtime surfaces, UX surfaces, verification tests, and filing artifacts.

| Control | Status | Backend Surface | Frontend Surface | Tests | Evidence Artifact |
|---|---|---|---|---|---|
| Non-Volatile Persistence | implemented | `backend/src/modules/pos/usecases/posUseCases.js`, `backend/src/models/PosOperationReplay.js` | `frontend/src/features/pos/pages/TerminalPage.jsx`, `frontend/src/features/pos/components/TerminalPageLayout.jsx` | `backend/tests/posOperationReplayParity.usecase.test.js`, `backend/tests/posHandlers.transport.test.js`, `backend/tests/complianceActivationReadiness.e2e.transport.test.js` | `docs/compliance/DGFY Compliance Certification Checklist.md` |
| Standardized Receipt/Invoice Format | implemented | `backend/src/modules/pos/usecases/posUseCases.js` | `frontend/src/features/pos/components/ReceiptPrintView.jsx` | `backend/tests/compliancePolicyEngine.test.js`, `frontend/src/features/pos/__tests__/receiptContractConformance.contract.test.js` | `docs/api/specification.md` |
| System-Generated Books of Accounts | implemented | `backend/src/services/reportService.js`, `backend/src/modules/reports/controllers/reportHandlers.js` | `frontend/src/hooks/useReports.js` | `backend/tests/reportHandlers.transport.test.js`, `backend/tests/reportUsecases.applicationResult.test.js`, `scripts/check-compliance-api-contracts.js` | `docs/compliance/submission/filing-instructions.md` |
| Data Encryption | implemented | `backend/src/server.js`, `backend/src/modules/compliance/repositories/complianceRepository.js` | n/a | `backend/tests/securityTransport.middleware.test.js`, `backend/tests/complianceRepository.documentaryReadiness.test.js` | `docs/compliance/submission/backup-disaster-recovery-plan.md`, `docs/compliance/evidence/drills/latest-encryption-verification.json` |
| Access Control (RBAC) | implemented | `backend/src/middleware/auth.js`, `backend/src/routes/compliance.js`, `backend/src/routes/pos.js`, `backend/src/routes/adminTenants.js` | `frontend/src/features/pos/pages/TerminalPage.jsx`, `frontend/Pages/admin/TenantManager.jsx` | `backend/tests/rbacRouteCoverage.contract.test.js`, `backend/tests/complianceActivation.transport.test.js` | `docs/compliance/evidence/rbac-sensitive-action-matrix.md` |
| Breach Notification Tooling | implemented | `backend/src/modules/compliance/usecases/complianceUseCases.js`, `backend/src/routes/adminTenants.js` | `frontend/Pages/admin/TenantManager.jsx`, `frontend/src/services/adminService.js` | `backend/tests/complianceSecuritySignal.usecase.test.js`, `backend/tests/complianceSecurityIncidents.usecase.test.js`, `frontend/src/pages/__tests__/TenantManager.complianceReviewContracts.test.js`, `scripts/check-compliance-api-contracts.js` | `docs/api/specification.md` |
| External Payment Handoff | implemented | `backend/src/modules/compliance/policy/compliancePolicyEngine.js`, `backend/src/middleware/compliancePolicy.js` | `frontend/src/features/compliance/components/ComplianceProgramPanel.jsx`, `frontend/src/features/pos/pages/TerminalPage.jsx`, `frontend/src/features/pos/components/POSCheckoutTerminal.jsx`, `frontend/src/features/pos/components/TerminalPageLayout.jsx` | `backend/tests/compliancePolicyEngine.test.js`, `frontend/src/services/__tests__/complianceService.preflight.test.js`, `frontend/src/features/pos/__tests__/terminalViewModeContracts.test.js` | `docs/api/specification.md` |
| System Flow Diagram | implemented | n/a (design evidence) | n/a | docs lint gate | `docs/compliance/submission/system-flow-diagram.mmd`, `docs/compliance/submission/system-flow-diagram.png` |
| Software Specifications Document | implemented | `backend/src/modules/**`, `frontend/src/features/**` (referenced in packet) | referenced in packet | `backend/tests/complianceRepository.documentaryReadiness.test.js`, architecture/compliance/docs gates | `docs/compliance/submission/software-specification-dgfy.md` |
| Data Backup & DR Plan | implemented | `backend/src/modules/compliance/repositories/complianceRepository.js` (readiness validation) | n/a | `backend/tests/complianceRepository.documentaryReadiness.test.js` | `docs/compliance/submission/backup-disaster-recovery-plan.md`, `docs/compliance/evidence/drills/latest-restore-drill.json` |

## Closure Rule
Checklist status may only remain `[x]` when all are true:
1. Runtime behavior is implemented.
2. Verification tests pass.
3. Evidence artifacts are present and, where applicable, freshness/quality checks pass.

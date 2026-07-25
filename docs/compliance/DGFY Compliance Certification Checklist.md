---
status: reference
authority_level: reference
owner: compliance
last_reviewed: 2026-04-10
applies_to: dgfy_certification_readiness
topic: dgfy_compliance_certification_checklist
---

# DGFY Technical Compliance Checklist (Current Status)

Last updated: 2026-04-10 (settings deep-link + remediation action determinism hardening pass)

Legend:
- `[x]` Completed in current implementation
- `[~]` Partially implemented (gaps remain)
- `[ ]` Not implemented / no sufficient evidence yet

## Scoring Rubric (Objective Inputs)

QA Readiness score per control area is assigned from four objective inputs:

| Input | Weight | Scoring Rule |
|---|---:|---|
| Runtime behavior implemented | 35% | 0 if missing, 1 if fully implemented |
| Verification tests passing | 30% | 0 if no test evidence, 1 if contract/integration coverage exists |
| Documentary artifact freshness | 20% | 0 if missing/stale, 1 if current and linked |
| Operational risk posture | 15% | 1 for low residual risk, 0 for high unmanaged risk |

Score formula: `round((runtime*0.35 + tests*0.30 + documentary*0.20 + risk*0.15) * 10, 1)`

## Implementation vs Operational Readiness

1. `Implementation Status` indicates feature/control existence in product/runtime.
2. `QA Readiness` indicates release/submission confidence using the scoring rubric above.
3. A control can remain `[x]` implemented while still carrying operational residual risk.

## QA Reassessment Snapshot (2026-04-10)

| Control Area | Implementation Status | QA Readiness (1-10) | Key Residual Gap |
|---|---|---:|---|
| Non-Volatile Persistence | `[x]` | 8.4 | Deterministic parity coverage exists for current operation set; add parity cases whenever new offline operation types are introduced. |
| Standardized Receipt/Invoice Format | `[x]` | 8.2 | Contract-level rendering is enforced; external regulator acceptance of physical print templates remains external to app tests. |
| System-Generated Books of Accounts | `[x]` | 8.3 | Package schema and checksums are stable; filing acceptance remains dependent on regulator review outside runtime control. |
| Data Encryption | `[x]` | 8.9 | Runtime transport and documentary controls are validated; infrastructure key custody remains operational responsibility. |
| Access Control (RBAC) | `[x]` | 8.5 | Route contract coverage is strong; future sensitive routes must continue to extend RBAC matrix coverage. |
| Breach Notification Tooling | `[x]` | 8.4 | Dispatch audit metadata is implemented; third-party channel delivery SLAs still require deployment-level verification. |
| External Payment Handoff | `[x]` | 8.5 | Reason-coded blocker UX and settings remediation anchors are deterministic; operator training consistency remains an operations dependency. |
| System Flow Diagram | `[x]` | 9.0 | Diagram and checksum-linked artifacts are complete; must stay synchronized with architecture changes. |
| Software Specifications Document | `[x]` | 8.5 | Submission metadata checks are in place; sign-off metadata freshness must be maintained per release. |
| Data Backup & DR Plan | `[x]` | 8.6 | Drill evidence freshness is validated; discipline of recurring drills remains operational. |

## Reassessment Addendum (2026-04-10)

1. Settings deep-link contract now resolves known compliance/POS inbound targets deterministically and normalizes legacy aliases.
2. Compliance `Fix now` actions now resolve against always-available final-review anchors, removing the prior no-op path in `compliant_active`.
3. Hash-target lookup behavior is hardened against malformed selector-style hashes via safe hash-to-id resolution in Settings and compliance panel actions.
4. Clipboard actions in Settings company controls now have explicit fallback feedback when browser clipboard API calls fail.
5. Regression evidence expanded to include:
   - `frontend/src/features/settings/__tests__/settingsDeepLink.contract.test.js`
   - `frontend/src/pages/__tests__/Settings.deepLinking.integration.test.jsx`
   - `frontend/src/features/compliance/__tests__/ComplianceProgramPanel.integration.test.jsx`
6. Final Review documentary requirements are tenant self-serve in Settings > Compliance with backend-stored records (submission packet files remain internal reference artifacts).

## Closure Criteria (Current, All Controls)

| Control | Closure Criteria (must all pass before score can move to >=8) |
|---|---|
| Non-Volatile Persistence | 1) Replay/idempotency tests cover `processed`, `idempotent_replay`, `conflict`, `blocked` for active operation types. 2) Offline queue surfaces state and replay action. 3) Evidence references current parity tests and replay model. |
| Standardized Receipt/Invoice Format | 1) Receipt contract tests enforce required ordering and context banners. 2) Runtime includes contract version/context metadata. 3) API documentation reflects receipt contract behavior. |
| System-Generated Books of Accounts | 1) Compliance package endpoint exports required journals and manifest checksums. 2) Filing instructions and package schema remain aligned. 3) Transport/use-case tests cover export response contract. |
| Data Encryption | 1) Automated transport-security tests validate HTTP rejection and HTTPS allowance behavior. 2) Documentary readiness checks enforce encryption prerequisites. 3) Current encryption evidence artifacts are linked. |
| Access Control (RBAC) | 1) Route-to-permission contract tests pass. 2) Sensitive-action matrix is synchronized to route surfaces. 3) New sensitive routes are blocked from merge if matrix/tests are missing. |
| Breach Notification Tooling | 1) Incident workflow stores immutable dispatch-attempt metadata. 2) Admin review UI exposes latest dispatch and target diagnostics. 3) Use-case tests cover strict-mode failed/sent outcomes. |
| External Payment Handoff | 1) Compliance policy denies non-cash POS path when OPS controls are incomplete. 2) Reason code + remediation target are surfaced in terminal UI. 3) Policy and terminal contract tests cover blocked path. 4) Cross-surface `/settings?tab=...#...` remediation targets are validated by Settings deep-link contract/integration tests. |
| System Flow Diagram | 1) Mermaid source and exported image both exist. 2) Filing packet links both artifacts. 3) Diagram checksum linkage is preserved in package manifest. |
| Software Specifications Document | 1) Specification includes required sign-off metadata tokens. 2) Documentary readiness validation checks quality tokens. 3) Links to active control/evidence docs remain valid. |
| Data Backup & DR Plan | 1) DR plan references RPO/RTO and escalation policy. 2) Restore drill and encryption verification artifacts are current within freshness window. 3) Documentary readiness checks enforce drill freshness. |

## 1. BIR Mandatory Fiscal Logic (Tax Engine)

- [x] Non-Resettable Grand Total
  - Evidence: Persistent fiscal counter increments in checkout and is surfaced in compliance readiness evidence.
  - References: `apps/dgfy-api/src/modules/pos/usecases/posUseCases.js`, `apps/dgfy-api/src/modules/compliance/repositories/complianceRepository.js`, `apps/dgfy-api/tests/posSalesReconciliation.db.integration.test.js`.

- [x] Reset Counter
  - Evidence: Governed reset endpoint increments `reset_counter` with mandatory confirmation and immutable `RST-*` snapshots.
  - References: `apps/dgfy-api/src/modules/pos/usecases/posUseCases.js`, `apps/dgfy-api/src/routes/pos.js`, `apps/dgfy-api/tests/posReadings.usecase.test.js`.

- [x] Tamper-Proofing (No Bypass Modes)
  - Evidence: Server-controlled `document_context` (`fiscal`/`non_fiscal`/`training_test`) and non-fiscal banner enforcement.
  - References: `apps/dgfy-api/src/modules/compliance/policy/compliancePolicyEngine.js`, `apps/dgfy-api/src/modules/pos/usecases/posUseCases.js`, `frontend/src/features/pos/components/ReceiptPrintView.jsx`, `apps/dgfy-api/tests/compliancePolicyEngine.test.js`.

- [x] Non-Volatile Persistence
  - Evidence: Offline-safe operation replay includes checkout, shift open, cash events, shift close, and order-status updates with parity coverage.
  - References: `frontend/src/features/pos/components/POSCheckoutTerminal.jsx`, `frontend/src/features/pos/pages/TerminalPage.jsx`, `apps/dgfy-api/src/modules/pos/usecases/posUseCases.js`, `apps/dgfy-api/src/models/PosOperationReplay.js`, `apps/dgfy-api/tests/posOperationReplayParity.usecase.test.js`.

- [x] VAT / Non-VAT Segregation
  - Evidence: VAT buckets (`vatable_sales`, `vat_amount`, `vat_exempt_sales`, `zero_rated_sales`) are persisted and rendered in POS and Sales flows.
  - References: `apps/dgfy-api/src/modules/pos/usecases/posUseCases.js`, `frontend/src/features/pos/components/ReceiptPrintView.jsx`, `apps/dgfy-api/tests/posSalesReconciliation.db.integration.test.js`, `frontend/src/features/pos/__tests__/receiptContractConformance.contract.test.js`.

## 2. Reporting & Output (Audit Trail)

- [x] Standardized Receipt/Invoice Format
  - Evidence: Receipt contract metadata persists context/version and renders fixed compliance footer statements with fixture-level contract tests.
  - References: `apps/dgfy-api/src/modules/pos/usecases/posUseCases.js`, `frontend/src/features/pos/components/ReceiptPrintView.jsx`, `frontend/src/features/pos/__tests__/receiptContractConformance.contract.test.js`, `docs/api/specification.md`.

- [x] Z-Reading Report
  - Evidence: Close-day snapshot includes `z_counter`, `reset_counter`, and lifetime grand-total fields.
  - References: `apps/dgfy-api/src/modules/pos/usecases/posUseCases.js`, `apps/dgfy-api/src/models/PosZReadingSnapshot.js`, `apps/dgfy-api/tests/posReadings.usecase.test.js`.

- [x] X-Reading Report
  - Evidence: `GET /pos/x-reading/current` returns intraday summary and counter state.
  - References: `apps/dgfy-api/src/modules/pos/usecases/posUseCases.js`, `apps/dgfy-api/src/routes/pos.js`, `docs/api/specification.md`, `apps/dgfy-api/tests/posHandlers.transport.test.js`.

- [x] System-Generated Books of Accounts
  - Evidence: Compliance package export includes journal payloads and documentary/evidence checksums.
  - References: `apps/dgfy-api/src/services/reportService.js`, `apps/dgfy-api/src/modules/reports/controllers/reportHandlers.js`, `apps/dgfy-api/tests/reportHandlers.transport.test.js`, `docs/compliance/submission/filing-instructions.md`.

- [x] Backend Discount Reporting (Senior/PWD/National Athlete + name/ID)
  - Evidence: Checkout enforces `discount_beneficiary` identity fields and package export includes `special_discount_journal` columns.
  - References: `apps/dgfy-api/src/modules/pos/usecases/posUseCases.js`, `apps/dgfy-api/src/services/reportService.js`, `apps/dgfy-api/tests/reportHandlers.transport.test.js`.

## 3. Data Privacy & Security (NPC Compliance)

- [x] Data Encryption
  - Evidence: Production HTTPS enforcement + HSTS and documented AES-256 at-rest controls.
  - References: `apps/dgfy-api/src/server.js`, `apps/dgfy-api/tests/securityTransport.middleware.test.js`, `docs/compliance/submission/backup-disaster-recovery-plan.md`, `docs/compliance/evidence/drills/latest-encryption-verification.json`.

- [x] Access Control (RBAC)
  - Evidence: Sensitive-action RBAC matrix maps to route/usecase enforcement and admin compliance actions.
  - References: `docs/compliance/evidence/rbac-sensitive-action-matrix.md`, `apps/dgfy-api/src/middleware/auth.js`, `apps/dgfy-api/src/routes/compliance.js`, `apps/dgfy-api/src/routes/pos.js`, `apps/dgfy-api/src/routes/adminTenants.js`, `apps/dgfy-api/tests/rbacRouteCoverage.contract.test.js`.

- [x] Immutable Audit Logs
  - Evidence: DB triggers reject update/delete on `tenant_compliance_audit_logs`; readiness checks validate trigger presence.
  - References: `apps/dgfy-migration-runner/migrations/20260408000003-harden-compliance-audit-immutability.cjs`, `apps/dgfy-api/src/modules/compliance/repositories/complianceRepository.js`, `apps/dgfy-api/tests/complianceRepository.documentaryReadiness.test.js`.

- [x] Breach Notification Tooling
  - Evidence: Immutable `security_signal` incidents support auditable admin workflow and dispatch-attempt metadata.
  - References: `apps/dgfy-api/src/modules/compliance/usecases/complianceUseCases.js`, `apps/dgfy-api/src/routes/adminTenants.js`, `frontend/Pages/admin/TenantManager.jsx`, `apps/dgfy-api/tests/complianceSecuritySignal.usecase.test.js`, `apps/dgfy-api/tests/complianceSecurityIncidents.usecase.test.js`.

## 4. Payment Integration (BSP Avoidance Strategy)

- [x] External Payment Handoff
  - Evidence: Policy engine enforces external handoff for non-cash when OPS controls are incomplete, with reason-coded denials and remediation targets.
  - References: `apps/dgfy-api/src/modules/compliance/policy/compliancePolicyEngine.js`, `apps/dgfy-api/src/middleware/compliancePolicy.js`, `frontend/src/features/pos/pages/TerminalPage.jsx`, `frontend/src/features/pos/components/TerminalPageLayout.jsx`, `frontend/src/features/settings/settingsDeepLink.js`, `frontend/src/features/settings/__tests__/settingsDeepLink.contract.test.js`, `frontend/src/pages/__tests__/Settings.deepLinking.integration.test.jsx`, `frontend/src/features/compliance/__tests__/ComplianceProgramPanel.integration.test.jsx`, `apps/dgfy-api/tests/compliancePolicyEngine.test.js`.

## 5. Dev-Produced Documentation (Required for Submission)

- [x] System Flow Diagram
  - Evidence: Submission-ready Mermaid source and exported image artifacts are maintained.
  - References: `docs/compliance/submission/system-flow-diagram.mmd`, `docs/compliance/submission/system-flow-diagram.png`, `docs/compliance/submission/filing-instructions.md`.

- [x] Database Schema
  - Evidence: Schema reference is maintained and linked from submission and control documents.
  - References: `docs/database/schema.md`, `docs/compliance/submission/software-specification-dgfy.md`, `docs/compliance/control-matrix.md`.

- [x] Software Specifications Document
  - Evidence: Filing-ready software specification includes architecture/runtime/control references and sign-off metadata requirements.
  - References: `docs/compliance/submission/software-specification-dgfy.md`, `apps/dgfy-api/tests/complianceRepository.documentaryReadiness.test.js`, `docs/compliance/evidence/open-controls-matrix.md`.

- [x] Data Backup & Disaster Recovery Plan
  - Evidence: Backup/DR plan includes RPO/RTO, encryption, restore drill references, and escalation policy.
  - References: `docs/compliance/submission/backup-disaster-recovery-plan.md`, `docs/compliance/evidence/drills/latest-restore-drill.json`, `apps/dgfy-api/tests/complianceRepository.documentaryReadiness.test.js`.

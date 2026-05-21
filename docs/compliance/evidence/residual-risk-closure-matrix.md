# Residual Risk Closure Matrix

Last updated: 2026-04-09 (dispatch/documentary/RBAC/POS-blocker hardening)  
Owner: Compliance Engineering

## Scope
Tracks residual-risk findings, closure evidence, and remaining monitoring notes after implementation.

| Risk ID | Control | Status | Previous Root Cause | Affected Surfaces | Required Tests | Closure Artifact | Residual Monitoring Note |
|---|---|---|---|---|---|---|---|
| `ENC-01` | Data Encryption | closed (implemented) | Transport enforcement existed without dedicated evidence tests; at-rest controls were documentation-first. | Backend middleware, compliance checklist evidence, submission docs | `backend/tests/securityTransport.middleware.test.js`, `backend/tests/complianceRepository.documentaryReadiness.test.js` | `docs/compliance/evidence/drills/latest-encryption-verification.json` | Keep environment key-management controls verified outside app runtime. |
| `INC-01` | Breach Notification Tooling | closed (implemented) | Incident workflow recorded status transitions but lacked dispatch-attempt evidence trail. | Compliance usecases/repository, admin endpoints, admin review UI | `backend/tests/complianceSecuritySignal.usecase.test.js`, `backend/tests/complianceSecurityIncidents.usecase.test.js`, `frontend/src/pages/__tests__/TenantManager.complianceReviewContracts.test.js` | Immutable dispatch metadata now includes `target_configured` and `dispatch_reference`, plus strict-mode failed/sent outcome coverage | Validate real provider delivery SLAs in deployment-specific runbooks. |
| `DOC-01` | Backup & DR Evidence | closed (implemented) | DR plan existed but drill evidence was not readiness-gated. | Compliance repository readiness checks, checklist payload, submission evidence | `backend/tests/complianceRepository.documentaryReadiness.test.js` | `docs/compliance/evidence/drills/latest-restore-drill.json` + encryption report | Maintain drill cadence and freshness within configured max-age window. |
| `NVP-01` | Non-Volatile Persistence | closed (implemented) | Replay coverage needed broader deterministic parity proof across operation types. | POS terminal usecases, replay repository, transport contracts | `backend/tests/posOperationReplayParity.usecase.test.js`, `backend/tests/posHandlers.transport.test.js`, `backend/tests/complianceActivationReadiness.e2e.transport.test.js` | Deterministic replay evidence across processed/idempotent/conflict/blocked outcomes for shift open, cash event, shift close, and order-status update | Extend parity suite when new queued operation types are introduced. |
| `RBAC-01` | RBAC Coverage | closed (implemented) | Route-to-permission deny/allow evidence was not exhaustive. | Routes, auth middleware, compliance/POS/admin handlers, docs | `backend/tests/rbacRouteCoverage.contract.test.js` | Drift-resistant route contract tests (method/path/guard) synced with RBAC matrix evidence | Ensure new sensitive routes extend route-coverage contracts. |
| `DOC-02` | API/Docs Consistency | closed (implemented) | Validator/runtime contracts drifted from API docs for idempotent operations. | API specification docs, validators, route contracts | `scripts/check-compliance-api-contracts.js` (via `npm run check:compliance`) | Updated API spec + CI drift-check output | Keep check list updated when adding new compliance-sensitive contracts. |
| `RCPT-01` | Receipt Conformance | closed (implemented) | Contract metadata existed but fixture-level conformance tests were limited. | POS checkout usecase, receipt render UI, compliance policy tests | `frontend/src/features/pos/__tests__/receiptContractConformance.contract.test.js`, `backend/tests/compliancePolicyEngine.test.js` | Runtime fixture coverage for context-specific banners, fiscal header fields, and fixed summary/footer ordering | Maintain regulator-facing print proof runbook for external filing validation. |
| `DOC-03` | Documentary Readiness Quality | closed (implemented) | Readiness checks were mostly file-existence only. | Compliance repository readiness checks, checklist payload, submission artifacts | `backend/tests/complianceRepository.documentaryReadiness.test.js` | Quality/freshness-scored checklist documentary readiness payload now enforces sign-off metadata tokens | Keep artifact tokens/quality criteria aligned to submission packet revisions. |

## Test Naming Convention
Use control prefixes in test names to keep evidence traceable:
1. `ENC-*` encryption and transport security
2. `INC-*` incident and breach workflow
3. `DOC-*` documentation/readiness/api-contract alignment
4. `NVP-*` non-volatile persistence and replay parity
5. `RBAC-*` route-permission access controls
6. `RCPT-*` receipt contract conformance

## Closure Rule
A risk row may be marked closed only when all are true:
1. Runtime behavior implemented.
2. Required tests pass in CI.
3. Closure artifact exists and is linked from checklist and control matrix.

---
status: reference
authority_level: reference
owner: compliance
last_reviewed: 2026-04-08
applies_to: compliance_sensitive_change_classification
topic: compliance_classification_matrix
related_adr: 0007-dual-mode-pos-compliance-program.md
---

# Compliance Classification Matrix

## Purpose
Define deterministic minimum classification floors enforced by `scripts/check-compliance-impact.js`.

## Source Of Truth
1. `scripts/check-compliance-impact.js` is normative.
2. This matrix is a human-readable mirror of `COMPLIANCE_SENSITIVE_RULES` and must be updated whenever that rule set changes.

## Rule
1. Classification is auto-minimum from changed compliance-sensitive files.
2. Declaration classification cannot be lower than the computed floor.
3. Higher classification is allowed.

## Surface Floors
| Surface | Minimum Classification |
|---|---|
| `pos` | `major` |
| `terminal` | `major` |
| `settings` | `major` |
| `payments` | `major` |
| `compliance` | `regulatory` |

## Path Matrix (Guardrail Source)
| Path Pattern | Surfaces | Minimum Classification |
|---|---|---|
| `backend/src/modules/pos/**` | `pos`, `terminal` | `major` |
| `backend/src/modules/payments/**` | `payments` | `major` |
| `backend/src/modules/downpayment/**` | `payments` | `major` |
| `backend/src/modules/settings/**` | `settings` | `major` |
| `backend/src/modules/compliance/**` | `compliance` | `regulatory` |
| `backend/src/middleware/compliancePolicy.js` | `compliance`, `settings`, `payments`, `pos` | `regulatory` |
| `backend/src/routes/pos.js` | `pos`, `terminal` | `major` |
| `backend/src/routes/payments.js` | `payments` | `major` |
| `backend/src/routes/settings.js` | `settings` | `major` |
| `backend/src/routes/compliance.js` | `compliance` | `regulatory` |
| `backend/src/routes/adminTenants.js` | `settings`, `compliance` | `regulatory` |
| `backend/src/validators/complianceValidator.js` | `compliance` | `regulatory` |
| `backend/src/controllers/complianceController.js` | `compliance` | `regulatory` |
| `backend/src/controllers/adminTenantController.js` | `settings`, `compliance` | `regulatory` |
| `backend/src/modules/tenants/controllers/adminTenantHandlers.js` | `settings`, `compliance` | `regulatory` |
| `backend/src/modules/tenants/usecases/registerCompanyRequestUseCase.js` | `settings`, `compliance` | `regulatory` |
| `backend/src/modules/tenants/usecases/provisionNewTenantUseCase.js` | `settings`, `compliance` | `regulatory` |
| `backend/src/modules/tenants/repositories/tenantAdminRepository.js` | `settings`, `compliance` | `regulatory` |
| `frontend/src/features/pos/**` | `pos`, `terminal` | `major` |
| `frontend/src/features/compliance/**` | `compliance` | `regulatory` |
| `frontend/src/pages/Settings*` | `settings` | `major` |
| `frontend/Pages/Settings.jsx` | `settings` | `major` |
| `frontend/src/services/paymentService.js` | `payments` | `major` |
| `frontend/src/services/complianceService.js` | `compliance` | `regulatory` |
| `frontend/src/services/adminService.js` | `settings`, `compliance` | `regulatory` |
| `frontend/Pages/admin/TenantManager.jsx` | `settings`, `compliance` | `regulatory` |

## Classification Enforcement Notes
1. Missing declaration still fails for any compliance-sensitive change.
2. `major|regulatory` declarations must include preflight evidence keys and `preflight_result=no_breach`.
3. `preflight_request_ref` must be a ticket/PR style reference token.

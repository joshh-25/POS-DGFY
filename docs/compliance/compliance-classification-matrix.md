---
status: reference
authority_level: reference
owner: compliance
last_reviewed: 2026-08-23
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

**Resynced 2026-08-23 (issue #914)** against `COMPLIANCE_SENSITIVE_RULES` in
`scripts/check-compliance-impact.js` — this mirror had drifted since `last_reviewed`, still
listing `backend/**`/`frontend/**` paths from before the `apps/*` relocation (ADR 0032/0059,
2026-07-20/08-06) and the frontend split (ADR 0071, issue #322). All paths below are current.

| Path Pattern | Surfaces | Minimum Classification |
|---|---|---|
| `apps/dgfy-api/src/modules/pos/**` | `pos`, `terminal` | `major` |
| `apps/dgfy-api/src/modules/vouchers/**` | `pos`, `terminal` | `major` |
| `apps/dgfy-api/src/modules/store/**` | `payments` | `major` |
| `apps/dgfy-api/src/modules/payments/**` | `payments` | `major` |
| `apps/dgfy-api/src/modules/commercePayments/**` | `payments` | `major` |
| `apps/dgfy-api/src/modules/downpayment/**` | `payments` | `major` |
| `apps/dgfy-api/src/modules/settings/**` | `settings` | `major` |
| `apps/dgfy-api/src/modules/compliance/**` | `compliance` | `regulatory` |
| `apps/dgfy-api/src/middleware/compliancePolicy.js` | `compliance`, `settings`, `payments`, `pos` | `regulatory` |
| `apps/dgfy-api/src/routes/payments.js` | `payments` | `major` |
| `apps/dgfy-api/src/routes/commercePayments.js` | `payments` | `major` |
| `apps/dgfy-api/src/routes/pos.js` | `pos`, `terminal` | `major` |
| `apps/dgfy-api/src/routes/settings.js` | `settings` | `major` |
| `apps/dgfy-api/src/routes/compliance.js` | `compliance` | `regulatory` |
| `apps/dgfy-api/src/routes/adminTenants.js` | `settings`, `compliance` | `regulatory` |
| `apps/dgfy-api/src/validators/complianceValidator.js` | `compliance` | `regulatory` |
| `apps/dgfy-api/src/controllers/complianceController.js` | `compliance` | `regulatory` |
| `apps/dgfy-api/src/controllers/adminTenantController.js` | `settings`, `compliance` | `regulatory` |
| `apps/dgfy-api/src/modules/tenants/controllers/adminTenantHandlers.js` | `settings`, `compliance` | `regulatory` |
| `apps/dgfy-api/src/modules/tenants/usecases/registerCompanyRequestUseCase.js` | `settings`, `compliance` | `regulatory` |
| `apps/dgfy-api/src/modules/tenants/usecases/provisionNewTenantUseCase.js` | `settings`, `compliance` | `regulatory` |
| `apps/dgfy-api/src/modules/tenants/repositories/tenantAdminRepository.js` | `settings`, `compliance` | `regulatory` |
| `packages/web-core/src/features/pos/**` | `pos`, `terminal` | `major` |
| `packages/web-core/src/features/compliance/**` | `compliance` | `regulatory` |
| `packages/web-core/src/pages/Settings*` | `settings` | `major` |
| `apps/dgfy-ims/Pages/Settings.jsx` | `settings` | `major` |
| `packages/web-core/src/services/paymentService.js` | `payments` | `major` |
| `packages/web-core/src/services/complianceService.js` | `compliance` | `regulatory` |
| `packages/web-core/src/services/adminService.js` | `settings`, `compliance` | `regulatory` |
| `apps/dgfy-ims/Pages/admin/TenantManager.jsx` | `settings`, `compliance` | `regulatory` |

Note the frontend-split asymmetry: the shared `src/features/`, `src/pages/`, and `src/services/`
paths above moved to `packages/web-core` (issue #322), but root `Pages/` (capital-P, the legacy
IMS page routes) moved to `apps/dgfy-ims/Pages/` instead — see
`docs/architecture/frontend-split-sync.md` for why the two didn't move together.

## Classification Enforcement Notes
1. Missing declaration still fails for any compliance-sensitive change.
2. `major|regulatory` declarations must include preflight evidence keys and `preflight_result=no_breach`.
3. `preflight_request_ref` must be a ticket/PR style reference token.

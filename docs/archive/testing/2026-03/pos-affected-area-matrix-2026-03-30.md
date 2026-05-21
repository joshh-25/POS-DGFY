# POS Hardening Affected-Area Matrix (2026-03-30)

Status: in_progress  
Purpose: prevent single-area assumptions by mapping cross-surface impacts before remediation.

## 1) Primary Domains

1. POS checkout domain
2. Unified Sales read domain
3. Auth/session resilience
4. Settings/compliance metadata
5. Reporting/reconciliation surfaces
6. Docs/testing governance assets

## 2) Module Impact Matrix

| Area | Files/Modules | Why Affected | Risk If Missed | Phase |
|---|---|---|---|---|
| POS checkout transport/usecase | `backend/src/modules/pos/**`, `frontend/src/features/pos/**` | Checkout, VAT, discount, service-fee, compliance gate behavior | financial mismatch, cashier confusion | 2, 5 |
| Sales read layer | `backend/src/modules/sales/**`, `frontend/src/features/sales/**` | POS-vs-sales reconciliation and permission behavior | inconsistent totals, false zero-sales | 2, 5 |
| Session/auth interceptors | `frontend/src/services/api.js` + interceptor tests | multi-tab/session-expiry reliability under error bursts | random logout/retry loops | 2 |
| Settings validation/persistence | `backend/src/validators/settingsValidator.js`, settings repo/usecases, `frontend/Pages/Settings.jsx` | compliance fields + POS setup correctness | blocked checkout despite valid setup or silent bad config | 1, 2 |
| Stock movements + Z-reading | `backend/src/services/stockMovementService.js`, POS reconciliation tests | checkout-to-stock and close-day integrity | reconciliation drift | 2, 5 |
| Build/degradation | `frontend/vite.config.js`, new budget checker script, package scripts | low-end cashier UX first-load/interaction responsiveness | slow terminal workflow | 3 |
| API/DB contracts docs | `docs/api/specification.md`, `docs/database/schema.md` | source-of-truth consistency for support/testing | implementation drift and wrong assumptions | 4 |
| UAT artifacts | `docs/testing/pos-e2e-uat-*.md` | manual signoff closure and traceability | readiness cannot be proven | 1, 4 |

## 3) Dependency Chain

1. UAT readiness assets must be improved before final human run.
2. Robustness and degradation gates must exist before final re-rating.
3. Canonical docs convergence should be completed before publishing final readiness status.

# Critical Systems Documentation

Last reviewed: 2026-04-18

This document tracks high-risk systems where regressions can break tenant isolation, checkout integrity, or operational readiness across IMS, POS terminal, storefront, and unified sales.

## 1. Tenant Isolation and Auth Transport
**Locations:**
- `backend/src/middleware/tenantHandler.js`
- `backend/src/services/authService.js`
- `frontend/src/services/authService.js`

**Purpose:**
- Resolves `x-company-token` and binds request execution to the correct tenant context.
- Maintains authenticated access and tenant-aware token lifecycle.

**Critical Risk:**
- Token/header drift can cause cross-tenant data exposure or hard API failures.
- Missing tenant context on login/refresh can break all downstream protected endpoints.

## 2. POS and Storefront Source Separation Contract
**Locations:**
- `backend/src/modules/pos/repositories/posRepository.js`
- `backend/src/modules/pos/usecases/posUseCases.js`
- `backend/src/modules/store/usecases/storeUseCases.js`
- `frontend/src/features/pos/components/POSCheckoutTerminal.jsx`
- `frontend/src/features/pos/components/orderFulfillmentUi.js`
- `docs/features/POS_STOREFRONT_SOURCE_SEPARATION_CONTRACT.md`

**Purpose:**
- Preserves explicit channel attribution using `order_source` (`in_store`, `online_store`).
- Keeps incoming POS orders online-only while in-store checkout remains separate.

**Critical Risk:**
- Any fallback to legacy `order_method='online'` semantics can reintroduce channel ambiguity in history/operations.
- UI inference from cashier assignment instead of backend source fields can misclassify transactions.

## 3. Unified Sales Read Model Integrity
**Locations:**
- `backend/src/modules/sales/repositories/salesRepository.js`
- `backend/src/modules/sales/controllers/salesHandlers.js`
- `backend/src/validators/salesValidator.js`
- `frontend/src/features/sales/pages/SalesPage.jsx`

**Purpose:**
- Provides consolidated read-only sales across POS and Dispatch (ADR 0005).
- Exposes POS subtype discriminator (`pos_order_source`) without breaking primary source grouping.

**Critical Risk:**
- Validator/contract drift can silently broaden or narrow sales filters.
- Missing subtype in table/export breaks reconciliation between POS history and sales reporting.

## 4. Checkout Error Contract and User Recovery UX
**Locations:**
- `frontend/apps/store/src/storefrontErrorMessages.js`
- `frontend/apps/store/src/main.jsx`
- `backend/src/modules/store/usecases/storeUseCases.js`

**Purpose:**
- Normalizes checkout failure payloads into deterministic, actionable customer-facing messages.
- Preserves clear retry guidance for stock, location, and validation failures.

**Critical Risk:**
- Raw backend errors leaking to UI increase abandonment and support load.
- Non-deterministic error mapping can produce inconsistent guidance across sessions.

## 5. Settings Deep-Link and Compliance Final Review Routing
**Locations:**
- `frontend/src/features/settings/settingsDeepLink.js`
- `frontend/src/features/settings/__tests__/settingsDeepLink.contract.test.js`

**Purpose:**
- Ensures hash fragments resolve to the correct settings/compliance destination.
- Supports Final Review documentary anchors without broken navigation.

**Critical Risk:**
- Deep-link drift blocks remediation workflows and manual readiness UAT flows.

## 6. Permission and UI Gating Layer
**Locations:**
- `frontend/src/store/PermissionContext.jsx`
- `frontend/Layout.jsx`

**Purpose:**
- Controls role-based access to operational surfaces and admin-only actions.

**Critical Risk:**
- Permission parsing regressions can hide critical controls or expose restricted features.

## Operational Guardrails
1. Source of truth for POS readiness state: `docs/testing/pos-readiness-status.md`.
2. Manual UAT runbook/checklist/evidence artifacts are mandatory before production-readiness signoff:
- `docs/testing/manual-qa-readiness-runbook-pos-ims-store.md`
- `docs/testing/pos-e2e-uat-checklist.md`
- `docs/testing/pos-e2e-uat-evidence-template.md`
3. Required gates for architecture-sensitive changes:
- `npm run check:architecture`
- `npm run check:compliance`
4. Required inventory integrity audits for multi-location rollout waves:
- `npm run audit:fifo-drift -- --json-output <artifact-path>`
- `npm run audit:location-stock-parity -- --json-output <artifact-path>`
5. Approved remediation commands when integrity audits fail (runbook-controlled only):
- `npm run audit:fifo-drift:repair`
- `npm run audit:location-stock-parity:repair`

## Multi-Location Rollout Regression Watchlist
For multi-location inventory rollout waves, treat these as hard regression checks:
1. Tenant isolation and auth transport remain intact.
2. POS/storefront source separation remains contract-accurate (`order_source` semantics unchanged).
3. Checkout error contract remains deterministic and actionable (especially location stock violations).
4. Permission gating remains enforced, including location-scoped write-path controls.
5. Inventory parity invariant holds: aggregated location stock matches compatibility total.

## Latest Production Evidence (2026-04-18)
1. Deploy commit: `07c1eb20e5dc0de8519d7dac89f4c70f37662db1`.
2. Deploy summary: `/var/www/skupervisor/logs/deploy/deploy_20260418_032723.summary.txt`.
3. Strict schema gate: `/var/www/skupervisor/logs/deploy/deploy_20260418_032723.tenant_schema_sync.json` (`failed=0`).
4. Strict index headroom gate: `/var/www/skupervisor/logs/deploy/deploy_20260418_032723.tenant_index_headroom.json` (`status=healthy`, `redundant_groups_total=0`).
5. Public runtime checks passed:
- `https://skupervisor.surebizcorp.com`
- `https://pos.surebizcorp.com`
- `https://surebizcorp.com`
- `https://surebizcorp.com/tenant-store/`

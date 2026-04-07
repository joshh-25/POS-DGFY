---
status: reference
owner: engineering
last_reviewed: 2026-04-06
related_adr: 0007-dual-mode-pos-compliance-program.md
declaration_id: 2026-04-06-dual-mode-pos-compliance-program
classification: regulatory
surfaces: pos,terminal,settings,payments,compliance
reason_codes_impacted: ALLOWED,LEGACY_MODE_SELECTION_REQUIRED,NON_COMPLIANT_FISCAL_DOCUMENT_BLOCKED,TERMINAL_DEVICE_MISMATCH,VERIFICATION_REQUIRED
policy_version: 2026.04.06
verification_evidence: npm -C backend test,npm -C frontend test,npm run check:architecture,npm run check:compliance
rollback_note: Revert compliance module and migration set, then run migration rollback and restore prior declaration.
---

# Dual-Mode POS Compliance Program

## Compliance Impact Classification
Regulatory

## Affected Surfaces
- Backend POS runtime (`backend/src/modules/pos/**`)
- Tenant lifecycle and onboarding (`backend/src/modules/tenants/**`, `backend/src/services/tenantProvisioningService.js`)
- Compliance core module (`backend/src/modules/compliance/**`)
- Settings and payments compliance gates (`backend/src/modules/settings/**`, `backend/src/routes/payments.js`)
- Compliance API (`backend/src/routes/compliance.js`)
- Admin tenant UI mode selection (`frontend/Pages/admin/TenantManager.jsx`)

## Compliance Preconditions
- Tenant compliance mode selected at registration (`non_compliant` or `compliant`)
- No downgrade from compliant states (`compliant_pending`/`compliant_active` -> non-compliant forbidden)
- Compliant activation requires checklist readiness (profile, artifacts, accredited peripherals, settings, readiness tests)
- Payment capability routes must pass BSP-related compliance gate
- Non-compliant mode must remain non-fiscal on POS output contracts

## Verification Evidence
- `npm -C backend run lint`
- `npm -C backend run check:architecture-guardrails`
- `npm -C backend run check:controller-boundaries`
- `npm -C backend run test`
- Focused suites:
  - `tests/posCheckout.db.integration.test.js`
  - `tests/posSalesReconciliation.db.integration.test.js`
  - `tests/storefrontPrimaryLocation.discovery.integration.test.js`
  - `tests/lookup_v2.test.js`

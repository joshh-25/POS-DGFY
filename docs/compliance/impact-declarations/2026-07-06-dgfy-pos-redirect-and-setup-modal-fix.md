---
status: reference
owner: engineering
last_reviewed: 2026-07-06
related_adr: docs/architecture/adr/0007-dual-mode-pos-compliance-program.md
declaration_id: 2026-07-06-dgfy-pos-redirect-and-setup-modal-fix
classification: major
surfaces: pos,terminal
reason_codes_impacted: POS_TENANT_ONBOARDING_STOREFRONT_SETUP_REQUIRED
policy_version: 2026.07.06
verification_evidence: npm --prefix frontend test -- --run,npm --prefix frontend run lint
rollback_note: Revert this commit; no schema migration or compliance policy change is introduced, so rollback is a plain code revert.
preflight_result: no_breach
preflight_reason_code: POS_ONBOARDING_REDIRECT_AND_SETUP_MODAL_FIX
preflight_run_at: 2026-07-06T17:10:00Z
preflight_request_ref: DGFY-101-POS-REDIRECT-2026-07-06
---

# DGFY Business Registration/Account POS Redirect + Storefront Setup Modal Fix

## Compliance Impact Classification

Major (surface-driven minimum). This slice changes where users land after registering
or opening a business (POS terminal onboarding instead of IMS/SKUpervisor) and fixes a
UI/validation bug in the POS terminal's storefront-setup onboarding step. It does not
change payment processing, fiscal computation, tax calculation, or compliance policy
evaluation logic.

## Affected Surfaces

1. `frontend/src/features/pos/components/PosTenantSetupModal.jsx` — fixes the storefront
   setup step's "Next Step" button getting stuck until a page refresh (the readiness check
   now also honors an already-known `primaryLocationId`, not only the local draft), and
   replaces the red-text "Required/Complete" checklist with red-highlighted required-field
   panels plus asterisks, only shown after a failed "Next Step" attempt.
2. `frontend/Pages/RegisterCompany.jsx`, `frontend/src/features/dgfyRouteHelpers.js` — after
   a company is registered and its tenant session is established, the user is redirected to
   `<pos-host>/terminal?setup_flow=tenant_onboarding&setup_step=storefront_setup` instead of
   back into the IMS/SKUpervisor app root. `resolvePosTerminalUrl` now resolves the POS host
   via `VITE_POS_TERMINAL_URL` or a `pos.` subdomain swap, matching the existing `pos.`/
   `skupervisor.`/`store.` swap pattern already used elsewhere in this codebase.
3. `frontend/apps/store/src/Components/storefront/pages/DgfyCustomerAccountPage.jsx`,
   `frontend/apps/store/src/StorefrontApp.jsx`, `frontend/apps/store/src/businessRegistrationUrl.js` —
   the storefront account page's business action button ("Go to Inventory") is replaced with
   "Go to POS", opening the same POS terminal onboarding URL in a new tab after establishing
   the tenant session, instead of navigating the current tab into IMS.
4. `infrastructure/docker/frontend/Dockerfile` — passes the new `VITE_POS_TERMINAL_URL` build
   arg through to the frontend build, matching the existing pattern for the other `VITE_*_URL`
   build args already wired here.

## Compliance Preconditions

1. No payment gateway, charge authorization, refund, or settlement flow is modified.
2. No VAT, service charge, DGFY fee, receipt numbering, or fiscal receipt calculation logic is
   modified.
3. Tenant session establishment (`startDgfyTenantSession` / the account-switch endpoint) is
   unchanged; only the post-session navigation target changes (POS instead of IMS).
4. POS Settings PIN protection and existing storefront-setup required-field rules (company
   icon, cover image, primary business location) are unchanged in substance — only their
   readiness check and visual presentation are fixed/reworked.

## Verification Evidence

- `npm --prefix frontend test -- --run` (full frontend suite: 779/779 passing)
- `npm --prefix frontend run lint` (0 errors; no new warnings introduced by this change)

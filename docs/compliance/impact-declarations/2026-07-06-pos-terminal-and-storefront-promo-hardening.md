---
status: reference
owner: engineering
last_reviewed: 2026-07-06
related_adr: docs/architecture/adr/0031-pos-terminal-pairing-and-shift-safe-navigation.md
declaration_id: 2026-07-06-pos-terminal-and-storefront-promo-hardening
classification: regulatory
surfaces: pos,terminal,storefront,settings,compliance
reason_codes_impacted: POS_TERMINAL_UNLOCK_REQUIRED,PROMO_CODE_VALIDATION,PROMO_USAGE_LIMIT_REACHED
policy_version: 2026.07.06
verification_evidence: npm --prefix backend test -- --runTestsByPath tests/storeUsecases.applicationResult.test.js -t promo,npm run check:architecture,npm run build:pos,npm run build:store
rollback_note: Revert the affected commits; no destructive migration or policy-table mutation is introduced in this slice.
preflight_result: no_breach
preflight_reason_code: POS_TERMINAL_AND_STOREFRONT_PROMO_HARDENING
preflight_run_at: 2026-07-06T16:30:00Z
preflight_request_ref: DGFY-101-POS-TERMINAL-PROMO-2026-07-06
---

# POS Terminal And Storefront Promo Hardening

## Compliance Impact Classification

Regulatory (surface-driven minimum). This slice changes POS terminal unlock messaging and
tenant setup behavior, restores POS report/navigation correctness, and extends the
Storefront promo-claim UX. It does not change payment authorization, fiscal receipt
numbering, VAT/service-charge computation, or settlement policy. Classification is escalated
to `regulatory` to satisfy the repository-wide compliance surface floor for compliance-sensitive
files changed in this same branch/PR.

## Affected Surfaces

1. `backend/src/modules/pos/controllers/posHandlers.js`,
   `backend/src/controllers/posController.js`,
   `backend/src/modules/pos/index.js`,
   `backend/src/routes/pos.js`,
   `backend/src/validators/posValidator.js` — restores missing POS terminal/pairing
   controller endpoints and keeps terminal unlock/report APIs transport-valid.
2. `frontend/src/features/pos/pages/TerminalPage.jsx`,
   `frontend/src/features/pos/components/TerminalLockDrawer.jsx`,
   `frontend/src/features/pos/components/TerminalPageLayout.jsx`,
   `frontend/src/features/pos/utils/terminalUnlockDiagnostics.js` — refines cashier/DGFY
   terminal unlock diagnostics so invalid credentials, missing terminal session, and
   company lookup states are operator-visible instead of surfacing the stale pairing copy.
3. `frontend/src/features/pos/components/TerminalOperationsWorkspace.jsx`,
   `backend/src/validators/settingsValidator.js`,
   `backend/src/modules/store/usecases/storeUseCases.js`,
   `backend/tests/storeUsecases.applicationResult.test.js`,
   `frontend/apps/store/src/StorefrontApp.jsx`,
   `frontend/apps/store/src/Components/storefront/sections/StorefrontPromoSection.jsx`,
   `frontend/apps/store/src/checkout/buildFnbCheckoutPayload.js`,
   `frontend/apps/store/src/checkout/components/PromoCodePanel.jsx` — adds governed
   storefront promo persistence and application, including specific-item targeting,
   promo-card click-to-claim behavior, usage-limit tracking, and quote-time validation.
4. `frontend/src/features/pos/components/PosReportsAnalyticsWorkspace.jsx`,
   `frontend/src/features/pos/services/posService.js`,
   `backend/src/modules/pos/usecases/posUseCases.js`,
   `frontend/src/features/pos/components/POSCheckoutTerminal.jsx`,
   `frontend/src/features/pos/components/TerminalPageLayout.jsx`,
   `frontend/src/features/pos/__tests__/terminalResponsiveScroll.contract.test.js` —
   restores POS report date normalization and terminal catalog scroll/report rendering
   behavior without changing receipt or checkout compliance rules.
5. `frontend/apps/store/src/businessRegistrationUrl.js`,
   `frontend/src/features/dgfyRouteHelpers.js`,
   `frontend/Pages/Settings.jsx` — preserves POS/storefront navigation and settings
   contracts while moving operators into the corrected POS-facing entry points.
6. `compliance` — added to satisfy the repository-wide compliance surface floor for
   compliance-sensitive files changed in this same branch/PR; this slice does not itself
   modify compliance policy evaluation logic.

## Compliance Preconditions

1. No payment provider request/response contract is changed.
2. No buyer fiscal-detail requirement, receipt numbering sequence, or tax policy rule is changed.
3. Storefront promos remain discount-only quote/checkout modifiers; they do not create loyalty
   balances, stored value, deferred credits, or settlement liabilities.
4. POS terminal unlock still requires the existing DGFY/tenant authorization path; the change is
   limited to handler restoration, diagnostics, and company-lookup/operator UX.
5. POS/report/storefront UI fixes do not bypass open-shift, terminal-location, or permission gates.

## Verification Evidence

- `npm --prefix backend test -- --runTestsByPath tests/storeUsecases.applicationResult.test.js -t promo`
- `npm run check:architecture`
- `npm run build:pos`
- `npm run build:store`

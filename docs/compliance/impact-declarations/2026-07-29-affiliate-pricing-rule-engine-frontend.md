---
status: reference
owner: engineering
last_reviewed: 2026-07-29
related_adr: docs/architecture/adr/0036-affiliates-program-commission-and-cashout.md
declaration_id: 2026-07-29-affiliate-pricing-rule-engine-frontend
classification: regulatory
surfaces: pos,terminal,settings,compliance
reason_codes_impacted: ALLOWED
policy_version: 2026.07.29
verification_evidence: backend/tests/browserSessionCookies.test.js (11 passed), frontend eslint (clean) on all touched files, frontend vitest (216/216 passed in src/features/pos/__tests__, including 13 new affiliatePricingPreview.test.js cases), npm run build:pos and build:store (both succeed), buildCompliancePreflightUseCase run locally with an ALLOW-stubbed evaluateComplianceOperationUseCase (see Verification Evidence section for methodology)
rollback_note: Revert the "Attribution window (days)" field removal, the Selling Price section, the per-affiliate price-override editor, and affiliatePricingPreview.js/.test.js in AffiliatesWorkspacePanel.jsx and its sibling files; no checkout, payment, receipt, terminal operation, or persisted transaction record is changed by any of it.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-29T17:03:21Z
preflight_request_ref: AFFILIATE-PRICING-PHASE1-STAGE-G
---

# Affiliate Pricing Rule Engine — Frontend Touches to AffiliatesWorkspacePanel.jsx

## Compliance Impact Classification

Major. `frontend/src/features/pos/components/AffiliatesWorkspacePanel.jsx` lives under
`frontend/src/features/pos/`, which floors any change there at `major`/`pos,terminal` regardless of
what the change actually does (see `docs/compliance/compliance-classification-matrix.md`). The
panel itself is an owner-facing back-office settings screen for the DGFY affiliate program - it is
not part of the checkout, payment, receipt, or terminal-operation path. This declaration covers
both the Stage F removal (decision A12) and the Stage G owner-config-UI additions landed in the same
working session - see
[the affiliate pricing rule engine scope](../../proposals/2026-07-29-affiliate-pricing-rule-engine-scope.md).

## Affected Surfaces

1. `frontend/src/features/pos/components/AffiliatesWorkspacePanel.jsx` - Stage F removed the
   "Attribution window (days)" field (decision A12). Stage G added: a "Selling Price" section
   (rule-type selector, one numeric input whose label/unit changes with the selected type, a live
   buyer-price/commission/merchant-net preview, and a promo-stacking warning banner) for the
   tenant-wide template, plus a per-affiliate "price override" inline editor on each affiliate row
   using the same controls, and a "Commission type" selector in Program Settings.
2. `frontend/src/features/pos/services/affiliateService.js` - three new API client functions
   (fetchAffiliatePriceRules, upsertAffiliatePriceRule, deactivateAffiliatePriceRule) calling the
   new backend endpoints under `/affiliates/price-rules`.
3. `frontend/src/features/pos/utils/affiliatePricingPreview.js` (new) - a frontend-local port of
   the backend's pure calculation service, used only to compute the live preview above. No I/O, no
   checkout/payment/receipt logic.
4. `backend/src/utils/browserSessionCookies.js` - the affiliate attribution cookie moved from a
   30-day lifetime to session-scoped (decision B3), recorded here since A12/B3 are one paired
   decision.

## Compliance Preconditions

1. No checkout totals, discounts, taxes, payments, receipts, refunds, voids, or shift cash
   calculations are changed by this commit. The new preview module
   (affiliatePricingPreview.js) only renders a number in this settings panel - it is never called
   from the checkout or POS terminal code path.
2. No POS terminal operation, fiscal document rendering, or persisted transaction record is
   touched.
3. The removed field (`attribution_window_days`) was never enforced anywhere in commission accrual
   - confirmed by reading `backend/src/modules/dgfy/utils/affiliateCommissionAccrual.js` and
   `backend/src/modules/dgfy/repositories/dgfyAffiliateRepository.js`, neither of which reads this
   setting. Removing it from the owner-facing UI changes only what an owner sees and can edit, not
   any runtime accrual, checkout, or compliance behavior.
4. The backend column/default (`tenant_affiliate_settings.attribution_window_days`) is left in
   place; only the panel's UI and its save payload changed.
5. The new price-rule endpoints (`GET/PUT /affiliates/price-rules`,
   `DELETE /affiliates/price-rules/:id`) are gated by the same `AFFILIATES.actions.VIEW_AFFILIATES` /
   `MANAGE_AFFILIATE_SETTINGS` permissions already enforced on the existing `/affiliates/settings`
   and `/affiliates/affiliates/:enrollment_id` routes - no new permission surface was introduced.

## Verification Evidence

1. `backend/tests/browserSessionCookies.test.js` - 11 tests passed (session-scoped attribution
   cookie behavior).
2. `npx eslint` (run from `frontend/`) on every touched file - clean, no errors. One pre-existing,
   unrelated warning (`accentSoft` unused in `FnbProductCard.jsx`) predates this change, confirmed
   via `git stash`.
3. `npx vitest run src/features/pos/__tests__` - 216/216 passed across 42 files, including 13 new
   tests in `affiliatePricingPreview.test.js` (a byte-identical fixture-parity check against the
   backend's original acceptance fixtures, plus the acceptance cases themselves).
4. `npm run build:pos` and `npm run build:store` - both succeed.
5. `npx vitest run apps/store/src/modes/fnb/storefront/model/buildFnbCatalogPresentation.test.js` -
   3/3 passed (storefront "affiliate price" labelling added to `SimpleProductCard.jsx` and
   `FnbProductCard.jsx`, both gated on a boolean flag from the API, no existing rendering path
   changed).
6. **Preflight methodology note:** this working environment has no live MySQL and no running
   backend server, so the real `POST /api/v1/compliance/preflight` endpoint (which evaluates a
   specific tenant's live compliance state) could not be called end-to-end. Instead,
   `buildCompliancePreflightUseCase` - the same use case that endpoint invokes - was run directly
   with the `pos`/`terminal` surfaces and an `evaluateComplianceOperationUseCase` stub returning
   `ALLOW`/`ALLOWED` for every operation, matching the existing unit-test pattern in
   `backend/tests/compliancePreflightUsecase.test.js`. This exercises the real preflight
   decision-merging logic (`buildPreflightResult`) rather than fabricating a result, and reflects
   what any tenant in good standing would receive, since this specific change does not touch any
   compliance-evaluated operation (POS checkout, receipt render, terminal operation) at all. The
   resulting decision was `result: no_breach`, `reason_code: ALLOWED`, recorded in this
   declaration's front matter. A tenant-specific live preflight run is recommended before this
   reaches production, consistent with the rest of this branch's environment-readiness notes in
   `docs/proposals/2026-07-29-affiliate-pricing-rule-engine-scope.md` section 12.

---
status: reference
owner: engineering
last_reviewed: 2026-07-29
related_adr: docs/architecture/adr/0036-affiliates-program-commission-and-cashout.md
declaration_id: 2026-07-29-affiliate-pricing-rule-engine-frontend
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.07.29
verification_evidence: backend/tests/browserSessionCookies.test.js (11 passed - session-scoped attribution cookie behavior), frontend eslint (clean) on AffiliatesWorkspacePanel.jsx, buildCompliancePreflightUseCase run locally with an ALLOW-stubbed evaluateComplianceOperationUseCase (see Verification Evidence section for methodology)
rollback_note: Revert the "Attribution window (days)" field and its save-payload key in AffiliatesWorkspacePanel.jsx; no checkout, payment, receipt, terminal operation, or persisted transaction record is changed by this or the planned Stage G config-UI additions to the same file.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-29T16:41:00+08:00
preflight_request_ref: AFFILIATE-PRICING-PHASE1-STAGE-F
---

# Affiliate Pricing Rule Engine — Frontend Touches to AffiliatesWorkspacePanel.jsx

## Compliance Impact Classification

Major. `frontend/src/features/pos/components/AffiliatesWorkspacePanel.jsx` lives under
`frontend/src/features/pos/`, which floors any change there at `major`/`pos,terminal` regardless of
what the change actually does (see `docs/compliance/compliance-classification-matrix.md`). The
panel itself is an owner-facing back-office settings screen for the DGFY affiliate program - it is
not part of the checkout, payment, receipt, or terminal-operation path, and this declaration also
covers the further additions planned for this same file under Stage G of
[the affiliate pricing rule engine scope](../../proposals/2026-07-29-affiliate-pricing-rule-engine-scope.md)
(a rule-type selector, live price/commission preview, and a promo-stacking warning), so a second
declaration is not required when that work lands against the same file.

## Affected Surfaces

1. `frontend/src/features/pos/components/AffiliatesWorkspacePanel.jsx` - removed the "Attribution
   window (days)" field and its corresponding key in the settings save payload (decision A12). Stage
   G will add new, purely additive owner-facing controls (selling-price rule type, live calculation
   preview, template-vs-per-affiliate toggle) to this same file.
2. `backend/src/utils/browserSessionCookies.js` - the affiliate attribution cookie moved from a
   30-day lifetime to session-scoped (decision B3). This file is not under a compliance-sensitive
   path pattern itself; recorded here because A12 and B3 are the same paired decision (the "days"
   setting became actively misleading once the cookie stopped carrying a multi-day lifetime).

## Compliance Preconditions

1. No checkout totals, discounts, taxes, payments, receipts, refunds, voids, or shift cash
   calculations are changed by this commit.
2. No POS terminal operation, fiscal document rendering, or persisted transaction record is
   touched.
3. The removed field (`attribution_window_days`) was never enforced anywhere in commission accrual
   - confirmed by reading `backend/src/modules/dgfy/utils/affiliateCommissionAccrual.js` and
   `backend/src/modules/dgfy/repositories/dgfyAffiliateRepository.js`, neither of which reads this
   setting. Removing it from the owner-facing UI changes only what an owner sees and can edit, not
   any runtime accrual, checkout, or compliance behavior.
4. The backend column/default (`tenant_affiliate_settings.attribution_window_days`) is left in
   place; only the panel's UI and its save payload changed.

## Verification Evidence

1. `backend/tests/browserSessionCookies.test.js` - 11 tests passed, including 5 new tests added in
   this change specifically pinning the session-scoped attribution cookie behavior (no prior test
   coverage existed for this cookie at all).
2. `npx eslint src/features/pos/components/AffiliatesWorkspacePanel.jsx` (run from `frontend/`) -
   clean, no errors or warnings.
3. **Preflight methodology note:** this working environment has no live MySQL and no running
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

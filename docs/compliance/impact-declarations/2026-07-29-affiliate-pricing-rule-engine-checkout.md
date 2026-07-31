---
status: reference
owner: engineering
last_reviewed: 2026-07-29
related_adr: docs/architecture/adr/0050-affiliate-buyer-facing-pricing-rule-engine.md
declaration_id: 2026-07-29-affiliate-pricing-rule-engine-checkout
classification: regulatory
surfaces: payments,pos,terminal,settings,compliance
reason_codes_impacted: ALLOWED
policy_version: 2026.07.29
verification_evidence: backend/tests/storeCheckoutAffiliatePricing.unit.test.js (9 passed), backend/tests/affiliateCommissionAccrual.unit.test.js (29 passed, including 4 new resolvedCommission/snapshot override cases), backend/tests/affiliatePricingPolicy.unit.test.js (29 passed, all external acceptance-pack cases), full backend affiliate-prefixed suite (176/183 passed - 7 pre-existing unrelated failures confirmed via git stash), buildCompliancePreflightUseCase run locally with an ALLOW-stubbed evaluateComplianceOperationUseCase
rollback_note: Revert storeUseCases.js's affiliate pricing integration (resolveAffiliatePricingForCheckout, the affiliateSellingPriceRule parameter on prepareCheckoutLines, and the accrual call site's commission_base_mode branching); checkout reverts to charging the catalog price and accruing on subtotal-minus-discount for every tenant, identical to pre-Phase-1 behavior.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-29T17:10:00Z
preflight_request_ref: AFFILIATE-PRICING-PHASE1-CHECKOUT
---

# Affiliate Pricing Rule Engine — Storefront Checkout Financial Impact

## Compliance Impact Classification

Major, self-classified as `payments` surface. This declaration is written even though
`scripts/check-compliance-impact.js`'s path matrix does not floor
`backend/src/modules/store/usecases/storeUseCases.js` at any classification — no rule in
`docs/compliance/compliance-classification-matrix.md` currently covers storefront checkout
financial logic (only `backend/src/modules/pos/**`, `backend/src/modules/payments/**`, and a handful
of settings/tenant paths are matched). That is a real coverage gap in the matrix, noted here rather
than used as a reason to skip documentation: this change alters VAT computation, the DGFY 1%
convenience fee base, and commission accrual on real storefront orders, which is squarely
money-affecting even though no automated gate currently requires a declaration for it.

`pos,terminal` is also declared here, alongside `payments`, because
`scripts/check-compliance-impact.js` requires every declaration in a changeset to state the full
set of surfaces the changeset touches, not only the surfaces its own file happens to affect. The
`pos`/`terminal` floor comes from this PR's `frontend/src/features/pos/**` changes, covered
in-depth by the companion declaration
(`2026-07-29-affiliate-pricing-rule-engine-frontend.md`) — this file's own subject matter (storefront
checkout financial math) does not itself touch POS or terminal code.

## Affected Surfaces

1. `backend/src/modules/store/usecases/storeUseCases.js` - `prepareCheckoutLines` now applies an
   affiliate's selling-price rule to the buyer-facing unit price when attribution is present, and
   adds a parallel `baseSubtotalAmount` (pre-affiliate-rule catalog subtotal). The checkout accrual
   call site now branches on `commission_base_mode` and resolves NONE/PERCENTAGE_OF_BASE/
   RESELLER_MARGIN commission types.
2. `backend/src/modules/dgfy/utils/affiliateCommissionAccrual.js` - `resolvedCommission`/`snapshot`
   optional parameters, additive and omitted by the in-store POS accrual path.
3. `backend/migrations/20260729000003-add-affiliate-price-rules.cjs` - new
   `dgfy_affiliate_price_rules` table and additive columns on three existing landlord tables.

## Compliance Preconditions

1. **VAT.** `vatableSales` derives from `line_subtotal`, which now reflects the affiliate-adjusted
   price when a rule is active. This is correct per BIR (VAT is computed on the price actually
   paid), not a compliance violation - stated explicitly in
   [ADR 0050](../../architecture/adr/0050-affiliate-buyer-facing-pricing-rule-engine.md) consequence
   1 so it is not mistaken for one.
2. **No fiscal document renderer, receipt template, or POS terminal path is touched.** Phase 1 is
   storefront-only; `backend/src/modules/pos/usecases/posUseCases.js:2548` (the in-store price
   resolution site) is unmodified, verified by the checkout integration test suite exercising only
   the storefront checkout path.
3. **Every new code path is additive and defaults to today's behavior.** `commission_base_mode`
   defaults to `discounted_subtotal` (today's formula, generalized); no affiliate price rule exists
   for a tenant until an owner explicitly creates one via the new `/affiliates/price-rules`
   endpoints. A tenant that never configures a rule sees byte-identical checkout math to before this
   change - proven directly by `storeCheckoutAffiliatePricing.unit.test.js`'s "no affiliate
   attribution (regression baseline)" test.
4. **Pricing fails closed; accrual stays best-effort.** An unresolvable or negative affiliate price
   blocks checkout (`AFFILIATE_PRICE_UNRESOLVED`/`AFFILIATE_NEGATIVE_PRICE`/
   `AFFILIATE_BELOW_COST_FLOOR`) rather than silently charging an unintended price. A commission
   accrual failure is caught and logged without failing the checkout that already committed,
   unchanged from ADR 0036's convention.

## Verification Evidence

1. `backend/tests/storeCheckoutAffiliatePricing.unit.test.js` - 9 tests, mocking
   `dgfyAffiliateRepository.js` at the module level via `jest.unstable_mockModule`: the no-attribution
   regression baseline, a price-rule-driven buyer price change, the fail-closed path, both
   `commission_base_mode` branches, all three commission types, and two enrollment-resolution edge
   cases (revoked enrollment, disabled program).
2. `backend/tests/affiliateCommissionAccrual.unit.test.js` - 29 tests, including 4 new cases for the
   `resolvedCommission`/`snapshot` override mechanism, and the pre-existing characterization tests
   proving the default (no-override) path is unchanged.
3. `backend/tests/affiliatePricingPolicy.unit.test.js` - 29 tests, every acceptance case from the
   external spec pack's `04-acceptance-tests.md` (cases 1-14).
4. Full affiliate-prefixed backend suite: 176/183 passed across 12 files. The 7 failures are in
   `storeFnbModifiers.usecases.test.js` and are confirmed pre-existing and unrelated via `git stash`
   against unmodified code (a storefront-hours test environment quirk).
5. **Preflight methodology note:** identical to the companion frontend declaration
   (`2026-07-29-affiliate-pricing-rule-engine-frontend.md`) - no live MySQL or running backend is
   reachable in this environment, so `buildCompliancePreflightUseCase` was run directly with an
   ALLOW-stubbed operation evaluator rather than fabricating a result. A tenant-specific live
   preflight, and the migration run against live MySQL, remain required before production per
   `docs/proposals/2026-07-29-affiliate-pricing-rule-engine-scope.md` section 12.

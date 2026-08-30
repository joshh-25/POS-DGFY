---
status: reference
owner: engineering
last_reviewed: 2026-09-01
declaration_id: 2026-09-01-affiliate-per-category-commission-rates
classification: major
surfaces: pos,terminal,payments
reason_codes_impacted: none
policy_version: 2026.09.01
verification_evidence: apps/dgfy-api/tests/affiliateCategoryRates.unit.test.js (16 passed, new),apps/dgfy-api/tests/affiliateEarningsCap.unit.test.js (unmodified, passed),apps/dgfy-api/tests/affiliateCommissionAccrual.unit.test.js (unmodified, passed),apps/dgfy-api/tests/storeCheckoutAffiliatePricing.unit.test.js (unmodified, passed),node --check on every changed .js/.cjs file
rollback_note: Revert this commit. The new dgfy_affiliate_category_rates table and the category_rates_enabled column may be left in place (both inert — category_rates_enabled defaults false) or dropped via the migration's down(). No data cleanup — commissions accrued under either behavior are valid rows.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-01T00:00:00Z
preflight_request_ref: NOT-EXECUTED-448-AFFILIATE-CATEGORY-RATES
---

# Per-Category Affiliate Commission Rates

## Compliance Impact Classification

`major`, `pos`/`terminal` + `payments` surfaces, per `scripts/check-compliance-impact.js`'s two rules:
`^apps/dgfy-api/src/modules/pos/` (surfaces `['pos','terminal']`, minimum `major`) and
`^apps/dgfy-api/src/modules/store/` (surfaces `['payments']`, minimum `major`). This PR touches
both `apps/dgfy-api/src/modules/pos/usecases/posUseCases.js` and
`apps/dgfy-api/src/modules/store/usecases/storeUseCases.js` — unlike Phase 208 (Affiliate Lifetime
Earnings Cap, #449), which stayed entirely under `modules/dgfy/**`/`models/Landlord/**`/
`migrations/**` and was correctly declaration-free. This phase is not exempt the same way: the
worker must not copy Phase 208's "declaration-free" conclusion.

## Affected Surfaces

1. `apps/dgfy-api/src/modules/pos/usecases/posUseCases.js` — one read-only snapshot field
   (`folder_id_snapshot`) added to `preparedLines`' push, and the post-commit affiliate accrual
   call now also passes `commissionLines` (per-line folder id + weight). Both are additive; no
   existing field, response shape, or checkout math changes.
2. `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js` — two read-only snapshot fields
   (`folder_id_snapshot`, `base_line_subtotal`) added to `prepareCheckoutLines`' push;
   `resolveAffiliatePricingForCheckout` now also returns `categoryRates` and `fallbackRateBps`; the
   post-commit accrual block's `PERCENTAGE_OF_BASE` branch now builds per-line weights and calls
   `computeCategoryAwareCommission` instead of a single-rate calculation. All additive/read-only;
   no buyer-facing price, discount, VAT, or total math changes.
3. `apps/dgfy-api/src/modules/dgfy/utils/affiliateCommissionAccrual.js` — four new pure/async
   exports (the category-rate resolution ladder) plus an optional `commissionLines` parameter on
   both accrual functions. `resolveCommissionRateBps`'s existing signature and every existing call
   site are unchanged.
4. New table `dgfy_affiliate_category_rates` (landlord DB) and a new
   `tenant_affiliate_settings.category_rates_enabled` boolean column, both gated inert by default
   (see Precondition 3).
5. Three new admin endpoints (`GET/PUT /category-rates`, `DELETE /category-rates/:id`) mirroring
   the existing `/price-rules` endpoints — backend only, no frontend file touched.

## Compliance Preconditions

1. **No buyer-facing price, discount, VAT, or total math changes.** `prepareCheckoutLines`'s price
   resolution, `netItemsTotal`, `discountAmount`, `governedCalculation`, and every
   `return ok({...})` payload are untouched on both channels. The only additions to
   `preparedLines` are read-only snapshot fields (`folder_id_snapshot`, `base_line_subtotal`)
   consumed solely by post-commit accrual — never read by any pricing or receipt code path.
2. **The POS change is entirely inside the existing post-commit, best-effort accrual block**
   (already wrapped in `try/catch`, already unable to fail a committed sale — see
   `posUseCases.js`'s existing "Best-effort, post-commit" comment). The storefront change is
   entirely inside the equivalent post-commit accrual block, same guarantee.
3. **`commissionableBaseCentavos` is unchanged on both channels.** The per-line split allocates
   that same number via largest-remainder allocation and re-sums to it exactly — see
   `computeCategoryAwareCommission`'s step 1 (uniform-rate collapse), which is the byte-identical
   pre-Phase-209 formula. With `category_rates_enabled = false` (every existing tenant today) or no
   matching category rows, every cart resolves to a uniform rate and takes that identical path —
   the new code is not merely equivalent to the old one, it is *not entered*. Zero added queries
   for every tenant that hasn't opted in (mirrors Phase 208's own bar, and the
   `commission_base_mode` gating precedent from Phase 1).
4. **Idempotency unchanged.** Still exactly one row per `(tenant_id, order_reference)` — no unique
   index change, no write-path change to `createEarnedCommissionIfMissing` /
   `createPendingCommissionIfMissing`.
5. **Senior/PWD (governed discount) sales explicitly analyzed.** On POS's governed-discount
   branch, `sum(line_subtotal) != commissionableBaseCentavos` because VAT is separately removed
   there (`posUseCases.js`'s governed `netItemsTotal` computation) — this is precisely why
   `commissionLines`' `weightCentavos` values are used as **relative weights only**, via
   largest-remainder allocation of the unchanged `commissionableBaseCentavos`, never as absolute
   bases. Using line amounts as absolute bases would silently change the commission total on every
   senior/PWD sale; the allocation is what keeps the parts summing exactly to the unchanged whole
   regardless of what the weights themselves sum to.
6. **The blended `rate_bps_snapshot` on a mixed-category order is no longer exactly invariant**
   with `amount ≡ round(base × rate / 10000)` (it can be off by a few centavos from the blended
   round-trip, by construction of the per-line allocation). This does not break Phase 208's
   earnings cap, which compares the computed `amount` directly — but a future reader must not
   assume the single-rate invariant still holds exactly on a mixed-category row. Recorded here and
   in the ledger entry per the plan's own instruction, not left implicit.
7. **Enrollment-override / category-rate shadowing is rejected at write time, not silently
   accepted.** The upsert endpoint 422s (`AFFILIATE_CATEGORY_RATE_SHADOWED_BY_OVERRIDE`) an attempt
   to create an enrollment-scoped category rate on an affiliate who already has
   `commission_rate_bps` set — that combination would be dead config (the enrollment override
   always wins outright), and a fail-closed rejection prevents a merchant believing a rate is
   configured when it can never fire.

## Verification Evidence

1. `apps/dgfy-api/tests/affiliateCategoryRates.unit.test.js` — new file, 16/16 tests passed: pure
   resolver precedence (3), the full ladder including the A7 zero-query guarantee (4), the §5.2
   multi-category allocation algorithm including the exact mixed-cart arithmetic and the
   uniform-rate byte-identical collapse (5), and wiring into `accrueEarnedForInStoreSale` including
   the Phase 208 cap interaction on a blended amount (4).
2. `apps/dgfy-api/tests/affiliateEarningsCap.unit.test.js` and
   `apps/dgfy-api/tests/affiliateCommissionAccrual.unit.test.js` — both pass **unmodified**,
   confirming the collapse in §5.2 step 1 holds (per the plan's own instruction: if either needed
   an edit, the collapse would be broken).
3. `apps/dgfy-api/tests/storeCheckoutAffiliatePricing.unit.test.js` — 13/13 tests pass unmodified,
   confirming the storefront accrual rewiring is behavior-preserving for every existing case.
4. `node --check` on every changed `.js`/`.cjs` file (this app has no real build step) — all
   passed.
5. **Preflight methodology note:** `preflight_request_ref` is `NOT-EXECUTED-*` because this PR
   targets `develop`. Per `docs/compliance/request-time-preflight-protocol.md`, the live preflight
   sweep runs once per batch at the `develop → staging` promotion, not per-PR — this is expected
   and not a gap in this declaration.

---
status: reference
owner: engineering
last_reviewed: 2026-09-02
related_adr: docs/architecture/adr/0066-voucher-sale-time-price-resolution.md (Decisions 1, 2, 3 --
  preserved, not superseded), docs/architecture/adr/0078-customer-delivery-fee-modes.md (Related
  note on ADR 0066 Decision 8, cited by this change's header comment)
declaration_id: 2026-09-02-voucher-benefit-target-axis
classification: major
surfaces: pos,terminal
reason_codes_impacted: UNKNOWN_BENEFIT_TARGET,BENEFIT_TARGET_CLASS_UNSUPPORTED,INVALID_DELIVERY_FEE_CENTAVOS
policy_version: 2026.09.02
verification_evidence: node --check on both changed/added apps/dgfy-api files (0 errors),apps/dgfy-api/tests/voucherBenefitPolicyDeliveryTarget.unit.test.js (new file -- T1-T15, all 15 new cases passing),full existing voucher regression suite run unmodified: tests/voucherBenefitPolicy.unit.test.js + posVoucherDiscountCalculator.unit.test.js + voucherRedemptionUseCases.usecases.test.js + voucherDisplayUseCases.usecases.test.js + storeCheckoutVoucherPromoStacking.unit.test.js + voucherEligibilityPolicy.unit.test.js + voucherFolderScope.unit.test.js + voucherUseCases.usecases.test.js + voucherValidator.test.js + voucherReversalUseCases.usecases.test.js (351 tests total across all 11 suites, all passing, zero edits to any existing *.test.js file or to voucherBenefitCases.json)
rollback_note: Revert this PR's diff. No migration, no model field, no validator change, no
  call-site change -- voucherUseCases.js's applyBenefitConfig and both real call sites
  (voucherRedemptionUseCases.js:147, voucherDisplayUseCases.js:190) are untouched and never pass
  benefitTarget, so they take the 'items' default before and after this change with byte-identical
  output. Reverting removes only the new optional parameter, the new VOUCHER_BENEFIT_TARGETS export,
  and the new test file; no persisted row, schema, or existing caller references anything this PR
  adds.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-01T18:51:27.077Z
preflight_request_ref: PREFLIGHT-33545741502-2026-09-02-VOUCHER-BENEFIT-TARGET-AXIS
---

# Voucher benefit_target axis, items-only default, no DDL (Phase 239, #1326)

## Compliance Impact Classification

**Major.** The only changed source file,
`apps/dgfy-api/src/modules/vouchers/domain/voucherBenefitPolicy.js`, matches
`scripts/check-compliance-impact.js`'s `COMPLIANCE_SENSITIVE_RULES` pattern for
`^apps/dgfy-api/src/modules/vouchers/` at a `major` floor on the `pos`/`terminal` surfaces. This is
also independently a change to shared voucher discount/money math (ADR 0066-governed), which is
exactly the class of change AGENTS.md requires a declaration for regardless of the automated floor.

Per `docs/compliance/request-time-preflight-protocol.md`'s "Where live preflight actually runs"
(#884/#1163/#1248): `preflight_request_ref` carries a `NOT-EXECUTED-*` placeholder, which is the
accepted, expected state for a PR targeting `develop` -- the continuous compliance-preflight sweep
reconciles it to a real run within minutes of merge, not at PR time.

## Scope -- deliberately narrow, no DDL

Per the issue's own title ("items-only default, no DDL") and the Opus planner's scope statement,
exactly two files change:

- `apps/dgfy-api/src/modules/vouchers/domain/voucherBenefitPolicy.js` (modified)
- `apps/dgfy-api/tests/voucherBenefitPolicyDeliveryTarget.unit.test.js` (new)

No migration, no model field, no validator change, no call-site change. `voucherUseCases.js`'s
`applyBenefitConfig` is deliberately untouched -- wiring a persisted `benefit_target` DB column is
out of scope for this ticket (#240).

## Affected Surfaces

1. **`calculateVoucherBenefit`** gains two new optional parameters: `benefitTarget` (defaults to
   `'items'`, a JS-level default only -- there is no `benefit_target` DB column yet) and
   `deliveryFeeCentavos` (only ever read on the `'delivery'` arm). Neither of the two real call sites
   in the repo (`voucherRedemptionUseCases.js:147`, `voucherDisplayUseCases.js:190`) is edited, so
   both take the default and resolve byte-identically to before this change.
2. **New export `VOUCHER_BENEFIT_TARGETS`** -- `Object.freeze(['items', 'delivery'])`, mirroring the
   existing `VOUCHER_BENEFIT_CLASSES` shape. A local `Object.freeze`, not imported from
   `modules/deliveryPricing/` -- keeps this file's zero-imports contract (see its header comment).
3. **Three new validation guards**, mirroring the existing `UNKNOWN_BENEFIT_CLASS` guard:
   `UNKNOWN_BENEFIT_TARGET` (an unrecognized `benefitTarget`), `BENEFIT_TARGET_CLASS_UNSUPPORTED`
   (`benefitTarget: 'delivery'` + `benefitClass: 'fixed_price'` -- rejected outright, since
   `fixed_price` is a per-unit-price pin with no delivery-fee analogue), and
   `INVALID_DELIVERY_FEE_CENTAVOS` (`benefitTarget: 'delivery'` with `deliveryFeeCentavos == null`
   -- fails closed per ADR 0066 Decision 3, rather than silently resolving a missing base to a zero
   waiver; `deliveryFeeCentavos: 0` is legal and distinct from `null` -- a free-delivery tenant has a
   real ₱0 base).
4. **A single shared clamp base, threaded through three sites, not one.** A new local
   `benefitBaseCentavos` (the eligible item subtotal for `'items'`, the delivery fee for
   `'delivery'`) replaces `eligibleSubtotalCentavos` as the base at all three sites that previously
   used it: `resolveRawDiscount`'s `percent_off` arm, its `amount_off` arm, and the final order-level
   clamp. Parameterizing only the final clamp (the one site the issue text names) would produce
   silently wrong money -- a "50% off delivery" voucher would compute 50% of the *item subtotal*
   and only clamp that result to the delivery fee. `resolveRawDiscount`'s corresponding parameter is
   renamed `eligibleSubtotalCentavos` -> `benefitBaseCentavos` (internal-only, the function is not
   exported).
5. **Delivery-targeted benefits carry no per-line component, by construction.** The line-allocation
   `if/else-if/else` gains `benefitTarget === 'delivery'` as its *first*, mutually-exclusive arm
   (an empty block -- deliberately not an `allocateByLargestRemainder` call with zero weights),
   making the two existing per-line write sites (the `fixed_price` arm and the largest-remainder
   arm) structurally unreachable on the delivery path. `lineAllocations` still carries one entry per
   input line with `discountCentavos: 0` and `voucherUnitPriceCentavos === baseUnitPriceCentavos`;
   `belowCostLines` is always `[]` for a delivery-targeted benefit -- a delivery waiver cannot trip
   the below-cost guard by construction, since it never touches a line's price.
6. **Additive return fields**: `benefitTarget` and `benefitBaseCentavos` are added to the returned
   object. Purely additive -- verified no existing caller destructures the object exhaustively.
   `capApplied`'s meaning widens (not renamed) to also cover "the fee ceiling clamped it" on the
   delivery path.

## Compliance Preconditions

1. **ADR 0066 Decision 1 `[binding]` ("a voucher never mutates a persisted unit price") is preserved
   by construction, not by a runtime guard, in both directions** -- this is the core invariant this
   change must not weaken, and it's designed to make an accidental violation structurally
   impossible rather than merely tested-against:
   - *A delivery-targeted voucher can't touch a unit price*: the only mutable per-line money channel
     in the module is the local `perLineDiscounts` array, written in exactly two places (the
     `fixed_price` arm and the largest-remainder arm). The new `benefitTarget === 'delivery'` arm is
     first in the `if/else-if/else` chain, so those two write sites are unreachable on the delivery
     path via mutual exclusion.
   - *An items-targeted voucher can't reach the delivery fee*: `deliveryFeeCentavos` has exactly one
     read site in the whole module (the `benefitBaseCentavos` ternary's `'delivery'` arm). It is
     never passed into `resolveRawDiscount`, never stored on a line, never present on the `'items'`
     path's return shape. Documented on the parameter declaration as an invariant a later refactor
     (e.g. hoisting the fee into `resolveRawDiscount`) must not silently break.
   - *Corollary*: `fixed_price` (the one benefit class defined as a per-unit-price pin) is rejected
     outright for `benefitTarget: 'delivery'` at the top of `calculateVoucherBenefit`, so it can
     never be aimed at a fee that has no units.
2. **ADR 0066 Decision 2 `[binding]` (integer centavos, no floats) preserved trivially** --
   `deliveryFeeCentavos` is normalized through the module's existing `toNonNegativeInteger` helper,
   same as every other money input; no float enters the module on either path.
3. **ADR 0066 Decision 3 (fail-closed on checkout-facing ambiguity) preserved** -- a delivery-target
   benefit with no delivery-fee base throws `INVALID_DELIVERY_FEE_CENTAVOS` rather than silently
   resolving to a zero discount; a caller cannot accidentally waive nothing when it meant to waive
   the whole fee.
4. **Zero regression to the existing voucher benefit surface.** On the `'items'` path,
   `benefitBaseCentavos` is assigned `eligibleSubtotalCentavos` and every downstream expression
   reads the identical value -- the change is a rename plus a ternary whose other arm is
   unreachable unless `benefitTarget: 'delivery'` is explicitly passed. Confirmed by running the
   entire existing voucher test suite (10 files, unmodified) alongside the new file: 351 tests
   total, all passing, zero edits to any existing `*.test.js` file or to the shared
   `voucherBenefitCases.json` fixture file.
5. **New test cases deliberately isolated from the shared fixture file.**
   `voucherBenefitPolicy.unit.test.js` runs an invariant over every entry in
   `fixtures.calculationCases`: `discountCentavos <= eligibleSubtotalCentavos`. A delivery-targeted
   case violates this by design (it clamps to the delivery fee, not the item subtotal), so all 15
   new cases (T1-T15) live in the new, separate file
   `apps/dgfy-api/tests/voucherBenefitPolicyDeliveryTarget.unit.test.js`, with its own
   delivery-shaped invariants (`0 <= discountCentavos <= benefitBaseCentavos`, integer money, zero
   per-line allocation, empty `belowCostLines`) rather than reusing the shared fixture's invariant.
6. **Not user-visible yet, named explicitly.** This ticket's own scope is fully delivered (the axis
   exists, is default-safe, and is unit-tested), but the axis has no persisted `benefit_target`
   column and no call site passes it -- #240 is required before any real voucher can actually be
   configured as delivery-targeted. Downstream ledger/POS semantics
   (`voucherRedemptionUseCases.js:384`, `posVoucherDiscountCalculator`'s `discount_amount` sum) will
   need #240 to account for a delivery-targeted discount; nothing to do here, but named so #240's
   builder doesn't mistake today's items-only behavior there for a bug needing a fix.

## Verification Evidence

See the `verification_evidence` front-matter field for the itemized list. Summary: `node --check`
clean on both changed files; the new file's 15 delivery-target cases (T1-T15, including the
`percent_off`/`amount_off` base-discrimination cases T3/T6 that would silently compute wrong money
under the pre-#1326 single-clamp-site version) all pass; the entire pre-existing voucher domain and
use-case test suite (10 files, 351 tests total across the full run including the new file) passes
unmodified, confirming zero regression on the `'items'` (default) path.

Outstanding before merge:

- **`POST /api/v1/compliance/preflight` has not been executed** -- front matter carries
  `NOT-EXECUTED-1326-VOUCHER-BENEFIT-TARGET-AXIS`, expected on a `develop`-targeting PR per
  `docs/compliance/request-time-preflight-protocol.md`; the continuous sweep reconciles it
  post-merge.
- **`npm run gate:release:local` has not been run** -- this PR's Tier 0/2 self-verification
  (syntax check + a targeted-but-broad test subset covering the entire voucher surface) is scoped
  evidence, not the full local gate; that gate is `promoter`'s job at promotion time, not
  `implement`'s at PR time, per `.agents/skills/implement/SKILL.md`.
- **#240 (the DB column, migration, and real call-site wiring)** is required before any voucher can
  actually be configured `delivery`-targeted in production -- this PR delivers the safe,
  default-preserving domain-layer axis only, per the issue's own scope.

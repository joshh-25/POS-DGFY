---
status: reference
owner: engineering
last_reviewed: 2026-09-02
declaration_id: 2026-09-02-storefront-calculated-and-free-delivery-fee-modes
classification: major
surfaces: payments
reason_codes_impacted: DELIVERY_DISTANCE_OUT_OF_RANGE
policy_version: 2026.09.02
verification_evidence: apps/dgfy-api/tests/storeCheckoutDeliveryFeeThreeEntryPointConsistency.unit.test.js -- actually executed (Jest), 2 passing,apps/dgfy-api/tests/storeCheckoutCalculatedDeliveryFee.unit.test.js -- actually executed (Jest), 13 passing (RF-3 fix, #1377 review: expanded the no-coordinates case into a 4-row matrix -- omitted/null/empty-string/non-numeric),apps/dgfy-api/tests/storeCheckoutDeliveryFeePin.unit.test.js -- actually executed (Jest), 26 passing (RF-2 fix, #1377 review: isValidPinnedDeliveryBreakdown now validates every persisted breakdown field, not just mode/finalFee/calcVersion),apps/dgfy-api/tests/addDeliveryFeeBreakdown.migration.test.js -- actually executed (Jest), 10 passing incl. the sync-tenant-schemas.js DDL drift guard,apps/dgfy-api/tests/deliveryFeePolicy.unit.test.js -- actually executed (Jest), 31 passing incl. the new DELIVERY_FEE_CALC_VERSION case,apps/dgfy-api/tests/deliveryFeeModeConfig.checkoutFallback.unit.test.js -- actually executed (Jest), unmodified, 5 passing (fixed-mode byte-identity regression),apps/dgfy-api/tests/storeCheckoutRoadDistanceCapture.unit.test.js -- actually executed (Jest), 10 passing (RF-4 fix, #1377 review: added an explicit store_delivery_fee_mode:'fixed' fixture variant to the byte-identity parameterized test, alongside the pre-existing absent-config case),apps/dgfy-api/tests/storeCartQuotePreviewNoContactRequired.unit.test.js -- actually executed (Jest), unmodified, regression-clean,apps/dgfy-api/tests/storeCheckoutAffiliatePricing.unit.test.js -- actually executed (Jest), unmodified, regression-clean,apps/dgfy-api/tests/storeCheckoutDownpaymentResolution.unit.test.js -- actually executed (Jest), unmodified, regression-clean,apps/dgfy-api/tests/storeCheckoutInventoryReservation.unit.test.js -- actually executed (Jest), unmodified, regression-clean,apps/dgfy-api/tests/storeCheckoutVoucherPromoStacking.unit.test.js -- actually executed (Jest), unmodified, regression-clean,apps/dgfy-api/tests/storePaymentTruth.unit.test.js -- actually executed (Jest), unmodified, regression-clean,apps/dgfy-api/tests/storeUsecases.applicationResult.test.js -- actually executed (Jest), unmodified, regression-clean,node --check on every changed apps/dgfy-api .js file (this fixup pass),npm run lint:docs -- passed (85 ADRs, 29 governed docs, incl. the ADR 0012 amendment),npm run check:architecture -- passed (52 modules, 537 code files),npm run check:compliance -- confirmed to fail first (listing storeUseCases.js and finalizePaidCommerceSession.js as the sensitive files with no declaration), then pass once this declaration was added
rollback_note: All five pos_transactions columns (delivery_fee_mode/base/waiver/override/calc_version) and the one commerce_payment_sessions column (delivery_fee_breakdown) are additive and nullable/defaulted, droppable with no dependent read path outside this diff -- reverting the commit set restores the pre-237 flat-rate resolver exactly, since resolveDeliveryFeeConfig's output was already being computed-and-discarded before this phase (Phase 233). Orders already persisted at a calculated fee are NOT recomputed by a revert -- the fee they carry stays correct for the money that was actually collected; only the provenance columns and the payment-session pin become unreadable. The quoted-fee pin (commerce_payment_sessions.delivery_fee_breakdown) reverting to NULL degrades a webhook finalization back to a fresh re-resolution -- exactly today's (pre-237) behavior, not a new failure mode.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-02T03:56:16.395Z
preflight_request_ref: PREFLIGHT-33588602895-2026-09-02-STOREFRONT-CALCULATED-AND-FREE-DELIVERY-FEE-MODES
---

# Storefront calculated and free delivery-fee modes (Phase 237, #1329)

## Compliance Impact Classification

Major. `check-compliance-impact.js`'s `COMPLIANCE_SENSITIVE_RULES[2]` floors any diff touching
`apps/dgfy-api/src/modules/store/` at `major`/`payments` -- this phase must touch
`modules/store/usecases/storeUseCases.js`. `modules/commercePayments/usecases/finalizePaidCommerceSession.js`
hits `COMPLIANCE_SENSITIVE_RULES[4]` with the same `major`/`payments` floor -- a second matching
rule, no higher tier. Nothing in this diff touches `modules/compliance/` or
`middleware/compliancePolicy.js`, so the `regulatory` tier is not reached.
`modules/deliveryPricing/` is not in the rule set at all and adds no floor of its own.

Independent of the mechanical floor, `major` is substantively correct: this diff changes **money
persistence** (five new `pos_transactions` columns carrying fee provenance, one new
`commerce_payment_sessions` column carrying the quoted-fee pin) *and* the **totals-formula
derivation** (ADR 0012's `delivery_fee` term is no longer a flat settings read).

`reason_codes_impacted: DELIVERY_DISTANCE_OUT_OF_RANGE` -- unlike Phase 236, this phase introduces
a genuinely new reason code (the ADR 0078 Decision 2 `[binding]` out-of-range hard block). Declaring
`ALLOWED` would be inaccurate.

## What this phase does and does not do

Phase 237 of epic #1321 (Customer delivery pricing) -- the risk gate: the first phase where a
customer-visible storefront price actually changes based on tenant configuration.

- `resolveStoreDeliveryFee` (`storeUseCases.js`) is rewritten from a synchronous flat-fee lookup
  into an `async` function that resolves a full, frozen 10-field breakdown
  (`mode`/`baseFee`/`waiverAmount`/`overrideAmount`/`finalFee`/`distanceMeters`/`distanceSource`/
  `fallbackApplied`/`outOfRange`/`calcVersion`) and wires the Phase 235 calculated-mode formula
  (`computeCalculatedDeliveryFeeCentavos`, `modules/deliveryPricing/domain/deliveryFeePolicy.js`)
  for the first time. `finalFee` is the only field any totals computation reads; the scalar
  `deliveryFee` (`=== delivery.finalFee`) is kept alongside the new `delivery` object so every
  existing money-adjacent call site (cart-quote/checkout/payment-session response and persistence)
  needs no edit to stay correct.
- ADR 0078 Decision 2 `[binding]`'s fail-open-to-fixed is implemented on every named failure
  branch: absent/malformed calc config, an unusable distance (provider down/timeout/non-2xx/
  unmapped/non-delivery/missing coordinates -- all collapsed by the road-distance adapter to
  `distanceSource: 'fallback'` or `'none'`), and a belt-and-suspenders catch around the pure policy
  module's own throw-on-malformed-input contract. None of these branches invents, estimates, or
  interpolates a distance.
- ADR 0078 Decision 2 `[binding]`'s out-of-range hard block is enforced ONLY at the two order-placing
  entry points (checkout, payment-session creation) via a new `enforceDeliveryRange` DI param on
  `resolveCheckoutContext` (mirrors `requireCheckoutContact`'s existing shape) -- thrown as a
  `DomainError`, `statusCode: 422`, `details.reason_code: 'DELIVERY_DISTANCE_OUT_OF_RANGE'`, before
  any total is computed and before any order/session row is written. The cart quote
  (`buildStoreCartQuoteUseCase`) passes `enforceDeliveryRange: false` and instead returns two
  additive response fields, `delivery_out_of_range`/`delivery_distance_meters`, so a shopper can
  still see their cart total.
- Quoted-fee pinning (Wave 0 decision #2 / D2): `buildStoreCheckoutPaymentSessionUseCase` persists
  the WHOLE resolved breakdown (plus a `pinned_at` timestamp) onto the new
  `commerce_payment_sessions.delivery_fee_breakdown` column at session creation.
  `finalizePaidCommerceSession.js` reads it back and passes it through to
  `storeCheckoutUseCase`/`resolveCheckoutContext` as a new server-internal sibling argument,
  `pinnedDeliveryBreakdown` -- never a payload field, same precedent as the existing
  `capturedPayment` argument, and never entering `hashPayload`'s 15 hashed fields, so it cannot
  perturb checkout idempotency and is not client-forgeable. A shape/version-invalid pin (missing
  `mode`, non-finite/negative `finalFee`, or a `calcVersion` mismatch against the current
  `DELIVERY_FEE_CALC_VERSION`) falls through to a fresh resolution, logged at `warn`, never thrown.
  **The pin is advisory-TTL only (60 minutes) and is NEVER hard-invalidated by age** -- past the TTL
  it is still honored, only a `warn` log fires. A hard expiry would produce either a
  paid-but-unfinalizable order (money already captured, refusing to write it) or a silent re-price
  to a number different from what the customer paid; this repo has no rollback mechanism (#495
  open) to lean on if either happened, so honoring a slightly-stale pin is strictly the safer of the
  two available failure modes.
- Five new `pos_transactions` columns capture money provenance on every storefront checkout order:
  `delivery_fee_mode`, `delivery_fee_base`, `delivery_fee_waiver`, `delivery_fee_override`
  (nullable -- `NULL` means no override, `0.0000` means an override that set the fee to zero, never
  conflated), `delivery_fee_calc_version`. `fallbackApplied`/`outOfRange` are deliberately NOT
  persisted -- fully derivable from `delivery_fee_mode = 'calculated' AND delivery_distance_source
  <> 'road'` (plus the config-malformed case), so a derivable boolean never drifts out of sync with
  the columns it's derived from.
- A `warn`-level log fires on every `fallbackApplied: true` (with `{ tenant_id, location_id }`),
  for rollout observability -- a calculated-mode fallback is otherwise invisible to the customer,
  who just sees the fixed rate.
- **Pre-existing correctness fix, found and fixed in this diff**: the road-distance promise's fire
  guard (`resolveCheckoutContext`, unchanged since Phase 236) re-wrapped an already-normalized
  `toNumberOrNull()` coordinate value in a second `Number(...)` call -- `Number(null) === 0`, which
  IS finite, so the guard could never actually detect "no coordinates" for a delivery order; it
  always fired the road-distance provider with fabricated `(0, 0)` coordinates instead. Harmless
  while this capture was observation-only (Phase 236); Phase 237 makes `distanceSource` feed
  calculated-mode fee pricing, so this is fixed here by checking finiteness on the already-normalized
  value directly, without the redundant re-coercion. Also hardened the promise's own `await` site
  with a defensive try/catch (the real adapter is documented to never reject, but this choke point
  now prices money, not just observes, so it no longer trusts that contract blindly).
- POS cashier checkout and POS-created delivery orders (`dispatchOrders`) are entirely unaffected --
  this phase is storefront-only (#1322 decision #6), matching every other Phase 237 boundary.

## Affected Surfaces

- `payments` -- `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js`: the core diff (see
  above). `apps/dgfy-api/src/modules/commercePayments/usecases/finalizePaidCommerceSession.js`:
  reads and passes through the pin. `apps/dgfy-api/src/models/PosTransaction.js` and
  `apps/dgfy-api/src/models/Landlord/CommercePaymentSession.js`: new fields matching the new
  columns (committed as `4ceca26ae`, see Changed Files below). `apps/dgfy-api/src/modules/deliveryPricing/`
  (`index.js`, `domain/deliveryFeePolicy.js`): additive exports only, no logic change to the pure
  policy module itself.
- Not compliance-sensitive by the guardrail's own rule set, named anyway for completeness:
  `apps/dgfy-api/scripts/sync-tenant-schemas.js` (the tenant-schema self-repair entries, committed
  alongside the migrations as `4ceca26ae`) and the two new migration files themselves.

## Compliance Preconditions

- No refund, settlement, capture, or fiscal-document code path is touched. VAT bucketing is
  unchanged -- `store_delivery_fee_vatable` is ADR 0078 Decision 7 / #1347, not this phase.
- The totals formula's *shape* is unchanged:
  `round4(subtotal − promo − voucher + delivery_fee + service_fee)` -- one term's derivation
  changed, no term added, removed, or reordered. Restated in the ADR 0012 amendment dated
  2026-09-02.
- Every tenant on `fixed` mode (i.e. every tenant today) is byte-identical to pre-237 -- cited to
  `deliveryFeeModeConfig.checkoutFallback.unit.test.js` and `storeCheckoutRoadDistanceCapture.unit.test.js`'s
  parameterized distance-invariance regression, both unmodified and still passing, not merely
  asserted.
- ADR 0078 Decision 2 `[binding]` fail-open-to-fixed is exercised on all five failure branches
  (`storeCheckoutCalculatedDeliveryFee.unit.test.js`), and no branch invents a distance.
- ADR 0078 Decision 3 `[binding]` (fixed rate always configured) is *consumed*, not enforced, by
  this phase -- enforcement lives in settings validation, a dependency named explicitly, not
  silently assumed.
- ADR 0078 Decision 6 `[binding]` field-by-field override merge: `locationOverride` stays hardwired
  `null` in every call site this phase adds; the known wholesale-replace divergence is #1346, still
  open, zero live impact, not fixed here.
- New money-provenance columns are additive with defaults describing pre-237 behavior exactly; no
  historical recompute or backfill (ADR 0012 Decision 2, restated in the new amendment).
- The `provider_quoted` mode reaches no persistence surface -- the new `pos_transactions.delivery_fee_mode`
  ENUM deliberately omits it (ADR 0078 Decision 1 `[binding]`: reserved, not accepted).
- The quoted-fee pin is a server-internal sibling argument, never a client payload field, and never
  enters `hashPayload`'s 15 hashed fields -- confirmed by reading `hashPayload`'s call site directly,
  not assumed -- so it is not client-forgeable and cannot perturb checkout idempotency.
- **Named limitation, not omitted**: the cart-quote-to-checkout window is unpinned -- a shopper who
  sees a fee in the cart drawer and submits checkout later can be priced differently if settings
  changed or GraphHopper state changed in between. `storeQuoteSchema` has no `idempotency_key`,
  making this structurally unpinnable in v1; accepted for v1 per Wave 0 decision #7's posture. The
  `roadDistanceProvider`'s 600ms timeout is still the provisional, unmeasured value from Phase 236 --
  now on the pricing path rather than observation-only, both stated, neither silently dropped.

## Verification Evidence

- `storeCheckoutDeliveryFeeThreeEntryPointConsistency.unit.test.js` (new, 2 tests): the ticket's own
  named acceptance evidence -- one frozen payload/settings fixture run through cart quote, checkout,
  and payment-session creation (calculated mode and free mode), asserting the resolved
  `delivery_fee`/`total_amount` are strictly `===` across all three, and that the five persisted
  `pos_transactions` breakdown columns reconcile (`base − waiver === delivery_fee` when `override`
  is `null`). All passing.
- `storeCheckoutCalculatedDeliveryFee.unit.test.js` (new, 10 tests): fail-open-to-fixed on provider
  unavailable/throws/no-coordinates/malformed-calc/absent-calc; the happy-path formula wiring
  (hand-computed against `computeCalculatedDeliveryFeeCentavos` directly, not a re-implementation:
  5400m distance -> ₱97, not the plan's illustrative ₱89 -- the plan's own arithmetic example did
  not match the algorithm's actual output; this declaration and the test both use the algorithm's
  real, verified result); the in-range boundary at exactly `max_distance_km`; and the ADR 0078
  Decision 2 / D6 out-of-range hard block at all three entry points (never at quote, always at
  checkout and payment-session). All passing.
- `storeCheckoutDeliveryFeePin.unit.test.js` (new, 10 tests): the pin mechanism itself (a valid pin
  wins over a fresh resolution regardless of what the provider now returns), the malformed-pin and
  calcVersion-mismatch fall-through paths, the advisory-TTL-is-never-enforcing behavior (a 90-minute-
  old pin is still honored), and `finalizePaidCommerceSession.js`'s own plumbing (reads
  `session.delivery_fee_breakdown`, passes it through verbatim; a pre-Phase-237 session with no
  breakdown passes `null`, unchanged behavior). All passing.
- `addDeliveryFeeBreakdown.migration.test.js` (new, 10 tests): both migrations' idempotence and
  down-migration behavior, plus a drift guard asserting `sync-tenant-schemas.js`'s five DDL strings
  for `pos_transactions` are column-definition-identical to the tenant-fanout migration's own DDL --
  the #860/#639 crash-loop guard. All passing.
- `deliveryFeePolicy.unit.test.js` (1 new case added to the existing suite): the new exported
  `DELIVERY_FEE_CALC_VERSION` constant is the integer `1`. 31/31 passing in the file.
- Fixed-mode regression, both files run UNMODIFIED: `deliveryFeeModeConfig.checkoutFallback.unit.test.js`
  (5 tests) and `storeCheckoutRoadDistanceCapture.unit.test.js` (7 tests, including its own
  parameterized fee-boundary regression across road/large-distance/unavailable provider results).
  Both passing byte-identically -- this is the actual evidence for "every fixed-mode tenant is
  unaffected," not an assertion.
- Whole-suite regression gate, all run UNMODIFIED: `storeCartQuotePreviewNoContactRequired`,
  `storeCheckoutAffiliatePricing`, `storeCheckoutDownpaymentResolution`,
  `storeCheckoutInventoryReservation`, `storeCheckoutVoucherPromoStacking`, `storePaymentTruth`,
  `storeUsecases.applicationResult` -- 105 tests across this group, all passing, none of these
  fixtures inject a `roadDistanceProvider` or a `pinnedDeliveryBreakdown`, so they exercise the
  "falls back to the real singleton / no pin" paths for real, not just by construction.
- `node --check` on every changed/new `apps/dgfy-api` `.js` file and both new
  `apps/dgfy-migration-runner` `.cjs` migration files -- no syntax errors (dgfy-api has no build
  step; this is its Tier 0 equivalent per `.agents/skills/implement/SKILL.md`).
- `npm run lint:docs` -- passed (85 ADRs, 29 governed docs validated, including the ADR 0012
  amendment's front matter and structure).
- `npm run check:architecture` -- passed (52 modules, 537 code files; 92 controller files, no
  unauthorized model imports).
- `npm run check:compliance` -- confirmed to fail first, listing exactly `storeUseCases.js` and
  `finalizePaidCommerceSession.js` as the sensitive files with no declaration, then passed once this
  file was added.

## Changed Files

- `apps/dgfy-api/src/modules/deliveryPricing/index.js`
- `apps/dgfy-api/src/modules/deliveryPricing/domain/deliveryFeePolicy.js`
- `apps/dgfy-api/src/modules/deliveryPricing/README.md`
- `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js`
- `apps/dgfy-api/src/modules/commercePayments/usecases/finalizePaidCommerceSession.js`
- `apps/dgfy-api/tests/storeCheckoutDeliveryFeeThreeEntryPointConsistency.unit.test.js` (new)
- `apps/dgfy-api/tests/storeCheckoutCalculatedDeliveryFee.unit.test.js` (new)
- `apps/dgfy-api/tests/storeCheckoutDeliveryFeePin.unit.test.js` (new)
- `apps/dgfy-api/tests/addDeliveryFeeBreakdown.migration.test.js` (new)
- `apps/dgfy-api/tests/deliveryFeePolicy.unit.test.js`
- `docs/architecture/adr/0012-dgfy-global-convenience-fee-and-ui-brand-separation.md`
- `apps/dgfy-api/tests/storeCheckoutRoadDistanceCapture.unit.test.js` (2026-09-02 amendment, RF-4:
  explicit-fixed-mode fixture variant added -- previously listed above as unmodified, no longer is)
- `apps/dgfy-migration-runner/migrations/20260903000001-add-delivery-fee-breakdown.cjs` (new,
  committed as `4ceca26ae`)
- `apps/dgfy-migration-runner/migrations/20260903000002-add-payment-session-delivery-breakdown.cjs`
  (new, committed as `4ceca26ae`)
- `apps/dgfy-api/scripts/sync-tenant-schemas.js` (committed as `4ceca26ae`)
- `apps/dgfy-api/src/models/PosTransaction.js` (committed as `4ceca26ae`)
- `apps/dgfy-api/src/models/Landlord/CommercePaymentSession.js` (committed as `4ceca26ae`)

Note (updated 2026-09-02, post-merge audit RF-5): the two new migrations
(`apps/dgfy-migration-runner/migrations/20260903000001-add-delivery-fee-breakdown.cjs`,
`apps/dgfy-migration-runner/migrations/20260903000002-add-payment-session-delivery-breakdown.cjs`),
the matching `apps/dgfy-api/scripts/sync-tenant-schemas.js` entries, and the
`PosTransaction.js`/`Landlord/CommercePaymentSession.js` model field additions were a Worker
checkpoint per `.agents/skills/implement/SKILL.md` (this phase is the epic's risk gate, materially
larger than Phase 236's two observation-only columns). That checkpoint was approved via the D5
checkpoint gate and the batch was committed as `4ceca26ae93ee72b9a2070de9c192d793c6eafe4`
("feat(db): add delivery-fee breakdown columns") -- an ancestor of PR #1377's own merge commit
(`4932cda4f600fe93774666cf961e069fb5f6f741`), i.e. it landed on `develop` before that PR merged, not
after. The five files are no longer held pending; they are listed in Changed Files below. This
mirrors the exact posture Phase 236's own declaration took for its migration, now resolved the same
way.

## Amendments

### 2026-09-02: PR #1377 review fixup (RF-1 through RF-4)

`pr-reviewer`'s first pass on this phase's PR (#1377) `BLOCK`ed on three findings; this amendment
records the fixes, all within the same `storeUseCases.js` surface already covered above -- no new
compliance-sensitive module is touched.

- **RF-2 (blocker)**: `isValidPinnedDeliveryBreakdown` previously validated only `mode`/`finalFee`/
  `calcVersion` on a read-back quoted-fee pin -- `baseFee`, `waiverAmount`, `overrideAmount`,
  `distanceMeters`, `distanceSource`, `fallbackApplied`, `outOfRange`, and `pinned_at` were accepted
  unchecked and copied verbatim into the persisted order on webhook finalization. Now every field is
  validated to its actual domain (finite nonnegative money values; `overrideAmount` null-or-finite-
  nonnegative, explicitly distinguishing a real zero override from "no override"; `distanceSource`
  against the closed `road|fallback|none` enum; `distanceMeters` null-or-finite-nonnegative;
  `fallbackApplied`/`outOfRange` as real booleans, not merely truthy; `pinned_at` as a parseable
  timestamp string) -- any single failure still falls through to the existing warn-and-fresh-
  resolution path, never a thrown error, unchanged from the original contract.
- **RF-3 (blocker)**: `toNumberOrNull` (used to normalize `delivery_latitude`/`delivery_longitude`)
  coerced an explicit JSON `null` (and an empty string) straight through `Number(...)`, which
  silently produced a finite `0` -- indistinguishable downstream from a genuine `(0, 0)` coordinate.
  A payload with `delivery_latitude: null` (a realistic client shape) could therefore still pass the
  road-distance provider's call guard and price calculated mode off a fabricated coordinate instead
  of correctly falling back to fixed. Fixed at `toNumberOrNull` itself -- explicit null/undefined/
  empty string all now normalize to `null` (absent) before any numeric coercion -- so every caller of
  `buildNormalizedCheckoutRequest` benefits, not just the road-distance guard.
- **RF-4 (should-fix)**: the fixed-mode byte-identity parameterized regression
  (`storeCheckoutRoadDistanceCapture.unit.test.js`) previously only exercised legacy absent-config
  defaulting. Added a second parameterized variant with an explicit
  `store_delivery_fee_mode: 'fixed'` setting, asserting the same strict `delivery_fee`/
  `total_amount` equality across road-zero/road-large/unavailable-provider distances -- proving a
  tenant who has explicitly set fixed mode is unaffected too, not just one who never touched the
  setting.
- No new `pos_transactions`/`commerce_payment_sessions` columns, no new reason code, no change to
  the totals-formula shape or the classification (`major`/`payments` stands unchanged) -- this
  amendment hardens validation on the same surfaces already declared above, it does not widen them.

Verification for this amendment: `storeCheckoutDeliveryFeePin.unit.test.js` (26 tests, up from 10 --
18 new malformed-pin rows covering every RF-2 field plus a dedicated overrideAmount null-vs-zero
case), `storeCheckoutCalculatedDeliveryFee.unit.test.js` (13 tests, up from 10 -- the no-coordinates
case expanded into a 4-row matrix: omitted/explicit-null/empty-string/non-numeric),
`storeCheckoutRoadDistanceCapture.unit.test.js` (10 tests, up from 7 -- the new explicit-fixed-mode
parameterized variant), all actually executed (Jest), all passing. `node --check` on every file this
amendment touched. `npm run check:compliance`/`check:architecture`/`lint:docs` re-run clean.

## Preflight Reconciliation

`NOT-EXECUTED-1329-CALCULATED-AND-FREE-DELIVERY-FEE-MODES` is expected on a PR targeting `develop`,
not a finding -- per `docs/compliance/request-time-preflight-protocol.md`, "Where live preflight
actually runs," the continuous sweep (`.github/workflows/compliance-preflight-sweep.yml`) triggers
automatically once this declaration lands on `develop` and reconciles this front matter within
minutes, well before any promotion is cut. No live `POST /api/v1/compliance/preflight` call was made
from this session -- no authenticated `SYSTEM.EDIT_SETTINGS` session against a running backend was
available, matching every other `develop`-targeting PR under this protocol.

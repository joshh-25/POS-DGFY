---
status: reference
owner: engineering
last_reviewed: 2026-09-05
declaration_id: 2026-09-05-discovery-delivery-from-price
classification: minor
surfaces: storefront
reason_codes_impacted: none
policy_version: 2026.09.02
verification_evidence: apps/dgfy-api/tests/deliveryFromPrice.unit.test.js -- actually executed (Jest), 14 passing,apps/dgfy-api/tests/deliveryFromPrice.parity.unit.test.js -- actually executed (Jest), 7 passing,apps/dgfy-api/tests/deliveryFeeModeDiscoveryIndexPersistence.contract.test.js -- actually executed (Jest), 6 passing,apps/dgfy-api/tests/addDeliveryFeeModeDiscoveryIndex.migration.test.js -- actually executed (Jest), 6 passing,apps/dgfy-api/tests/storefrontDiscoveryRepository.test.js -- actually executed (Jest), extended + 4 new mode-pair cases, all passing (67 total across the 5 suites),node --check on every changed apps/dgfy-api .js file and the new migration .cjs file,npm run check:architecture -- passed (52 modules, 538 code files),npm run check:compliance -- confirmed "No compliance-sensitive changes detected" on this diff's full file set (no declaration required by the mechanical floor; this declaration is written anyway per the reasoning below),npm run check:tenant-schema-coverage -- --staged -- passed, 1 migration file checked (landlord-only, no tenant-schema-registry entry needed)
rollback_note: The migration is a single additive, non-nullable-with-default (NOT NULL DEFAULT 'fixed') column on a landlord-only table -- droppable with no dependent read path outside this diff, since every consumer's mapper already defaults delivery_fee_mode to 'fixed' when absent. Reverting the code commits restores the pre-phase behavior exactly: store_delivery_fee reverts to the flat settings read it was before this phase (byte-identical for every fixed-mode store, which is every store today). No money is resolved, persisted, or charged by this diff at any point, so a rollback carries zero payment-correctness risk.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-05T00:00:00.000Z
preflight_request_ref: NOT-EXECUTED-1333-DISCOVERY-DELIVERY-FROM-PRICE
---

# Discovery delivery from-price (Phase 242, #1333)

## Compliance Impact Classification

`minor`. Mechanically, `npm run check:compliance` reports **no compliance-sensitive changes** on
this diff's full file set -- verified empirically by staging the diff and running the check, not
assumed from the rule table. None of the touched paths match `COMPLIANCE_SENSITIVE_RULES`:
`apps/dgfy-api/src/models/Landlord/StorefrontDiscoveryIndex.js`,
`apps/dgfy-api/src/services/storefrontDiscoveryIndexService.js` (`src/services/` is not in the rule
set), `apps/dgfy-api/src/modules/geoSearch/repositories/geoSearchRepository.js`
(`modules/geoSearch/` is not in the rule set),
`apps/dgfy-api/src/modules/storefrontDiscovery/repositories/storefrontDiscoveryRepository.js`,
`apps/dgfy-api/src/modules/deliveryPricing/domain/deliveryFromPrice.js` and `index.js`
(`modules/deliveryPricing/` is not in the rule set -- confirmed by Phase 237's own declaration
making the same statement), the new migration (migrations are not in the rule set), and the new/
modified test files.

This declaration is written anyway, at `minor`, because the diff **changes the meaning of a
customer-visible advertised price**: a `calculated`-mode store's discovery card scalar
(`store_delivery_fee`) goes from a flat rate it will not actually charge to a genuine price floor
(the calc `min_fee`) it will. Epic #1321's own precedent (Phase 233's config-schema-only change,
`2026-09-01-delivery-fee-mode-config-schema.md`) declares price-surface work under this epic even
where the mechanical floor is low.

`reason_codes_impacted: none` is correct and deliberate -- this phase introduces no new reason code.
`DELIVERY_DISTANCE_OUT_OF_RANGE` was introduced by Phase 237 and is already declared in
`2026-09-02-storefront-calculated-and-free-delivery-fee-modes.md`; re-declaring it here would be
double-counting.

## What this phase does and does not do

- **Read-path and projection only. No money is resolved, persisted, or charged by this diff, and no
  checkout path is touched.** `resolveAdvertisedDeliveryFromPrice`
  (`modules/deliveryPricing/domain/deliveryFromPrice.js`) is a new, pure, zero-I/O module that
  mirrors `resolveStoreDeliveryFee`'s (`storeUseCases.js:586-694`) branching to derive what a
  discovery card *could* advertise -- it is never called from any checkout or payment code path.
- Adds `delivery_fee_mode` (`STRING(32)`, `NOT NULL DEFAULT 'fixed'`) to the landlord-only
  `storefront_discovery_index` table, and redefines `store_delivery_fee` on that same table/API
  surface as a FROM-price: the fixed rate in `fixed` mode, the calculated-mode `min_fee` in
  `calculated` mode, `0` in `free` mode.
- **`fixed`-mode stores (every store today, since Phase 233 shipped the settings keys with a
  `fixed` default) see a byte-identical `store_delivery_fee` value** -- the only stores whose
  advertised value changes are `calculated`-mode (now `min_fee` instead of the flat rate) and
  `free`-mode (now `0` instead of a stale flat rate that was never actually charged). This is the
  property that makes the change low-risk: it only ever makes the advertised figure MORE accurate,
  never less.
- Surfaced on `GET /api/v1/storefront/geo-search` and the discovery list/profile reads
  (`storefrontDiscoveryRepository.js`). **No discovery-card renderer in this repo consumes
  `store_delivery_fee` today** (`grep -rn "store_delivery_fee"` across every frontend app returns
  zero hits) -- this phase ships the API contract only; the card itself is a follow-up, handed to
  `pm`.
- Known staleness window, pre-existing and not introduced by this phase: the discovery index is not
  refreshed when a tenant changes `store_delivery_fee_mode`/`store_delivery_fee_calc` via settings
  -- nothing in `modules/settings/` triggers `syncStorefrontDiscoveryIndexForTenant`. Bounded by the
  existing 15-minute reconciliation sweep (`STOREFRONT_DISCOVERY_INDEX_RECONCILE_MINUTES`), same as
  every other field on this table (e.g. `store_delivery_fee` itself, pre-existing). Also handed to
  `pm` as a follow-up, now with a customer-visible price attached.
- Also closes issue #478 (delivery-radius enforcement) by direct comment/close, verified against
  Phase 237/ADR 0078's already-merged mechanism -- no code change in this PR effects that closure,
  it documents an already-shipped resolution. Does **not** close #625 (cart-contents-conditional
  delivery fee); that closure is held pending #1332 (auto-apply), per #1333's own stated dependency.

## Affected Surfaces

- `storefront` -- `apps/dgfy-api/src/services/storefrontDiscoveryIndexService.js` (the projection),
  `apps/dgfy-api/src/modules/geoSearch/repositories/geoSearchRepository.js` and
  `apps/dgfy-api/src/modules/storefrontDiscovery/repositories/storefrontDiscoveryRepository.js`
  (the two read paths), `apps/dgfy-api/src/models/Landlord/StorefrontDiscoveryIndex.js` (the new
  column).
- Not compliance-sensitive by the guardrail's own rule set, named anyway for completeness:
  `apps/dgfy-api/src/modules/deliveryPricing/domain/deliveryFromPrice.js` and `index.js` (additive
  exports only, no change to the existing pure policy module), and the new migration file itself.

## Compliance Preconditions

- No refund, settlement, capture, checkout, or fiscal-document code path is touched. This diff has
  no call site inside `modules/store/`, `modules/commercePayments/`, or `modules/vouchers/`.
- The totals formula (ADR 0012) is entirely untouched -- this diff has no persistence-layer write to
  any money column on `pos_transactions` or `commerce_payment_sessions`.
- `resolveAdvertisedDeliveryFromPrice` mirrors, but does not call, `resolveStoreDeliveryFee` --
  divergence between the two is a real but bounded risk (R2/R3 in the phase's own risk register),
  not a compliance risk: the advertised value can only ever be MORE conservative than a byte-
  identical restatement in the `fixed`-mode case, and the one direction where they can legitimately
  diverge (a `calculated`-mode store whose road-distance provider is down, so checkout falls open to
  the fixed rate below the advertised `min_fee`) is the safe direction -- charged less than
  advertised, never more.
- `fixed`-mode byte-identity is the tested invariant that makes this a low-risk projection change --
  cited to `deliveryFromPrice.unit.test.js`'s fixed-mode cases and
  `storefrontDiscoveryRepository.test.js`'s new mode-pair cases, not merely asserted.
- The floor-is-real property (the advertised `calculated`-mode price is never higher than what an
  in-range order actually gets charged, and is reachable at distance 0) is tested against the real
  checkout formula (`computeCalculatedDeliveryFeeCentavos`) directly, not a restatement of it --
  `deliveryFromPrice.parity.unit.test.js`.
- No new reason code, no new ENUM value, no new voucher/discount interaction. `provider_quoted`
  reaches no new surface in this diff.
- **Named limitation, not omitted**: the discovery index's up-to-15-minute settings-write staleness
  window (pre-existing for every field on this table) now applies to a customer-visible price
  figure for the first time. Not fixed in this phase -- see "What this phase does and does not do"
  above and the PR body's `pm` handoff list.

## Verification Evidence

- `deliveryFromPrice.unit.test.js` (new, 14 tests): the full mode matrix --
  fixed/free/calculated x valid/null/malformed/JSON-string calc, mode normalization, frozen result.
  All passing.
- `deliveryFromPrice.parity.unit.test.js` (new, 7 tests): the advertised `calculated`-mode floor is
  tested against `computeCalculatedDeliveryFeeCentavos` directly across a distance sweep (0,
  1 km, `included_km`, `included_km + ε`, `max_distance_km`), asserting the charged fee is always
  `>=` the advertised from-price, and that the floor is reachable exactly at distance 0. All
  passing.
- `deliveryFeeModeDiscoveryIndexPersistence.contract.test.js` (new, 6 tests): source-contract guard
  (#713-class) covering both of this phase's own silent-wrong-but-green traps -- the
  `STOREFRONT_SETTING_KEYS` allowlist entries and the `parseJsonObject(...)` call before the calc
  blob reaches the resolver -- plus the model attribute, the migration's add/remove pair, both read
  paths' column references, and the `LEGACY_SCHEMA_SAFE_ATTRIBUTES` backwards-easy mistake (must NOT
  contain the new column). All passing.
- `addDeliveryFeeModeDiscoveryIndex.migration.test.js` (new, 6 tests): idempotent `up()`, `down()`
  removes/no-ops correctly, and an explicit no-tenant-fan-out assertion (both a source-string check
  and a call-count check on the queryInterface double). All passing.
- `storefrontDiscoveryRepository.test.js` (extended, existing suite unmodified elsewhere): 4 new
  cases assert the `store_delivery_fee`/`delivery_fee_mode` pair travels together through the
  response mapper for all three modes, plus a legacy-row default-to-`fixed` case. All passing.
- Full targeted run, `apps/dgfy-api` (`node --experimental-vm-modules .../jest.js --runInBand`, the
  5 suites above): **67/67 passing**.
- `node --check` on every changed/new `apps/dgfy-api` `.js` file and the new migration `.cjs` file --
  OK.
- `npm run check:architecture` -- OK, 52 modules / 538 code files; controller-boundary check OK, 92
  controller files, no unauthorized model imports.
- `npm run check:compliance` -- confirmed "No compliance-sensitive changes detected" on this diff's
  full file set, both before and after this declaration file was added (this declaration is
  voluntary, not required to pass the gate).
- `npm run check:tenant-schema-coverage -- --staged` (pre-commit, fired on the migration commit) --
  `PASS`, 1 migration file checked.

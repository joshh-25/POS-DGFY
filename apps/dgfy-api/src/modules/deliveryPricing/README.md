# Delivery Pricing Module

Customer-facing delivery-fee resolution for storefront checkout, epic #1321 (Customer delivery
pricing). Phase 233 shipped the fee-mode config schema. Phase 237 (#1329) wires this module's
calculated-mode formula and road-distance repository into `resolveStoreDeliveryFee`
(`modules/store/usecases/storeUseCases.js`), which now resolves `fixed`/`calculated`/`free` as a
real, priced breakdown rather than always returning the flat `store_delivery_fee` value.

## Files

| File | Responsibility |
|---|---|
| `index.js` | DI entry point / public exports |
| `domain/deliveryFeeConfig.js` | Pure normalization of the `store_delivery_fee_mode` / `store_delivery_fee_calc` settings keys into one frozen config object. Zero I/O, absent/garbage input fails toward `mode: 'fixed'`, never throws. |
| `domain/deliveryFeePolicy.js` | Pure calculated-fee math (Phase 235, #1325) -- `computeCalculatedDeliveryFeeCentavos`, zero I/O, integer centavos in/out (ADR 0066 Decision 2 `[binding]`). Also owns `DELIVERY_FEE_CALC_VERSION`, which versions the whole resolution algorithm in `storeUseCases.js`, not just this module's calculated branch. |
| `repositories/roadDistanceProvider.js` | Road-distance adapter wrapping `modules/routeCalculator/` (self-hosted GraphHopper) -- reuse of an existing modular boundary, not a new third-party integration (Phase 236, #1328). |
| `usecases/deliveryFeeConfigUseCases.js` | Thin, currently dependency-free DI wrapper (`buildResolveDeliveryFeeConfigUseCase`) over the domain normalizer -- exists so this module carries the standard `controllers`/`usecases`/`repositories` layer shape `check-architecture-guardrails.js` requires, and gives later phases a builder to extend with real dependencies rather than a bare function to replace. |

## Shipped

- Fee-mode config schema and normalization (#1324, Phase 233).
- Pure calculated-fee formula, unwired (#1325, Phase 235).
- Observation-only server-side road-distance capture, never fed into fee math (#1328, Phase 236).
- Calculated/free-mode fee computation wired into `resolveStoreDeliveryFee`'s async rewrite, the
  ADR 0078 Decision 2 out-of-range hard block, and quoted-fee pinning across a webhook-replay
  finalization (#1329, Phase 237).

## What's not here yet

Per #1321's Definition of Done, later phases add:

- Staff override policy (#238) and its audit trail (#234). Phase 238 (#1330) has already shipped a
  POST-HOC override of the persisted `pos_transactions.delivery_fee` column
  (`modules/pos/usecases/deliveryFeeOverrideUseCases.js`) -- it is not a resolve-time input to this
  module and Phase 237 does not read it.
- The `free_delivery` voucher benefit class (#240) and auto-apply campaign selector (#241/#242) --
  will populate `resolveStoreDeliveryFee`'s `waiverAmount` field, hardcoded `0` as of Phase 237.
- A resolved (non-null) `locationOverride` source -- `domain/deliveryFeeConfig.js`'s resolver
  already accepts one (Wave 0a decision #1: wholesale replacement, not a field merge), but no call
  site produces one yet (#1346 tracks a known wholesale-replace divergence from ADR 0078 Decision 6
  `[binding]`'s field-by-field merge -- zero live impact today since every caller stays null).
- Pinning a cart-quote-to-checkout window: today only a payment-session-to-webhook-finalization
  replay is pinned (Phase 237 §7). A cart quote has no `idempotency_key` and is structurally
  unpinnable in v1 -- accepted as a known gap, not silently dropped.

## Governance

New ADR for delivery-fee modes is tracked separately (#1323, Wave 0b of #1321) and had not landed
as of this phase -- this module's `[default]`-tier choices (module placement, settings-key naming)
anticipate that ADR rather than cite it. Flagged here rather than silently assumed settled; revisit
once #1323 merges.

# Delivery Pricing Module

Customer-facing delivery-fee resolution for storefront checkout. Phase 233 of #1321 (epic:
Customer delivery pricing) -- this phase ships only the fee-mode config schema, with **zero
production behavior change**. `resolveStoreDeliveryFee`
(`modules/store/usecases/storeUseCases.js`) starts consuming this module's output but still
returns today's flat `store_delivery_fee` value regardless of what mode resolves.

## Files

| File | Responsibility |
|---|---|
| `index.js` | DI entry point / public exports |
| `domain/deliveryFeeConfig.js` | Pure normalization of the `store_delivery_fee_mode` / `store_delivery_fee_calc` settings keys into one frozen config object. Zero I/O, absent/garbage input fails toward `mode: 'fixed'`, never throws. |
| `usecases/deliveryFeeConfigUseCases.js` | Thin, currently dependency-free DI wrapper (`buildResolveDeliveryFeeConfigUseCase`) over the domain normalizer -- exists so this module carries the standard `controllers`/`usecases`/`repositories` layer shape `check-architecture-guardrails.js` requires, and gives later phases a builder to extend with real dependencies rather than a bare function to replace. |

## What's not here yet

Per #1321's Definition of Done, later phases add:

- Calculated/free-mode fee computation and the `resolveStoreDeliveryFee` async rewrite (#237).
- A road-distance adapter wrapping `modules/routeCalculator/` (self-hosted GraphHopper) -- reuse of
  an existing modular boundary, not a new third-party integration.
- Staff override policy (#238) and its audit trail (#234).
- The `free_delivery` voucher benefit class (#240) and auto-apply campaign selector (#241/#242).
- A resolved (non-null) `locationOverride` source -- `domain/deliveryFeeConfig.js`'s resolver
  already accepts one (Wave 0a decision #1: wholesale replacement, not a field merge), but no call
  site produces one yet.
- A `repositories/` directory, once a phase actually needs one (e.g. the road-distance adapter
  above). None exists yet -- `usecases/deliveryFeeConfigUseCases.js` alone already satisfies the
  module-shape guardrail.

## Governance

New ADR for delivery-fee modes is tracked separately (#1323, Wave 0b of #1321) and had not landed
as of this phase -- this module's `[default]`-tier choices (module placement, settings-key naming)
anticipate that ADR rather than cite it. Flagged here rather than silently assumed settled; revisit
once #1323 merges.

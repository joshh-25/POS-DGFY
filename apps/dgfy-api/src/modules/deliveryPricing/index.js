// Phase 233 (#1324, epic #1321). DI entry point for the delivery-pricing module. Phase 236
// (#1328) adds the first repository -- roadDistanceProvider -- an observation-only road-distance
// capture that never feeds resolveDeliveryFeeConfigUseCase's fee math. Phase 237 (#1329) wires the
// calculated-mode pure policy (computeCalculatedDeliveryFeeCentavos) and its calc-version constant
// into storeUseCases.js's resolveStoreDeliveryFee -- both are exported here for the first time.
// Later phases (#238 staff override, #240 free_delivery voucher benefit) extend
// resolveDeliveryFeeConfigUseCase's own dependencies alongside this file.

import { buildResolveDeliveryFeeConfigUseCase } from './usecases/deliveryFeeConfigUseCases.js';

export const resolveDeliveryFeeConfigUseCase = buildResolveDeliveryFeeConfigUseCase();

// The pure domain layer is also exported directly (same pattern as modules/vouchers/index.js
// re-exporting VoucherReasonCode from domain/voucherErrors.js) -- callers with no need for the
// DI wrapper's future dependencies can keep depending on the zero-I/O function directly.
export { DELIVERY_FEE_MODES, resolveDeliveryFeeConfig } from './domain/deliveryFeeConfig.js';

export { buildRoadDistanceProvider, roadDistanceProvider } from './repositories/roadDistanceProvider.js';

// Phase 237 (#1329): the pure calculated-fee formula (Phase 235, #1325) is wired into
// storeUseCases.js's resolveStoreDeliveryFee for the first time in this phase -- see this module's
// own domain/deliveryFeePolicy.js header for its contract (throws on malformed input; fail-open-to-
// fixed is the use-case layer's job, not this pure module's).
export {
    computeCalculatedDeliveryFeeCentavos,
    DeliveryFeePolicyError,
    DELIVERY_FEE_CALC_VERSION
} from './domain/deliveryFeePolicy.js';

// Phase 242 (#1333): the advertised discovery "from ₱X" price -- a landlord-side read-model
// consumer, not the checkout path (see this function's own module header for why it lives here
// rather than in storeUseCases.js).
export { resolveAdvertisedDeliveryFromPrice } from './domain/deliveryFromPrice.js';

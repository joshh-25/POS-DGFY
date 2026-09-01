// Phase 233 (#1324, epic #1321). DI entry point for the delivery-pricing module. Phase 236
// (#1328) adds the first repository -- roadDistanceProvider -- an observation-only road-distance
// capture that never feeds resolveDeliveryFeeConfigUseCase's fee math. Later phases (#237
// calculated/free-mode wiring, #238 staff override, #240 free_delivery voucher benefit) extend
// resolveDeliveryFeeConfigUseCase's own dependencies alongside this file.

import { buildResolveDeliveryFeeConfigUseCase } from './usecases/deliveryFeeConfigUseCases.js';

export const resolveDeliveryFeeConfigUseCase = buildResolveDeliveryFeeConfigUseCase();

// The pure domain layer is also exported directly (same pattern as modules/vouchers/index.js
// re-exporting VoucherReasonCode from domain/voucherErrors.js) -- callers with no need for the
// DI wrapper's future dependencies can keep depending on the zero-I/O function directly.
export { DELIVERY_FEE_MODES, resolveDeliveryFeeConfig } from './domain/deliveryFeeConfig.js';

export { buildRoadDistanceProvider, roadDistanceProvider } from './repositories/roadDistanceProvider.js';

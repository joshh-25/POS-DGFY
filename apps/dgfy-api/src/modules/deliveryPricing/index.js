// Phase 233 (#1324, epic #1321). DI entry point for the delivery-pricing module. No repositories
// exist yet -- this phase intentionally ships zero production behavior change (see
// domain/deliveryFeeConfig.js's own header). Later phases (#237 calculated/free-mode wiring, #238
// staff override, #240 free_delivery voucher benefit) add repositories and extend
// resolveDeliveryFeeConfigUseCase's dependencies alongside this file.

import { buildResolveDeliveryFeeConfigUseCase } from './usecases/deliveryFeeConfigUseCases.js';

export const resolveDeliveryFeeConfigUseCase = buildResolveDeliveryFeeConfigUseCase();

// The pure domain layer is also exported directly (same pattern as modules/vouchers/index.js
// re-exporting VoucherReasonCode from domain/voucherErrors.js) -- callers with no need for the
// DI wrapper's future dependencies can keep depending on the zero-I/O function directly.
export { DELIVERY_FEE_MODES, resolveDeliveryFeeConfig } from './domain/deliveryFeeConfig.js';

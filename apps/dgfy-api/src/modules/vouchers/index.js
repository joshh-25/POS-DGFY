import { voucherRepository } from './repositories/voucherRepository.js';
import { pricelistRepository } from './repositories/pricelistRepository.js';
import { VoucherReasonCode } from './domain/voucherErrors.js';
import {
    buildActivateVoucherUseCase,
    buildArchiveVoucherUseCase,
    buildCreateVoucherUseCase,
    buildGetVoucherUseCase,
    buildListVouchersUseCase,
    buildPauseVoucherUseCase,
    buildUpdateVoucherUseCase
} from './usecases/voucherUseCases.js';
import {
    buildPreviewVoucherEligibilityUseCase,
    buildRedeemVoucherUseCase
} from './usecases/voucherRedemptionUseCases.js';
import { buildReverseVoucherRedemptionUseCase } from './usecases/voucherReversalUseCases.js';
import { buildResolveVoucherDisplayPricesUseCase } from './usecases/voucherDisplayUseCases.js';
import {
    buildArchivePricelistUseCase,
    buildCreatePricelistUseCase,
    buildGetPricelistUseCase,
    buildListPricelistsUseCase,
    buildPublishPricelistUseCase,
    buildReplacePricelistItemsUseCase,
    buildUpdatePricelistUseCase
} from './usecases/pricelistUseCases.js';

export const listVouchersUseCase = buildListVouchersUseCase({ repository: voucherRepository });
export const getVoucherUseCase = buildGetVoucherUseCase({ repository: voucherRepository });
export const createVoucherUseCase = buildCreateVoucherUseCase({ repository: voucherRepository });
export const updateVoucherUseCase = buildUpdateVoucherUseCase({ repository: voucherRepository });
export const activateVoucherUseCase = buildActivateVoucherUseCase({ repository: voucherRepository });
export const pauseVoucherUseCase = buildPauseVoucherUseCase({ repository: voucherRepository });
export const archiveVoucherUseCase = buildArchiveVoucherUseCase({ repository: voucherRepository });

// Phase 105 (#455) -- storefront redemption. `redeemVoucherUseCase` requires an open transaction;
// `previewVoucherEligibilityUseCase` does not. See voucherRedemptionUseCases.js.
export const previewVoucherEligibilityUseCase = buildPreviewVoucherEligibilityUseCase({ repository: voucherRepository });
export const redeemVoucherUseCase = buildRedeemVoucherUseCase({ repository: voucherRepository });
export const reverseVoucherRedemptionUseCase = buildReverseVoucherRedemptionUseCase({ repository: voucherRepository });

// #603 -- storefront catalog display seam. Read-only, best-effort (fail-open), no transaction.
export const resolveVoucherDisplayPricesUseCase = buildResolveVoucherDisplayPricesUseCase({ repository: voucherRepository });

// #696 -- pricelist entity (per-item fixed prices), a separate repository/aggregate from vouchers
// itself. See pricelistRepository.js's own header for why it is a distinct file.
export const listPricelistsUseCase = buildListPricelistsUseCase({ repository: pricelistRepository });
export const getPricelistUseCase = buildGetPricelistUseCase({ repository: pricelistRepository });
export const createPricelistUseCase = buildCreatePricelistUseCase({ repository: pricelistRepository });
export const updatePricelistUseCase = buildUpdatePricelistUseCase({ repository: pricelistRepository });
export const replacePricelistItemsUseCase = buildReplacePricelistItemsUseCase({ repository: pricelistRepository });
export const publishPricelistUseCase = buildPublishPricelistUseCase({ repository: pricelistRepository });
export const archivePricelistUseCase = buildArchivePricelistUseCase({ repository: pricelistRepository });

// #667 -- the voucher domain's single reason-code registry, re-exported so a caller outside this
// module (storeUseCases.js's storefront/promo stacking check) can reference a voucher reason code
// by name instead of a free-floating string literal, matching the registry's own stated purpose
// ("re-exported... so the registry cannot drift" -- voucherErrors.js's header comment).
export { VoucherReasonCode };

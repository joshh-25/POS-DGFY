import { voucherRepository } from './repositories/voucherRepository.js';
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

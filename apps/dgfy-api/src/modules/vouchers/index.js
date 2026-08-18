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

export const listVouchersUseCase = buildListVouchersUseCase({ repository: voucherRepository });
export const getVoucherUseCase = buildGetVoucherUseCase({ repository: voucherRepository });
export const createVoucherUseCase = buildCreateVoucherUseCase({ repository: voucherRepository });
export const updateVoucherUseCase = buildUpdateVoucherUseCase({ repository: voucherRepository });
export const activateVoucherUseCase = buildActivateVoucherUseCase({ repository: voucherRepository });
export const pauseVoucherUseCase = buildPauseVoucherUseCase({ repository: voucherRepository });
export const archiveVoucherUseCase = buildArchiveVoucherUseCase({ repository: voucherRepository });

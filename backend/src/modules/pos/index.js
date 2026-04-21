import { posRepository } from './repositories/posRepository.js';
import { posCatalogImageStorage } from './repositories/posCatalogImageStorage.js';
import { createStockMovement } from '../../services/stockMovementService.js';
import {
    buildListPosCatalogUseCase,
    buildCheckoutPosUseCase,
    buildListPosTransactionsUseCase,
    buildGetPosTransactionByIdUseCase,
    buildCloseDayZReadingUseCase,
    buildGetDailyZReadingUseCase,
    buildGetCurrentXReadingUseCase,
    buildIncrementGovernedResetCounterUseCase,
    buildListPosCatalogOverridesUseCase,
    buildUpdatePosCatalogOverrideUseCase,
    buildUploadPosCatalogImageUseCase,
    buildDeletePosCatalogImageUseCase,
    buildOpenTerminalShiftUseCase,
    buildSwitchTerminalShiftLocationUseCase,
    buildGetCurrentTerminalShiftUseCase,
    buildRecordCashDrawerEventUseCase,
    buildCloseTerminalShiftUseCase,
    buildGetTerminalTodayDashboardUseCase,
    buildListIncomingOnlineOrdersUseCase,
    buildUpdateOnlineOrderStatusUseCase
} from './usecases/posUseCases.js';

const stockMovementService = { createStockMovement };

export const listPosCatalogUseCase = buildListPosCatalogUseCase({ posRepository });
export const checkoutPosUseCase = buildCheckoutPosUseCase({ posRepository, stockMovementService });
export const listPosTransactionsUseCase = buildListPosTransactionsUseCase({ posRepository });
export const getPosTransactionByIdUseCase = buildGetPosTransactionByIdUseCase({ posRepository });
export const closeDayZReadingUseCase = buildCloseDayZReadingUseCase({ posRepository });
export const getDailyZReadingUseCase = buildGetDailyZReadingUseCase({ posRepository });
export const getCurrentXReadingUseCase = buildGetCurrentXReadingUseCase({ posRepository });
export const incrementGovernedResetCounterUseCase = buildIncrementGovernedResetCounterUseCase({ posRepository });
export const listPosCatalogOverridesUseCase = buildListPosCatalogOverridesUseCase({ posRepository });
export const updatePosCatalogOverrideUseCase = buildUpdatePosCatalogOverrideUseCase({ posRepository });
export const uploadPosCatalogImageUseCase = buildUploadPosCatalogImageUseCase({
    posRepository,
    imageStorage: posCatalogImageStorage
});
export const deletePosCatalogImageUseCase = buildDeletePosCatalogImageUseCase({
    posRepository,
    imageStorage: posCatalogImageStorage
});
export const openTerminalShiftUseCase = buildOpenTerminalShiftUseCase({ posRepository });
export const switchTerminalShiftLocationUseCase = buildSwitchTerminalShiftLocationUseCase({ posRepository });
export const getCurrentTerminalShiftUseCase = buildGetCurrentTerminalShiftUseCase({ posRepository });
export const recordCashDrawerEventUseCase = buildRecordCashDrawerEventUseCase({ posRepository });
export const closeTerminalShiftUseCase = buildCloseTerminalShiftUseCase({ posRepository });
export const getTerminalTodayDashboardUseCase = buildGetTerminalTodayDashboardUseCase({ posRepository });
export const listIncomingOnlineOrdersUseCase = buildListIncomingOnlineOrdersUseCase({ posRepository });
export const updateOnlineOrderStatusUseCase = buildUpdateOnlineOrderStatusUseCase({
    posRepository,
    stockMovementService
});

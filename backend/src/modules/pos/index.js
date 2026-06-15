import { posRepository } from './repositories/posRepository.js';
import { posCatalogImageStorage } from './repositories/posCatalogImageStorage.js';
import { createStockMovement } from '../../services/stockMovementService.js';
import { posDeviceBridgeService } from '../../services/posDeviceBridgeService.js';
import {
    buildListPosCatalogUseCase,
    buildScanPosBarcodeUseCase,
    buildCheckoutPosUseCase,
    buildListPosTransactionsUseCase,
    buildGetPosTransactionByIdUseCase,
    buildRecordFiscalPrintEventUseCase,
    buildVoidPosTransactionUseCase,
    buildGenerateESalesReportUseCase,
    buildListESalesReportsUseCase,
    buildVerifyFiscalEventLedgerUseCase,
    buildUpdateESalesReportStatusUseCase,
    buildUpsertFiscalTerminalRegistrationUseCase,
    buildListFiscalTerminalRegistrationsUseCase,
    buildCloseDayZReadingUseCase,
    buildGetDailyZReadingUseCase,
    buildGetCurrentXReadingUseCase,
    buildIncrementGovernedResetCounterUseCase,
    buildListPosCatalogOverridesUseCase,
    buildUpdatePosCatalogOverrideUseCase,
    buildUpdateBulkPosCatalogOverridesUseCase,
    buildUploadPosCatalogImageUseCase,
    buildUploadBulkPosCatalogImagesUseCase,
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
import {
    buildGetPosDeviceStatusUseCase,
    buildPrintPosReceiptUseCase,
    buildOpenPosDrawerUseCase
} from './usecases/posDeviceUseCases.js';

const stockMovementService = { createStockMovement };

export const listPosCatalogUseCase = buildListPosCatalogUseCase({ posRepository });
export const scanPosBarcodeUseCase = buildScanPosBarcodeUseCase({ posRepository });
export const checkoutPosUseCase = buildCheckoutPosUseCase({ posRepository, stockMovementService });
export const listPosTransactionsUseCase = buildListPosTransactionsUseCase({ posRepository });
export const getPosTransactionByIdUseCase = buildGetPosTransactionByIdUseCase({ posRepository });
export const recordFiscalPrintEventUseCase = buildRecordFiscalPrintEventUseCase({ posRepository });
export const voidPosTransactionUseCase = buildVoidPosTransactionUseCase({ posRepository, stockMovementService });
export const generateESalesReportUseCase = buildGenerateESalesReportUseCase({ posRepository });
export const listESalesReportsUseCase = buildListESalesReportsUseCase({ posRepository });
export const verifyFiscalEventLedgerUseCase = buildVerifyFiscalEventLedgerUseCase({ posRepository });
export const updateESalesReportStatusUseCase = buildUpdateESalesReportStatusUseCase({ posRepository });
export const upsertFiscalTerminalRegistrationUseCase = buildUpsertFiscalTerminalRegistrationUseCase({ posRepository });
export const listFiscalTerminalRegistrationsUseCase = buildListFiscalTerminalRegistrationsUseCase({ posRepository });
export const closeDayZReadingUseCase = buildCloseDayZReadingUseCase({ posRepository });
export const getDailyZReadingUseCase = buildGetDailyZReadingUseCase({ posRepository });
export const getCurrentXReadingUseCase = buildGetCurrentXReadingUseCase({ posRepository });
export const incrementGovernedResetCounterUseCase = buildIncrementGovernedResetCounterUseCase({ posRepository });
export const listPosCatalogOverridesUseCase = buildListPosCatalogOverridesUseCase({ posRepository });
export const updatePosCatalogOverrideUseCase = buildUpdatePosCatalogOverrideUseCase({ posRepository });
export const updateBulkPosCatalogOverridesUseCase = buildUpdateBulkPosCatalogOverridesUseCase({ posRepository });
export const uploadPosCatalogImageUseCase = buildUploadPosCatalogImageUseCase({
    posRepository,
    imageStorage: posCatalogImageStorage
});
export const uploadBulkPosCatalogImagesUseCase = buildUploadBulkPosCatalogImagesUseCase({
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
export const getPosDeviceStatusUseCase = buildGetPosDeviceStatusUseCase({
    posRepository,
    deviceBridgeService: posDeviceBridgeService
});
export const printPosReceiptUseCase = buildPrintPosReceiptUseCase({
    posRepository,
    deviceBridgeService: posDeviceBridgeService
});
export const openPosDrawerUseCase = buildOpenPosDrawerUseCase({
    posRepository,
    deviceBridgeService: posDeviceBridgeService
});

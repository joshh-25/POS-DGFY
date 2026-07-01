import { posRepository } from './repositories/posRepository.js';
import { posCatalogImageStorage } from './repositories/posCatalogImageStorage.js';
import { createStockMovement } from '../../services/stockMovementService.js';
import { posDeviceBridgeService } from '../../services/posDeviceBridgeService.js';
import * as userService from '../../services/userService.js';
import * as authService from '../../services/authService.js';
import * as terminalPairingService from './services/posTerminalPairingService.js';
import {
    buildCreatePosSetupCashierUseCase,
    buildListPosSetupCashiersUseCase,
    buildLoginPosCashierUseCase,
    buildVerifyPosTerminalUseCase,
    buildGetPairedPosTerminalUseCase,
    buildListPosCatalogUseCase,
    buildScanPosBarcodeUseCase,
    buildCheckoutPosUseCase,
    buildListPosTransactionsUseCase,
    buildGetPosReportsOverviewUseCase,
    buildGetPosReportsTopItemsUseCase,
    buildGetPosReportsComparisonUseCase,
    buildGetPosReportsProfitLossUseCase,
    buildGetPosReportsCashierShiftHistoryUseCase,
    buildExportPosReportsUseCase,
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
import {
    buildGetMobilePosCatalogBootstrapUseCase,
    buildGetMobilePosSettingsBootstrapUseCase,
    buildGetMobilePosDevicePolicyUseCase,
    buildSyncMobilePosCheckoutsUseCase,
    buildSyncMobilePosShiftsUseCase,
    buildSyncMobilePosHardwareEventsUseCase,
    buildAcknowledgeMobilePosCheckpointUseCase
} from './usecases/mobilePosUseCases.js';

const stockMovementService = { createStockMovement };

export const createPosSetupCashierUseCase = buildCreatePosSetupCashierUseCase({ userService });
export const listPosSetupCashiersUseCase = buildListPosSetupCashiersUseCase({ userService });
export const loginPosCashierUseCase = buildLoginPosCashierUseCase({ authService });
export const verifyPosTerminalUseCase = buildVerifyPosTerminalUseCase({ posRepository, terminalPairingService });
export const getPairedPosTerminalUseCase = buildGetPairedPosTerminalUseCase({ posRepository, terminalPairingService });
export const listPosCatalogUseCase = buildListPosCatalogUseCase({ posRepository });
export const scanPosBarcodeUseCase = buildScanPosBarcodeUseCase({ posRepository });
export const checkoutPosUseCase = buildCheckoutPosUseCase({ posRepository, stockMovementService });
export const listPosTransactionsUseCase = buildListPosTransactionsUseCase({ posRepository });
export const getPosReportsOverviewUseCase = buildGetPosReportsOverviewUseCase({ posRepository });
export const getPosReportsTopItemsUseCase = buildGetPosReportsTopItemsUseCase({ posRepository });
export const getPosReportsComparisonUseCase = buildGetPosReportsComparisonUseCase({ posRepository });
export const getPosReportsProfitLossUseCase = buildGetPosReportsProfitLossUseCase({ posRepository });
export const getPosReportsCashierShiftHistoryUseCase = buildGetPosReportsCashierShiftHistoryUseCase({ posRepository });
export const exportPosReportsUseCase = buildExportPosReportsUseCase({ posRepository });
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
export const getMobilePosCatalogBootstrapUseCase = buildGetMobilePosCatalogBootstrapUseCase({
    listPosCatalogUseCase
});
export const getMobilePosSettingsBootstrapUseCase = buildGetMobilePosSettingsBootstrapUseCase();
export const getMobilePosDevicePolicyUseCase = buildGetMobilePosDevicePolicyUseCase({
    posRepository
});
export const syncMobilePosCheckoutsUseCase = buildSyncMobilePosCheckoutsUseCase({
    checkoutPosUseCase
});
export const syncMobilePosShiftsUseCase = buildSyncMobilePosShiftsUseCase({
    openTerminalShiftUseCase,
    switchTerminalShiftLocationUseCase,
    recordCashDrawerEventUseCase,
    closeTerminalShiftUseCase
});
export const syncMobilePosHardwareEventsUseCase = buildSyncMobilePosHardwareEventsUseCase();
export const acknowledgeMobilePosCheckpointUseCase = buildAcknowledgeMobilePosCheckpointUseCase();

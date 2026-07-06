import { posRepository } from './repositories/posRepository.js';
import { posCatalogImageStorage } from './repositories/posCatalogImageStorage.js';
import { inventoryStockCommandService } from '../inventory/index.js';
import { posDeviceBridgeService } from '../../services/posDeviceBridgeService.js';
import posTerminalPairingService from './services/posTerminalPairingService.js';
import * as userService from '../../services/userService.js';
import * as authService from '../../services/authService.js';
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
    buildCreatePosSetupCashierUseCase,
    buildListPosSetupCashiersUseCase,
    buildLoginPosCashierUseCase,
    buildSwitchTerminalShiftLocationUseCase,
    buildGetCurrentTerminalShiftUseCase,
    buildRecordCashDrawerEventUseCase,
    buildCloseTerminalShiftUseCase,
    buildGetTerminalTodayDashboardUseCase,
    buildListIncomingOnlineOrdersUseCase,
    buildUpdateOnlineOrderStatusUseCase,
    buildVerifyPosTerminalUseCase,
    buildGetPairedPosTerminalUseCase,
    buildGetPosReportsOverviewUseCase,
    buildExportPosReportsUseCase
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

export const listPosCatalogUseCase = buildListPosCatalogUseCase({ posRepository });
export const scanPosBarcodeUseCase = buildScanPosBarcodeUseCase({ posRepository });
export const checkoutPosUseCase = buildCheckoutPosUseCase({ posRepository, inventoryCommandService: inventoryStockCommandService });
export const listPosTransactionsUseCase = buildListPosTransactionsUseCase({ posRepository });
export const getPosTransactionByIdUseCase = buildGetPosTransactionByIdUseCase({ posRepository });
export const getPosReportsOverviewUseCase = buildGetPosReportsOverviewUseCase({ posRepository });
export const exportPosReportsUseCase = buildExportPosReportsUseCase({ posRepository });
export const recordFiscalPrintEventUseCase = buildRecordFiscalPrintEventUseCase({ posRepository });
export const voidPosTransactionUseCase = buildVoidPosTransactionUseCase({ posRepository, inventoryCommandService: inventoryStockCommandService });
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
export const createPosSetupCashierUseCase = buildCreatePosSetupCashierUseCase({ userService });
export const listPosSetupCashiersUseCase = buildListPosSetupCashiersUseCase({ userService });
export const loginPosCashierUseCase = buildLoginPosCashierUseCase({ authService });
export const switchTerminalShiftLocationUseCase = buildSwitchTerminalShiftLocationUseCase({ posRepository });
export const getCurrentTerminalShiftUseCase = buildGetCurrentTerminalShiftUseCase({ posRepository });
export const recordCashDrawerEventUseCase = buildRecordCashDrawerEventUseCase({ posRepository });
export const closeTerminalShiftUseCase = buildCloseTerminalShiftUseCase({ posRepository });
export const getTerminalTodayDashboardUseCase = buildGetTerminalTodayDashboardUseCase({ posRepository });
export const listIncomingOnlineOrdersUseCase = buildListIncomingOnlineOrdersUseCase({ posRepository });
export const updateOnlineOrderStatusUseCase = buildUpdateOnlineOrderStatusUseCase({
    posRepository,
    inventoryCommandService: inventoryStockCommandService
});
export const verifyPosTerminalUseCase = buildVerifyPosTerminalUseCase({
    posRepository,
    terminalPairingService: posTerminalPairingService
});
export const getPairedPosTerminalUseCase = buildGetPairedPosTerminalUseCase({ posRepository });
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
export const getMobilePosCatalogBootstrapUseCase = buildGetMobilePosCatalogBootstrapUseCase({ listPosCatalogUseCase });
export const getMobilePosSettingsBootstrapUseCase = buildGetMobilePosSettingsBootstrapUseCase();
export const getMobilePosDevicePolicyUseCase = buildGetMobilePosDevicePolicyUseCase({ posRepository });
export const syncMobilePosCheckoutsUseCase = buildSyncMobilePosCheckoutsUseCase({ checkoutPosUseCase });
export const syncMobilePosShiftsUseCase = buildSyncMobilePosShiftsUseCase({
    openTerminalShiftUseCase,
    switchTerminalShiftLocationUseCase,
    recordCashDrawerEventUseCase,
    closeTerminalShiftUseCase
});
export const syncMobilePosHardwareEventsUseCase = buildSyncMobilePosHardwareEventsUseCase();
export const acknowledgeMobilePosCheckpointUseCase = buildAcknowledgeMobilePosCheckpointUseCase();

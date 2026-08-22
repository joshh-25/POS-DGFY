import { posRepository } from './repositories/posRepository.js';
import { posCatalogImageStorage } from './repositories/posCatalogImageStorage.js';
import {
    inventoryStockCommandService,
    inventoryReservationService,
    itemRepository,
    createItemUseCase,
    updateItemUseCase,
    deleteItemUseCase
} from '../inventory/index.js';
import { resolvePosDeviceDriver } from './integrations/resolvePosDeviceDriver.js';
import posTerminalPairingService from './services/posTerminalPairingService.js';
import { employeeCreditService } from '../employeeCredit/index.js';
import { serviceRepository } from '../services/repositories/serviceRepository.js';
import { createServiceOptionRepository } from '../services/repositories/serviceOptionRepository.js';
import { buildCalculateServiceQuoteUseCase } from '../services/usecases/calculateServiceQuoteUseCase.js';
import {
    commercePaymentRepository,
    createCommercePaymentRefundUseCase,
    handleCommerceOrderLifecycleUseCase
} from '../commercePayments/index.js';
import * as userService from '../../services/userService.js';
import * as authService from '../../services/authService.js';
import {
    buildListPosCatalogUseCase,
    buildScanPosBarcodeUseCase,
    buildCheckoutPosUseCase,
    buildListPosDiscountApproversUseCase,
    buildVerifyPosDiscountApprovalUseCase,
    buildListPosTransactionsUseCase,
    buildGetPosReportsOverviewUseCase,
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
    buildGetDayCloseReadinessUseCase,
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
    buildGetCashierShiftHistoryUseCase,
    buildRecordCashDrawerEventUseCase,
    buildCloseTerminalShiftUseCase,
    buildForceCloseStaleTerminalShiftUseCase,
    buildGetTerminalTodayDashboardUseCase,
    buildListIncomingOnlineOrdersUseCase,
    buildListOnlineOrderHistoryUseCase,
    buildListActiveDeliveryPersonnelUseCase,
    buildGetAdminLocationMonitorUseCase,
    buildCollectCashPickupOrderUseCase,
    buildCollectCashDeliveryOrderUseCase,
    buildAssignDeliveryPersonnelUseCase,
    buildUpdateDeliveryJobStatusUseCase,
    buildUpdateOnlineOrderStatusUseCase,
    buildVerifyPosTerminalUseCase,
    buildGetPairedPosTerminalUseCase
} from './usecases/posUseCases.js';
import { buildCashRefundPosTransactionUseCase } from './usecases/cashRefundUseCases.js';
import { buildExternalRefundPosTransactionUseCase } from './usecases/externalRefundUseCases.js';
import { buildProviderRefundPosTransactionUseCase } from './usecases/providerRefundUseCases.js';
import { buildSplitAllocationReversalUseCase } from './usecases/splitAllocationReversalUseCases.js';
import {
    buildGetPosDeviceStatusUseCase,
    buildPrintPosReceiptUseCase,
    buildPrintPosShiftSummaryUseCase,
    buildPrintPosZReadingUseCase,
    buildAuthorizePosDrawerUseCase,
    buildOpenPosDrawerUseCase
} from './usecases/posDeviceUseCases.js';
import {
    buildGetMobilePosCatalogBootstrapUseCase,
    buildGetMobilePosSettingsBootstrapUseCase,
    buildGetMobilePosDevicePolicyUseCase,
    buildSyncMobilePosCheckoutsUseCase,
    buildSyncMobilePosItemsUseCase,
    buildSyncMobilePosShiftsUseCase,
    buildSyncMobilePosHardwareEventsUseCase,
    buildAcknowledgeMobilePosCheckpointUseCase
} from './usecases/mobilePosUseCases.js';
import {
    buildCreatePosParkedSaleUseCase,
    buildListPosParkedSalesUseCase,
    buildClaimPosParkedSaleUseCase,
    buildReparkPosParkedSaleUseCase,
    buildCompleteClaimedPosParkedSaleUseCase,
    buildCancelPosParkedSaleUseCase
} from './usecases/parkedSaleUseCases.js';
import {
    buildCreatePosPaymentSessionUseCase,
    buildGetPosPaymentSessionUseCase,
    buildGetActivePosPaymentSessionUseCase,
    buildAddPosPaymentAllocationUseCase,
    buildCancelPosPaymentAllocationUseCase,
    buildConfirmPosPaymentAllocationUseCase,
    buildReconcilePosPaymentAllocationUseCase,
    buildCancelPosPaymentSessionUseCase,
    buildCompletePosPaymentSessionUseCase
} from './usecases/splitPaymentUseCases.js';
import { createPosPaymentProviderConfirmationVerifier } from './services/posPaymentProviderConfirmation.js';
import { createPosPayMongoReconciler } from './services/posPayMongoReconciliation.js';
import {
    buildGetMerchantTenderReconciliationUseCase,
    buildReviewMerchantTenderReconciliationUseCase
} from './usecases/merchantTenderReconciliationUseCases.js';
import { paymongoService } from '../../services/paymongoService.js';
import posDrawerAuthorizationService from './services/posDrawerAuthorizationService.js';

export const listPosCatalogUseCase = buildListPosCatalogUseCase({ posRepository });
export const scanPosBarcodeUseCase = buildScanPosBarcodeUseCase({ posRepository });
const posServiceOptionRepository = createServiceOptionRepository();
const posCalculateServiceQuoteUseCase = buildCalculateServiceQuoteUseCase({
    serviceRepository,
    serviceOptionRepository: posServiceOptionRepository
});
const completeClaimedPosParkedSaleUseCase = buildCompleteClaimedPosParkedSaleUseCase({ posRepository });
export const checkoutPosUseCase = buildCheckoutPosUseCase({
    posRepository,
    inventoryCommandService: inventoryStockCommandService,
    employeeCreditService,
    calculateServiceQuoteUseCase: posCalculateServiceQuoteUseCase,
    completeClaimedPosParkedSaleUseCase
});
export const listPosDiscountApproversUseCase = buildListPosDiscountApproversUseCase({ posRepository });
export const verifyPosDiscountApprovalUseCase = buildVerifyPosDiscountApprovalUseCase({ posRepository });
export const listPosTransactionsUseCase = buildListPosTransactionsUseCase({ posRepository });
export const createPosParkedSaleUseCase = buildCreatePosParkedSaleUseCase({ posRepository });
export const listPosParkedSalesUseCase = buildListPosParkedSalesUseCase({ posRepository });
export const claimPosParkedSaleUseCase = buildClaimPosParkedSaleUseCase({ posRepository });
export const reparkPosParkedSaleUseCase = buildReparkPosParkedSaleUseCase({ posRepository });
export const cancelPosParkedSaleUseCase = buildCancelPosParkedSaleUseCase({ posRepository });
export const createPosPaymentSessionUseCase = buildCreatePosPaymentSessionUseCase({
    posRepository,
    quotePosCheckoutUseCase: checkoutPosUseCase
});
export const getPosPaymentSessionUseCase = buildGetPosPaymentSessionUseCase({ posRepository });
export const getActivePosPaymentSessionUseCase = buildGetActivePosPaymentSessionUseCase({ posRepository });
export const addPosPaymentAllocationUseCase = buildAddPosPaymentAllocationUseCase({ posRepository });
export const cancelPosPaymentAllocationUseCase = buildCancelPosPaymentAllocationUseCase({ posRepository });
export const confirmPosPaymentAllocationUseCase = buildConfirmPosPaymentAllocationUseCase({
    posRepository,
    providerConfirmationVerifier: createPosPaymentProviderConfirmationVerifier()
});
export const reconcilePosPaymentAllocationUseCase = buildReconcilePosPaymentAllocationUseCase({
    posRepository,
    providerReconciler: createPosPayMongoReconciler({ paymongoService })
});
export const cancelPosPaymentSessionUseCase = buildCancelPosPaymentSessionUseCase({ posRepository });
export const completePosPaymentSessionUseCase = buildCompletePosPaymentSessionUseCase({
    posRepository,
    checkoutPosUseCase
});
export const getMerchantTenderReconciliationUseCase = buildGetMerchantTenderReconciliationUseCase({ posRepository });
export const reviewMerchantTenderReconciliationUseCase = buildReviewMerchantTenderReconciliationUseCase({ posRepository });
export const getPosReportsOverviewUseCase = buildGetPosReportsOverviewUseCase({ posRepository });
export const exportPosReportsUseCase = buildExportPosReportsUseCase({ posRepository });
export const getPosTransactionByIdUseCase = buildGetPosTransactionByIdUseCase({ posRepository });
export const recordFiscalPrintEventUseCase = buildRecordFiscalPrintEventUseCase({ posRepository });
export const voidPosTransactionUseCase = buildVoidPosTransactionUseCase({
    posRepository,
    inventoryCommandService: inventoryStockCommandService,
    employeeCreditService
});
export const cashRefundPosTransactionUseCase = buildCashRefundPosTransactionUseCase({ posRepository });
export const externalRefundPosTransactionUseCase = buildExternalRefundPosTransactionUseCase({ posRepository });
export const providerRefundPosTransactionUseCase = buildProviderRefundPosTransactionUseCase({
    posRepository,
    commercePaymentRepository,
    createCommercePaymentRefundUseCase,
    paymongoService
});
export const splitAllocationReversalUseCase = buildSplitAllocationReversalUseCase({
    posRepository,
    providerReconciler: createPosPayMongoReconciler({ paymongoService })
});
export const generateESalesReportUseCase = buildGenerateESalesReportUseCase({ posRepository });
export const listESalesReportsUseCase = buildListESalesReportsUseCase({ posRepository });
export const verifyFiscalEventLedgerUseCase = buildVerifyFiscalEventLedgerUseCase({ posRepository });
export const updateESalesReportStatusUseCase = buildUpdateESalesReportStatusUseCase({ posRepository });
export const upsertFiscalTerminalRegistrationUseCase = buildUpsertFiscalTerminalRegistrationUseCase({ posRepository });
export const listFiscalTerminalRegistrationsUseCase = buildListFiscalTerminalRegistrationsUseCase({ posRepository });
export const getDayCloseReadinessUseCase = buildGetDayCloseReadinessUseCase({ posRepository });
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
export const getCashierShiftHistoryUseCase = buildGetCashierShiftHistoryUseCase({ posRepository });
export const recordCashDrawerEventUseCase = buildRecordCashDrawerEventUseCase({ posRepository });
export const closeTerminalShiftUseCase = buildCloseTerminalShiftUseCase({ posRepository });
export const forceCloseStaleTerminalShiftUseCase = buildForceCloseStaleTerminalShiftUseCase({ posRepository });
export const getTerminalTodayDashboardUseCase = buildGetTerminalTodayDashboardUseCase({ posRepository });
export const listIncomingOnlineOrdersUseCase = buildListIncomingOnlineOrdersUseCase({ posRepository });
export const listOnlineOrderHistoryUseCase = buildListOnlineOrderHistoryUseCase({ posRepository });
export const listActiveDeliveryPersonnelUseCase = buildListActiveDeliveryPersonnelUseCase({ posRepository });
export const getAdminLocationMonitorUseCase = buildGetAdminLocationMonitorUseCase({ posRepository });
export const collectCashPickupOrderUseCase = buildCollectCashPickupOrderUseCase({ posRepository });
export const collectCashDeliveryOrderUseCase = buildCollectCashDeliveryOrderUseCase({ posRepository });
export const assignDeliveryPersonnelUseCase = buildAssignDeliveryPersonnelUseCase({ posRepository });
export const updateDeliveryJobStatusUseCase = buildUpdateDeliveryJobStatusUseCase({ posRepository });
export const updateOnlineOrderStatusUseCase = buildUpdateOnlineOrderStatusUseCase({
    posRepository,
    inventoryCommandService: inventoryStockCommandService,
    inventoryReservationService,
    commerceOrderLifecycleUseCase: handleCommerceOrderLifecycleUseCase
});
export const verifyPosTerminalUseCase = buildVerifyPosTerminalUseCase({
    posRepository,
    terminalPairingService: posTerminalPairingService
});
export const getPairedPosTerminalUseCase = buildGetPairedPosTerminalUseCase({ posRepository });
// Resolved once at module load per ADR 0053: which driver handles backend-
// dispatched hardware (LAN bridge, client-managed, or disabled) is a deployment
// setting (POS_DEVICE_DRIVER / DEVICE_BRIDGE_ENABLED), not a per-request choice.
const posDeviceDriver = resolvePosDeviceDriver();
export const getPosDeviceStatusUseCase = buildGetPosDeviceStatusUseCase({
    posRepository,
    deviceDriver: posDeviceDriver
});
export const printPosReceiptUseCase = buildPrintPosReceiptUseCase({
    posRepository,
    deviceDriver: posDeviceDriver
});
export const printPosShiftSummaryUseCase = buildPrintPosShiftSummaryUseCase({
    posRepository,
    deviceDriver: posDeviceDriver
});
export const printPosZReadingUseCase = buildPrintPosZReadingUseCase({
    posRepository,
    deviceDriver: posDeviceDriver
});
export const authorizePosDrawerUseCase = buildAuthorizePosDrawerUseCase({
    posRepository,
    authorizationService: posDrawerAuthorizationService
});
export const openPosDrawerUseCase = buildOpenPosDrawerUseCase({
    posRepository,
    deviceDriver: posDeviceDriver,
    authorizationService: posDrawerAuthorizationService
});
export const getMobilePosCatalogBootstrapUseCase = buildGetMobilePosCatalogBootstrapUseCase({ listPosCatalogUseCase });
export const getMobilePosSettingsBootstrapUseCase = buildGetMobilePosSettingsBootstrapUseCase();
export const getMobilePosDevicePolicyUseCase = buildGetMobilePosDevicePolicyUseCase({ posRepository });
export const syncMobilePosCheckoutsUseCase = buildSyncMobilePosCheckoutsUseCase({ checkoutPosUseCase });
export const syncMobilePosItemsUseCase = buildSyncMobilePosItemsUseCase({
    createItemUseCase,
    updateItemUseCase,
    deleteItemUseCase,
    itemRepository
});
export const syncMobilePosShiftsUseCase = buildSyncMobilePosShiftsUseCase({
    openTerminalShiftUseCase,
    switchTerminalShiftLocationUseCase,
    recordCashDrawerEventUseCase,
    closeTerminalShiftUseCase
});
export const syncMobilePosHardwareEventsUseCase = buildSyncMobilePosHardwareEventsUseCase();
export const acknowledgeMobilePosCheckpointUseCase = buildAcknowledgeMobilePosCheckpointUseCase();

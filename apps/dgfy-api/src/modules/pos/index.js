import { posRepository } from './repositories/posRepository.js';
export { createPosCashierAttendanceRepository } from './repositories/posCashierAttendanceRepository.js';
export {
    serializeEmployeeAttendanceSession,
    serializeEmployeeBreakSegment,
    serializePosDrawerHandoffEvent,
    serializePosTerminalOperatorSession,
    serializePosTransactionOperatorAttribution
} from './serializers/posCashierAttendanceSerializers.js';
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
    buildListPosDiscountEmployeesUseCase,
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
    buildRecordOrderBalancePaymentUseCase,
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
import { createPosCashierAttendanceRepository } from './repositories/posCashierAttendanceRepository.js';
import { createPosCashierAttendanceConfigRepository } from './repositories/posCashierAttendanceConfigRepository.js';
import { createPosCashierAttendanceUseCases } from './usecases/posCashierAttendanceUseCases.js';
import { createPosCashierLifecycleUseCases } from './usecases/posCashierLifecycleUseCases.js';
import { createPosCashierAttendanceConfigUseCases } from './usecases/posCashierAttendanceConfigUseCases.js';
import { resolveMovementLocation, assertLocationAccess } from '../../services/locationInventoryService.js';
import { resolvePosCashierAttendanceFeature, requirePosCashierAttendanceFeature } from './services/posCashierAttendanceFeature.js';
import { assertPosAttendanceLifecyclePermission } from './services/posAttendancePermissionPolicy.js';
import posOperatorAuthorityService from './services/posOperatorAuthorityService.js';
import { createPosOperatorAuthorityUseCases } from './usecases/posOperatorAuthorityUseCases.js';

const posCashierAttendanceRepository = createPosCashierAttendanceRepository();
const posCashierLifecycleUseCases = createPosCashierLifecycleUseCases({
    repository: posCashierAttendanceRepository,
    resolveFeature: resolvePosCashierAttendanceFeature,
    authorityService: posOperatorAuthorityService,
    // #1045: shared with posOperatorAuthorityUseCases below so both routes
    // enforce the identical pos:attendance:* requirement and reason code.
    assertAttendancePermission: assertPosAttendanceLifecyclePermission
});

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
export const listPosDiscountEmployeesUseCase = buildListPosDiscountEmployeesUseCase({ posRepository });
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
export const openTerminalShiftUseCase = buildOpenTerminalShiftUseCase({
    posRepository,
    onShiftOpened: posCashierLifecycleUseCases.onShiftOpened
});
export const createPosSetupCashierUseCase = buildCreatePosSetupCashierUseCase({ userService });
export const listPosSetupCashiersUseCase = buildListPosSetupCashiersUseCase({ userService });
export const loginPosCashierUseCase = buildLoginPosCashierUseCase({ authService });
export const switchTerminalShiftLocationUseCase = buildSwitchTerminalShiftLocationUseCase({ posRepository });
export const getCurrentTerminalShiftUseCase = buildGetCurrentTerminalShiftUseCase({ posRepository });
export const getCashierShiftHistoryUseCase = buildGetCashierShiftHistoryUseCase({ posRepository });
export const recordCashDrawerEventUseCase = buildRecordCashDrawerEventUseCase({ posRepository });
const revokePosOperatorSessionsForTerminal = ({ terminalId, reason, transaction, at }) => (
    posCashierAttendanceRepository.revokeOperatorSessionsForTerminal({ terminalId, reason, transaction, at })
);
export const closeTerminalShiftUseCase = buildCloseTerminalShiftUseCase({
    posRepository,
    revokeOperatorSessionsForTerminal: revokePosOperatorSessionsForTerminal,
    onShiftClosing: posCashierLifecycleUseCases.onShiftClosing
});
export const forceCloseStaleTerminalShiftUseCase = buildForceCloseStaleTerminalShiftUseCase({
    posRepository,
    revokeOperatorSessionsForTerminal: revokePosOperatorSessionsForTerminal,
    onShiftClosing: posCashierLifecycleUseCases.onShiftClosing
});
export const getTerminalTodayDashboardUseCase = buildGetTerminalTodayDashboardUseCase({ posRepository });
export const listIncomingOnlineOrdersUseCase = buildListIncomingOnlineOrdersUseCase({ posRepository });
export const listOnlineOrderHistoryUseCase = buildListOnlineOrderHistoryUseCase({ posRepository });
export const listActiveDeliveryPersonnelUseCase = buildListActiveDeliveryPersonnelUseCase({ posRepository });
export const getAdminLocationMonitorUseCase = buildGetAdminLocationMonitorUseCase({ posRepository });
export const collectCashPickupOrderUseCase = buildCollectCashPickupOrderUseCase({ posRepository });
export const collectCashDeliveryOrderUseCase = buildCollectCashDeliveryOrderUseCase({ posRepository });
export const recordOrderBalancePaymentUseCase = buildRecordOrderBalancePaymentUseCase({ posRepository });
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
const posCashierAttendanceUseCases = createPosCashierAttendanceUseCases({
    repository: posCashierAttendanceRepository,
    resolveLocation: resolveMovementLocation,
    assertLocationAccess,
    resolveFeature: requirePosCashierAttendanceFeature,
    resolveReadFeature: resolvePosCashierAttendanceFeature,
    revokeOperatorSessionsForUser: ({ userId, reason, transaction, at }) => posCashierAttendanceRepository.revokeOperatorSessionsForUser({ userId, reason, transaction, at })
});
const posCashierAttendanceConfigUseCases = createPosCashierAttendanceConfigUseCases({
    repository: createPosCashierAttendanceConfigRepository()
});
export const getPosCashierAttendanceConfigUseCase = posCashierAttendanceConfigUseCases.getConfig;
export const updatePosCashierAttendanceConfigUseCase = posCashierAttendanceConfigUseCases.updateConfig;
export const getCurrentPosCashierAttendanceUseCase = posCashierAttendanceUseCases.getCurrentAttendance;
export const timeInPosCashierAttendanceUseCase = posCashierAttendanceUseCases.timeIn;
export const timeOutPosCashierAttendanceUseCase = posCashierAttendanceUseCases.timeOut;
export const startPosCashierBreakUseCase = posCashierAttendanceUseCases.startBreak;
export const endPosCashierBreakUseCase = posCashierAttendanceUseCases.endBreak;
export const startPosCashierReliefDutyUseCase = posCashierAttendanceUseCases.startReliefDuty;
export const endPosCashierReliefDutyUseCase = posCashierAttendanceUseCases.endReliefDuty;
export const correctPosCashierAttendanceUseCase = posCashierAttendanceUseCases.correctAttendance;
const posOperatorPinRateLimiter = (() => {
    const failures = new Map();
    const keyState = (key) => failures.get(key) || { count: 0, lockedUntil: 0 };
    return {
        isLocked: (key, at = Date.now()) => keyState(key).lockedUntil > at,
        registerFailure: (key, at = Date.now()) => {
            const state = keyState(key);
            state.count += 1;
            if (state.count >= 5) state.lockedUntil = at + (15 * 60 * 1000);
            failures.set(key, state);
        },
        clear: (key) => failures.delete(key)
    };
})();
const posOperatorAuthorityUseCases = createPosOperatorAuthorityUseCases({
    repository: posCashierAttendanceRepository,
    resolveFeature: requirePosCashierAttendanceFeature,
    resolveMutationFeature: resolvePosCashierAttendanceFeature,
    authorityService: posOperatorAuthorityService,
    rateLimiter: posOperatorPinRateLimiter,
    ensureAttendanceForTakeover: posCashierLifecycleUseCases.ensureAttendanceForTakeover,
    // #1045: same shared policy as posCashierLifecycleUseCases above.
    assertAttendancePermission: assertPosAttendanceLifecyclePermission
});
export const enrollPosCashierPinUseCase = posOperatorAuthorityUseCases.setPin;
export const resetPosCashierPinUseCase = posOperatorAuthorityUseCases.resetPin;
export const takeOverPosRegisterUseCase = posOperatorAuthorityUseCases.takeOver;
export const returnPosRegisterUseCase = posOperatorAuthorityUseCases.returnRegister;
export const startPosSharedReliefUseCase = posOperatorAuthorityUseCases.startSharedRelief;
export const endPosSharedReliefUseCase = posOperatorAuthorityUseCases.endSharedRelief;
export const countedPosCustodyHandoffUseCase = posOperatorAuthorityUseCases.countedHandoff;
export const getCurrentPosOperatorUseCase = posOperatorAuthorityUseCases.getCurrent;
export const listEligiblePosOperatorsUseCase = posOperatorAuthorityUseCases.listEligible;
export const authorizePosOperatorMutationUseCase = posOperatorAuthorityUseCases.authorizeMutation;
export const releasePosOperatorMutationUseCase = posOperatorAuthorityUseCases.releaseMutation;
export const endPosOperatorSessionUseCase = posOperatorAuthorityUseCases.end;
export const resumePosCashierUseCase = posCashierLifecycleUseCases.resume;
export const revokePosOperatorSessionsForUser = posOperatorAuthorityUseCases.revokeForUser;
// Keep the repository-backed revocation adapter available to close/unpair paths and export the
// policy use case for callers that need the same behavior outside a shift close transaction.
export { revokePosOperatorSessionsForTerminal };
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

import {
    createPosSetupCashierUseCase,
    listPosSetupCashiersUseCase,
    loginPosCashierUseCase,
    verifyPosTerminalUseCase,
    getPairedPosTerminalUseCase,
    listPosCatalogUseCase,
    scanPosBarcodeUseCase,
    checkoutPosUseCase,
    listPosTransactionsUseCase,
    getPosReportsOverviewUseCase,
    getPosReportsTopItemsUseCase,
    getPosReportsComparisonUseCase,
    getPosReportsProfitLossUseCase,
    getPosReportsCashierShiftHistoryUseCase,
    exportPosReportsUseCase,
    getPosTransactionByIdUseCase,
    recordFiscalPrintEventUseCase,
    voidPosTransactionUseCase,
    generateESalesReportUseCase,
    listESalesReportsUseCase,
    verifyFiscalEventLedgerUseCase,
    updateESalesReportStatusUseCase,
    upsertFiscalTerminalRegistrationUseCase,
    listFiscalTerminalRegistrationsUseCase,
    closeDayZReadingUseCase,
    getDailyZReadingUseCase,
    getCurrentXReadingUseCase,
    incrementGovernedResetCounterUseCase,
    listPosCatalogOverridesUseCase,
    updatePosCatalogOverrideUseCase,
    updateBulkPosCatalogOverridesUseCase,
    uploadPosCatalogImageUseCase,
    uploadBulkPosCatalogImagesUseCase,
    deletePosCatalogImageUseCase,
    openTerminalShiftUseCase,
    switchTerminalShiftLocationUseCase,
    getCurrentTerminalShiftUseCase,
    recordCashDrawerEventUseCase,
    closeTerminalShiftUseCase,
    getTerminalTodayDashboardUseCase,
    listIncomingOnlineOrdersUseCase,
    updateOnlineOrderStatusUseCase,
    getPosDeviceStatusUseCase,
    printPosReceiptUseCase,
    openPosDrawerUseCase
} from '../index.js';
import { resolveDomainFailure, sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';
import { trackProductUsageFromResult } from '../../../services/productUsageTelemetryService.js';
import {
    SESSION_COOKIE_NAMES,
    clearSessionCookie,
    getCookie,
    setBearerSessionCookie,
    setTenantSessionCookies
} from '../../../utils/browserSessionCookies.js';
import { maxAgeMs as terminalPairingMaxAgeMs } from '../services/posTerminalPairingService.js';

const timestamp = () => new Date().toISOString();
const requestId = (req, res) => req.requestId || res.locals?.requestId || null;

const defaultErrorPayload = (req, res, failure) => ({
    success: false,
    data: null,
    message: failure.message,
    error_code: failure.code,
    errors: failure.details,
    request_id: requestId(req, res),
    timestamp: timestamp()
});

export const createSetupCashier = async (req, res, next) => {
    try {
        const result = await createPosSetupCashierUseCase({
            payload: req.validatedData || req.body || {},
            user: req.user
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 201,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Cashier created',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const listSetupCashiers = async (req, res, next) => {
    try {
        const result = await listPosSetupCashiersUseCase({ user: req.user });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Cashiers retrieved',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const loginCashier = async (req, res, next) => {
    try {
        const result = await loginPosCashierUseCase({
            payload: req.validatedData || req.body || {}
        });
        if (result?.success) {
            setTenantSessionCookies(res, {
                refreshToken: result.data?.refreshToken,
                tenantToken: req.headers?.['x-company-token'] || req.tenant?.company_token || null
            });
        }
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Cashier login successful',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const verifyTerminal = async (req, res, next) => {
    try {
        const result = await verifyPosTerminalUseCase({
            payload: req.validatedData || req.body || {},
            user: req.user
        });
        if (result?.success && result.data?.pairing_token) {
            setBearerSessionCookie(
                res,
                SESSION_COOKIE_NAMES.posTerminalPairing,
                result.data.pairing_token,
                { maxAgeMs: terminalPairingMaxAgeMs }
            );
        }
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: {
                    terminal_identity_policy: result.data?.terminal_identity_policy
                },
                message: 'Terminal verified',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const getPairedTerminal = async (req, res, next) => {
    try {
        const result = await getPairedPosTerminalUseCase({
            pairingToken: getCookie(req, SESSION_COOKIE_NAMES.posTerminalPairing),
            user: req.user
        });
        if (!result?.success) {
            clearSessionCookie(res, SESSION_COOKIE_NAMES.posTerminalPairing);
        }
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Paired terminal verified',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const listCatalog = async (req, res, next) => {
    try {
        const result = await listPosCatalogUseCase({
            query: req.validatedQuery || req.query,
            user: req.user
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const scanBarcode = async (req, res, next) => {
    try {
        const payload = req.validatedData || req.body || {};
        const terminalIdHeader = req.headers['x-pos-terminal-id'];
        if (!payload.terminal_id && typeof terminalIdHeader === 'string' && terminalIdHeader.trim()) {
            payload.terminal_id = terminalIdHeader.trim();
        }

        const result = await scanPosBarcodeUseCase({
            payload,
            user: req.user
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const checkout = async (req, res, next) => {
    try {
        const payload = req.validatedData || req.body;
        const terminalIdHeader = req.headers['x-pos-terminal-id'];
        if (!payload.terminal_id && typeof terminalIdHeader === 'string' && terminalIdHeader.trim()) {
            payload.terminal_id = terminalIdHeader.trim();
        }

        const result = await checkoutPosUseCase({
            payload,
            userId: req.user.user_id,
            user: req.user
        });

        await trackProductUsageFromResult({
            req,
            user: req.user,
            eventType: 'pos_checkout_completed',
            surface: 'pos',
            action: 'checkout',
            result,
            successMetadataResolver: (data) => ({
                pos_transaction_id: data?.transaction?.pos_transaction_id ?? null,
                invoice_number: data?.transaction?.invoice_number ?? null,
                idempotent_replay: Boolean(data?.idempotent_replay)
            })
        });

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 201,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'POS checkout completed',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const recordFiscalPrintEvent = async (req, res, next) => {
    try {
        const result = await recordFiscalPrintEventUseCase({
            posTransactionId: req.validatedParams?.id || req.params.id,
            payload: req.validatedData || req.body || {},
            user: req.user
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 201,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Fiscal print event recorded',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const voidTransaction = async (req, res, next) => {
    try {
        const result = await voidPosTransactionUseCase({
            posTransactionId: req.validatedParams?.id || req.params.id,
            payload: req.validatedData || req.body || {},
            user: req.user
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'POS transaction voided',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const generateESalesReport = async (req, res, next) => {
    try {
        const result = await generateESalesReportUseCase({
            payload: req.validatedData || req.body || {},
            user: req.user
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 201,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'eSales report generated',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const listESalesReports = async (req, res, next) => {
    try {
        const result = await listESalesReportsUseCase({
            query: req.validatedQuery || req.query,
            user: req.user
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const updateESalesReportStatus = async (req, res, next) => {
    try {
        const result = await updateESalesReportStatusUseCase({
            reportId: req.validatedParams?.id || req.params.id,
            payload: req.validatedData || req.body || {},
            user: req.user
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'eSales report status updated',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const upsertFiscalTerminalRegistration = async (req, res, next) => {
    try {
        const result = await upsertFiscalTerminalRegistrationUseCase({
            payload: req.validatedData || req.body || {},
            user: req.user
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Fiscal terminal registration saved',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const listFiscalTerminalRegistrations = async (req, res, next) => {
    try {
        const result = await listFiscalTerminalRegistrationsUseCase({
            query: req.validatedQuery || req.query,
            user: req.user
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const verifyFiscalEventLedger = async (req, res, next) => {
    try {
        const result = await verifyFiscalEventLedgerUseCase({
            query: req.validatedQuery || req.query,
            user: req.user
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const getCurrentTerminalShift = async (req, res, next) => {
    try {
        const result = await getCurrentTerminalShiftUseCase({
            query: req.validatedQuery || req.query,
            user: req.user
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const openTerminalShift = async (req, res, next) => {
    try {
        const result = await openTerminalShiftUseCase({
            payload: req.validatedData || req.body,
            user: req.user
        });
        await trackProductUsageFromResult({
            req,
            user: req.user,
            eventType: 'pos_terminal_shift_opened',
            surface: 'pos_terminal',
            action: 'open_shift',
            result,
            successMetadataResolver: (data) => ({
                shift_id: data?.shift?.pos_terminal_shift_id || null,
                reused_existing: Boolean(data?.reused_existing)
            })
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Terminal shift is ready',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const switchTerminalShiftLocation = async (req, res, next) => {
    try {
        const result = await switchTerminalShiftLocationUseCase({
            shiftId: req.validatedParams?.id || req.params.id,
            payload: req.validatedData || req.body,
            user: req.user
        });
        await trackProductUsageFromResult({
            req,
            user: req.user,
            eventType: 'pos_terminal_shift_location_switched',
            surface: 'pos_terminal',
            action: 'switch_location',
            result,
            successMetadataResolver: (data) => ({
                from_shift_id: data?.from_shift?.pos_terminal_shift_id || null,
                to_shift_id: data?.to_shift?.pos_terminal_shift_id || null,
                from_location_id: data?.from_shift?.location_id || null,
                to_location_id: data?.to_shift?.location_id || null
            })
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Terminal shift location switched successfully',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const recordCashDrawerEvent = async (req, res, next) => {
    try {
        const result = await recordCashDrawerEventUseCase({
            shiftId: req.validatedParams?.id || req.params.id,
            payload: req.validatedData || req.body,
            user: req.user
        });
        await trackProductUsageFromResult({
            req,
            user: req.user,
            eventType: 'pos_cash_drawer_event_recorded',
            surface: 'pos_terminal',
            action: 'cash_event',
            result,
            successMetadataResolver: (data) => ({
                shift_id: data?.pos_terminal_shift_id || null,
                event_type: data?.event_type || null
            })
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Cash drawer event recorded',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const closeTerminalShift = async (req, res, next) => {
    try {
        const result = await closeTerminalShiftUseCase({
            shiftId: req.validatedParams?.id || req.params.id,
            payload: req.validatedData || req.body,
            user: req.user
        });
        await trackProductUsageFromResult({
            req,
            user: req.user,
            eventType: 'pos_terminal_shift_closed',
            surface: 'pos_terminal',
            action: 'close_shift',
            result,
            successMetadataResolver: (data) => ({
                shift_id: data?.shift?.pos_terminal_shift_id || null
            })
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Terminal shift closed successfully',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const getTerminalTodayDashboard = async (req, res, next) => {
    try {
        const result = await getTerminalTodayDashboardUseCase({
            query: req.validatedQuery || req.query,
            user: req.user
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const listIncomingOnlineOrders = async (req, res, next) => {
    try {
        const result = await listIncomingOnlineOrdersUseCase({
            query: req.validatedQuery || req.query,
            user: req.user
        });

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const updateOnlineOrderStatus = async (req, res, next) => {
    try {
        const result = await updateOnlineOrderStatusUseCase({
            posTransactionId: req.validatedParams?.id || req.params.id,
            payload: req.validatedData || req.body,
            user: req.user
        });

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Online order status updated successfully',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const getDeviceStatus = async (req, res, next) => {
    try {
        const result = await getPosDeviceStatusUseCase({
            user: req.user,
            auditContext: {
                ipAddress: req.ip,
                userAgent: req.get('user-agent')
            }
        });

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const printReceipt = async (req, res, next) => {
    try {
        const result = await printPosReceiptUseCase({
            payload: req.validatedData || req.body,
            user: req.user,
            auditContext: {
                ipAddress: req.ip,
                userAgent: req.get('user-agent')
            }
        });

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'POS receipt print request sent',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const openDeviceDrawer = async (req, res, next) => {
    try {
        const result = await openPosDrawerUseCase({
            payload: req.validatedData || req.body,
            user: req.user,
            auditContext: {
                ipAddress: req.ip,
                userAgent: req.get('user-agent')
            }
        });

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'POS cash drawer open request sent',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const listTransactions = async (req, res, next) => {
    try {
        const result = await listPosTransactionsUseCase({
            query: req.validatedQuery || req.query,
            user: req.user
        });
        await trackProductUsageFromResult({
            req,
            user: req.user,
            eventType: 'pos_transactions_viewed',
            surface: 'pos',
            action: 'list_transactions',
            result,
            successMetadataResolver: (data) => ({
                result_count: Array.isArray(data?.transactions) ? data.transactions.length : 0
            })
        });

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const getReportsOverview = async (req, res, next) => {
    try {
        const result = await getPosReportsOverviewUseCase({
            query: req.validatedQuery || req.query,
            user: req.user
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const getReportsTopItems = async (req, res, next) => {
    try {
        const result = await getPosReportsTopItemsUseCase({
            query: req.validatedQuery || req.query,
            user: req.user
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const getReportsComparison = async (req, res, next) => {
    try {
        const result = await getPosReportsComparisonUseCase({
            query: req.validatedQuery || req.query,
            user: req.user
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const getReportsProfitLoss = async (req, res, next) => {
    try {
        const result = await getPosReportsProfitLossUseCase({
            query: req.validatedQuery || req.query,
            user: req.user
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const getReportsCashierShiftHistory = async (req, res, next) => {
    try {
        const result = await getPosReportsCashierShiftHistoryUseCase({
            query: req.validatedQuery || req.query,
            user: req.user
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const exportReports = async (req, res, next) => {
    try {
        const result = await exportPosReportsUseCase({
            query: req.validatedQuery || req.query,
            user: req.user
        });
        if (!result?.success) {
            const failure = resolveDomainFailure(result);
            return res.status(failure.statusCode).json(defaultErrorPayload(req, res, failure));
        }
        res.setHeader('Content-Type', result.data?.content_type || 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${result.data?.filename || 'pos-report.csv'}"`);
        return res.status(200).send(result.data?.content || '');
    } catch (error) {
        next(error);
    }
};

export const getTransactionById = async (req, res, next) => {
    try {
        const result = await getPosTransactionByIdUseCase({
            posTransactionId: req.validatedParams?.id || req.params.id
        });
        await trackProductUsageFromResult({
            req,
            user: req.user,
            eventType: 'pos_transaction_viewed',
            surface: 'pos',
            action: 'view_transaction',
            result,
            successMetadataResolver: (data) => ({
                pos_transaction_id: data?.pos_transaction_id ?? req.params.id
            })
        });

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const closeDayZReading = async (req, res, next) => {
    try {
        const result = await closeDayZReadingUseCase({
            businessDateInput: req.validatedData?.business_date || null
        });
        await trackProductUsageFromResult({
            req,
            user: req.user,
            eventType: 'pos_z_reading_generated',
            surface: 'pos',
            action: 'close_day',
            result,
            successMetadataResolver: (data) => ({
                business_date: data?.business_date ?? null,
                transaction_count: data?.summary?.transaction_count ?? 0
            })
        });

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Z-reading generated successfully',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const getDailyZReading = async (req, res, next) => {
    try {
        const result = await getDailyZReadingUseCase({
            businessDateInput: req.validatedParams?.date || req.params.date
        });

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const getCurrentXReading = async (req, res, next) => {
    try {
        const result = await getCurrentXReadingUseCase({
            query: req.validatedQuery || req.query
        });

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const incrementGovernedResetCounter = async (req, res, next) => {
    try {
        const result = await incrementGovernedResetCounterUseCase({
            payload: req.validatedData || req.body,
            user: req.user
        });
        await trackProductUsageFromResult({
            req,
            user: req.user,
            eventType: 'pos_reset_counter_incremented',
            surface: 'pos',
            action: 'governed_reset_increment',
            result,
            successMetadataResolver: (data) => ({
                business_date: data?.business_date ?? null,
                reset_counter: data?.counters?.reset_counter ?? null
            })
        });

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Reset counter increment recorded',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const listCatalogOverrides = async (req, res, next) => {
    try {
        const result = await listPosCatalogOverridesUseCase({ query: req.validatedQuery || req.query });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const updateCatalogOverride = async (req, res, next) => {
    try {
        const result = await updatePosCatalogOverrideUseCase({
            itemId: req.validatedParams?.item_id || req.params.item_id,
            payload: req.validatedData || req.body,
            user: req.user
        });

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'POS catalog override updated successfully',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const updateBulkCatalogOverrides = async (req, res, next) => {
    try {
        const result = await updateBulkPosCatalogOverridesUseCase({
            payload: req.validatedData || req.body,
            user: req.user
        });

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'POS catalog overrides updated',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const uploadCatalogImage = async (req, res, next) => {
    try {
        const result = await uploadPosCatalogImageUseCase({
            itemId: req.validatedParams?.item_id || req.params.item_id,
            file: req.file,
            user: req.user
        });

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'POS catalog image uploaded successfully',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const uploadBulkCatalogImages = async (req, res, next) => {
    try {
        const result = await uploadBulkPosCatalogImagesUseCase({
            files: req.files,
            user: req.user
        });

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'POS catalog images processed',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const deleteCatalogImage = async (req, res, next) => {
    try {
        const result = await deletePosCatalogImageUseCase({
            itemId: req.validatedParams?.item_id || req.params.item_id,
            user: req.user
        });

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'POS catalog image deleted successfully',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export default {
    createSetupCashier,
    listSetupCashiers,
    loginCashier,
    verifyTerminal,
    getPairedTerminal,
    listCatalog,
    scanBarcode,
    checkout,
    listTransactions,
    getReportsOverview,
    getReportsTopItems,
    getReportsComparison,
    getReportsProfitLoss,
    getReportsCashierShiftHistory,
    exportReports,
    getTransactionById,
    closeDayZReading,
    getDailyZReading,
    getCurrentXReading,
    incrementGovernedResetCounter,
    listCatalogOverrides,
    updateCatalogOverride,
    updateBulkCatalogOverrides,
    uploadCatalogImage,
    uploadBulkCatalogImages,
    deleteCatalogImage,
    getCurrentTerminalShift,
    openTerminalShift,
    switchTerminalShiftLocation,
    recordCashDrawerEvent,
    closeTerminalShift,
    getTerminalTodayDashboard,
    listIncomingOnlineOrders,
    updateOnlineOrderStatus,
    getDeviceStatus,
    printReceipt,
    openDeviceDrawer
};

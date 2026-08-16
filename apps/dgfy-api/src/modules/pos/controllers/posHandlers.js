import {
    verifyPosTerminalUseCase,
    listPosCatalogUseCase,
    scanPosBarcodeUseCase,
    checkoutPosUseCase,
    listPosDiscountApproversUseCase,
    verifyPosDiscountApprovalUseCase,
    listPosTransactionsUseCase,
    getPosReportsOverviewUseCase,
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
    getDayCloseReadinessUseCase,
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
    createPosSetupCashierUseCase,
    listPosSetupCashiersUseCase,
    loginPosCashierUseCase,
    switchTerminalShiftLocationUseCase,
    getCurrentTerminalShiftUseCase,
    getCashierShiftHistoryUseCase,
    recordCashDrawerEventUseCase,
    closeTerminalShiftUseCase,
    forceCloseStaleTerminalShiftUseCase,
    getTerminalTodayDashboardUseCase,
    listIncomingOnlineOrdersUseCase,
    listOnlineOrderHistoryUseCase,
    listActiveDeliveryPersonnelUseCase,
    getAdminLocationMonitorUseCase,
    collectCashPickupOrderUseCase,
    collectCashDeliveryOrderUseCase,
    assignDeliveryPersonnelUseCase,
    updateDeliveryJobStatusUseCase,
    updateOnlineOrderStatusUseCase,
    getPosDeviceStatusUseCase,
    printPosReceiptUseCase,
    printPosShiftSummaryUseCase,
    printPosZReadingUseCase,
    openPosDrawerUseCase,
    getPairedPosTerminalUseCase,
    createPosParkedSaleUseCase,
    listPosParkedSalesUseCase,
    claimPosParkedSaleUseCase,
    reparkPosParkedSaleUseCase,
    cancelPosParkedSaleUseCase,
    createPosPaymentSessionUseCase,
    getPosPaymentSessionUseCase,
    getActivePosPaymentSessionUseCase,
    addPosPaymentAllocationUseCase,
    cancelPosPaymentAllocationUseCase,
    confirmPosPaymentAllocationUseCase,
    reconcilePosPaymentAllocationUseCase,
    cancelPosPaymentSessionUseCase,
    completePosPaymentSessionUseCase,
    getMerchantTenderReconciliationUseCase,
    reviewMerchantTenderReconciliationUseCase
} from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';
import { trackProductUsageFromResult } from '../../../services/productUsageTelemetryService.js';
import {
    setTenantSessionCookies
} from '../../../utils/browserSessionCookies.js';
import { publishCatalogChange, subscribeCatalogChanges } from '../../shared/services/catalogChangeEventBus.js';
import dbStore from '../../../utils/dbStore.js';

const timestamp = () => new Date().toISOString();
const requestId = (req, res) => req?.requestId || res?.locals?.requestId || null;
const publishCatalogInvalidation = async (req, reason, itemIds = []) => {
    const tenantId = req.user?.tenant_id || req.tenant?.id;
    if (!tenantId) return;
    await publishCatalogChange({ tenantId, reason, itemIds });
};

const persistPosSessionAudit = async (req, result, eventType) => {
    if (!result?.success) return;
    try {
        const AuditLog = dbStore.get('AuditLog');
        if (!AuditLog) return;
        const payload = result.data || {};
        const terminalId = String(
            req.headers?.['x-pos-terminal-id']
            || req.body?.terminal_id
            || ''
        ).trim().toUpperCase() || null;
        await AuditLog.create({
            user_id: Number.parseInt(payload.user_id, 10) || null,
            entity_type: 'pos_terminal_session',
            entity_id: Number.parseInt(payload.user_id, 10) || null,
            action: eventType === 'terminal_login' ? 'CREATE' : 'UPDATE',
            event_type: eventType,
            actor_username: String(payload.username || payload.email || req.body?.identifier || '').trim().slice(0, 120) || null,
            terminal_id: terminalId,
            request_id: requestId(req),
            changes: {
                event: eventType,
                terminal_id: terminalId,
                actor_email: String(payload.email || '').trim() || null,
                request_id: requestId(req)
            }
        });
    } catch {
        // Session audit must not prevent a valid cashier login response.
    }
};

const defaultErrorPayload = (req, res, failure) => ({
    success: false,
    data: null,
    message: failure.message,
    error_code: failure.code,
    errors: failure.details,
    request_id: requestId(req, res),
    timestamp: timestamp()
});

export const listDiscountApprovers = async (req, res, next) => {
    try {
        const result = await listPosDiscountApproversUseCase();
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({ success: true, data: result.data, timestamp: timestamp() }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const verifyDiscountApproval = async (req, res, next) => {
    try {
        const result = await verifyPosDiscountApprovalUseCase({
            payload: req.validatedData || req.body || {},
            user: req.user
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'POS discount approval verified',
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
        const query = req.validatedQuery || req.query || {};
        const result = await getPosReportsOverviewUseCase({ query, user: req.user });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({ success: true, data: result.data, timestamp: timestamp() }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const exportReports = async (req, res, next) => {
    try {
        const query = req.validatedQuery || req.query || {};
        const result = await exportPosReportsUseCase({ query, user: req.user });
        if (!result?.success) {
            return sendUseCaseResult(res, result, {
                errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
            });
        }
        res.setHeader('Content-Type', result.data.content_type);
        res.setHeader('Content-Disposition', `attachment; filename="${result.data.filename}"`);
        return res.status(200).send(result.data.content);
    } catch (error) {
        next(error);
    }
};

export const createSetupCashier = async (req, res, next) => {
    try {
        const result = await createPosSetupCashierUseCase({
            payload: req.validatedData || req.body || {},
            user: req.user
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => result.data?.idempotent_replay ? 200 : 201,
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
            await persistPosSessionAudit(req, result, 'terminal_login');
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
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: result.message || 'Terminal paired',
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
            terminalId: String(req.headers?.['x-pos-terminal-id'] || req.query?.terminal_id || '').trim(),
            user: req.user
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Registered terminal resolved',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const clearPairedTerminal = async (req, res, next) => {
    try {
        return res.status(200).json({
            success: true,
            data: {
                cleared: true,
                compatibility_mode: true
            },
            message: 'Terminal pairing cache cleared',
            timestamp: timestamp()
        });
    } catch (error) {
        next(error);
    }
};

export const requireRegisteredTerminal = async (req, res, next) => {
    try {
        const requestedTerminalId = String(
            req.body?.terminal_id
            || req.headers?.['x-pos-terminal-id']
            || ''
        ).trim().toUpperCase();
        const result = await getPairedPosTerminalUseCase({
            terminalId: requestedTerminalId,
            user: req.user
        });
        if (!result?.success) {
            const failure = result?.error || {};
            return res.status(failure.statusCode || 403).json(defaultErrorPayload(req, res, failure));
        }
        const requestedLocationId = Number.parseInt(
            req.body?.location_id || req.body?.target_location_id,
            10
        );
        if (Number.isInteger(requestedLocationId) && requestedLocationId > 0
            && requestedLocationId !== Number(result.data.location_id)) {
            return res.status(403).json({
                success: false,
                data: null,
                message: 'Requested location does not match the registered terminal location.',
                error_code: 'POS_REGISTERED_TERMINAL_LOCATION_MISMATCH',
                timestamp: timestamp()
            });
        }
        req.headers['x-pos-terminal-id'] = result.data.terminal_id;
        req.posTerminalRegistration = result.data;
        return next();
    } catch (error) {
        return next(error);
    }
};

export const requirePairedTerminal = requireRegisteredTerminal;

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

const writeCatalogEvent = (res, type, payload = {}) => {
    res.write(`event: ${type}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
};

// Events are invalidation signals only. The terminal always reloads its own
// authorized catalog, so no item data leaks across location grants.
export const streamCatalogEvents = async (req, res, next) => {
    try {
        const tenantId = String(req.user?.tenant_id || req.tenant?.id || '').trim();
        if (!tenantId) {
            res.status(403).json({
                success: false,
                message: 'Tenant context is required for catalog updates.'
            });
            return;
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders?.();

        writeCatalogEvent(res, 'connected', { connected: true, emitted_at: timestamp() });
        const unsubscribe = subscribeCatalogChanges(tenantId, (event) => {
            writeCatalogEvent(res, 'pos.catalog.changed', {
                reason: event?.reason || 'catalog_changed',
                emitted_at: event?.emitted_at || timestamp()
            });
        });
        const heartbeat = setInterval(() => {
            writeCatalogEvent(res, 'heartbeat', { emitted_at: timestamp() });
        }, 25000);

        req.on('close', () => {
            clearInterval(heartbeat);
            unsubscribe();
            res.end();
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

export const createParkedSale = async (req, res, next) => {
    try {
        const result = await createPosParkedSaleUseCase({
            payload: req.validatedData || req.body || {},
            user: req.user
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 201,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'POS sale parked',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const listParkedSales = async (req, res, next) => {
    try {
        const result = await listPosParkedSalesUseCase({
            query: req.validatedQuery || req.query || {},
            user: req.user
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Parked POS sales retrieved',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const claimParkedSale = async (req, res, next) => {
    try {
        const result = await claimPosParkedSaleUseCase({
            parkedSaleId: req.validatedParams?.id || req.params.id,
            payload: req.validatedData || req.body || {},
            user: req.user
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Parked POS sale claimed',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const cancelParkedSale = async (req, res, next) => {
    try {
        const result = await cancelPosParkedSaleUseCase({
            parkedSaleId: req.validatedParams?.id || req.params.id,
            payload: req.validatedData || req.body || {},
            user: req.user
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Parked POS sale cancelled',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const reparkParkedSale = async (req, res, next) => {
    try {
        const result = await reparkPosParkedSaleUseCase({
            parkedSaleId: req.validatedParams?.id || req.params.id,
            payload: req.validatedData || req.body || {},
            user: req.user
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Parked POS sale updated',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const createPaymentSession = async (req, res, next) => {
    try {
        const result = await createPosPaymentSessionUseCase({
            payload: req.validatedData || req.body || {},
            user: req.user
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 201,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'POS payment session created',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const getPaymentSession = async (req, res, next) => {
    try {
        const result = await getPosPaymentSessionUseCase({
            paymentSessionId: req.validatedParams?.id || req.params.id,
            payload: req.validatedQuery || req.query || {},
            user: req.user
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'POS payment session retrieved',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const getActivePaymentSession = async (req, res, next) => {
    try {
        const result = await getActivePosPaymentSessionUseCase({
            payload: req.validatedQuery || req.query || {},
            user: req.user
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: result.data ? 'Active POS payment session retrieved' : 'No active POS payment session',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const addPaymentAllocation = async (req, res, next) => {
    try {
        const result = await addPosPaymentAllocationUseCase({
            paymentSessionId: req.validatedParams?.id || req.params.id,
            payload: req.validatedData || req.body || {},
            user: req.user
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 201,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'POS payment allocation recorded',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const cancelPaymentAllocation = async (req, res, next) => {
    try {
        const result = await cancelPosPaymentAllocationUseCase({
            paymentSessionId: req.validatedParams?.id || req.params.id,
            allocationId: req.validatedParams?.allocation_id || req.params.allocation_id,
            payload: req.validatedData || req.body || {},
            user: req.user
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'POS payment allocation cancelled',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const confirmPaymentAllocation = async (req, res, next) => {
    try {
        const result = await confirmPosPaymentAllocationUseCase({
            paymentSessionId: req.validatedParams?.id || req.params.id,
            allocationId: req.validatedParams?.allocation_id || req.params.allocation_id,
            payload: req.validatedData || req.body || {},
            user: req.user
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'POS payment allocation provider-confirmed',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const reconcilePaymentAllocation = async (req, res, next) => {
    try {
        const result = await reconcilePosPaymentAllocationUseCase({
            paymentSessionId: req.validatedParams?.id || req.params.id,
            allocationId: req.validatedParams?.allocation_id || req.params.allocation_id,
            payload: req.validatedData || req.body || {},
            user: req.user
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'POS payment allocation provider-reconciled',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const cancelPaymentSession = async (req, res, next) => {
    try {
        const result = await cancelPosPaymentSessionUseCase({
            paymentSessionId: req.validatedParams?.id || req.params.id,
            payload: req.validatedData || req.body || {},
            user: req.user
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'POS payment session cancelled',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const completePaymentSession = async (req, res, next) => {
    try {
        const result = await completePosPaymentSessionUseCase({
            paymentSessionId: req.validatedParams?.id || req.params.id,
            payload: req.validatedData || req.body || {},
            user: req.user
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'POS split payment sale completed',
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

export const getCashierShiftHistory = async (req, res, next) => {
    try {
        const result = await getCashierShiftHistoryUseCase({
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

export const getMerchantTenderReconciliation = async (req, res, next) => {
    try {
        const result = await getMerchantTenderReconciliationUseCase({
            shiftId: req.validatedParams?.id || req.params.id,
            user: req.user
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Merchant tender reconciliation loaded',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const reviewMerchantTenderReconciliation = async (req, res, next) => {
    try {
        const result = await reviewMerchantTenderReconciliationUseCase({
            shiftId: req.validatedParams?.id || req.params.id,
            payload: req.validatedData || req.body || {},
            user: req.user
        });
        await trackProductUsageFromResult({
            req,
            user: req.user,
            eventType: 'pos_merchant_tender_reconciliation_reviewed',
            surface: 'pos_terminal',
            action: 'review_merchant_tender_reconciliation',
            result,
            successMetadataResolver: (data) => ({
                shift_id: data?.reconciliation?.shift_id || null,
                reconciliation_status: data?.reconciliation?.status || null,
                has_variance: Math.abs(Number(data?.reconciliation?.variance_total || 0)) > 0.0001
            })
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 201,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Merchant tender reconciliation reviewed',
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

export const forceCloseStaleTerminalShift = async (req, res, next) => {
    try {
        const result = await forceCloseStaleTerminalShiftUseCase({
            shiftId: req.validatedParams?.id || req.params.id,
            payload: req.validatedData || req.body,
            user: req.user
        });
        await trackProductUsageFromResult({
            req,
            user: req.user,
            eventType: 'pos_terminal_stale_shift_force_closed',
            surface: 'pos_terminal',
            action: 'force_close_stale_shift',
            result,
            successMetadataResolver: (data) => ({
                shift_id: data?.shift?.pos_terminal_shift_id || null,
                original_cashier_id: data?.recovery_authorization?.shift_cashier_id || null
            })
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Stale terminal shift recovered successfully',
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

export const listOnlineOrderHistory = async (req, res, next) => {
    try {
        const result = await listOnlineOrderHistoryUseCase({
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

export const listActiveDeliveryPersonnel = async (req, res, next) => {
    try {
        const result = await listActiveDeliveryPersonnelUseCase({
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

export const getAdminLocationMonitor = async (req, res, next) => {
    try {
        const result = await getAdminLocationMonitorUseCase({
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

export const collectCashPickupOrder = async (req, res, next) => {
    try {
        const result = await collectCashPickupOrderUseCase({
            posTransactionId: req.validatedParams?.id || req.params.id,
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
                message: 'Cash payment collected for pickup order.',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const collectCashDeliveryOrder = async (req, res, next) => {
    try {
        const result = await collectCashDeliveryOrderUseCase({
            posTransactionId: req.validatedParams?.id || req.params.id,
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
                message: 'Cash payment collected for delivery order.',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const assignDeliveryPersonnel = async (req, res, next) => {
    try {
        const result = await assignDeliveryPersonnelUseCase({
            posTransactionId: req.validatedParams?.id || req.params.id,
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
                message: 'Delivery personnel assigned successfully.',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const updateDeliveryJobStatus = async (req, res, next) => {
    try {
        const result = await updateDeliveryJobStatusUseCase({
            posTransactionId: req.validatedParams?.id || req.params.id,
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
                message: 'Delivery job status updated successfully.',
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

export const printShiftSummary = async (req, res, next) => {
    try {
        const result = await printPosShiftSummaryUseCase({
            shiftId: req.validatedParams?.id || req.params.id,
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
                message: 'Shift sales summary print request sent',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const printZReading = async (req, res, next) => {
    try {
        const result = await printPosZReadingUseCase({
            businessDateInput: req.validatedParams?.date || req.params.date,
            locationId: req.posTerminalRegistration?.location_id || null,
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
                message: 'Z-reading print request sent',
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
            businessDateInput: req.validatedData?.business_date || null,
            dayClosePin: req.validatedData?.day_close_pin || '',
            terminalId: req.posTerminalRegistration?.terminal_id || null,
            user: req.user,
            locationId: req.posTerminalRegistration?.location_id || null
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

export const getDayCloseReadiness = async (req, res, next) => {
    try {
        const result = await getDayCloseReadinessUseCase({
            businessDateInput: req.query?.business_date || null,
            user: req.user,
            locationId: req.posTerminalRegistration?.location_id || null
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

export const getDailyZReading = async (req, res, next) => {
    try {
        const result = await getDailyZReadingUseCase({
            businessDateInput: req.validatedParams?.date || req.params.date,
            user: req.user,
            locationId: req.validatedQuery?.location_id || null
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
        const itemId = req.validatedParams?.item_id || req.params.item_id;
        const result = await updatePosCatalogOverrideUseCase({
            itemId,
            payload: req.validatedData || req.body,
            user: req.user
        });
        if (result.success) {
            await publishCatalogInvalidation(req, 'catalog_override_updated', [itemId]);
        }

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
        if (result.success) {
            await publishCatalogInvalidation(req, 'catalog_overrides_updated');
        }

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
        const itemId = req.validatedParams?.item_id || req.params.item_id;
        const result = await uploadPosCatalogImageUseCase({
            itemId,
            file: req.file,
            user: req.user
        });
        if (result.success) {
            await publishCatalogInvalidation(req, 'catalog_image_uploaded', [itemId]);
        }

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
        if (result.success) {
            await publishCatalogInvalidation(req, 'catalog_images_uploaded');
        }

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
        const itemId = req.validatedParams?.item_id || req.params.item_id;
        const result = await deletePosCatalogImageUseCase({
            itemId,
            user: req.user
        });
        if (result.success) {
            await publishCatalogInvalidation(req, 'catalog_image_deleted', [itemId]);
        }

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
    listDiscountApprovers,
    verifyDiscountApproval,
    requireRegisteredTerminal,
    createSetupCashier,
    listSetupCashiers,
    loginCashier,
    listCatalog,
    streamCatalogEvents,
    scanBarcode,
    checkout,
    listTransactions,
    getReportsOverview,
    exportReports,
    getTransactionById,
    getDayCloseReadiness,
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
    getCashierShiftHistory,
    openTerminalShift,
    switchTerminalShiftLocation,
    recordCashDrawerEvent,
    closeTerminalShift,
    forceCloseStaleTerminalShift,
    getTerminalTodayDashboard,
    listIncomingOnlineOrders,
    listActiveDeliveryPersonnel,
    assignDeliveryPersonnel,
    updateOnlineOrderStatus,
    getDeviceStatus,
    printReceipt,
    printShiftSummary,
    printZReading,
    openDeviceDrawer
};

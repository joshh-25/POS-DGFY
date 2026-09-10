import api from '@/services/api';
import { reconcilePosImageUploads } from './posImageUploadReconciliation.js';
import { getBrowserSessionSnapshot } from '../../../services/browserSession.js';
import { createCatalogReadCoordinator } from './posCatalogReadCoordinator.js';
import { emitPosHardwareMessage } from '../utils/posHardwareMessageBus.js';
import { ANALYTICS_EVENTS, trackFunnelEvent } from '../../../observability/analyticsEvents.js';
import {
    assignItemOptionGroups,
    createServiceOptionGroup,
    deactivateServiceOption,
    getItemOptionGroups,
    listServiceOptionGroups,
    updateServiceOptionGroup
} from '../../services/api/servicesApi.js';
const TERMINAL_ID_STORAGE_KEY = 'pos_terminal_identity_v1';
export const POS_ATTENDANCE_CONFIG_CHANGED_EVENT = 'dgfy:pos-attendance-config-changed';

const getRegisteredTerminalHeaders = (terminalId = '') => {
    const storedTerminalId = typeof window !== 'undefined'
        ? String(window.localStorage.getItem(TERMINAL_ID_STORAGE_KEY) || '').trim().toUpperCase()
        : '';
    const resolvedTerminalId = String(terminalId || storedTerminalId).trim().toUpperCase();
    return resolvedTerminalId ? { 'x-pos-terminal-id': resolvedTerminalId } : undefined;
};

const coordinateCatalogRead = createCatalogReadCoordinator();
export const fetchPosCatalog = async (params = {}) => {
    const session = getBrowserSessionSnapshot();
    const key = JSON.stringify([session.companyToken, session.generation, Object.entries(params).sort()]);
    const response = await coordinateCatalogRead(key, () => api.get('/pos/catalog', { params }));
    if (getBrowserSessionSnapshot().generation !== session.generation) throw new Error('Catalog session changed.');
    void reconcilePosImageUploads(response.data?.data || []);
    return response.data?.data || [];
};

export const fetchPosCatalogPage = async (params = {}) => {
    const session = getBrowserSessionSnapshot();
    const pagedParams = { ...params, paginate: true };
    const response = await api.get('/pos/catalog', { params: pagedParams });
    // Guard against a company switch landing mid-flight: a page of the previous
    // tenant's catalog must never be rendered against the newly selected one.
    if (getBrowserSessionSnapshot().generation !== session.generation) throw new Error('Catalog session changed.');
    const payload = response.data?.data || {};
    const items = Array.isArray(payload.items) ? payload.items : [];
    // Paged POS catalog reads are the primary data refresh used by Items.
    // Run the same worker reconciliation used by the unpaged catalog path so
    // Edit Item previews are replaced as soon as the background job completes.
    void reconcilePosImageUploads(items);
    return {
        items,
        pagination: payload.pagination || { page: 1, page_size: 15, total: 0, total_pages: 1 }
    };
};

// Preserve the POS-facing names while keeping one Services API implementation
// shared by SKUpervisor and POS.
export const fetchPosServiceOptionGroups = listServiceOptionGroups;
export const createPosServiceOptionGroup = createServiceOptionGroup;
export const updatePosServiceOptionGroup = updateServiceOptionGroup;
export const deactivatePosServiceOption = deactivateServiceOption;
export const fetchPosItemOptionGroups = getItemOptionGroups;
export const assignPosItemOptionGroups = assignItemOptionGroups;

export const fetchPosSettingsBootstrap = async (requestConfig = {}) => {
    const response = await api.get('/mobile-pos/bootstrap/settings', requestConfig);
    return response.data?.data?.settings || {};
};

export const fetchPosCashierAttendanceConfig = async () => {
    const response = await api.get('/pos/attendance/config');
    return response.data?.data || null;
};

export const updatePosCashierAttendanceConfig = async (payload) => {
    const response = await api.put('/pos/attendance/config', payload);
    return response.data?.data || null;
};

export const scanPosBarcode = async (payload = {}) => {
    const response = await api.post('/pos/scan', payload, {
        headers: payload?.terminal_id
            ? { 'x-pos-terminal-id': payload.terminal_id }
            : undefined
    });
    return response.data?.data;
};

export const createPosCheckout = async (payload) => {
    const response = await api.post('/pos/checkouts', payload, {
        headers: payload?.terminal_id
            ? { 'x-pos-terminal-id': payload.terminal_id }
            : undefined
    });
    const data = response.data?.data;
    trackFunnelEvent(ANALYTICS_EVENTS.POS_PAYMENT_METHOD_SELECTED, {
        payment_method: payload?.payment_method
    });
    trackFunnelEvent(ANALYTICS_EVENTS.POS_ORDER_COMPLETED, {
        order_value: data?.total_amount ?? payload?.total_amount,
        item_count: Array.isArray(payload?.items) ? payload.items.length : undefined,
        payment_method: payload?.payment_method,
        fulfillment_type: payload?.order_method || payload?.fulfillment_type
    });
    return data;
};

export const createPosParkedSale = async (payload = {}) => {
    const response = await api.post('/pos/parked-sales', payload, {
        headers: getRegisteredTerminalHeaders(payload?.terminal_id)
    });
    return response.data?.data;
};

export const fetchPosParkedSales = async (params = {}) => {
    const response = await api.get('/pos/parked-sales', { params });
    return response.data?.data;
};

export const claimPosParkedSale = async (parkedSaleId, payload = {}) => {
    const response = await api.post(`/pos/parked-sales/${parkedSaleId}/claim`, payload, {
        headers: getRegisteredTerminalHeaders(payload?.terminal_id)
    });
    return response.data?.data;
};

export const reparkPosParkedSale = async (parkedSaleId, payload = {}) => {
    const response = await api.post(`/pos/parked-sales/${parkedSaleId}/repark`, payload, {
        headers: getRegisteredTerminalHeaders(payload?.terminal_id)
    });
    return response.data?.data;
};

export const cancelPosParkedSale = async (parkedSaleId, payload = {}) => {
    const response = await api.post(`/pos/parked-sales/${parkedSaleId}/cancel`, payload, {
        headers: getRegisteredTerminalHeaders(payload?.terminal_id)
    });
    return response.data?.data;
};

export const createPosPaymentSession = async (payload = {}) => {
    const response = await api.post('/pos/payment-sessions', payload, {
        headers: getRegisteredTerminalHeaders(payload?.terminal_id)
    });
    return response.data?.data;
};

export const fetchActivePosPaymentSession = async (scope = {}) => {
    const response = await api.get('/pos/payment-sessions/active', {
        params: scope,
        headers: getRegisteredTerminalHeaders(scope?.terminal_id)
    });
    return response.data?.data || null;
};

export const fetchPosPaymentSession = async (paymentSessionId, scope = {}) => {
    const response = await api.get(`/pos/payment-sessions/${paymentSessionId}`, {
        params: scope,
        headers: getRegisteredTerminalHeaders(scope?.terminal_id)
    });
    return response.data?.data;
};

export const addPosPaymentAllocation = async (paymentSessionId, payload = {}) => {
    const response = await api.post(`/pos/payment-sessions/${paymentSessionId}/allocations`, payload, {
        headers: getRegisteredTerminalHeaders(payload?.terminal_id)
    });
    return response.data?.data;
};

export const cancelPosPaymentAllocation = async (paymentSessionId, allocationId, payload = {}) => {
    const response = await api.post(`/pos/payment-sessions/${paymentSessionId}/allocations/${allocationId}/cancel`, payload, {
        headers: getRegisteredTerminalHeaders(payload?.terminal_id)
    });
    return response.data?.data;
};

export const cancelPosPaymentSession = async (paymentSessionId, payload = {}) => {
    const response = await api.post(`/pos/payment-sessions/${paymentSessionId}/cancel`, payload, {
        headers: getRegisteredTerminalHeaders(payload?.terminal_id)
    });
    return response.data?.data;
};

export const completePosPaymentSession = async (paymentSessionId, payload = {}) => {
    const response = await api.post(`/pos/payment-sessions/${paymentSessionId}/complete`, payload, {
        headers: getRegisteredTerminalHeaders(payload?.terminal_id)
    });
    return response.data?.data;
};

export const fetchPosDiscountApprovers = async () => {
    const response = await api.get('/pos/discount-approvers');
    return response.data?.data?.approvers || [];
};

export const fetchPosDiscountEmployees = async () => {
    const response = await api.get('/pos/discount-employees');
    return response.data?.data?.employees || [];
};

export const verifyPosDiscountApproval = async (payload = {}) => {
    const response = await api.post('/pos/discount-approvals/verify', payload);
    return response.data?.data?.approver || null;
};

export const fetchPosTransactions = async (params = {}) => {
    const response = await api.get('/pos/transactions', { params });
    return response.data?.data;
};

export const fetchPosTransactionById = async (id) => {
    const response = await api.get(`/pos/transactions/${id}`);
    return response.data?.data;
};

export const voidPosTransaction = async (id, payload = {}) => {
    const response = await api.post(`/pos/transactions/${id}/void`, payload, {
        headers: getRegisteredTerminalHeaders(payload?.terminal_id)
    });
    trackFunnelEvent(ANALYTICS_EVENTS.POS_ORDER_VOIDED, {
        transaction_id: id,
        reason: payload?.reason
    });
    return response.data?.data;
};

export const refundCashPosTransaction = async (id, payload = {}) => {
    const response = await api.post(`/pos/transactions/${id}/cash-refund`, payload, {
        headers: getRegisteredTerminalHeaders(payload?.terminal_id)
    });
    return response.data?.data;
};

export const recordExternalPosTransactionRefund = async (id, payload = {}) => {
    const response = await api.post(`/pos/transactions/${id}/external-refund`, payload, {
        headers: getRegisteredTerminalHeaders(payload?.terminal_id)
    });
    return response.data?.data;
};

export const refundProviderPosTransaction = async (id, payload = {}) => {
    const response = await api.post(`/pos/transactions/${id}/provider-refund`, payload, {
        headers: getRegisteredTerminalHeaders(payload?.terminal_id)
    });
    return response.data?.data;
};

export const reversePosSplitAllocation = async (transactionId, allocationId, payload = {}) => {
    const response = await api.post(`/pos/transactions/${transactionId}/split-allocations/${allocationId}/reversal`, payload, {
        headers: getRegisteredTerminalHeaders(payload?.terminal_id)
    });
    return response.data?.data;
};

export const createPosSetupCashier = async (payload = {}) => {
    const response = await api.post('/pos/setup/cashiers', payload);
    return response.data?.data;
};

export const fetchPosSetupCashiers = async () => {
    const response = await api.get('/pos/setup/cashiers');
    return response.data?.data?.cashiers || [];
};

export const fetchPosDeviceStatus = async () => {
    const response = await api.get('/pos/device/status', {
        // Device status is a background capability probe. In tablet/APK deployments
        // the local HTTP bridge can be absent, so this should fail quietly.
        skipGlobalErrorToast: true
    });
    return response.data?.data;
};

// `silent` is used when a client-side driver (iMin native, a future Web
// Bluetooth driver) already printed/opened the drawer itself and is only
// reporting the outcome back for the backend audit trail (payload carries
// client_driver_id/client_result — see posDeviceUseCases.js). The physical
// action already happened and was already surfaced to the cashier, so this
// call must not raise a second toast or a second failed-print analytics event.
export const printPosReceipt = async (payload = {}, { silent = false, timeoutMs } = {}) => {
    try {
        const response = await api.post('/pos/device/print-receipt', payload, {
            headers: payload?.terminal_id
                ? { 'x-pos-terminal-id': payload.terminal_id }
                : undefined,
            skipGlobalErrorToast: silent || undefined,
            timeout: timeoutMs
        });
        const responsePayload = response.data?.data;
        const message = String(response.data?.message || responsePayload?.message || '').trim();
        if (message && !silent) {
            emitPosHardwareMessage({
                title: 'POS receipt printer',
                message,
                tone: 'success',
                source: 'POS hardware'
            });
        }
        return responsePayload;
    } catch (error) {
        if (!silent) {
            emitPosHardwareMessage({
                title: 'POS receipt printer error',
                message: String(error?.response?.data?.message || error?.message || 'Failed to send receipt to printer.').trim(),
                tone: 'error',
                source: 'POS hardware',
                details: error?.response?.data?.errors || null
            });
            trackFunnelEvent(ANALYTICS_EVENTS.POS_PRINT_FAILED, {
                reason: error?.response?.data?.message || error?.message
            });
        }
        throw error;
    }
};

export const claimOnlineOrderReceiptAutoPrint = async (payload = {}) => {
    const response = await api.post('/pos/device/online-order-receipt-claim', payload, {
        headers: getRegisteredTerminalHeaders(payload?.terminal_id),
        skipGlobalErrorToast: true
    });
    return response.data?.data;
};

export const printPosShiftSummary = async (shiftId, payload = {}, { silent = false, timeoutMs } = {}) => {
    try {
        const response = await api.post(`/pos/terminal/shifts/${shiftId}/print-summary`, payload, {
            headers: payload?.terminal_id
                ? { 'x-pos-terminal-id': payload.terminal_id }
                : undefined,
            skipGlobalErrorToast: silent || undefined,
            timeout: timeoutMs
        });
        const responsePayload = response.data?.data;
        const message = String(response.data?.message || responsePayload?.message || '').trim();
        if (message && !silent) {
            emitPosHardwareMessage({
                title: 'POS shift summary printer',
                message,
                tone: 'success',
                source: 'POS hardware'
            });
        }
        return responsePayload;
    } catch (error) {
        if (!silent) {
            emitPosHardwareMessage({
                title: 'POS shift summary printer error',
                message: String(error?.response?.data?.message || error?.message || 'Failed to print shift sales summary.').trim(),
                tone: 'error',
                source: 'POS hardware',
                details: error?.response?.data?.errors || null
            });
        }
        throw error;
    }
};

export const printPosZReading = async (businessDate, payload = {}, { silent = false, timeoutMs } = {}) => {
    const normalizedDate = String(businessDate || '').trim();
    if (!normalizedDate) throw new Error('Business date is required to print the Z-reading.');
    try {
        const response = await api.post(`/pos/z-reading/${normalizedDate}/print`, payload, {
            headers: getRegisteredTerminalHeaders(payload?.terminal_id),
            skipGlobalErrorToast: silent || undefined,
            timeout: timeoutMs
        });
        const responsePayload = response.data?.data;
        const message = String(response.data?.message || responsePayload?.message || '').trim();
        if (message && !silent) {
            emitPosHardwareMessage({
                title: 'POS Z-reading printer',
                message,
                tone: 'success',
                source: 'POS hardware'
            });
        }
        return responsePayload;
    } catch (error) {
        if (!silent) {
            emitPosHardwareMessage({
                title: 'POS Z-reading printer error',
                message: String(error?.response?.data?.message || error?.message || 'Failed to print the Z-reading.').trim(),
                tone: 'error',
                source: 'POS hardware',
                details: error?.response?.data?.errors || null
            });
        }
        throw error;
    }
};

export const openPosDeviceDrawer = async (payload = {}, { silent = false, timeoutMs } = {}) => {
    try {
        const response = await api.post('/pos/device/open-drawer', payload, {
            headers: payload?.terminal_id
                ? { 'x-pos-terminal-id': payload.terminal_id }
                : undefined,
            skipGlobalErrorToast: silent || undefined,
            timeout: timeoutMs
        });
        const responsePayload = response.data?.data;
        const message = String(response.data?.message || responsePayload?.message || '').trim();
        if (message && !silent) {
            emitPosHardwareMessage({
                title: 'POS cash drawer',
                message,
                tone: 'success',
                source: 'POS hardware'
            });
        }
        return responsePayload;
    } catch (error) {
        if (!silent) {
            emitPosHardwareMessage({
                title: 'POS cash drawer error',
                message: String(error?.response?.data?.message || error?.message || 'Failed to open the cash drawer.').trim(),
                tone: 'error',
                source: 'POS hardware',
                details: error?.response?.data?.errors || null
            });
        }
        throw error;
    }
};

export const authorizePosDrawerOpen = async (payload = {}) => {
    const response = await api.post('/pos/device/authorize-drawer', payload, {
        headers: payload?.terminal_id
            ? { 'x-pos-terminal-id': payload.terminal_id }
            : undefined
    });
    return response.data?.data;
};

const CLIENT_RESULT_AUDIT_MAX_ATTEMPTS = 3;
const CLIENT_RESULT_AUDIT_TIMEOUT_MS = 5_000;

const shouldRetryClientResultAudit = (error) => {
    const status = Number(error?.response?.status || 0);
    return status === 0 || status >= 500;
};

// Reports a client-driver-executed hardware outcome to the backend for audit.
// The client driver awaits this confirmation before returning its final result.
// Transient failures are retried with the same idempotency key so a lost
// response cannot create duplicate audit rows.
export const reportPosDeviceClientResult = async ({
    operation,
    transactionId,
    shiftId,
    businessDate,
    locationId,
    terminalId,
    reason,
    idempotencyKey,
    drawerAuthorizationToken,
    driverId,
    result
}) => {
    const submit = async () => {
        if (operation === 'open_drawer') {
            return openPosDeviceDrawer({
                idempotency_key: idempotencyKey,
                shift_id: shiftId,
                transaction_id: transactionId || undefined,
                terminal_id: terminalId || undefined,
                reason: reason || 'client_driver_report',
                drawer_authorization_token: drawerAuthorizationToken || undefined,
                client_driver_id: driverId,
                client_result: result
            }, { silent: true, timeoutMs: CLIENT_RESULT_AUDIT_TIMEOUT_MS });
        }

        if (operation === 'print_shift_summary') {
            return printPosShiftSummary(shiftId, {
                idempotency_key: idempotencyKey,
                terminal_id: terminalId || undefined,
                reason: reason || 'client_driver_report',
                client_driver_id: driverId,
                client_result: result
            }, { silent: true, timeoutMs: CLIENT_RESULT_AUDIT_TIMEOUT_MS });
        }

        if (operation === 'print_z_reading') {
            return printPosZReading(businessDate, {
                idempotency_key: idempotencyKey,
                terminal_id: terminalId || undefined,
                location_id: locationId || undefined,
                reason: reason || 'client_driver_report',
                client_driver_id: driverId,
                client_result: result
            }, { silent: true, timeoutMs: CLIENT_RESULT_AUDIT_TIMEOUT_MS });
        }

        return printPosReceipt({
            idempotency_key: idempotencyKey,
            transaction_id: transactionId,
            terminal_id: terminalId || undefined,
            reason: reason || 'client_driver_report',
            client_driver_id: driverId,
            client_result: result
        }, { silent: true, timeoutMs: CLIENT_RESULT_AUDIT_TIMEOUT_MS });
    };

    let lastError = null;
    for (let attempt = 1; attempt <= CLIENT_RESULT_AUDIT_MAX_ATTEMPTS; attempt += 1) {
        try {
            return await submit();
        } catch (error) {
            lastError = error;
            if (!shouldRetryClientResultAudit(error) || attempt === CLIENT_RESULT_AUDIT_MAX_ATTEMPTS) {
                break;
            }
        }
    }

    throw lastError || new Error('The POS hardware audit result could not be confirmed.');
};

export const closePosDay = async (businessDate = null, { dayClosePin = '' } = {}) => {
    const payload = {
        ...(businessDate ? { business_date: businessDate } : {}),
        day_close_pin: dayClosePin
    };
    const response = await api.post('/pos/z-reading/close-day', payload, {
        headers: getRegisteredTerminalHeaders()
    });
    return response.data?.data;
};

export const fetchPosDayCloseReadiness = async (businessDate = null) => {
    const response = await api.get('/pos/z-reading/close-readiness', {
        params: businessDate ? { business_date: businessDate } : undefined,
        headers: getRegisteredTerminalHeaders()
    });
    return response.data?.data;
};

export const fetchDailyZReading = async (businessDate) => {
    const response = await api.get(`/pos/z-reading/${businessDate}`);
    return response.data?.data;
};

export const fetchCurrentXReading = async (params = {}) => {
    const response = await api.get('/pos/x-reading/current', { params });
    return response.data?.data;
};

export const incrementGovernedResetCounter = async (payload) => {
    const response = await api.post('/pos/z-reading/governed-reset', payload, {
        headers: getRegisteredTerminalHeaders(payload?.terminal_id)
    });
    return response.data?.data;
};

export const fetchCurrentTerminalShift = async (params = {}, requestConfig = {}) => {
    const response = await api.get('/pos/terminal/shifts/current', { params, ...requestConfig });
    return response.data?.data;
};

export const fetchCurrentPosCashierAttendance = async (params = {}, requestConfig = {}) => {
    const response = await api.get('/pos/attendance/current', { params, ...requestConfig });
    return response.data?.data;
};

export const timeInPosCashierAttendance = async (payload = {}, requestConfig = {}) => {
    const response = await api.post('/pos/attendance/time-in', payload, requestConfig);
    return response.data?.data;
};

export const timeOutPosCashierAttendance = async (payload = {}, requestConfig = {}) => {
    const response = await api.post('/pos/attendance/time-out', payload, requestConfig);
    return response.data?.data;
};

export const startPosCashierBreak = async (payload = {}, requestConfig = {}) => {
    const response = await api.post('/pos/attendance/breaks/start', payload, requestConfig);
    return response.data?.data;
};

export const endPosCashierBreak = async (payload = {}, requestConfig = {}) => {
    const response = await api.post('/pos/attendance/breaks/end', payload, requestConfig);
    return response.data?.data;
};

export const resumePosCashier = async (payload = {}, requestConfig = {}) => {
    const response = await api.post('/pos/terminal/operator/resume', payload, {
        ...requestConfig,
        headers: {
            ...getRegisteredTerminalHeaders(payload?.terminal_id),
            ...(requestConfig.headers || {})
        }
    });
    return response.data?.data;
};

export const startPosCashierReliefDuty = async (payload = {}, requestConfig = {}) => {
    const response = await api.post('/pos/attendance/relief/start', payload, requestConfig);
    return response.data?.data;
};

export const endPosCashierReliefDuty = async (payload = {}, requestConfig = {}) => {
    const response = await api.post('/pos/attendance/relief/end', payload, requestConfig);
    return response.data?.data;
};

const operatorRequestConfig = (terminalId, requestConfig = {}) => ({
    ...requestConfig,
    headers: {
        ...getRegisteredTerminalHeaders(terminalId),
        ...(requestConfig.headers || {})
    }
});

export const fetchCurrentPosOperator = async (params = {}, requestConfig = {}) => {
    const response = await api.get('/pos/terminal/operator/current', {
        params,
        ...operatorRequestConfig(params.terminal_id, requestConfig)
    });
    return response.data?.data;
};

export const fetchEligiblePosOperators = async (params = {}, requestConfig = {}) => {
    const response = await api.get('/pos/terminal/operator/eligible', {
        params,
        ...operatorRequestConfig(params.terminal_id, requestConfig)
    });
    return response.data?.data;
};

const mutatePosOperator = async (path, payload = {}, requestConfig = {}) => {
    const response = await api.post(path, payload, operatorRequestConfig(payload.terminal_id, requestConfig));
    return response.data?.data;
};

export const takeOverPosRegister = (payload = {}, requestConfig = {}) => (
    mutatePosOperator('/pos/terminal/operator/takeover', payload, requestConfig)
);

export const returnPosRegister = (payload = {}, requestConfig = {}) => (
    mutatePosOperator('/pos/terminal/operator/return', payload, requestConfig)
);

export const startPosSharedRelief = (payload = {}, requestConfig = {}) => (
    mutatePosOperator('/pos/terminal/operator/shared-relief/start', payload, requestConfig)
);

export const endPosSharedRelief = (payload = {}, requestConfig = {}) => (
    mutatePosOperator('/pos/terminal/operator/shared-relief/end', payload, requestConfig)
);

export const countedPosCustodyHandoff = (payload = {}, requestConfig = {}) => (
    mutatePosOperator('/pos/terminal/operator/handoff/count', payload, requestConfig)
);

export const fetchCashierShiftHistory = async (params = {}, requestConfig = {}) => {
    const response = await api.get('/pos/terminal/shifts/history', {
        params,
        ...requestConfig
    });
    return response.data?.data;
};

export const openTerminalShift = async (payload = {}, requestConfig = {}) => {
    const response = await api.post('/pos/terminal/shifts/open', payload, requestConfig);
    trackFunnelEvent(ANALYTICS_EVENTS.POS_SHIFT_OPENED, {
        location_id: payload?.location_id
    });
    return response.data?.data;
};

export const switchTerminalShiftLocation = async (shiftId, payload = {}) => {
    const response = await api.post(`/pos/terminal/shifts/${shiftId}/switch-location`, payload, {
        headers: getRegisteredTerminalHeaders(payload?.terminal_id)
    });
    return response.data?.data;
};

export const recordCashDrawerEvent = async (shiftId, payload = {}) => {
    const response = await api.post(`/pos/terminal/shifts/${shiftId}/cash-events`, payload, {
        headers: getRegisteredTerminalHeaders(payload?.terminal_id)
    });
    return response.data?.data;
};

export const closeTerminalShift = async (shiftId, payload = {}) => {
    const response = await api.post(`/pos/terminal/shifts/${shiftId}/close`, payload, {
        headers: getRegisteredTerminalHeaders(payload?.terminal_id)
    });
    trackFunnelEvent(ANALYTICS_EVENTS.POS_SHIFT_CLOSED, { shift_id: shiftId, forced: false });
    return response.data?.data;
};

export const forceCloseStaleTerminalShift = async (shiftId, payload = {}) => {
    const response = await api.post(`/pos/terminal/shifts/${shiftId}/force-close`, payload, {
        headers: getRegisteredTerminalHeaders(payload?.terminal_id)
    });
    trackFunnelEvent(ANALYTICS_EVENTS.POS_SHIFT_CLOSED, { shift_id: shiftId, forced: true });
    return response.data?.data;
};

export const fetchMerchantTenderReconciliation = async (shiftId) => {
    const response = await api.get(`/pos/terminal/shifts/${shiftId}/merchant-tender-reconciliation`);
    return response.data?.data;
};

export const reviewMerchantTenderReconciliation = async (shiftId, payload = {}) => {
    const response = await api.post(`/pos/terminal/shifts/${shiftId}/merchant-tender-reconciliation`, payload);
    return response.data?.data;
};

export const fetchTerminalTodayDashboard = async (params = {}, requestConfig = {}) => {
    const response = await api.get('/pos/terminal/dashboard/today', { params, ...requestConfig });
    return response.data?.data;
};

const normalizeReportDateParam = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return undefined;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

    const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slashMatch) {
        const [, first, second, year] = slashMatch;
        const month = String(Number(first)).padStart(2, '0');
        const day = String(Number(second)).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return raw;
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const normalizePosReportParams = (params = {}) => {
    const nextParams = { ...params };
    const normalizedDateFrom = normalizeReportDateParam(nextParams.date_from);
    const normalizedDateTo = normalizeReportDateParam(nextParams.date_to);

    if (normalizedDateFrom !== undefined) nextParams.date_from = normalizedDateFrom;
    if (normalizedDateTo !== undefined) nextParams.date_to = normalizedDateTo;

    return nextParams;
};

export const fetchPosReportsOverview = async (params = {}, requestConfig = {}) => {
    const response = await api.get('/pos/reports/overview', {
        params: normalizePosReportParams(params),
        ...requestConfig
    });
    return response.data?.data;
};

export const fetchPosReportsTopItems = async (params = {}, requestConfig = {}) => {
    const response = await api.get('/pos/reports/top-items', { params, ...requestConfig });
    return response.data?.data;
};

export const fetchPosReportsComparison = async (params = {}, requestConfig = {}) => {
    const response = await api.get('/pos/reports/comparison', { params, ...requestConfig });
    return response.data?.data;
};

export const fetchPosReportsProfitLoss = async (params = {}, requestConfig = {}) => {
    const response = await api.get('/pos/reports/profit-loss', { params, ...requestConfig });
    return response.data?.data;
};

export const exportPosReportCsv = async (params = {}) => {
    const response = await api.get('/pos/reports/export', {
        params: normalizePosReportParams(params),
        responseType: 'blob'
    });
    return {
        blob: response.data,
        filename: String(response.headers?.['content-disposition'] || '')
            .match(/filename="?([^"]+)"?$/i)?.[1] || 'pos-report.csv'
    };
};

// Phase 261 (#1488): pre-run procurement CSV export.
export const exportProcurementCsv = async (params = {}) => {
    const response = await api.get('/pos/reports/procurement-export', {
        params,
        responseType: 'blob'
    });
    return {
        blob: response.data,
        filename: String(response.headers?.['content-disposition'] || '')
            .match(/filename="?([^"]+)"?$/i)?.[1] || 'procurement-export.csv'
    };
};

export const fetchIncomingOnlineOrders = async (params = {}, requestConfig = {}) => {
    const response = await api.get('/pos/incoming-orders', {
        params,
        ...requestConfig
    });
    return response.data?.data;
};

export const fetchOnlineOrderHistory = async (params = {}, requestConfig = {}) => {
    const response = await api.get('/pos/order-history', {
        params,
        ...requestConfig
    });
    return response.data?.data;
};

export const fetchActiveDeliveryPersonnel = async (params = {}, requestConfig = {}) => {
    const response = await api.get('/pos/delivery-personnel', {
        params,
        ...requestConfig
    });
    return response.data?.data;
};

export const fetchAdminLocationMonitor = async (params = {}, requestConfig = {}) => {
    const response = await api.get('/pos/admin/location-monitor', {
        params,
        ...requestConfig
    });
    return response.data?.data;
};

export const updateOnlineOrderStatus = async (posTransactionId, payload = {}) => {
    const response = await api.patch(`/pos/orders/${posTransactionId}/status`, payload, {
        headers: getRegisteredTerminalHeaders(payload?.terminal_id)
    });
    return response.data?.data;
};

// Phase 210 (#1179). Staff-only post-placement delivery address/pin edit.
export const updateOnlineOrderDeliveryAddress = async (posTransactionId, payload = {}) => {
    const response = await api.patch(`/pos/orders/${posTransactionId}/delivery-address`, payload, {
        headers: getRegisteredTerminalHeaders(payload?.terminal_id)
    });
    return response.data?.data;
};

export const collectCashPickupOrder = async (posTransactionId, payload = {}) => {
    const response = await api.post(`/pos/orders/${posTransactionId}/collect-cash`, payload, {
        headers: getRegisteredTerminalHeaders(payload?.terminal_id)
    });
    return response.data?.data;
};

export const collectCashDeliveryOrder = async (posTransactionId, payload = {}) => {
    const response = await api.post(`/pos/orders/${posTransactionId}/collect-delivery-cash`, payload, {
        headers: getRegisteredTerminalHeaders(payload?.terminal_id)
    });
    return response.data?.data;
};

// Phase 148 (#825): settles the remaining balance on a partially-paid downpayment order. A
// separate endpoint from the two collect-cash calls above, not a variant of them -- those own the
// plain-COD `unpaid` path and are deliberately untouched.
export const recordOrderBalancePayment = async (posTransactionId, payload = {}) => {
    const response = await api.post(`/pos/orders/${posTransactionId}/record-payment`, payload, {
        headers: getRegisteredTerminalHeaders(payload?.terminal_id)
    });
    return response.data?.data;
};

// Phase 204 (#965): attaches a proof-of-payment image to an already-recorded balance settlement.
// A separate call from recordOrderBalancePayment above, always sequenced strictly after it
// resolves (TerminalPage.jsx handleSettleBalance) -- never folded into the same request.
export const uploadOrderBalancePaymentProof = async (posTransactionId, paymentId, file, { terminal_id: terminalId } = {}) => {
    const form = new FormData();
    form.append('proof', file);
    // Do NOT hand-set Content-Type: multipart/form-data -- omitting it is what lets the browser
    // attach its own boundary.
    const response = await api.post(
        `/pos/orders/${posTransactionId}/balance-payments/${paymentId}/proof`,
        form,
        { headers: getRegisteredTerminalHeaders(terminalId) }
    );
    return response.data?.data;
};

// The POS app authenticates with a Bearer header, not a cookie (services/api.js sets
// config.headers.Authorization) -- a plain <img src="..."> would never carry it and would 401.
// Callers MUST fetch -> blob -> object URL, and MUST revokeObjectURL when done with it.
export const fetchOrderBalancePaymentProof = async (posTransactionId, paymentId) => {
    const response = await api.get(
        `/pos/orders/${posTransactionId}/balance-payments/${paymentId}/proof`,
        { responseType: 'blob' }
    );
    return URL.createObjectURL(response.data);
};

export const updateDeliveryJobStatus = async (posTransactionId, payload = {}) => {
    const response = await api.patch(`/pos/orders/${posTransactionId}/delivery-job/status`, payload);
    return response.data?.data;
};

export const assignDeliveryPersonnel = async (posTransactionId, payload = {}) => {
    const response = await api.patch(`/pos/orders/${posTransactionId}/delivery-job/assignment`, payload);
    return response.data?.data;
};

const unsupportedFiscalEndpointError = (operation) => {
    const error = new Error(`${operation} is not available in the current backend runtime.`);
    error.code = 'POS_FISCAL_ENDPOINT_UNAVAILABLE';
    return error;
};

const getDataOrFallback = (response) => response.data?.data ?? response.data ?? null;

export const fetchFiscalTerminalRegistrations = async () => {
    try {
        const response = await api.get('/pos/fiscal-terminal-registrations');
        return getDataOrFallback(response) || [];
    } catch (error) {
        if (error?.response?.status === 404) {
            return [];
        }
        throw error;
    }
};

export const saveFiscalTerminalRegistration = async (payload = {}) => {
    try {
        const id = payload?.pos_fiscal_terminal_registration_id;
        const response = id
            ? await api.put(`/pos/fiscal-terminal-registrations/${id}`, payload)
            : await api.post('/pos/fiscal-terminal-registrations', payload);
        return getDataOrFallback(response);
    } catch (error) {
        if (error?.response?.status === 404) {
            throw unsupportedFiscalEndpointError('Fiscal terminal registration');
        }
        throw error;
    }
};

export const fetchESalesReports = async (params = {}) => {
    try {
        const response = await api.get('/pos/esales-reports', { params });
        return getDataOrFallback(response) || [];
    } catch (error) {
        if (error?.response?.status === 404) {
            return [];
        }
        throw error;
    }
};

export const generateESalesReport = async (payload = {}) => {
    try {
        const response = await api.post('/pos/esales-reports', payload);
        return getDataOrFallback(response);
    } catch (error) {
        if (error?.response?.status === 404) {
            throw unsupportedFiscalEndpointError('eSales report generation');
        }
        throw error;
    }
};

export const updateESalesReportStatus = async (reportId, payload = {}) => {
    try {
        const response = await api.patch(`/pos/esales-reports/${reportId}`, payload);
        return getDataOrFallback(response);
    } catch (error) {
        if (error?.response?.status === 404) {
            throw unsupportedFiscalEndpointError('eSales report status update');
        }
        throw error;
    }
};

export const fetchFiscalLedgerIntegrity = async (params = {}) => {
    try {
        const response = await api.get('/pos/fiscal-ledger-integrity', { params });
        return getDataOrFallback(response) || null;
    } catch (error) {
        if (error?.response?.status === 404) {
            return null;
        }
        throw error;
    }
};

export default {
    fetchPosCatalog,
    fetchPosCashierAttendanceConfig,
    updatePosCashierAttendanceConfig,
    scanPosBarcode,
    createPosCheckout,
    createPosParkedSale,
    fetchPosParkedSales,
    claimPosParkedSale,
    cancelPosParkedSale,
    fetchPosTransactions,
    fetchPosTransactionById,
    fetchPosDeviceStatus,
    printPosReceipt,
    printPosShiftSummary,
    printPosZReading,
    openPosDeviceDrawer,
    reportPosDeviceClientResult,
    closePosDay,
    fetchDailyZReading,
    fetchCurrentXReading,
    incrementGovernedResetCounter,
    fetchCurrentTerminalShift,
    fetchCashierShiftHistory,
    openTerminalShift,
    switchTerminalShiftLocation,
    recordCashDrawerEvent,
    closeTerminalShift,
    forceCloseStaleTerminalShift,
    fetchMerchantTenderReconciliation,
    reviewMerchantTenderReconciliation,
    fetchTerminalTodayDashboard,
    fetchPosReportsOverview,
    fetchPosReportsTopItems,
    fetchPosReportsComparison,
    fetchPosReportsProfitLoss,
    exportPosReportCsv,
    exportProcurementCsv,
    fetchIncomingOnlineOrders,
    fetchOnlineOrderHistory,
    fetchActiveDeliveryPersonnel,
    collectCashPickupOrder,
    collectCashDeliveryOrder,
    recordOrderBalancePayment,
    uploadOrderBalancePaymentProof,
    fetchOrderBalancePaymentProof,
    updateDeliveryJobStatus,
    assignDeliveryPersonnel,
    updateOnlineOrderStatus,
    updateOnlineOrderDeliveryAddress,
    fetchFiscalTerminalRegistrations,
    saveFiscalTerminalRegistration,
    fetchESalesReports,
    generateESalesReport,
    updateESalesReportStatus,
    fetchFiscalLedgerIntegrity
};

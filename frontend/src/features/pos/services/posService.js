import api from '@/services/api';
import { emitPosHardwareMessage } from '../utils/posHardwareMessageBus.js';

const TERMINAL_ID_STORAGE_KEY = 'pos_terminal_identity_v1';

const getRegisteredTerminalHeaders = (terminalId = '') => {
    const storedTerminalId = typeof window !== 'undefined'
        ? String(window.localStorage.getItem(TERMINAL_ID_STORAGE_KEY) || '').trim().toUpperCase()
        : '';
    const resolvedTerminalId = String(terminalId || storedTerminalId).trim().toUpperCase();
    return resolvedTerminalId ? { 'x-pos-terminal-id': resolvedTerminalId } : undefined;
};

export const fetchPosCatalog = async (params = {}) => {
    const response = await api.get('/pos/catalog', { params });
    return response.data?.data || [];
};

export const fetchPosSettingsBootstrap = async (requestConfig = {}) => {
    const response = await api.get('/mobile-pos/bootstrap/settings', requestConfig);
    return response.data?.data?.settings || {};
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
    return response.data?.data;
};

export const fetchPosDiscountApprovers = async () => {
    const response = await api.get('/pos/discount-approvers');
    return response.data?.data?.approvers || [];
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

export const printPosReceipt = async (payload = {}) => {
    try {
        const response = await api.post('/pos/device/print-receipt', payload, {
            headers: payload?.terminal_id
                ? { 'x-pos-terminal-id': payload.terminal_id }
                : undefined
        });
        const responsePayload = response.data?.data;
        const message = String(response.data?.message || responsePayload?.message || '').trim();
        if (message) {
            emitPosHardwareMessage({
                title: 'POS receipt printer',
                message,
                tone: 'success',
                source: 'POS hardware'
            });
        }
        return responsePayload;
    } catch (error) {
        emitPosHardwareMessage({
            title: 'POS receipt printer error',
            message: String(error?.response?.data?.message || error?.message || 'Failed to send receipt to printer.').trim(),
            tone: 'error',
            source: 'POS hardware',
            details: error?.response?.data?.errors || null
        });
        throw error;
    }
};

export const openPosDeviceDrawer = async (payload = {}) => {
    try {
        const response = await api.post('/pos/device/open-drawer', payload, {
            headers: payload?.terminal_id
                ? { 'x-pos-terminal-id': payload.terminal_id }
                : undefined
        });
        const responsePayload = response.data?.data;
        const message = String(response.data?.message || responsePayload?.message || '').trim();
        if (message) {
            emitPosHardwareMessage({
                title: 'POS cash drawer',
                message,
                tone: 'success',
                source: 'POS hardware'
            });
        }
        return responsePayload;
    } catch (error) {
        emitPosHardwareMessage({
            title: 'POS cash drawer error',
            message: String(error?.response?.data?.message || error?.message || 'Failed to open the cash drawer.').trim(),
            tone: 'error',
            source: 'POS hardware',
            details: error?.response?.data?.errors || null
        });
        throw error;
    }
};

export const closePosDay = async (businessDate = null) => {
    const response = await api.post('/pos/z-reading/close-day', businessDate ? { business_date: businessDate } : {}, {
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

export const openTerminalShift = async (payload = {}) => {
    const response = await api.post('/pos/terminal/shifts/open', payload);
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
    return response.data?.data;
};

export const forceCloseStaleTerminalShift = async (shiftId, payload = {}) => {
    const response = await api.post(`/pos/terminal/shifts/${shiftId}/force-close`, payload, {
        headers: getRegisteredTerminalHeaders(payload?.terminal_id)
    });
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

export const fetchIncomingOnlineOrders = async (params = {}, requestConfig = {}) => {
    const response = await api.get('/pos/incoming-orders', {
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

export const collectCashPickupOrder = async (posTransactionId, payload = {}) => {
    const response = await api.post(`/pos/orders/${posTransactionId}/collect-cash`, payload, {
        headers: getRegisteredTerminalHeaders(payload?.terminal_id)
    });
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
    scanPosBarcode,
    createPosCheckout,
    fetchPosTransactions,
    fetchPosTransactionById,
    fetchPosDeviceStatus,
    printPosReceipt,
    openPosDeviceDrawer,
    closePosDay,
    fetchDailyZReading,
    fetchCurrentXReading,
    incrementGovernedResetCounter,
    fetchCurrentTerminalShift,
    openTerminalShift,
    switchTerminalShiftLocation,
    recordCashDrawerEvent,
    closeTerminalShift,
    forceCloseStaleTerminalShift,
    fetchTerminalTodayDashboard,
    fetchPosReportsOverview,
    fetchPosReportsTopItems,
    fetchPosReportsComparison,
    fetchPosReportsProfitLoss,
    exportPosReportCsv,
    fetchIncomingOnlineOrders,
    collectCashPickupOrder,
    updateOnlineOrderStatus,
    fetchFiscalTerminalRegistrations,
    saveFiscalTerminalRegistration,
    fetchESalesReports,
    generateESalesReport,
    updateESalesReportStatus,
    fetchFiscalLedgerIntegrity
};

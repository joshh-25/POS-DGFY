import api from '@/services/api';

export const fetchPosCatalog = async (params = {}) => {
    const response = await api.get('/pos/catalog', { params });
    return response.data?.data || [];
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

export const fetchPosTransactions = async (params = {}) => {
    const response = await api.get('/pos/transactions', { params });
    return response.data?.data;
};

export const fetchPosTransactionById = async (id) => {
    const response = await api.get(`/pos/transactions/${id}`);
    return response.data?.data;
};

export const recordFiscalPrintEvent = async (id, payload = {}) => {
    const response = await api.post(`/pos/transactions/${id}/print-events`, payload);
    return response.data?.data;
};

export const voidPosTransaction = async (id, payload = {}) => {
    const response = await api.post(`/pos/transactions/${id}/void`, payload);
    return response.data?.data;
};

export const generateESalesReport = async (payload = {}) => {
    const response = await api.post('/pos/esales-reports/generate', payload);
    return response.data?.data;
};

export const fetchESalesReports = async () => {
    const response = await api.get('/pos/esales-reports');
    return response.data?.data;
};

export const fetchFiscalLedgerIntegrity = async () => {
    const response = await api.get('/pos/fiscal-ledger/integrity');
    return response.data?.data;
};

export const updateESalesReportStatus = async (id, payload = {}) => {
    const response = await api.patch(`/pos/esales-reports/${id}/status`, payload);
    return response.data?.data;
};

export const fetchFiscalTerminalRegistrations = async () => {
    const response = await api.get('/pos/fiscal-terminal-registrations');
    return response.data?.data;
};

export const saveFiscalTerminalRegistration = async (payload = {}) => {
    const response = await api.put('/pos/fiscal-terminal-registrations', payload);
    return response.data?.data;
};

export const closePosDay = async (businessDate = null) => {
    const response = await api.post('/pos/z-reading/close-day', businessDate ? { business_date: businessDate } : {});
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
    const response = await api.post('/pos/z-reading/governed-reset', payload);
    return response.data?.data;
};

export const fetchCurrentTerminalShift = async (params = {}) => {
    const response = await api.get('/pos/terminal/shifts/current', { params });
    return response.data?.data;
};

export const openTerminalShift = async (payload = {}) => {
    const response = await api.post('/pos/terminal/shifts/open', payload);
    return response.data?.data;
};

export const switchTerminalShiftLocation = async (shiftId, payload = {}) => {
    const response = await api.post(`/pos/terminal/shifts/${shiftId}/switch-location`, payload);
    return response.data?.data;
};

export const recordCashDrawerEvent = async (shiftId, payload = {}) => {
    const response = await api.post(`/pos/terminal/shifts/${shiftId}/cash-events`, payload);
    return response.data?.data;
};

export const closeTerminalShift = async (shiftId, payload = {}) => {
    const response = await api.post(`/pos/terminal/shifts/${shiftId}/close`, payload);
    return response.data?.data;
};

export const fetchTerminalTodayDashboard = async (params = {}) => {
    const response = await api.get('/pos/terminal/dashboard/today', { params });
    return response.data?.data;
};

export const fetchIncomingOnlineOrders = async (params = {}, requestConfig = {}) => {
    const response = await api.get('/pos/incoming-orders', {
        params,
        ...requestConfig
    });
    return response.data?.data;
};

export const updateOnlineOrderStatus = async (posTransactionId, payload = {}) => {
    const response = await api.patch(`/pos/orders/${posTransactionId}/status`, payload);
    return response.data?.data;
};

export default {
    fetchPosCatalog,
    scanPosBarcode,
    createPosCheckout,
    fetchPosTransactions,
    fetchPosTransactionById,
    recordFiscalPrintEvent,
    voidPosTransaction,
    generateESalesReport,
    fetchESalesReports,
    fetchFiscalLedgerIntegrity,
    updateESalesReportStatus,
    fetchFiscalTerminalRegistrations,
    saveFiscalTerminalRegistration,
    closePosDay,
    fetchDailyZReading,
    fetchCurrentXReading,
    incrementGovernedResetCounter,
    fetchCurrentTerminalShift,
    openTerminalShift,
    switchTerminalShiftLocation,
    recordCashDrawerEvent,
    closeTerminalShift,
    fetchTerminalTodayDashboard,
    fetchIncomingOnlineOrders,
    updateOnlineOrderStatus
};

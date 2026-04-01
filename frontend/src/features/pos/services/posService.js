import api from '@/services/api';

export const fetchPosCatalog = async (params = {}) => {
    const response = await api.get('/pos/catalog', { params });
    return response.data?.data || [];
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

export const closePosDay = async (businessDate = null) => {
    const response = await api.post('/pos/z-reading/close-day', businessDate ? { business_date: businessDate } : {});
    return response.data?.data;
};

export const fetchDailyZReading = async (businessDate) => {
    const response = await api.get(`/pos/z-reading/${businessDate}`);
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

export const fetchIncomingOnlineOrders = async (params = {}) => {
    const response = await api.get('/pos/incoming-orders', { params });
    return response.data?.data;
};

export const updateOnlineOrderStatus = async (posTransactionId, payload = {}) => {
    const response = await api.patch(`/pos/orders/${posTransactionId}/status`, payload);
    return response.data?.data;
};

export default {
    fetchPosCatalog,
    createPosCheckout,
    fetchPosTransactions,
    fetchPosTransactionById,
    closePosDay,
    fetchDailyZReading,
    fetchCurrentTerminalShift,
    openTerminalShift,
    recordCashDrawerEvent,
    closeTerminalShift,
    fetchTerminalTodayDashboard,
    fetchIncomingOnlineOrders,
    updateOnlineOrderStatus
};

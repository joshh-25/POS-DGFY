import api from '../../../../../packages/web-core/src/services/api.js';

const unwrap = (response) => response?.data?.data ?? response?.data ?? {};

const get = (path, params = {}) => api.get(path, { params }).then(unwrap);

export const businessAdminApi = {
    bootstrap: () => get('/business-admin/bootstrap'),
    overview: (params) => get('/business-admin/overview', params),
    notifications: (params) => get('/business-admin/notifications', params),
    activity: (params) => get('/business-admin/activity', params),
    reports: (params) => get('/business-admin/reports', params),
    reportDefinitions: () => get('/business-admin/reports/definitions'),
    reportDataset: (reportKey, params) => get(`/business-admin/reports/datasets/${encodeURIComponent(reportKey)}`, params),
    exportReport: (reportKey, params) => api.get(`/business-admin/reports/datasets/${encodeURIComponent(reportKey)}/export`, {
        params,
        responseType: 'blob'
    }),
    inventoryValuation: (params) => get('/business-admin/inventory/valuation', params),
    inventoryStock: (params) => get('/business-admin/inventory/stock', params),
    workforce: (params) => get('/business-admin/workforce', params),
    attendance: (params) => get('/business-admin/attendance', params),
    fiscal: (params) => get('/business-admin/fiscal', params),
    recipes: (params) => get('/business-admin/inventory/recipes', params),
    customers: (params) => get('/business-admin/customers', params),
    customerDetail: (profileRef, params) => get(`/business-admin/customers/${encodeURIComponent(profileRef)}`, params),
    shifts: (params) => get('/business-admin/shifts', params),
    orders: (params) => get('/business-admin/orders', params),
    orderDetail: (transactionId) => get(`/business-admin/orders/${encodeURIComponent(transactionId)}`),
    expenses: (params) => get('/business-admin/expenses', params),
    createExpense: (body) => api.post('/business-admin/expenses', body).then(unwrap),
    voidExpense: (expenseId, body) => api.post(`/business-admin/expenses/${encodeURIComponent(expenseId)}/void`, body).then(unwrap),
    payments: (params) => get('/business-admin/payments/monitoring', params),
    audit: (params) => get('/business-admin/audit', params),
    approvals: (params) => get('/business-admin/approvals', params),
    markNotificationRead: (id) => api.patch(`/business-admin/notifications/${encodeURIComponent(id)}/read`).then(unwrap),
    dismissNotification: (id) => api.post(`/business-admin/notifications/${encodeURIComponent(id)}/dismiss`).then(unwrap),
    acknowledgeNotification: (id, note = '') => api.post(`/business-admin/notifications/${encodeURIComponent(id)}/acknowledge`, { note }).then(unwrap),
    decideApproval: (id, decision, note = '') => api.post(`/business-admin/approvals/${encodeURIComponent(id)}/${decision}`, { note }).then(unwrap),
    cancelApproval: (id, note = '') => api.post(`/business-admin/approvals/${encodeURIComponent(id)}/cancel`, { note }).then(unwrap)
};

export const getBusinessAdminErrorMessage = (error) => {
    const payload = error?.response?.data;
    if (typeof payload === 'string' && payload.trim()) return payload;
    return payload?.message
        || payload?.error
        || error?.message
        || 'Back Office could not load this workspace.';
};

import api from '../../../../../packages/web-core/src/services/api.js';

const unwrap = (response) => response?.data?.data ?? response?.data ?? {};

const get = (path, params = {}, config = {}) => api.get(path, { ...config, params }).then(unwrap);

export const businessAdminApi = {
    bootstrap: (config) => get('/business-admin/bootstrap', {}, config),
    staffRoles: () => get('/staff-roles', { include_inactive: true }),
    roleCatalog: () => get('/users/role-catalog'),
    users: () => get('/users'),
    userLocationGrants: (userId) => get(`/users/${encodeURIComponent(userId)}/location-grants`),
    createStaffRole: (body) => api.post('/staff-roles', body).then(unwrap),
    updateStaffRole: (id, body) => api.put(`/staff-roles/${encodeURIComponent(id)}`, body).then(unwrap),
    setStaffRoleStatus: (id, isActive) => api.put(`/staff-roles/${encodeURIComponent(id)}/status`, { is_active: isActive }).then(unwrap),
    assignStaffRole: (userId, staffRoleId) => api.put(`/staff-roles/users/${encodeURIComponent(userId)}`, { staff_role_id: staffRoleId }).then(unwrap),
    updateUserLocationGrants: (userId, locationIds) => api.put(`/users/${encodeURIComponent(userId)}/location-grants`, { location_ids: locationIds }).then(unwrap),
    company: (config) => get('/business-admin/company', {}, config),
    updateCompanyName: (body) => api.patch('/business-admin/company/name', body).then(unwrap),
    overview: (params, config) => get('/business-admin/overview', params, config),
    notifications: (params, config) => get('/business-admin/notifications', params, config),
    reportDataset: (reportKey, params, config) => get(`/business-admin/reports/datasets/${encodeURIComponent(reportKey)}`, params, config),
    posActivityAnalytics: (params, config) => get('/business-admin/pos-activity-analytics', params, config),
    inventoryValuation: (params, config) => get('/business-admin/inventory/valuation', params, config),
    workforce: (params, config) => get('/business-admin/workforce', params, config),
    attendance: (params, config) => get('/business-admin/attendance', params, config),
    endAttendanceShift: (shiftId, body) => api.post(`/business-admin/attendance/shifts/${encodeURIComponent(shiftId)}/end`, body).then(unwrap),
    fiscal: (params, config) => get('/business-admin/fiscal', params, config),
    recipes: (params, config) => get('/business-admin/inventory/recipes', params, config),
    customers: (params, config) => get('/business-admin/customers', params, config),
    createCustomer: (body) => api.post('/business-admin/customers', body).then(unwrap),
    customerDetail: (profileRef, params, config) => get(`/business-admin/customers/${encodeURIComponent(profileRef)}`, params, config),
    shifts: (params, config) => get('/business-admin/shifts', params, config),
    orders: (params, config) => get('/business-admin/orders', params, config),
    orderDetail: (transactionId, config) => get(`/business-admin/orders/${encodeURIComponent(transactionId)}`, {}, config),
    expenses: (params, config) => get('/business-admin/expenses', params, config),
    createExpense: (body) => api.post('/business-admin/expenses', body).then(unwrap),
    voidExpense: (expenseId, body) => api.post(`/business-admin/expenses/${encodeURIComponent(expenseId)}/void`, body).then(unwrap),
    payments: (params, config) => get('/business-admin/payments/monitoring', params, config),
    tenantRevenueSummary: (params, config) => get('/tenant-revenue/tenant/summary', params, config),
    tenantRevenueTransactions: (params, config) => get('/tenant-revenue/tenant/transactions', params, config),
    tenantRevenueFeeHistory: (config) => get('/tenant-revenue/tenant/fee-history', {}, config),
    saveTenantRevenueFeePolicy: (body) => api.post('/tenant-revenue/tenant/fee-policies', body).then(unwrap),
    audit: (params, config) => get('/business-admin/audit', params, config),
    approvals: (params, config) => get('/business-admin/approvals', params, config),
    markNotificationRead: (id) => api.patch(`/business-admin/notifications/${encodeURIComponent(id)}/read`).then(unwrap),
    dismissNotification: (id) => api.post(`/business-admin/notifications/${encodeURIComponent(id)}/dismiss`).then(unwrap),
    acknowledgeNotification: (id, note = '') => api.post(`/business-admin/notifications/${encodeURIComponent(id)}/acknowledge`, { note }).then(unwrap),
    decideApproval: (id, decision, note = '') => api.post(`/business-admin/approvals/${encodeURIComponent(id)}/${decision}`, { note }).then(unwrap),
    cancelApproval: (id, note = '') => api.post(`/business-admin/approvals/${encodeURIComponent(id)}/cancel`, { note }).then(unwrap),
    // #2159: transitional Legacy Promos surface (read/revoke only).
    legacyPromos: (config) => get('/vouchers/legacy-promos', {}, config),
    revokeLegacyPromo: (body) => api.post('/vouchers/legacy-promos/revoke', body).then(unwrap)
};

export const getBusinessAdminErrorMessage = (error) => {
    const payload = error?.response?.data;
    if (typeof payload === 'string' && payload.trim()) return payload;
    return payload?.message
        || payload?.error
        || error?.message
        || 'Back Office could not load this workspace.';
};

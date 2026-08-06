import api from '@/services/api';

export const fetchEmployeeCreditAccount = async (accountCode) => {
    const response = await api.get('/pos/employee-credit/lookup', {
        params: { account_code: String(accountCode || '').trim().toUpperCase() }
    });
    return response.data?.data?.account || null;
};

export const fetchEmployeeCreditCheckoutOptions = async ({ search = '', locationId = null, limit = 50 } = {}) => {
    const response = await api.get('/pos/employee-credit/checkout-options', {
        params: {
            search: String(search || '').trim(),
            location_id: locationId || undefined,
            limit
        }
    });
    return response.data?.data?.options || [];
};

export const fetchEmployeeCreditAccounts = async () => {
    const response = await api.get('/pos/employee-credit/accounts');
    return response.data?.data?.accounts || [];
};

export const updateEmployeeCreditAccount = async (userId, payload = {}) => {
    const response = await api.patch(`/pos/employee-credit/accounts/${userId}`, payload);
    return response.data?.data || null;
};

export const updateEmployeeCreditEmployeeAccount = async (employeeId, payload = {}) => {
    const response = await api.patch(`/pos/employee-credit/employee-accounts/${employeeId}`, payload);
    return response.data?.data || null;
};

export const recordEmployeeCreditRepayment = async (accountId, payload = {}) => {
    const response = await api.post(`/pos/employee-credit/accounts/${accountId}/repay`, payload);
    return response.data?.data || null;
};

export const adjustEmployeeCreditOutstanding = async (accountId, payload = {}) => {
    const response = await api.post(`/pos/employee-credit/accounts/${accountId}/adjust-outstanding`, payload);
    return response.data?.data || null;
};

export const fetchEmployeeCreditReport = async ({ signal, ...params } = {}) => {
    const response = await api.get('/pos/employee-credit/report', { params, signal });
    const report = response.data?.data;

    if (!report || !Array.isArray(report.entries) || !report.totals || typeof report.totals !== 'object') {
        throw new Error('Employee Credit report returned an invalid response.');
    }

    return report;
};

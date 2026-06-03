import axios from 'axios';
import { emitGlobalApiError } from '../utils/errorHandler.js';
import { getCsrfToken } from './browserSession.js';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';
let adminToken = '';

// Create a dedicated axios instance for admin requests
const adminApi = axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true
});

// Callback to notify the UI of authentication failures
let authFailureCallback = null;

/**
 * Set callback to be invoked when authentication fails (401)
 */
export const setAuthFailureCallback = (callback) => {
    authFailureCallback = callback;
};

adminApi.interceptors.request.use((config) => {
    const method = String(config.method || 'get').toLowerCase();
    if (!['get', 'head', 'options'].includes(method)) {
        const csrfToken = getCsrfToken();
        if (csrfToken && !config.headers?.['x-csrf-token']) {
            config.headers = { ...(config.headers || {}), 'x-csrf-token': csrfToken };
        }
    }
    if (adminToken && !config.headers?.Authorization) {
        config.headers = { ...(config.headers || {}), Authorization: `Bearer ${adminToken}` };
    }
    return config;
});

// Add response interceptor to handle 401 errors
adminApi.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response && error.response.status === 401) {
            adminToken = '';

            // Notify the UI to show login form
            if (authFailureCallback) {
                authFailureCallback();
            }
        }

        // Global handling for server and network errors (with request-level opt-out).
        if (!error?.config?.skipGlobalErrorToast) {
            emitGlobalApiError({ error, source: 'admin-api' });
        }
        return Promise.reject(error);
    }
);

export { adminApi };

/**
 * Admin login
 */
export const login = async (username, password) => {
    const response = await adminApi.post('/admin/login', {
        username,
        password
    });

    if (response.data.success && response.data.token) {
        adminToken = response.data.token;
    }

    return response.data;
};

/**
 * Admin logout
 */
export const logout = () => {
    const token = getToken();
    if (token) {
        adminApi.post(
            '/admin/logout',
            {},
            {
                headers: {
                    Authorization: `Bearer ${token}`
                },
                skipGlobalErrorToast: true
            }
        ).catch(() => {
            // Best-effort revoke; always clear local token.
        });
    }
    adminToken = '';
};

/**
 * Check if admin is authenticated
 */
export const isAuthenticated = () => {
    return !!adminToken;
};

/**
 * Get admin token
 */
export const getToken = () => {
    return adminToken;
};

const requireAdminHeaders = () => {
    const token = getToken();
    if (!token) {
        throw new Error('Admin authentication required');
    }
    return {
        'Authorization': `Bearer ${token}`
    };
};

/**
 * Get feedback with optional filters
 */
export const getFeedback = async (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.type && filters.type !== 'all') params.append('type', filters.type);
    if (filters.search) params.append('search', filters.search);
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);

    const response = await adminApi.get('/admin/feedback', {
        headers: requireAdminHeaders(),
        params
    });

    return response.data;
};

export const listCommercePaymentSessions = async (filters = {}) => {
    const response = await adminApi.get('/commerce-payments/admin/payment-sessions', {
        headers: requireAdminHeaders(),
        params: filters
    });
    return response.data;
};

export const getCommercePaymentSession = async (paymentSessionId) => {
    const response = await adminApi.get(`/commerce-payments/admin/payment-sessions/${paymentSessionId}`, {
        headers: requireAdminHeaders()
    });
    return response.data;
};

export const getCommerceSettlementReport = async (filters = {}) => {
    const response = await adminApi.get('/commerce-payments/admin/settlement-report', {
        headers: requireAdminHeaders(),
        params: filters
    });
    return response.data;
};

export const getPayMongoSandboxCertification = async () => {
    const response = await adminApi.get('/commerce-payments/admin/certification/paymongo-sandbox', {
        headers: requireAdminHeaders()
    });
    return response.data;
};

export const retryCommercePaymentFinalization = async (paymentSessionId) => {
    const response = await adminApi.post(`/commerce-payments/admin/payment-sessions/${paymentSessionId}/retry-finalization`, {}, {
        headers: requireAdminHeaders()
    });
    return response.data;
};

export const createCommercePaymentRefund = async (paymentSessionId, payload) => {
    const response = await adminApi.post(`/commerce-payments/admin/payment-sessions/${paymentSessionId}/refunds`, payload, {
        headers: requireAdminHeaders()
    });
    return response.data;
};

export const listTenantPaymentAccounts = async (filters = {}) => {
    const response = await adminApi.get('/commerce-payments/admin/tenant-payment-accounts', {
        headers: requireAdminHeaders(),
        params: filters
    });
    return response.data;
};

export const listDgfyAccounts = async (filters = {}) => {
    const response = await adminApi.get('/dgfy/admin/accounts', {
        headers: requireAdminHeaders(),
        params: filters
    });
    return response.data;
};

export const getDgfyAccount = async (accountId) => {
    const response = await adminApi.get(`/dgfy/admin/accounts/${accountId}`, {
        headers: requireAdminHeaders()
    });
    return response.data;
};

export const updateDgfyAccountProfile = async (accountId, payload) => {
    const response = await adminApi.patch(`/dgfy/admin/accounts/${accountId}/profile`, payload, {
        headers: requireAdminHeaders()
    });
    return response.data;
};

export const suspendDgfyAccount = async (accountId, payload) => {
    const response = await adminApi.post(`/dgfy/admin/accounts/${accountId}/suspend`, payload, {
        headers: requireAdminHeaders()
    });
    return response.data;
};

export const reactivateDgfyAccount = async (accountId, payload) => {
    const response = await adminApi.post(`/dgfy/admin/accounts/${accountId}/reactivate`, payload, {
        headers: requireAdminHeaders()
    });
    return response.data;
};

export const upsertTenantPaymentAccount = async (tenantId, payload) => {
    const response = await adminApi.put(`/commerce-payments/admin/tenants/${tenantId}/payment-account`, payload, {
        headers: requireAdminHeaders()
    });
    return response.data;
};

/**
 * Get feedback statistics
 */
export const getStats = async () => {
    const token = getToken();

    if (!token) {
        throw new Error('Admin authentication required');
    }

    const response = await adminApi.get('/admin/feedback/stats', {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    return response.data;
};

/**
 * Create a new tenant (Manual Provisioning)
 */
export const createTenant = async (tenantData) => {
    const token = getToken();

    if (!token) {
        throw new Error('Admin authentication required');
    }

    // Using the legacy direct provisioning endpoint
    const response = await adminApi.post('/admin/tenants/provision', tenantData, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    return response.data;
};

/**
 * Get all tenants with optional status filter
 */
export const getTenants = async (status = 'all') => {
    const token = getToken();

    if (!token) {
        throw new Error('Admin authentication required');
    }

    const params = new URLSearchParams();
    if (status && status !== 'all') params.append('status', status);

    const response = await adminApi.get('/admin/tenants', {
        headers: {
            'Authorization': `Bearer ${token}`
        },
        params
    });

    return response.data;
};

/**
 * Approve a pending tenant
 */
export const approveTenant = async (tenantId) => {
    const token = getToken();

    if (!token) {
        throw new Error('Admin authentication required');
    }

    const response = await adminApi.post(`/admin/tenants/${tenantId}/approve`, {}, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    return response.data;
};

/**
 * Reject a pending tenant
 */
export const rejectTenant = async (tenantId, reason = '') => {
    const token = getToken();

    if (!token) {
        throw new Error('Admin authentication required');
    }

    const response = await adminApi.post(`/admin/tenants/${tenantId}/reject`, { reason }, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    return response.data;
};

/**
 * Update tenant details
 */
export const updateTenant = async (tenantId, updates) => {
    const token = getToken();

    if (!token) {
        throw new Error('Admin authentication required');
    }

    const response = await adminApi.put(`/admin/tenants/${tenantId}`, updates, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    return response.data;
};

/**
 * Permanently delete tenant
 */
export const deleteTenant = async (tenantId) => {
    const token = getToken();

    if (!token) {
        throw new Error('Admin authentication required');
    }

    const response = await adminApi.delete(`/admin/tenants/${tenantId}`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    return response.data;
};

/**
 * Get pricing settings
 */
export const getPricing = async () => {
    const token = getToken();
    if (!token) throw new Error('Admin authentication required');

    const response = await adminApi.get('/admin/tenants/pricing', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    return response.data;
};

/**
 * Update pricing settings
 */
export const updatePricing = async (settings) => {
    const token = getToken();
    if (!token) throw new Error('Admin authentication required');

    const response = await adminApi.put('/admin/tenants/pricing', settings, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    return response.data;
};

/**
 * Initiate admin-driven PayPal setup for a manual tenant
 */
export const setupPayPalRecurring = async (tenantId) => {
    const token = getToken();
    if (!token) throw new Error('Admin authentication required');

    const response = await adminApi.post(`/admin/tenants/${tenantId}/setup-paypal-recurring`, {}, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    return response.data;
};

/**
 * Change a tenant's plan (admin override)
 */
export const adminChangePlan = async (tenantId, plan) => {
    const token = getToken();
    if (!token) throw new Error('Admin authentication required');

    const response = await adminApi.post(`/admin/tenants/${tenantId}/change-plan`, { plan }, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    return response.data;
};

/**
 * Reactivate an inactive tenant
 */
export const adminReactivateTenant = async (tenantId) => {
    const token = getToken();
    if (!token) throw new Error('Admin authentication required');

    const response = await adminApi.post(`/admin/tenants/${tenantId}/reactivate`, {}, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    return response.data;
};

/**
 * List tenant compliance artifacts for platform-admin review
 */
export const listTenantComplianceArtifacts = async (tenantId) => {
    const token = getToken();
    if (!token) throw new Error('Admin authentication required');

    const response = await adminApi.get(`/admin/tenants/${tenantId}/compliance/artifacts`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
};

/**
 * List tenant compliance peripherals for platform-admin review
 */
export const listTenantCompliancePeripherals = async (tenantId) => {
    const token = getToken();
    if (!token) throw new Error('Admin authentication required');

    const response = await adminApi.get(`/admin/tenants/${tenantId}/compliance/peripherals`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
};

/**
 * Get tenant compliance checklist for platform-admin review context
 */
export const getTenantComplianceChecklist = async (tenantId, params = {}) => {
    const token = getToken();
    if (!token) throw new Error('Admin authentication required');

    const response = await adminApi.get(`/admin/tenants/${tenantId}/compliance/checklist`, {
        headers: { Authorization: `Bearer ${token}` },
        params
    });
    return response.data;
};

/**
 * List tenant compliance audit logs for platform-admin review context
 */
export const listTenantComplianceAuditLogs = async (tenantId, params = {}) => {
    const token = getToken();
    if (!token) throw new Error('Admin authentication required');

    const response = await adminApi.get(`/admin/tenants/${tenantId}/compliance/audit-logs`, {
        headers: { Authorization: `Bearer ${token}` },
        params
    });
    return response.data;
};

/**
 * List tenant compliance security incidents for platform-admin review context
 */
export const listTenantComplianceSecurityIncidents = async (tenantId, params = {}) => {
    const token = getToken();
    if (!token) throw new Error('Admin authentication required');

    const response = await adminApi.get(`/admin/tenants/${tenantId}/compliance/security-incidents`, {
        headers: { Authorization: `Bearer ${token}` },
        params
    });
    return response.data;
};

/**
 * Platform-admin action: acknowledge tenant compliance security incident
 */
export const acknowledgeTenantComplianceSecurityIncident = async (tenantId, incidentId, payload = {}) => {
    const token = getToken();
    if (!token) throw new Error('Admin authentication required');

    const response = await adminApi.post(
        `/admin/tenants/${tenantId}/compliance/security-incidents/${incidentId}/acknowledge`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
    );
    return response.data;
};

/**
 * Platform-admin action: resolve tenant compliance security incident
 */
export const resolveTenantComplianceSecurityIncident = async (tenantId, incidentId, payload = {}) => {
    const token = getToken();
    if (!token) throw new Error('Admin authentication required');

    const response = await adminApi.post(
        `/admin/tenants/${tenantId}/compliance/security-incidents/${incidentId}/resolve`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
    );
    return response.data;
};

/**
 * Platform-admin action: force tenant back to non-compliant mode.
 */
export const forceTenantNonCompliant = async (tenantId, payload) => {
    const token = getToken();
    if (!token) throw new Error('Admin authentication required');

    const response = await adminApi.post(
        `/admin/tenants/${tenantId}/force-non-compliant`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
    );
    return response.data;
};

/**
 * Platform-admin verification action for tenant compliance artifact
 */
export const updateTenantComplianceArtifactVerification = async (tenantId, artifactId, payload) => {
    const token = getToken();
    if (!token) throw new Error('Admin authentication required');

    const response = await adminApi.post(
        `/admin/tenants/${tenantId}/compliance/artifacts/${artifactId}/verification`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
    );
    return response.data;
};

/**
 * Platform-admin verification action for tenant compliance peripheral
 */
export const updateTenantCompliancePeripheralVerification = async (tenantId, peripheralId, payload) => {
    const token = getToken();
    if (!token) throw new Error('Admin authentication required');

    const response = await adminApi.post(
        `/admin/tenants/${tenantId}/compliance/peripherals/${peripheralId}/verification`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
    );
    return response.data;
};

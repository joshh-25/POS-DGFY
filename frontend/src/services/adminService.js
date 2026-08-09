import axios from 'axios';
import { emitGlobalApiError } from '../utils/errorHandler.js';
import { resolveApiBaseUrl } from '../utils/runtimeConfig.js';
import { getCsrfToken } from './browserSession.js';

const API_BASE_URL = resolveApiBaseUrl(import.meta.env, typeof window !== 'undefined' ? window.location : undefined);
const COOKIE_SESSION_MARKER = 'cookie-session';
let sessionKnown = false;

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
    config.headers = config.headers || {};
    const method = String(config.method || 'get').toLowerCase();
    if (!['get', 'head', 'options'].includes(method) && !config.headers['x-csrf-token']) {
        const csrfToken = getCsrfToken();
        if (csrfToken) {
            config.headers['x-csrf-token'] = csrfToken;
        }
    }
    if (config.headers.Authorization === `Bearer ${COOKIE_SESSION_MARKER}`) delete config.headers.Authorization;
    return config;
});

// Add response interceptor to handle 401 errors
adminApi.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response && error.response.status === 401) {
            sessionKnown = false;

            // Notify the UI to show login form
            if (authFailureCallback && !error?.config?.suppressAuthFailure) {
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

    if (response.data.success) sessionKnown = true;

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
    sessionKnown = false;
};

/**
 * Check if admin is authenticated
 */
export const isAuthenticated = () => {
    return sessionKnown;
};

/**
 * Get admin token
 */
export const getToken = () => {
    return sessionKnown ? COOKIE_SESSION_MARKER : null;
};

export const getCurrentAdmin = async () => {
    const response = await adminApi.get('/admin/me', { skipGlobalErrorToast: true, suppressAuthFailure: true });
    sessionKnown = Boolean(response.data?.success);
    return response.data;
};

export const listPlatformInvoices = async () => (await adminApi.get('/admin/invoices', requireAdminAuthConfig())).data;
export const listEligiblePlatformInvoiceApplications = async () => (await adminApi.get('/admin/invoices/eligible-applications', requireAdminAuthConfig())).data;
export const createPlatformInvoiceDraft = async (payload) => (await adminApi.post('/admin/invoices/drafts', payload, requireAdminAuthConfig())).data;
export const createPlatformInvoiceReplacementDraft = async (invoiceId, payload) => (await adminApi.post(`/admin/invoices/${invoiceId}/replacement-drafts`, payload, requireAdminAuthConfig())).data;
export const updatePlatformInvoiceDraft = async (invoiceId, payload) => (await adminApi.patch(`/admin/invoices/${invoiceId}/draft`, payload, requireAdminAuthConfig())).data;
export const discardPlatformInvoiceDraft = async (invoiceId) => (await adminApi.delete(`/admin/invoices/${invoiceId}/draft`, requireAdminAuthConfig())).data;
export const issuePlatformInvoice = async (invoiceId, payload) => (await adminApi.post(`/admin/invoices/${invoiceId}/issue`, payload, requireAdminAuthConfig())).data;
export const recordPlatformInvoiceCashPayment = async (invoiceId, payload) => (await adminApi.post(`/admin/invoices/${invoiceId}/payments/cash`, payload, requireAdminAuthConfig())).data;
export const creditPlatformInvoice = async (invoiceId, payload) => (await adminApi.post(`/admin/invoices/${invoiceId}/credits/full`, payload, requireAdminAuthConfig())).data;
export const deliverPlatformInvoiceEmail = async (invoiceId) => (await adminApi.post(`/admin/invoices/${invoiceId}/deliveries/email`, {}, requireAdminAuthConfig())).data;
export const downloadPlatformInvoiceArtifact = async (invoiceId) => (await adminApi.get(`/admin/invoices/${invoiceId}/artifact`, { ...requireAdminAuthConfig(), responseType: 'blob' }));
export const listPlatformAdmins = async () => (await adminApi.get('/admin/platform-admins', requireAdminAuthConfig())).data;
export const getPlatformAdminReadiness = async () => (await adminApi.get('/admin/platform-admins/readiness', requireAdminAuthConfig())).data;
export const createPlatformAdmin = async (payload) => (await adminApi.post('/admin/platform-admins', payload, requireAdminAuthConfig())).data;
export const updatePlatformAdminPermissions = async (adminId, permissions) => (await adminApi.patch(`/admin/platform-admins/${adminId}/permissions`, { permissions }, requireAdminAuthConfig())).data;
export const suspendPlatformAdmin = async (adminId, reason = '') => (await adminApi.post(`/admin/platform-admins/${adminId}/suspend`, { reason }, requireAdminAuthConfig())).data;
export const reactivatePlatformAdmin = async (adminId) => (await adminApi.post(`/admin/platform-admins/${adminId}/reactivate`, {}, requireAdminAuthConfig())).data;
export const resetPlatformAdminPassword = async (adminId) => (await adminApi.post(`/admin/platform-admins/${adminId}/reset-password`, {}, requireAdminAuthConfig())).data;
export const deletePlatformAdmin = async (adminId, reason) => (await adminApi.delete(`/admin/platform-admins/${adminId}`, { ...requireAdminAuthConfig(), data: { reason } })).data;
export const changeOwnPlatformAdminPassword = async (payload) => (await adminApi.post('/admin/change-password', payload, requireAdminAuthConfig())).data;

const requireAdminAuthConfig = () => {
    const token = getToken();

    if (!token) {
        throw new Error('Admin authentication required');
    }

    return {
        headers: {
            Authorization: `Bearer ${token}`
        }
    };
};

/**
 * Get feedback with optional filters
 */
export const getFeedback = async (filters = {}) => {
    const token = getToken();

    if (!token) {
        throw new Error('Admin authentication required');
    }

    const params = new URLSearchParams();
    if (filters.type && filters.type !== 'all') params.append('type', filters.type);
    if (filters.search) params.append('search', filters.search);
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);

    const response = await adminApi.get('/admin/feedback', {
        headers: {
            'Authorization': `Bearer ${token}`
        },
        params
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

export const createAdminProvisionedTenant = async (tenantData) => {
    const token = getToken();

    if (!token) {
        throw new Error('Admin authentication required');
    }

    const response = await adminApi.post('/admin/tenants/admin-provision', tenantData, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    return response.data;
};

export const createAdminProvisionedAccountAndTenant = async (payload) => {
    const token = getToken();

    if (!token) {
        throw new Error('Admin authentication required');
    }

    const response = await adminApi.post('/admin/tenants/admin-provision-with-account', payload, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    return response.data;
};

export const assignTenantOwner = async (tenantId, payload) => {
    const token = getToken();

    if (!token) {
        throw new Error('Admin authentication required');
    }

    const response = await adminApi.post(`/admin/tenants/${tenantId}/owner`, payload, {
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
export const retryTenantProvisioning = async (tenantId) => (await adminApi.post(`/admin/tenants/${tenantId}/retry-provisioning`, {}, requireAdminAuthConfig())).data;

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

export const updateTenantCapabilities = async (tenantId, payload = {}) => {
    const response = await adminApi.patch(
        `/admin/tenants/${tenantId}/capabilities`,
        payload,
        requireAdminAuthConfig()
    );
    return response.data;
};

// Issue #178 Phase 17: applies a published Store Template to an
// already-provisioned tenant. Mirrors updateTenantCapabilities above -
// same audited platform-admin write shape.
export const applyTenantTemplate = async (tenantId, payload = {}) => {
    const response = await adminApi.post(
        `/admin/tenants/${tenantId}/apply-template`,
        payload,
        requireAdminAuthConfig()
    );
    return response.data;
};

export const listTenantCapabilityAuditLogs = async (tenantId, params = {}) => {
    const response = await adminApi.get(`/admin/tenants/${tenantId}/capabilities/audit-logs`, {
        ...requireAdminAuthConfig(),
        params
    });
    return response.data;
};

export const getTenantPosMetadata = async (tenantId) => {
    const response = await adminApi.get(`/admin/tenants/${tenantId}/pos-metadata`, requireAdminAuthConfig());
    return response.data;
};

export const listTenantPosMetadataAuditLogs = async (tenantId, params = {}) => {
    const response = await adminApi.get(`/admin/tenants/${tenantId}/pos-metadata/audit-logs`, {
        ...requireAdminAuthConfig(),
        params
    });
    return response.data;
};

export const updateTenantPosMetadata = async (tenantId, payload = {}) => {
    const response = await adminApi.patch(
        `/admin/tenants/${tenantId}/pos-metadata`,
        payload,
        requireAdminAuthConfig()
    );
    return response.data;
};

export const listStorefrontDomains = async (tenantId) => {
    const response = await adminApi.get(
        `/admin/tenants/${tenantId}/storefront-domains`,
        requireAdminAuthConfig()
    );
    return response.data;
};

export const createStorefrontDomain = async (tenantId, payload = {}) => {
    const response = await adminApi.post(
        `/admin/tenants/${tenantId}/storefront-domains`,
        payload,
        requireAdminAuthConfig()
    );
    return response.data;
};

export const verifyStorefrontDomain = async (tenantId, domainId, reason) => {
    const response = await adminApi.post(
        `/admin/tenants/${tenantId}/storefront-domains/${domainId}/verify`,
        { reason },
        requireAdminAuthConfig()
    );
    return response.data;
};

export const retryStorefrontDomain = async (tenantId, domainId, reason) => {
    const response = await adminApi.post(
        `/admin/tenants/${tenantId}/storefront-domains/${domainId}/retry`,
        { reason },
        requireAdminAuthConfig()
    );
    return response.data;
};

export const makeCanonicalStorefrontDomain = async (tenantId, domainId, reason) => {
    const response = await adminApi.post(
        `/admin/tenants/${tenantId}/storefront-domains/${domainId}/make-canonical`,
        { reason },
        requireAdminAuthConfig()
    );
    return response.data;
};

export const checkStorefrontDomainDns = async (tenantId, domainId, reason) => {
    const response = await adminApi.post(
        `/admin/tenants/${tenantId}/storefront-domains/${domainId}/check-dns`,
        { reason },
        requireAdminAuthConfig()
    );
    return response.data;
};

export const suspendStorefrontDomain = async (tenantId, domainId, reason) => {
    const response = await adminApi.post(
        `/admin/tenants/${tenantId}/storefront-domains/${domainId}/suspend`,
        { reason },
        requireAdminAuthConfig()
    );
    return response.data;
};

export const removeStorefrontDomain = async (tenantId, domainId, reason) => {
    const response = await adminApi.delete(
        `/admin/tenants/${tenantId}/storefront-domains/${domainId}`,
        {
            ...requireAdminAuthConfig(),
            data: { reason }
        }
    );
    return response.data;
};

export const reconcileStorefrontDomainEligibility = async (tenantId, reason) => {
    const response = await adminApi.post(
        `/admin/tenants/${tenantId}/storefront-domains/reconcile-eligibility`,
        { reason },
        requireAdminAuthConfig()
    );
    return response.data;
};

export const listDgfyAccounts = async (params = {}) => {
    const response = await adminApi.get('/dgfy/admin/accounts', {
        ...requireAdminAuthConfig(),
        params
    });
    return response.data;
};

export const getDgfyAccount = async (accountId) => {
    const response = await adminApi.get(`/dgfy/admin/accounts/${accountId}`, requireAdminAuthConfig());
    return response.data;
};

export const createDgfyAccount = async (payload = {}) => {
    const response = await adminApi.post('/dgfy/admin/accounts', payload, requireAdminAuthConfig());
    return response.data;
};

export const updateDgfyAccountProfile = async (accountId, payload = {}) => {
    const response = await adminApi.patch(
        `/dgfy/admin/accounts/${accountId}/profile`,
        payload,
        requireAdminAuthConfig()
    );
    return response.data;
};

export const suspendDgfyAccount = async (accountId, payload = {}) => {
    const response = await adminApi.post(
        `/dgfy/admin/accounts/${accountId}/suspend`,
        payload,
        requireAdminAuthConfig()
    );
    return response.data;
};

export const reactivateDgfyAccount = async (accountId, payload = {}) => {
    const response = await adminApi.post(
        `/dgfy/admin/accounts/${accountId}/reactivate`,
        payload,
        requireAdminAuthConfig()
    );
    return response.data;
};

export const deleteDgfyAccount = async (accountId, payload = {}) => {
    const response = await adminApi.delete(`/dgfy/admin/accounts/${accountId}`, {
        ...requireAdminAuthConfig(),
        data: payload
    });
    return response.data;
};

export const listCommercePaymentSessions = async (params = {}) => {
    const response = await adminApi.get('/commerce-payments/admin/payment-sessions', {
        ...requireAdminAuthConfig(),
        params
    });
    return response.data;
};

export const getCommerceSettlementReport = async (params = {}) => {
    const response = await adminApi.get('/commerce-payments/admin/settlement-report', {
        ...requireAdminAuthConfig(),
        params
    });
    return response.data;
};

export const getPayMongoSandboxCertification = async () => {
    const response = await adminApi.get(
        '/commerce-payments/admin/certification/paymongo-sandbox',
        requireAdminAuthConfig()
    );
    return response.data;
};

export const listTenantPaymentAccounts = async (params = {}) => {
    const response = await adminApi.get('/commerce-payments/admin/tenant-payment-accounts', {
        ...requireAdminAuthConfig(),
        params
    });
    return response.data;
};

export const upsertTenantPaymentAccount = async (tenantId, payload = {}) => {
    const response = await adminApi.put(
        `/commerce-payments/admin/tenants/${tenantId}/payment-account`,
        payload,
        requireAdminAuthConfig()
    );
    return response.data;
};

export const createTenantPayMongoChildAccount = async (tenantId, payload = {}) => {
    const response = await adminApi.post(
        `/commerce-payments/admin/tenants/${tenantId}/paymongo-child-account`,
        payload,
        requireAdminAuthConfig()
    );
    return response.data;
};

export const operateTenantPayMongoChildAccount = async (tenantId, action) => {
    const response = await adminApi.post(
        `/commerce-payments/admin/tenants/${tenantId}/paymongo-child-account/${action}`,
        {},
        requireAdminAuthConfig()
    );
    return response.data;
};

export const createCommercePaymentRefund = async (paymentSessionId, payload = {}) => {
    const response = await adminApi.post(
        `/commerce-payments/admin/payment-sessions/${paymentSessionId}/refunds`,
        payload,
        requireAdminAuthConfig()
    );
    return response.data;
};

export const retryCommercePaymentFinalization = async (paymentSessionId) => {
    const response = await adminApi.post(
        `/commerce-payments/admin/payment-sessions/${paymentSessionId}/retry-finalization`,
        {},
        requireAdminAuthConfig()
    );
    return response.data;
};

export const reconcileCommercePaymentSession = async (paymentSessionId) => {
    const response = await adminApi.post(
        `/commerce-payments/admin/payment-sessions/${paymentSessionId}/reconcile`,
        {},
        requireAdminAuthConfig()
    );
    return response.data;
};

export const getTenantRevenueDashboard = async (params = {}) => {
    const response = await adminApi.get('/tenant-revenue/admin/dashboard', {
        ...requireAdminAuthConfig(),
        params
    });
    return response.data;
};

export const listTenantRevenueTransactions = async (params = {}) => {
    const response = await adminApi.get('/tenant-revenue/admin/transactions', {
        ...requireAdminAuthConfig(),
        params
    });
    return response.data;
};

export const listTenantRevenueFeePolicies = async (tenantId) => {
    const response = await adminApi.get(
        `/tenant-revenue/admin/tenants/${tenantId}/fee-policies`,
        requireAdminAuthConfig()
    );
    return response.data;
};

export const createTenantRevenueFeePolicy = async (tenantId, payload = {}) => {
    const response = await adminApi.post(
        `/tenant-revenue/admin/tenants/${tenantId}/fee-policies`,
        payload,
        requireAdminAuthConfig()
    );
    return response.data;
};

export const listTenantSettlementBatches = async (params = {}) => {
    const response = await adminApi.get('/tenant-revenue/admin/settlement-batches', {
        ...requireAdminAuthConfig(),
        params
    });
    return response.data;
};

export const createTenantSettlementBatch = async (payload = {}) => {
    const response = await adminApi.post(
        '/tenant-revenue/admin/settlement-batches',
        payload,
        requireAdminAuthConfig()
    );
    return response.data;
};

export const approveTenantSettlementBatch = async (settlementBatchId, payload = {}) => {
    const response = await adminApi.post(
        `/tenant-revenue/admin/settlement-batches/${settlementBatchId}/approve`,
        payload,
        requireAdminAuthConfig()
    );
    return response.data;
};

export const cancelTenantSettlementBatch = async (settlementBatchId, payload = {}) => {
    const response = await adminApi.post(
        `/tenant-revenue/admin/settlement-batches/${settlementBatchId}/cancel`,
        payload,
        requireAdminAuthConfig()
    );
    return response.data;
};

export const scheduleTenantSettlementBatch = async (settlementBatchId, payload = {}) => {
    const response = await adminApi.post(
        `/tenant-revenue/admin/settlement-batches/${settlementBatchId}/schedule`,
        payload,
        requireAdminAuthConfig()
    );
    return response.data;
};

export const createTenantManualPayout = async (settlementBatchId, payload = {}) => {
    const response = await adminApi.post(
        `/tenant-revenue/admin/settlement-batches/${settlementBatchId}/payouts`,
        payload,
        requireAdminAuthConfig()
    );
    return response.data;
};

export const confirmTenantManualPayout = async (payoutId, payload = {}) => {
    const response = await adminApi.post(
        `/tenant-revenue/admin/payouts/${payoutId}/confirm`,
        payload,
        requireAdminAuthConfig()
    );
    return response.data;
};

export const failTenantManualPayout = async (payoutId, payload = {}) => {
    const response = await adminApi.post(
        `/tenant-revenue/admin/payouts/${payoutId}/fail`,
        payload,
        requireAdminAuthConfig()
    );
    return response.data;
};

export const retryTenantManualPayout = async (payoutId, payload = {}) => {
    const response = await adminApi.post(
        `/tenant-revenue/admin/payouts/${payoutId}/retry`,
        payload,
        requireAdminAuthConfig()
    );
    return response.data;
};

export const listTenantRevenueReconciliation = async (params = {}) => {
    const response = await adminApi.get('/tenant-revenue/admin/reconciliation', {
        ...requireAdminAuthConfig(),
        params
    });
    return response.data;
};

export const runTenantRevenueInternalReconciliation = async (params = {}) => {
    const response = await adminApi.post(
        '/tenant-revenue/admin/reconciliation/run-internal',
        null,
        { ...requireAdminAuthConfig(), params }
    );
    return response.data;
};

export const resolveTenantRevenueReconciliation = async (reconciliationId, payload = {}) => {
    const response = await adminApi.post(
        `/tenant-revenue/admin/reconciliation/${reconciliationId}/resolve`,
        payload,
        requireAdminAuthConfig()
    );
    return response.data;
};

export const listTenantRevenueAdjustments = async (params = {}) => {
    const response = await adminApi.get('/tenant-revenue/admin/adjustments', {
        ...requireAdminAuthConfig(),
        params
    });
    return response.data;
};

export const requestTenantRevenueAdjustment = async (payload = {}) => {
    const response = await adminApi.post(
        '/tenant-revenue/admin/adjustments',
        payload,
        requireAdminAuthConfig()
    );
    return response.data;
};

export const approveTenantRevenueAdjustment = async (adjustmentId, payload = {}) => {
    const response = await adminApi.post(
        `/tenant-revenue/admin/adjustments/${adjustmentId}/approve`,
        payload,
        requireAdminAuthConfig()
    );
    return response.data;
};

export const reconcileTenantRevenueProviderFinancials = async (payload = {}) => {
    const response = await adminApi.post(
        '/tenant-revenue/admin/reconciliation/provider-financials',
        payload,
        requireAdminAuthConfig()
    );
    return response.data;
};

export const downloadTenantRevenueCsv = async (params = {}) => {
    const response = await adminApi.get('/tenant-revenue/admin/transactions.csv', {
        ...requireAdminAuthConfig(),
        params,
        responseType: 'blob'
    });
    return response;
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
 * Platform-admin action: select compliance mode for a tenant that still requires mode choice.
 */
export const selectTenantComplianceMode = async (tenantId, payload) => {
    const token = getToken();
    if (!token) throw new Error('Admin authentication required');

    const response = await adminApi.post(
        `/admin/tenants/${tenantId}/compliance/mode/select`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
    );
    return response.data;
};

/**
 * Platform-admin action: move a tenant into compliant pending mode.
 */
export const upgradeTenantComplianceMode = async (tenantId, payload) => {
    const token = getToken();
    if (!token) throw new Error('Admin authentication required');

    const response = await adminApi.post(
        `/admin/tenants/${tenantId}/compliance/mode/upgrade`,
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

/**
 * Store Template curation (issue #178 Phase 14, ADR 0056).
 */
export const listStoreTemplates = async (params = {}) => (
    await adminApi.get('/admin/templates', { ...requireAdminAuthConfig(), params })
).data;

export const getStoreTemplate = async (templateId) => (
    await adminApi.get(`/admin/templates/${templateId}`, requireAdminAuthConfig())
).data;

export const listStoreTemplateAuditLogs = async (templateId, params = {}) => (
    await adminApi.get(`/admin/templates/${templateId}/audit-logs`, { ...requireAdminAuthConfig(), params })
).data;

export const createStoreTemplateDraft = async (payload) => (
    await adminApi.post('/admin/templates', payload, requireAdminAuthConfig())
).data;

export const updateStoreTemplateModules = async (templateId, payload) => (
    await adminApi.patch(`/admin/templates/${templateId}/modules`, payload, requireAdminAuthConfig())
).data;

export const publishStoreTemplate = async (templateId, reason) => (
    await adminApi.post(`/admin/templates/${templateId}/publish`, { reason }, requireAdminAuthConfig())
).data;

export const deprecateStoreTemplate = async (templateId, reason) => (
    await adminApi.post(`/admin/templates/${templateId}/deprecate`, { reason }, requireAdminAuthConfig())
).data;

/**
 * Registration Industry visibility curation (issue #178 Phase 39): whether
 * an Industry is offered on merchant-facing signup surfaces. Distinct from
 * Store Template curation above - keyed by industry key, not template id.
 */
export const listRegistrationIndustryVisibility = async () => (
    await adminApi.get('/admin/registration-industries', requireAdminAuthConfig())
).data;

export const setRegistrationIndustryVisibility = async (industryKey, { hidden, reason }) => (
    await adminApi.patch(`/admin/registration-industries/${industryKey}/visibility`, { hidden, reason }, requireAdminAuthConfig())
).data;

export const listRegistrationIndustryAuditLogs = async (industryKey, params = {}) => (
    await adminApi.get(`/admin/registration-industries/${industryKey}/audit-logs`, { ...requireAdminAuthConfig(), params })
).data;

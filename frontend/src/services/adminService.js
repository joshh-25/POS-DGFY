import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';
const ADMIN_TOKEN_KEY = 'admin_token';

// Create a dedicated axios instance for admin requests
const adminApi = axios.create({
    baseURL: API_BASE_URL
});

// Callback to notify the UI of authentication failures
let authFailureCallback = null;

/**
 * Set callback to be invoked when authentication fails (401)
 */
export const setAuthFailureCallback = (callback) => {
    authFailureCallback = callback;
};

// Add response interceptor to handle 401 errors
adminApi.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response && error.response.status === 401) {
            // Clear the invalid token
            sessionStorage.removeItem(ADMIN_TOKEN_KEY);

            // Notify the UI to show login form
            if (authFailureCallback) {
                authFailureCallback();
            }
        }
        return Promise.reject(error);
    }
);

/**
 * Admin login
 */
export const login = async (username, password) => {
    const response = await adminApi.post('/admin/login', {
        username,
        password
    });

    if (response.data.success && response.data.token) {
        // Store token in sessionStorage (cleared on browser close)
        sessionStorage.setItem(ADMIN_TOKEN_KEY, response.data.token);
    }

    return response.data;
};

/**
 * Admin logout
 */
export const logout = () => {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
};

/**
 * Check if admin is authenticated
 */
export const isAuthenticated = () => {
    return !!sessionStorage.getItem(ADMIN_TOKEN_KEY);
};

/**
 * Get admin token
 */
export const getToken = () => {
    return sessionStorage.getItem(ADMIN_TOKEN_KEY);
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



import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - Add JWT token to headers
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    const companyToken = localStorage.getItem('companyToken');

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // Only add stored companyToken if request doesn't already have one set
    // This allows login/register to use a different token than what's stored
    if (companyToken && !config.headers['x-company-token']) {
      config.headers['x-company-token'] = companyToken;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - Handle token refresh and errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Handle 401 errors (unauthorized)
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('refreshToken');
        const companyToken = localStorage.getItem('companyToken');

        if (refreshToken) {
          console.debug('🔄 [Auth] Refreshing token...', { companyToken });

          const refreshConfig = {
            headers: {}
          };

          if (companyToken) {
            refreshConfig.headers['x-company-token'] = companyToken;
          }

          const response = await axios.post(`${API_BASE_URL}/auth/refresh-token`, {
            refreshToken
          }, refreshConfig);

          const { token, refreshToken: newRefreshToken } = response.data.data;
          localStorage.setItem('authToken', token);
          if (newRefreshToken) {
            localStorage.setItem('refreshToken', newRefreshToken);
          }
          originalRequest.headers.Authorization = `Bearer ${token}`;

          // Ensure retry also has company token if needed
          if (companyToken && !originalRequest.headers['x-company-token']) {
            originalRequest.headers['x-company-token'] = companyToken;
          }

          return api(originalRequest);
        }
      } catch (refreshError) {
        console.error('❌ [Auth] Token refresh failed:', refreshError);
        // Refresh failed, logout user
        localStorage.removeItem('authToken');

        localStorage.removeItem('refreshToken');
        localStorage.removeItem('companyToken');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    // NEW: Handle stale tenant context (Tenant no longer exists or user removed)
    if (error.response?.status === 404 &&
      (error.response?.data?.message?.includes('Tenant') || error.response?.data?.message?.includes('company token'))) {
      console.warn('⚠️ [Auth] Stale company token detected, clearing...');
      localStorage.removeItem('companyToken');
      // Don't necessarily redirect to login here, just clear the token
      // Most protected routes will redirect if they need a tenant
    }

    // Log detailed validation errors for 422 responses
    if (error.response?.status === 422) {
      console.error('❌ API 422 Validation Error:', error.response.data);
      if (error.response.data.errors) {
        console.table(error.response.data.errors);
      }
    }

    return Promise.reject(error);
  }
);

export default api;

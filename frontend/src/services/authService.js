import api from './api.js';
import { clearClientSession } from './sessionCleanup.js';
import { getAccessToken, refreshBrowserSession, setBrowserSession } from './browserSession.js';

export const register = async (userData, companyToken) => {
  // Pass company token in header for the registration request (to route to correct DB)
  const config = companyToken ? {
    headers: {
      'x-company-token': companyToken
    }
  } : {};

  const response = await api.post('/auth/register', userData, config);

  setBrowserSession({ companyToken });

  return response.data.data;
};

export const requestEmailOtp = async ({ purpose, email, invitationToken, companyToken } = {}) => {
  const config = companyToken ? {
    headers: {
      'x-company-token': companyToken
    }
  } : {};

  const payload = {
    purpose
  };
  if (email) payload.email = email;
  if (invitationToken) payload.invitation_token = invitationToken;

  const response = await api.post('/auth/email-otp/request', payload, config);
  return response.data.data;
};

export const login = async (credentials) => {
  const resolvedCompanyToken = String(
    credentials?.companyToken || ''
  ).trim();
  if (!resolvedCompanyToken) {
    const error = new Error('Company token is required for login.');
    error.statusCode = 400;
    throw error;
  }
  const config = {
    headers: {
      'x-company-token': resolvedCompanyToken
    }
  };

  const response = await api.post('/auth/login', {
    email: credentials.email,
    password: credentials.password
  }, config);

  const { token } = response.data.data;
  setBrowserSession({ token, companyToken: resolvedCompanyToken });

  // Dispatch custom event to notify PermissionContext to reload
  window.dispatchEvent(new CustomEvent('auth:login'));

  return response.data.data;
};

export const logout = async () => {
  let logoutError = null;
  try {
    await api.post('/auth/logout');
  } catch (error) {
    logoutError = error;
  } finally {
    clearClientSession({
      reason: 'logout',
      broadcast: true,
      emitAuthEvents: true,
      redirectTo: '/login'
    });
  }

  if (logoutError) {
    console.warn('[Auth] Backend logout failed; local session still cleared.', logoutError);
  }
};

export const refreshToken = async () => {
  return refreshBrowserSession();
};

export const getCurrentUser = async () => {
  let token = getAccessToken();
  if (!token) {
    token = await refreshBrowserSession().catch(() => '');
  }
  if (!token) return null;

  try {
    const response = await api.get('/users/me');
    return response.data.data;
  } catch (error) {
    if (error.response?.status === 401) {
      return null;
    }
    throw error;
  }
};

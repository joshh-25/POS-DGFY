import api from './api.js';
import { setBrowserSession } from './browserSession.js';
import { clearClientSession } from './sessionCleanup.js';

let dgfyToken = '';
let dgfyAccount = null;
const DGFY_EXPLICIT_SIGN_OUT_KEY = 'dgfy_customer_explicit_sign_out';

const dgfyRequestConfig = (token = getStoredDgfyToken()) => {
  const normalizedToken = String(token || '').trim();
  const base = {
    skipTenantAuthHeaders: true,
    skipAuthRefresh: true,
    skipGlobalErrorToast: true,
    withCredentials: true
  };
  return normalizedToken
    ? {
      ...base,
      headers: {
        Authorization: `Bearer ${normalizedToken}`
      }
    }
    : base;
};

const dgfyBusinessRequestConfig = (token = getStoredDgfyToken()) => {
  const normalizedToken = String(token || '').trim();
  if (normalizedToken) return dgfyRequestConfig(normalizedToken);
  return {
    withCredentials: true,
    skipGlobalErrorToast: true
  };
};

const dgfyTenantBridgeRequestConfig = () => ({
  withCredentials: true,
  skipGlobalErrorToast: true,
  headers: {
    'x-dgfy-auth-mode': 'tenant_membership'
  }
});

const isInvalidDgfyBusinessSessionError = (error, token) => {
  if (!String(token || '').trim()) return false;
  if (error?.response?.status !== 401) return false;
  const message = String(error?.response?.data?.message || '').trim().toLowerCase();
  return [
    'invalid dgfy account token',
    'invalid dgfy account session',
    'dgfy session has been revoked',
    'dgfy account is unavailable'
  ].some((fragment) => message.includes(fragment));
};

const isMissingTenantMembershipBridgeError = (error) => {
  if (error?.response?.status !== 401) return false;
  const message = String(error?.response?.data?.message || '').trim().toLowerCase();
  return message.includes('this ims user is not linked to a dgfy account membership');
};

const isDgfyCookieAuthRequiredError = (error) => {
  if (error?.response?.status !== 401) return false;
  const message = String(error?.response?.data?.message || '').trim().toLowerCase();
  return message.includes('dgfy account authentication is required');
};

const callDgfyBusinessEndpoint = async (requestFn, token = getStoredDgfyToken()) => {
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) {
    try {
      return await requestFn(dgfyRequestConfig(''));
    } catch (cookieError) {
      if (!isDgfyCookieAuthRequiredError(cookieError)) throw cookieError;
      return requestFn(dgfyBusinessRequestConfig(''));
    }
  }

  try {
    return await requestFn(dgfyBusinessRequestConfig(normalizedToken));
  } catch (error) {
    if (isInvalidDgfyBusinessSessionError(error, normalizedToken)) {
      clearDgfySession();
      return requestFn(dgfyBusinessRequestConfig(''));
    }
    if (!normalizedToken && isMissingTenantMembershipBridgeError(error)) {
      try {
        return await requestFn(dgfyRequestConfig(''));
      } catch (cookieError) {
        if (isDgfyCookieAuthRequiredError(cookieError)) throw error;
        throw cookieError;
      }
    }
    throw error;
  }
};

export const getStoredDgfyToken = () => {
  return dgfyToken;
};

export const getStoredDgfyAccount = () => {
  return dgfyAccount;
};

export const storeDgfySession = ({ token, account }) => {
  if (token) {
    dgfyToken = String(token || '').trim();
  }
  if (account) dgfyAccount = account;
  clearDgfyExplicitSignOut();
};

export const clearDgfySession = () => {
  dgfyToken = '';
  dgfyAccount = null;
};

export const markDgfyExplicitSignOut = () => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(DGFY_EXPLICIT_SIGN_OUT_KEY, String(Date.now()));
  } catch {
    // Session storage can be unavailable in hardened/private browser modes.
  }
};

export const clearDgfyExplicitSignOut = () => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(DGFY_EXPLICIT_SIGN_OUT_KEY);
  } catch {
    // Session storage cleanup is best-effort.
  }
};

export const markDgfySessionActive = () => {
  clearDgfyExplicitSignOut();
};

export const hasDgfyExplicitSignOut = () => {
  if (typeof window === 'undefined') return false;
  try {
    return Boolean(window.sessionStorage.getItem(DGFY_EXPLICIT_SIGN_OUT_KEY));
  } catch {
    return false;
  }
};

export const registerDgfyAccount = async (payload) => {
  const response = await api.post('/dgfy/auth/register', payload, dgfyRequestConfig(''));
  const data = response.data.data;
  storeDgfySession(data);
  return data;
};

export const preflightDgfyAccountRegistration = async (payload) => {
  const response = await api.post('/dgfy/auth/register/preflight', payload, dgfyRequestConfig(''));
  return response.data.data;
};

export const requestDgfyRegistrationEmailVerification = async (email) => {
  const response = await api.post('/auth/email-otp/request', {
    purpose: 'dgfy_account_verification',
    email
  }, dgfyRequestConfig(''));
  return response.data.data;
};

export const requestDgfySignupOtp = requestDgfyRegistrationEmailVerification;

export const fetchDgfyLegalTerms = async () => {
  const response = await api.get('/dgfy/legal-terms/current', dgfyRequestConfig(''));
  return response.data.data;
};

export const loginDgfyAccount = async (payload) => {
  const response = await api.post('/dgfy/auth/login', payload, dgfyRequestConfig(''));
  const data = response.data.data;
  storeDgfySession(data);
  return data;
};

export const fetchDgfyMe = async (token = getStoredDgfyToken()) => {
  const normalizedToken = String(token || '').trim();
  const response = await api.get('/dgfy/auth/me', dgfyRequestConfig(normalizedToken));
  const data = response.data.data;
  if (data?.account) storeDgfySession({ token: normalizedToken, account: data.account });
  if (data?.token) storeDgfySession(data);
  return data;
};

export const updateDgfyProfile = async (payload, token = getStoredDgfyToken()) => {
  const response = await api.patch('/dgfy/auth/me', payload, dgfyRequestConfig(token));
  const data = response.data.data;
  if (data?.account) storeDgfySession({ token, account: data.account });
  return data;
};

export const changeDgfyPassword = async (payload, token = getStoredDgfyToken()) => {
  const response = await api.post('/dgfy/auth/password/change', payload, dgfyRequestConfig(token));
  return response.data.data;
};

export const requestDgfyEmailVerification = async (token = getStoredDgfyToken()) => {
  const response = await api.post('/dgfy/auth/email-verification/request', {}, dgfyRequestConfig(token));
  return response.data.data;
};

export const verifyDgfyEmail = async (code, token = getStoredDgfyToken()) => {
  const response = await api.post('/dgfy/auth/email-verification/verify', { code }, dgfyRequestConfig(token));
  const data = response.data.data;
  if (data?.account) storeDgfySession({ token, account: data.account });
  return data;
};

export const requestDgfyPasswordReset = async (email) => {
  const response = await api.post('/dgfy/auth/password-reset/request', { email }, dgfyRequestConfig(''));
  return response.data.data;
};

export const completeDgfyPasswordReset = async (payload) => {
  const response = await api.post('/dgfy/auth/password-reset/complete', payload, dgfyRequestConfig(''));
  return response.data.data;
};

export const logoutDgfyAccount = async (token = getStoredDgfyToken()) => {
  markDgfyExplicitSignOut();
  try {
    await api.post('/dgfy/auth/logout', {}, dgfyRequestConfig(token));
  } finally {
    clearDgfySession();
  }
};

export const createDgfyHandoff = async (token = getStoredDgfyToken()) => {
  const response = await api.post('/dgfy/auth/handoff', {}, dgfyRequestConfig(token));
  return response.data.data;
};

export const exchangeDgfyHandoff = async (handoffToken, { softFail = false } = {}) => {
  const response = await api.post('/dgfy/auth/handoff/exchange', {
    handoff_token: handoffToken,
    ...(softFail ? { soft_fail: true } : {})
  });
  const data = response.data.data;
  if (data?.token) storeDgfySession(data);
  return data;
};

export const acceptDgfyInvitation = async (membershipId, token = getStoredDgfyToken()) => {
  const response = await callDgfyBusinessEndpoint(
    (config) => api.post(`/dgfy/invitations/${membershipId}/accept`, {}, config),
    token
  );
  return response.data.data;
};

export const searchDgfyBusinessAccounts = async (query) => {
  const params = new URLSearchParams();
  params.set('query', String(query || '').trim());
  const response = await api.get(`/dgfy/accounts/search?${params.toString()}`);
  return response.data.data;
};

export const createDgfyCompanyInvitation = async (payload) => {
  const response = await api.post('/dgfy/invitations', payload);
  return response.data.data;
};

export const requestDgfyBusinessStepUp = async (token = getStoredDgfyToken()) => {
  const response = await callDgfyBusinessEndpoint(
    (config) => api.post('/dgfy/account/business-step-up/request', {}, config),
    token
  );
  return response.data.data;
};

export const requestDgfyBusinessStepUpForTenantSession = async () => {
  const response = await api.post(
    '/dgfy/account/business-step-up/request',
    {},
    dgfyTenantBridgeRequestConfig()
  );
  return response.data.data;
};

export const listDgfyAccountCompanies = async (token = getStoredDgfyToken()) => {
  const response = await callDgfyBusinessEndpoint(
    (config) => api.get('/dgfy/account/companies', config),
    token
  );
  return response.data.data;
};

export const listDgfyAccountCompaniesForTenantSession = async () => {
  const response = await api.get('/dgfy/account/companies', dgfyTenantBridgeRequestConfig());
  return response.data.data;
};

export const getDgfyLegacyLinkStatus = async () => {
  const response = await api.get('/dgfy/legacy-link/status');
  return response.data.data;
};

export const requestDgfyLegacyLinkEmailOtp = async () => {
  const response = await api.post('/dgfy/legacy-link/request-email-otp');
  return response.data.data;
};

export const completeDgfyLegacyLink = async ({
  emailOtpCode,
  dgfyAccountToken = getStoredDgfyToken()
} = {}) => {
  const response = await api.post('/dgfy/legacy-link/complete', {
    email_otp_code: emailOtpCode,
    dgfy_account_token: dgfyAccountToken
  });
  return response.data.data;
};

export const startDgfyLegacyRegistrationHandoff = async () => {
  const response = await api.post('/dgfy/legacy-link/start-registration-handoff');
  return response.data.data;
};

export const acceptDgfyCompanyInvitation = async ({
  membershipId,
  emailOtpCode
} = {}, token = getStoredDgfyToken()) => {
  const response = await callDgfyBusinessEndpoint(
    (config) => api.post(`/dgfy/invitations/${membershipId}/accept`, {
      email_otp_code: emailOtpCode
    }, config),
    token
  );
  return response.data.data;
};

export const rejectDgfyCompanyInvitation = async ({ membershipId } = {}, token = getStoredDgfyToken()) => {
  const response = await callDgfyBusinessEndpoint(
    (config) => api.post(`/dgfy/invitations/${membershipId}/reject`, {}, config),
    token
  );
  return response.data.data;
};

export const acceptDgfyCompanyInvitationForTenantSession = async ({
  membershipId,
  emailOtpCode
} = {}) => {
  const response = await api.post(`/dgfy/invitations/${membershipId}/accept`, {
    email_otp_code: emailOtpCode
  }, dgfyTenantBridgeRequestConfig());
  return response.data.data;
};

export const switchDgfyCompany = async ({
  tenantId,
  emailOtpCode
} = {}, token = getStoredDgfyToken()) => {
  const response = await callDgfyBusinessEndpoint(
    (config) => api.post(`/dgfy/account/companies/${encodeURIComponent(String(tenantId || ''))}/switch`, {
      email_otp_code: emailOtpCode
    }, config),
    token
  );
  const data = response.data.data;
  clearClientSession({
    reason: 'company_switch',
    broadcast: false,
    emitAuthEvents: false,
    redirectTo: null
  });
  setBrowserSession({
    token: data?.token,
    companyToken: data?.company?.token
  });
  if (typeof window !== 'undefined') {
    const event = typeof CustomEvent === 'function'
      ? new CustomEvent('auth:tenant-switched', {
        detail: {
          tenantId: data?.company?.id || tenantId,
          companyName: data?.company?.name || ''
        }
      })
      : new Event('auth:tenant-switched');
    window.dispatchEvent(event);
    try {
      const channel = new BroadcastChannel('sku_auth');
      channel.postMessage({
        type: 'tenant-switched',
        tenantId: data?.company?.id || tenantId,
        companyName: data?.company?.name || ''
      });
      channel.close();
    } catch {
      // Cross-tab notification is best-effort and carries no secrets.
    }
  }
  return data;
};

export const leaveDgfyCompany = async ({ tenantId } = {}, token = getStoredDgfyToken()) => {
  const response = await callDgfyBusinessEndpoint(
    (config) => api.post(`/dgfy/account/companies/${encodeURIComponent(String(tenantId || ''))}/leave`, {}, config),
    token
  );
  return response.data.data;
};

export const transferDgfyCompanyOwnership = async ({
  tenantId,
  targetDgfyAccountId,
  emailOtpCode
} = {}, token = getStoredDgfyToken()) => {
  const response = await callDgfyBusinessEndpoint(
    (config) => api.post(`/dgfy/account/companies/${encodeURIComponent(String(tenantId || ''))}/transfer-ownership`, {
      target_dgfy_account_id: targetDgfyAccountId,
      email_otp_code: emailOtpCode
    }, config),
    token
  );
  return response.data.data;
};

export const transferDgfyCompanyOwnershipForTenantSession = async ({
  tenantId,
  targetDgfyAccountId,
  emailOtpCode
} = {}) => {
  const response = await api.post(`/dgfy/account/companies/${encodeURIComponent(String(tenantId || ''))}/transfer-ownership`, {
    target_dgfy_account_id: targetDgfyAccountId,
    email_otp_code: emailOtpCode
  }, dgfyTenantBridgeRequestConfig());
  return response.data.data;
};

export const switchDgfyCompanyForTenantSession = async ({
  tenantId,
  emailOtpCode
} = {}) => {
  const response = await api.post(`/dgfy/account/companies/${encodeURIComponent(String(tenantId || ''))}/switch`, {
    email_otp_code: emailOtpCode
  }, dgfyTenantBridgeRequestConfig());
  const data = response.data.data;
  clearClientSession({
    reason: 'company_switch',
    broadcast: false,
    emitAuthEvents: false,
    redirectTo: null
  });
  setBrowserSession({
    token: data?.token,
    companyToken: data?.company?.token
  });
  if (typeof window !== 'undefined') {
    const event = typeof CustomEvent === 'function'
      ? new CustomEvent('auth:tenant-switched', {
        detail: {
          tenantId: data?.company?.id || tenantId,
          companyName: data?.company?.name || ''
        }
      })
      : new Event('auth:tenant-switched');
    window.dispatchEvent(event);
    try {
      const channel = new BroadcastChannel('sku_auth');
      channel.postMessage({
        type: 'tenant-switched',
        tenantId: data?.company?.id || tenantId,
        companyName: data?.company?.name || ''
      });
      channel.close();
    } catch {
      // Cross-tab notification is best-effort and carries no secrets.
    }
  }
  return data;
};

export const startDgfyTenantSession = async ({
  tenantId,
  companyToken
} = {}, token = getStoredDgfyToken()) => {
  const response = await api.post('/dgfy/auth/tenant-session', {
    tenant_id: tenantId,
    company_token: companyToken
  }, dgfyRequestConfig(token));
  const data = response.data.data;
  const tenantToken = String(data?.token || '').trim();
  const resolvedCompanyToken = String(data?.company?.token || companyToken || '').trim();
  if (!tenantToken || !resolvedCompanyToken) {
    throw new Error('The selected company did not return a valid POS session. Sign in again.');
  }
  setBrowserSession({
    token: tenantToken,
    companyToken: resolvedCompanyToken
  });
  if (typeof window !== 'undefined') {
    const event = typeof CustomEvent === 'function'
      ? new CustomEvent('auth:login')
      : new Event('auth:login');
    window.dispatchEvent(event);
  }
  return data;
};

export const startDgfyPosSession = async ({
  tenantId,
  terminalId
} = {}, token = getStoredDgfyToken()) => {
  const response = await api.post(`/dgfy/account/companies/${encodeURIComponent(String(tenantId || ''))}/pos-session`, {
    terminal_id: terminalId
  }, dgfyRequestConfig(token));
  const data = response.data.data;
  setBrowserSession({
    token: data?.token,
    companyToken: data?.company?.token
  });
  if (typeof window !== 'undefined') {
    const event = typeof CustomEvent === 'function'
      ? new CustomEvent('auth:login')
      : new Event('auth:login');
    window.dispatchEvent(event);
  }
  return data;
};

export const dgfyAuthHeader = () => {
  const token = getStoredDgfyToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

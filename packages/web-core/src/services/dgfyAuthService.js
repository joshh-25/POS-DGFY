import api from './api.js';
import { getAccessToken, setBrowserSession } from './browserSession.js';
import { clearClientSession } from './sessionCleanup.js';
import { ANALYTICS_EVENTS, trackFunnelEvent } from '../observability/analyticsEvents.js';

let dgfyToken = '';
let dgfyAccount = null;
let pendingDgfyLegalTermsRequest = null;
const pendingDgfyMeRequests = new Map();
const DGFY_EXPLICIT_SIGN_OUT_KEY = 'dgfy_customer_explicit_sign_out';
// Mirrors SESSION_COOKIE_NAMES.csrf in backend/src/utils/browserSessionCookies.js.
const DGFY_SESSION_HINT_COOKIE = 'sku_csrf_token';

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

const withPreviousTenantAccessToken = (config = {}) => {
  const previousTenantAccessToken = String(getAccessToken() || '').trim();
  if (!previousTenantAccessToken) return config;

  return {
    ...config,
    headers: {
      ...(config.headers || {}),
      'x-previous-tenant-access-token': previousTenantAccessToken
    }
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

// Cheap client-side "is a session plausibly present?" probe.
//
// The session cookies themselves are httpOnly and unreadable here, but the
// backend issues `sku_csrf_token` with httpOnly:false alongside every one of
// them (see backend/src/utils/browserSessionCookies.js issueCsrfToken), and
// clears it in clearAllSessionCookies. So its presence is a reliable-enough
// signal to decide whether an auth probe is worth sending at all.
//
// This is deliberately a HINT, not proof: it can be present without a valid
// session (cookie outlived the session) or absent with one (cleared
// separately). Callers must still handle a failing probe normally -- the only
// thing this buys is skipping a request that would otherwise return 401 and
// print an unsuppressable "Failed to load resource: 401" in the browser
// console on every anonymous page load. That console line is emitted by the
// network layer before any JS runs, so it cannot be caught or silenced; not
// sending the request is the only way to avoid it.
export const hasDgfyBrowserSessionHint = () => {
  if (typeof document === 'undefined') return false;
  try {
    return document.cookie
      .split(';')
      .some((entry) => entry.trim().startsWith(`${DGFY_SESSION_HINT_COOKIE}=`));
  } catch {
    // Treat an unreadable cookie jar as "might have a session" so the probe
    // still runs -- failing open keeps real sessions working.
    return true;
  }
};

export const registerDgfyAccount = async (payload) => {
  const response = await api.post('/dgfy/auth/register', payload, dgfyRequestConfig(''));
  const data = response.data.data;
  storeDgfySession(data);
  trackFunnelEvent(ANALYTICS_EVENTS.ACCOUNT_REGISTERED, { account_id: data?.account?.id });
  return data;
};

export const preflightDgfyAccountRegistration = async (payload) => {
  const response = await api.post('/dgfy/auth/register/preflight', payload, dgfyRequestConfig(''));
  return response.data.data;
};

// Affiliate invite claim: preview is public (used to lock the register email + show the business);
// accept requires a logged-in DGFY account.
const pendingAffiliateInvitePreviewRequests = new Map();

export const fetchAffiliateInvitePreview = async (token) => {
  const normalizedToken = String(token || '').trim();
  if (!pendingAffiliateInvitePreviewRequests.has(normalizedToken)) {
    const request = api
      .get(`/dgfy/affiliate/invites/${encodeURIComponent(normalizedToken)}`, dgfyRequestConfig(''))
      .then((response) => response.data.data)
      .finally(() => { pendingAffiliateInvitePreviewRequests.delete(normalizedToken); });
    pendingAffiliateInvitePreviewRequests.set(normalizedToken, request);
  }
  return pendingAffiliateInvitePreviewRequests.get(normalizedToken);
};

export const acceptAffiliateInvite = async (token) => {
  const response = await api.post('/dgfy/affiliate/invites/accept', { token }, dgfyRequestConfig());
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
  if (!pendingDgfyLegalTermsRequest) {
    pendingDgfyLegalTermsRequest = api
      .get('/dgfy/legal-terms/current', dgfyRequestConfig(''))
      .then((response) => response.data.data)
      .finally(() => { pendingDgfyLegalTermsRequest = null; });
  }
  return pendingDgfyLegalTermsRequest;
};

export const loginDgfyAccount = async (payload) => {
  const response = await api.post('/dgfy/auth/login', payload, dgfyRequestConfig(''));
  const data = response.data.data;
  storeDgfySession(data);
  trackFunnelEvent(ANALYTICS_EVENTS.ACCOUNT_SIGNED_IN, { account_id: data?.account?.id });
  return data;
};

export const fetchDgfyMe = async (token = getStoredDgfyToken()) => {
  const normalizedToken = String(token || '').trim();
  const requestKey = normalizedToken || 'cookie-session';
  if (!pendingDgfyMeRequests.has(requestKey)) {
    const request = api
      .get('/dgfy/auth/me', dgfyRequestConfig(normalizedToken))
      .then((response) => {
        const data = response.data.data;
        if (data?.account) storeDgfySession({ token: normalizedToken, account: data.account });
        if (data?.token) storeDgfySession(data);
        return data;
      })
      .finally(() => { pendingDgfyMeRequests.delete(requestKey); });
    pendingDgfyMeRequests.set(requestKey, request);
  }
  return pendingDgfyMeRequests.get(requestKey);
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

// Laundry staff operations are owned by the independently hosted DGLaundry
// runtime. The DGFY account session authorizes this launch request, but no
// DGFY password, refresh token, or tenant session is passed to the other app.
export const launchDgfyLaundryOperations = async ({
  companyId,
  branchId = null
} = {}, token = getStoredDgfyToken()) => {
  const response = await callDgfyBusinessEndpoint(
    (config) => api.post('/partners/dglaundry/account/launch', {
      company_id: companyId,
      ...(branchId ? { branch_id: branchId } : {})
    }, config),
    token
  );
  return response.data.data;
};

export const listDgfyAccountCompaniesForTenantSession = async () => {
  // skipAuthRefresh: a DGFY-only storefront visitor (no tenant/IMS session) will
  // legitimately 401 here -- authenticateDgfyAccountOrTenantMembership forces the
  // tenant-membership path via x-dgfy-auth-mode and that path requires a tenant
  // Bearer token the visitor never has. Without this flag, api.js's response
  // interceptor treats that 401 as an expired *tenant* session, attempts
  // /auth/refresh-token, fails, and hard-redirects the whole page to
  // /login?reason=session_expired -- destroying a perfectly valid DGFY session
  // just because the "other stores" switcher lookup wasn't authorized. Letting
  // the 401 propagate here instead lands it in fetchStorefrontAccountBranches's
  // existing catch { return []; }, which just hides the switcher as intended.
  const response = await api.get('/dgfy/account/companies', {
    ...dgfyTenantBridgeRequestConfig(),
    skipAuthRefresh: true
  });
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
    }, withPreviousTenantAccessToken(config)),
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
  }, withPreviousTenantAccessToken(dgfyTenantBridgeRequestConfig()));
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

export const activateDgfyTenantSession = (data, { emitAuthEvent = true } = {}) => {
  const tenantToken = String(data?.token || '').trim();
  const resolvedCompanyToken = String(data?.company?.token || '').trim();
  if (!tenantToken || !resolvedCompanyToken) {
    throw new Error('The selected company did not return a valid POS session. Sign in again.');
  }
  setBrowserSession({
    token: tenantToken,
    companyToken: resolvedCompanyToken
  });
  if (emitAuthEvent && typeof window !== 'undefined') {
    const event = typeof CustomEvent === 'function'
      ? new CustomEvent('auth:login')
      : new Event('auth:login');
    window.dispatchEvent(event);
  }
  return data;
};

export const startDgfyTenantSession = async ({
  tenantId,
  companyToken,
  accessScope = ''
} = {}, token = getStoredDgfyToken(), { activate = true } = {}) => {
  const normalizedAccessScope = String(accessScope || '').trim().toLowerCase();
  const response = await api.post('/dgfy/auth/tenant-session', {
    tenant_id: tenantId,
    company_token: companyToken,
    ...(normalizedAccessScope ? { access_scope: normalizedAccessScope } : {})
  }, dgfyRequestConfig(token));
  const data = response.data.data;
  const tenantToken = String(data?.token || '').trim();
  const resolvedCompanyToken = String(data?.company?.token || companyToken || '').trim();
  if (!tenantToken || !resolvedCompanyToken) {
    throw new Error('The selected company did not return a valid POS session. Sign in again.');
  }
  const normalizedSession = {
    ...data,
    company: {
      ...(data?.company || {}),
      token: resolvedCompanyToken
    }
  };
  return activate ? activateDgfyTenantSession(normalizedSession) : normalizedSession;
};

export const startDgfyPosSession = async ({
  tenantId,
  terminalId
} = {}, token = getStoredDgfyToken(), { activate = true } = {}) => {
  const response = await api.post(`/dgfy/account/companies/${encodeURIComponent(String(tenantId || ''))}/pos-session`, {
    terminal_id: terminalId
  }, dgfyRequestConfig(token));
  const data = response.data.data;
  return activate ? activateDgfyTenantSession(data) : data;
};

export const dgfyAuthHeader = () => {
  const token = getStoredDgfyToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

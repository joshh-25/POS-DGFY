import api from './api.js';
import { setBrowserSession } from './browserSession.js';

let dgfyToken = '';
let dgfyAccount = null;

const dgfyRequestConfig = (token = getStoredDgfyToken()) => {
  const normalizedToken = String(token || '').trim();
  return normalizedToken
    ? {
      headers: {
        Authorization: `Bearer ${normalizedToken}`
      }
    }
    : {};
};

export const getStoredDgfyToken = () => {
  return dgfyToken;
};

export const getStoredDgfyAccount = () => {
  return dgfyAccount;
};

export const storeDgfySession = ({ token, account }) => {
  if (token) dgfyToken = String(token || '').trim();
  if (account) dgfyAccount = account;
};

export const clearDgfySession = () => {
  dgfyToken = '';
  dgfyAccount = null;
};

export const registerDgfyAccount = async (payload) => {
  const response = await api.post('/dgfy/auth/register', payload);
  const data = response.data.data;
  storeDgfySession(data);
  return data;
};

export const requestDgfyRegistrationEmailVerification = async (email) => {
  const response = await api.post('/auth/email-otp/request', {
    purpose: 'dgfy_account_verification',
    email
  });
  return response.data.data;
};

export const fetchDgfyLegalTerms = async () => {
  const response = await api.get('/dgfy/legal-terms/current');
  return response.data.data;
};

export const loginDgfyAccount = async (payload) => {
  const response = await api.post('/dgfy/auth/login', payload);
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
  const response = await api.patch('/dgfy/auth/me', payload, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  const data = response.data.data;
  if (data?.account) storeDgfySession({ token, account: data.account });
  return data;
};

export const changeDgfyPassword = async (payload, token = getStoredDgfyToken()) => {
  const response = await api.post('/dgfy/auth/password/change', payload, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  return response.data.data;
};

export const requestDgfyEmailVerification = async (token = getStoredDgfyToken()) => {
  const response = await api.post('/dgfy/auth/email-verification/request', {}, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  return response.data.data;
};

export const verifyDgfyEmail = async (code, token = getStoredDgfyToken()) => {
  const response = await api.post('/dgfy/auth/email-verification/verify', { code }, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  const data = response.data.data;
  if (data?.account) storeDgfySession({ token, account: data.account });
  return data;
};

export const requestDgfyPasswordReset = async (email) => {
  const response = await api.post('/dgfy/auth/password-reset/request', { email });
  return response.data.data;
};

export const completeDgfyPasswordReset = async (payload) => {
  const response = await api.post('/dgfy/auth/password-reset/complete', payload);
  return response.data.data;
};

export const logoutDgfyAccount = async (token = getStoredDgfyToken()) => {
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
  const response = await api.post(`/dgfy/invitations/${membershipId}/accept`, {}, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  return response.data.data;
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
  setBrowserSession({
    token: data?.token,
    companyToken: data?.company?.token || companyToken
  });
  return data;
};

export const dgfyAuthHeader = () => {
  const token = getStoredDgfyToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

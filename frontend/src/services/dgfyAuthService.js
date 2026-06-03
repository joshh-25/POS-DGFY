import api from './api.js';
import { setBrowserSession } from './browserSession.js';

let dgfyToken = '';
let dgfyAccount = null;

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
  if (!token) return null;
  const response = await api.get('/dgfy/auth/me', {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  const data = response.data.data;
  if (data?.account) storeDgfySession({ token, account: data.account });
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
    if (token) {
      await api.post('/dgfy/auth/logout', {}, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
    }
  } finally {
    clearDgfySession();
  }
};

export const createDgfyHandoff = async (token = getStoredDgfyToken()) => {
  const response = await api.post('/dgfy/auth/handoff', {}, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  return response.data.data;
};

export const exchangeDgfyHandoff = async (handoffToken) => {
  const response = await api.post('/dgfy/auth/handoff/exchange', {
    handoff_token: handoffToken
  });
  const data = response.data.data;
  storeDgfySession(data);
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
  }, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
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

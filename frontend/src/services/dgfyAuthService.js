import api from './api.js';

const DGFY_TOKEN_KEY = 'dgfyAccountToken';
const DGFY_ACCOUNT_KEY = 'dgfyAccount';

export const getStoredDgfyToken = () => {
  if (typeof localStorage === 'undefined') return '';
  return localStorage.getItem(DGFY_TOKEN_KEY) || '';
};

export const getStoredDgfyAccount = () => {
  if (typeof localStorage === 'undefined') return null;
  try {
    return JSON.parse(localStorage.getItem(DGFY_ACCOUNT_KEY) || 'null');
  } catch {
    return null;
  }
};

export const storeDgfySession = ({ token, account }) => {
  if (typeof localStorage === 'undefined') return;
  if (token) localStorage.setItem(DGFY_TOKEN_KEY, token);
  if (account) localStorage.setItem(DGFY_ACCOUNT_KEY, JSON.stringify(account));
};

export const clearDgfySession = () => {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(DGFY_TOKEN_KEY);
  localStorage.removeItem(DGFY_ACCOUNT_KEY);
};

export const registerDgfyAccount = async (payload) => {
  const response = await api.post('/dgfy/auth/register', payload);
  const data = response.data.data;
  storeDgfySession(data);
  return data;
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

export const acceptDgfyInvitation = async (membershipId, token = getStoredDgfyToken()) => {
  const response = await api.post(`/dgfy/invitations/${membershipId}/accept`, {}, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  return response.data.data;
};

export const dgfyAuthHeader = () => {
  const token = getStoredDgfyToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

import api from './api.js';

export const register = async (userData) => {
  const response = await api.post('/auth/register', userData);
  const { token, refreshToken } = response.data.data;
  localStorage.setItem('authToken', token);
  localStorage.setItem('refreshToken', refreshToken);
  return response.data.data;
};

export const login = async (credentials) => {
  const response = await api.post('/auth/login', credentials);
  const { token, refreshToken } = response.data.data;
  localStorage.setItem('authToken', token);
  localStorage.setItem('refreshToken', refreshToken);
  return response.data.data;
};

export const logout = async () => {
  await api.post('/auth/logout');
  localStorage.removeItem('authToken');
  localStorage.removeItem('refreshToken');
};

export const refreshToken = async () => {
  const refreshToken = localStorage.getItem('refreshToken');
  const response = await api.post('/auth/refresh-token', { refreshToken });
  const { token } = response.data.data;
  localStorage.setItem('authToken', token);
  return token;
};


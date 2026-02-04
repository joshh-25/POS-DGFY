import api from './api.js';

export const register = async (userData, companyToken) => {
  // Pass company token in header for the registration request (to route to correct DB)
  const config = companyToken ? {
    headers: {
      'x-company-token': companyToken
    }
  } : {};

  const response = await api.post('/auth/register', userData, config);
  const { token, refreshToken } = response.data.data;
  localStorage.setItem('authToken', token);
  localStorage.setItem('refreshToken', refreshToken);
  // Store company token for future requests
  if (companyToken) {
    localStorage.setItem('companyToken', companyToken);
  }
  return response.data.data;
};

export const login = async (credentials) => {
  // Pass companyToken in header for the login request itself (to route to correct DB)
  // OR pass it in body? 
  // Backend tenantHandler looks for header 'x-company-token'.

  // We need to send it as a header for THIS request first.
  const config = {
    headers: {
      'x-company-token': credentials.companyToken
    }
  };

  const response = await api.post('/auth/login', {
    email: credentials.email,
    password: credentials.password
  }, config);

  const { token, refreshToken } = response.data.data;
  localStorage.setItem('authToken', token);
  localStorage.setItem('refreshToken', refreshToken);
  // Store company token for future requests
  if (credentials.companyToken) {
    localStorage.setItem('companyToken', credentials.companyToken);
  }
  return response.data.data;
};

export const logout = async () => {
  await api.post('/auth/logout');
  localStorage.removeItem('authToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('companyToken');
};

export const refreshToken = async () => {
  const refreshToken = localStorage.getItem('refreshToken');
  const response = await api.post('/auth/refresh-token', { refreshToken });
  const { token } = response.data.data;
  localStorage.setItem('authToken', token);
  return token;
};

export const getCurrentUser = async () => {
  const response = await api.get('/users/me');
  return response.data.data;
};

import api from './api.js';

export const getHostingStatus = async () => {
  const response = await api.get('/health', {
    skipGlobalErrorToast: true,
    validateStatus: (status) => status >= 200 && status < 600
  });

  return {
    statusCode: response.status,
    health: response.data
  };
};

export default {
  getHostingStatus
};

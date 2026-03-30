import api from './api.js';

export const fetchUnifiedSalesTransactions = async (params = {}) => {
  const response = await api.get('/sales/transactions', { params });
  return response.data?.data || { transactions: [], pagination: null, summary: null };
};

export const exportUnifiedSalesTransactionsCsv = async (params = {}) => {
  const response = await api.get('/sales/transactions', {
    params: { ...params, export: 'csv' },
    responseType: 'blob'
  });
  return response.data;
};

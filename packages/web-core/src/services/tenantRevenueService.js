import api from './api.js';

export const getTenantFinancialSummary = async (params = {}) => {
  const response = await api.get('/tenant-revenue/tenant/summary', { params });
  return response.data;
};

export const listTenantFinancialTransactions = async (params = {}) => {
  const response = await api.get('/tenant-revenue/tenant/transactions', { params });
  return response.data;
};

export const listTenantFinancialSettlements = async (params = {}) => {
  const response = await api.get('/tenant-revenue/tenant/settlements', { params });
  return response.data;
};

export const listTenantFinancialFeeHistory = async () => {
  const response = await api.get('/tenant-revenue/tenant/fee-history');
  return response.data;
};


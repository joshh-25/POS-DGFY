import api from '@/services/api';

export const fetchEmployees = async ({ includeInactive = true } = {}) => {
  const response = await api.get('/pos/employees', {
    params: { include_inactive: includeInactive }
  });
  return response.data?.data?.employees || [];
};

export const createEmployee = async (payload) => {
  const response = await api.post('/pos/employees', payload);
  return response.data?.data?.employee || null;
};

export const updateEmployee = async (employeeId, payload) => {
  const response = await api.patch(`/pos/employees/${employeeId}`, payload);
  return response.data?.data?.employee || null;
};

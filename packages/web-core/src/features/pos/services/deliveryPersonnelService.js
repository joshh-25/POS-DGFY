import api from '@/services/api';

export const fetchDeliveryPersonnelRegistry = async ({ includeInactive = true } = {}) => {
  const response = await api.get('/pos/delivery-personnel/registry', {
    params: { include_inactive: includeInactive }
  });
  return response.data?.data?.delivery_personnel || [];
};

export const createDeliveryPersonnel = async (payload) => {
  const response = await api.post('/pos/delivery-personnel', payload);
  return response.data?.data?.delivery_personnel || null;
};

export const updateDeliveryPersonnel = async (deliveryPersonnelId, payload) => {
  const response = await api.patch(`/pos/delivery-personnel/${deliveryPersonnelId}`, payload);
  return response.data?.data?.delivery_personnel || null;
};

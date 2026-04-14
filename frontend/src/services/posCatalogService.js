import api from './api.js';

const POS_READINESS_INCOMPLETE = 'POS_READINESS_INCOMPLETE';

const normalizePosCatalogOverrideError = (error) => {
  const details = error?.response?.data?.errors;
  const reasonCode = details?.reason_code;
  if (reasonCode !== POS_READINESS_INCOMPLETE) {
    return error;
  }

  const normalized = new Error(
    error?.response?.data?.message || 'Cannot enable POS visibility until readiness requirements are completed.'
  );
  normalized.reason_code = reasonCode;
  normalized.missing_requirements = Array.isArray(details?.missing_requirements)
    ? details.missing_requirements
    : [];
  normalized.readiness_snapshot = details?.readiness_snapshot || null;
  normalized.is_pos_readiness_blocked = true;
  normalized.original = error;
  return normalized;
};

export const getPosCatalogOverrides = async (params = {}) => {
  const response = await api.get('/pos/catalog-overrides', { params });
  return response.data.data || [];
};

export const updatePosCatalogOverride = async (itemId, payload) => {
  try {
    const response = await api.patch(`/pos/catalog-overrides/${itemId}`, payload);
    return response.data.data;
  } catch (error) {
    throw normalizePosCatalogOverrideError(error);
  }
};

export const uploadPosCatalogImage = async (itemId, file) => {
  const formData = new FormData();
  formData.append('image', file);
  const response = await api.post(`/pos/catalog-overrides/${itemId}/image`, formData);
  return response.data.data;
};

export const deletePosCatalogImage = async (itemId) => {
  const response = await api.delete(`/pos/catalog-overrides/${itemId}/image`);
  return response.data.data;
};

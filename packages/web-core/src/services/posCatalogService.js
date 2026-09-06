import api from './api.js';

export const POS_READINESS_INCOMPLETE = 'POS_READINESS_INCOMPLETE';

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

export const updateBulkPosCatalogOverrides = async ({ itemIds, posVisible }) => {
  const response = await api.patch('/pos/catalog-overrides/bulk', {
    item_ids: itemIds,
    pos_visible: posVisible
  });
  return response.data.data;
};

export const uploadPosCatalogImage = async (itemId, file) => {
  const formData = new FormData();

  // Client-side encode is behind rolloutFlag.js's `image_client_conversion` stub (epic #265,
  // Phase 296) -- inert until Phase 298 wires a real flag, so this branch is dead code today
  // but still exercised by tests to prove the plumbing compiles and works. Single-variant only:
  // `image_medium`/`image_thumbnail`/`client_image_manifest` multipart fields are Phase 297's
  // server-contract job, not this phase's.
  const { getImageClientConversionFlag } = await import('../utils/imageEncoding/rolloutFlag.js');
  if (getImageClientConversionFlag() !== 'off') {
    const { prepareImageVariants } = await import('../utils/imageEncoding/index.js');
    const { variants } = await prepareImageVariants(file);
    formData.append('image', variants.large || file);
  } else {
    formData.append('image', file);
  }

  const response = await api.post(`/pos/catalog-overrides/${itemId}/image`, formData);
  return response.data.data;
};

export const uploadBulkPosCatalogImages = async (files = []) => {
  const formData = new FormData();
  files.forEach((file) => formData.append('images', file));
  const response = await api.post('/pos/catalog-overrides/images/bulk', formData);
  return response.data.data;
};

export const deletePosCatalogImage = async (itemId) => {
  const response = await api.delete(`/pos/catalog-overrides/${itemId}/image`);
  return response.data.data;
};

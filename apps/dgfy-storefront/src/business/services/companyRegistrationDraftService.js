import api from '../../../../../packages/web-core/src/services/api.js';
import { getStoredDgfyToken } from '../../../../../packages/web-core/src/services/dgfyAuthService.js';

const getToken = (token) => String(token || getStoredDgfyToken() || '').trim();

const requestConfig = (token, extra = {}) => ({
  withCredentials: true,
  skipTenantAuthHeaders: true,
  skipAuthRefresh: true,
  skipGlobalErrorToast: true,
  ...extra,
  headers: {
    ...(getToken(token) ? { Authorization: `Bearer ${getToken(token)}` } : {}),
    ...(extra.headers || {})
  }
});

const unwrap = (response) => {
  const body = response?.data || {};
  if (body.success === false) {
    throw new Error(body.message || 'The registration request could not be completed.');
  }
  return body.data ?? body;
};

const getDraftPath = (draftId) => `/registration/drafts/${encodeURIComponent(String(draftId))}`;

export const createCompanyRegistrationDraft = async (token) => unwrap(
  await api.post('/registration/drafts', {}, requestConfig(token))
);

export const updateCompanyRegistrationDraft = async (draftId, payload, token) => unwrap(
  await api.patch(getDraftPath(draftId), payload, requestConfig(token))
);

export const uploadCompanyRegistrationDraftFile = async (draftId, category, file, token, onProgress, { replaceUploadId = '' } = {}) => {
  const formData = new FormData();
  formData.append('category', category);
  formData.append('file', file);
  if (replaceUploadId) formData.append('replace_upload_id', String(replaceUploadId));
  return unwrap(await api.post(
    `${getDraftPath(draftId)}/uploads`,
    formData,
    requestConfig(token, {
      onUploadProgress: (event) => {
        const total = Number(event?.total || 0);
        const loaded = Number(event?.loaded || 0);
        const progress = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : null;
        onProgress?.(progress);
      }
    })
  ));
};

export const removeCompanyRegistrationDraftFile = async (draftId, uploadId, token) => unwrap(
  await api.delete(`${getDraftPath(draftId)}/uploads/${encodeURIComponent(String(uploadId))}`, requestConfig(token))
);

export const submitCompanyRegistrationDraft = async (draftId, body, token) => unwrap(
  await api.post(`${getDraftPath(draftId)}/submit`, body, requestConfig(token))
);

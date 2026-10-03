import api from '../../services/api.js';
import { dgfyAuthHeader } from '../../services/dgfyAuthService.js';

export const COMPANY_REGISTRATION_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

const COMPANY_REGISTRATION_IMAGE_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png']);
const COMPANY_REGISTRATION_IMAGE_EXTENSION_PATTERN = /\.(?:jpe?g|png)$/i;

export const getCompanyRegistrationMenuImageValidationError = (file) => {
    if (!file) return '';
    const mime = String(file.type || '').trim().toLowerCase();
    const filename = String(file.name || '').trim();
    if (Number(file.size || 0) > COMPANY_REGISTRATION_IMAGE_MAX_BYTES) {
        return 'The menu image must be 10 MB or smaller.';
    }
    if (!COMPANY_REGISTRATION_IMAGE_MIMES.has(mime) && !COMPANY_REGISTRATION_IMAGE_EXTENSION_PATTERN.test(filename)) {
        return 'Choose a JPG, JPEG, or PNG image for the optional menu image.';
    }
    return '';
};

export const uploadCompanyRegistrationMenuImage = async (applicationId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post(
        `/dgfy/company-registration/${encodeURIComponent(applicationId)}/uploads/menu`,
        formData,
        {
            withCredentials: true,
            skipTenantAuthHeaders: true,
            headers: dgfyAuthHeader()
        }
    );
    if (!response.data?.success) throw new Error(response.data?.message || 'Menu image upload failed.');
    return response;
};

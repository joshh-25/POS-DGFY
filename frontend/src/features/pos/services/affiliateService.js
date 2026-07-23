import api from '@/services/api';

export const fetchAffiliateSettings = async () => {
    const response = await api.get('/affiliates/settings');
    return response.data?.data?.settings || null;
};

export const updateAffiliateSettings = async (payload = {}) => {
    const response = await api.put('/affiliates/settings', payload);
    return response.data?.data?.settings || null;
};

export const fetchAffiliates = async () => {
    const response = await api.get('/affiliates/affiliates');
    return response.data?.data?.affiliates || [];
};

export const provisionAffiliate = async (payload = {}) => {
    const response = await api.post('/affiliates/affiliates', payload);
    return response.data?.data?.enrollment || null;
};

export const updateAffiliateEnrollment = async (enrollmentId, payload = {}) => {
    const response = await api.patch(`/affiliates/affiliates/${enrollmentId}`, payload);
    return response.data?.data?.enrollment || null;
};

export const fetchAffiliateQrPayload = async (enrollmentId) => {
    const response = await api.get(`/affiliates/affiliates/${enrollmentId}/qr`);
    return response.data?.data || null;
};

export default {
    fetchAffiliateSettings,
    updateAffiliateSettings,
    fetchAffiliates,
    provisionAffiliate,
    updateAffiliateEnrollment,
    fetchAffiliateQrPayload
};

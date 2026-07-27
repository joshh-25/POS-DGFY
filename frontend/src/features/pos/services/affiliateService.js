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

export const fetchAffiliateInvites = async (params = {}) => {
    const response = await api.get('/affiliates/invites', { params });
    return response.data?.data?.invites || [];
};

export const inviteAffiliate = async (payload = {}) => {
    const response = await api.post('/affiliates/invites', payload);
    return response.data?.data || null;
};

export const cancelAffiliateInvite = async (inviteId) => {
    const response = await api.delete(`/affiliates/invites/${inviteId}`);
    return response.data?.data?.invite || null;
};

export const fetchAffiliateQrPayload = async (enrollmentId) => {
    const response = await api.get(`/affiliates/affiliates/${enrollmentId}/qr`);
    return response.data?.data || null;
};

export const fetchAffiliateCashouts = async (params = {}) => {
    const response = await api.get('/affiliates/cashouts', { params });
    return response.data?.data?.cashouts || [];
};

export const approveAffiliateCashout = async (cashoutId) => {
    const response = await api.patch(`/affiliates/cashouts/${cashoutId}/approve`);
    return response.data?.data?.cashout || null;
};

export const markAffiliateCashoutPaid = async (cashoutId, payload = {}) => {
    const response = await api.patch(`/affiliates/cashouts/${cashoutId}/mark-paid`, payload);
    return response.data?.data?.cashout || null;
};

export const rejectAffiliateCashout = async (cashoutId, payload = {}) => {
    const response = await api.patch(`/affiliates/cashouts/${cashoutId}/reject`, payload);
    return response.data?.data?.cashout || null;
};

export default {
    fetchAffiliateSettings,
    updateAffiliateSettings,
    fetchAffiliates,
    provisionAffiliate,
    updateAffiliateEnrollment,
    fetchAffiliateInvites,
    inviteAffiliate,
    cancelAffiliateInvite,
    fetchAffiliateQrPayload,
    fetchAffiliateCashouts,
    approveAffiliateCashout,
    markAffiliateCashoutPaid,
    rejectAffiliateCashout
};

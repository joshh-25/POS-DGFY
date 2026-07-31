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

// Phase 1 affiliate pricing rule engine (see
// docs/proposals/2026-07-29-affiliate-pricing-rule-engine-scope.md). Selling-price rule only -
// commission configuration goes through updateAffiliateSettings/updateAffiliateEnrollment above.
export const fetchAffiliatePriceRules = async () => {
    const response = await api.get('/affiliates/price-rules');
    return response.data?.data?.price_rules || [];
};

// enrollment_id omitted (or 0) saves the tenant-wide template; a real enrollment_id saves that
// affiliate's override.
export const upsertAffiliatePriceRule = async (payload = {}) => {
    const response = await api.put('/affiliates/price-rules', payload);
    return response.data?.data?.price_rule || null;
};

export const deactivateAffiliatePriceRule = async (priceRuleId) => {
    const response = await api.delete(`/affiliates/price-rules/${priceRuleId}`);
    return response.data?.data?.price_rule || null;
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
    rejectAffiliateCashout,
    fetchAffiliatePriceRules,
    upsertAffiliatePriceRule,
    deactivateAffiliatePriceRule
};

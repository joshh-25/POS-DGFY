import api from '@/services/api';

// Phase 143 (#848). Thin client for GET/PUT /api/v1/downpayment/settings (Phase 138, #820) --
// mirrors affiliateService.js's fetch/update shape exactly. The envelope is double-nested
// (data.settings, not data) -- see downpaymentSettingsHandlers.js on the API side.

export const fetchDownpaymentSettings = async () => {
    const response = await api.get('/downpayment/settings');
    return response.data?.data?.settings || null;
};

export const updateDownpaymentSettings = async (payload = {}) => {
    const response = await api.put('/downpayment/settings', payload);
    return response.data?.data?.settings || null;
};

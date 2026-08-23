import api from '@/services/api';

export const fetchAuditLogs = async (params = {}) => {
    const response = await api.get('/audit', { params });
    return response.data?.data || {
        logs: [],
        pagination: { page: 1, limit: 25, total: 0, total_pages: 1 }
    };
};

import api from '@/services/api.js';

const EMPTY_SUMMARY = Object.freeze({
  average_rating: null,
  total_count: 0,
  distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
});

export const listStorefrontReviews = async ({ tenantId, limit = 50 } = {}) => {
  const normalizedTenantId = String(tenantId || '').trim();
  if (!normalizedTenantId) return { reviews: [], summary: EMPTY_SUMMARY };

  const response = await api.get('/dgfy/customer/reviews/public', {
    params: { tenant_id: normalizedTenantId, limit }
  });
  const payload = response?.data?.data || response?.data || {};
  return {
    reviews: Array.isArray(payload.reviews) ? payload.reviews : [],
    summary: payload.summary && typeof payload.summary === 'object' ? payload.summary : EMPTY_SUMMARY
  };
};

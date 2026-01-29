/**
 * Analytics Service
 * 
 * Frontend service for fetching AI-driven analytics data.
 * Consumes endpoints from /api/v1/analytics/
 */

import api from '../services/api';

/**
 * Get performance scorecard for a specific supplier
 * @param {number|string} supplierId 
 */
export const getSupplierPerformance = async (supplierId) => {
    const response = await api.get(`/analytics/supplier/${supplierId}`);
    return response.data;
};

/**
 * Get anomaly detection results
 * @param {Object} options { category, itemId, days }
 */
export const getAnomalies = async (options = {}) => {
    const params = new URLSearchParams();
    if (options.category) params.append('category', options.category);
    if (options.itemId) params.append('itemId', options.itemId);
    if (options.days) params.append('days', options.days);

    const response = await api.get(`/analytics/anomalies?${params.toString()}`);
    return response.data;
};

/**
 * Get Cost Analysis (COGS vs Waste)
 * @param {Object} options { startDate, endDate }
 */
export const getCostAnalysis = async (options = {}) => {
    const params = new URLSearchParams();
    if (options.startDate) params.append('startDate', options.startDate);
    if (options.endDate) params.append('endDate', options.endDate);

    const response = await api.get(`/analytics/costs?${params.toString()}`);
    return response.data;
};

/**
 * Get Burn Rate & Reorder Recommendation for an item
 * @param {number|string} itemId 
 * @param {number} days 
 */
export const getItemBurnRate = async (itemId, days = 30) => {
    const response = await api.get(`/analytics/burn-rate/${itemId}?days=${days}`);
    return response.data;
};

export default {
    getSupplierPerformance,
    getAnomalies,
    getCostAnalysis,
    getItemBurnRate
};

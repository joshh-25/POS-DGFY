/**
 * Analytics Controller
 * 
 * Exposes statistical analysis and AI-driven insights to the frontend.
 * Read-only endpoints for dashboards and reports.
 */

import * as analyticsService from '../services/analyticsService.js';
import logger from '../config/logger.js';

/**
 * GET /api/v1/analytics/supplier/:id
 * Get performance scorecard for a specific supplier
 */
export const getSupplierPerformance = async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await analyticsService.analyzeSupplierPerformance(id);

        res.json({
            success: true,
            data: result,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error in getSupplierPerformance:', error);
        next(error);
    }
};

/**
 * GET /api/v1/analytics/anomalies
 * Detect potential irregularities in inventory movements
 */
export const getAnomalies = async (req, res, next) => {
    try {
        const { category, itemId, days } = req.query;

        const options = {
            // Fix 7.3: Sanitize category to prevent operator injection (ensure string)
            category: typeof category === 'string' ? category : null,
            itemId: itemId ? parseInt(itemId) : null,
            days: days ? parseInt(days) : 30
        };

        const anomalies = await analyticsService.detectAnomalies(options);

        res.json({
            success: true,
            data: anomalies,
            count: anomalies.length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error in getAnomalies:', error);
        next(error);
    }
};

/**
 * GET /api/v1/analytics/costs
 * Analyze COGS vs Waste for a given period
 */
export const getCostAnalysis = async (req, res, next) => {
    try {
        const { startDate, endDate } = req.query;

        const result = await analyticsService.analyzeInventoryCosts({
            startDate,
            endDate
        });

        res.json({
            success: true,
            data: result,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error in getCostAnalysis:', error);
        next(error);
    }
};

/**
 * GET /api/v1/analytics/burn-rate/:itemId
 * Calculate burn rate and reorder points for a specific item
 */
export const getItemBurnRate = async (req, res, next) => {
    try {
        const { itemId } = req.params;
        const { days } = req.query;

        const burnRate = await analyticsService.calculateBurnRate(itemId, days ? parseInt(days) : undefined);
        const recommendation = await analyticsService.calculateReorderPoint(itemId);

        res.json({
            success: true,
            data: {
                ...burnRate,
                recommendation: recommendation.recommendation
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error in getItemBurnRate:', error);
        next(error);
    }
};

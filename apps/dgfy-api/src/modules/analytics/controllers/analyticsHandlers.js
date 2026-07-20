import logger from '../../../config/logger.js';
import {
  getSupplierPerformanceUseCase,
  getAnomaliesUseCase,
  getCostAnalysisUseCase,
  getItemBurnRateUseCase
} from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';
import { trackProductUsageFromResult } from '../../../services/productUsageTelemetryService.js';

const timestamp = () => new Date().toISOString();
const requestId = (req, res) => req.requestId || res.locals?.requestId || null;
const defaultErrorPayload = (req, res, failure) => ({
  success: false,
  data: null,
  message: failure.message,
  error_code: failure.code,
  errors: failure.details,
  request_id: requestId(req, res),
  timestamp: timestamp()
});

export const getSupplierPerformance = async (req, res, next) => {
  try {
    const result = await getSupplierPerformanceUseCase({ supplierId: req.params.id });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'analytics_supplier_performance_viewed',
      surface: 'analytics',
      action: 'view_supplier_performance',
      result,
      successMetadataResolver: () => ({
        supplier_id: req.params.id
      })
    });
    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    logger.error('Error in getSupplierPerformance:', error);
    next(error);
  }
};

export const getAnomalies = async (req, res, next) => {
  try {
    const { category, itemId, days } = req.query;
    const options = {
      category: typeof category === 'string' ? category : null,
      itemId: itemId ? Number.parseInt(itemId, 10) : null,
      days: days ? Number.parseInt(days, 10) : 30
    };

    const result = await getAnomaliesUseCase({ options });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'analytics_anomalies_viewed',
      surface: 'analytics',
      action: 'view_anomalies',
      result,
      successMetadataResolver: (data) => ({
        anomaly_count: Array.isArray(data) ? data.length : 0,
        category: options.category,
        item_id: options.itemId
      })
    });
    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        count: Array.isArray(result.data) ? result.data.length : 0,
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    logger.error('Error in getAnomalies:', error);
    next(error);
  }
};

export const getCostAnalysis = async (req, res, next) => {
  try {
    const result = await getCostAnalysisUseCase({
      startDate: req.query.startDate,
      endDate: req.query.endDate
    });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'analytics_cost_analysis_viewed',
      surface: 'analytics',
      action: 'view_cost_analysis',
      result,
      successMetadataResolver: () => ({
        start_date: req.query.startDate || null,
        end_date: req.query.endDate || null
      })
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    logger.error('Error in getCostAnalysis:', error);
    next(error);
  }
};

export const getItemBurnRate = async (req, res, next) => {
  try {
    const result = await getItemBurnRateUseCase({
      itemId: req.params.itemId,
      days: req.query.days ? Number.parseInt(req.query.days, 10) : undefined
    });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'analytics_item_burn_rate_viewed',
      surface: 'analytics',
      action: 'view_item_burn_rate',
      result,
      successMetadataResolver: () => ({
        item_id: req.params.itemId,
        days: req.query.days ? Number.parseInt(req.query.days, 10) : null
      })
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    logger.error('Error in getItemBurnRate:', error);
    next(error);
  }
};

export default {
  getSupplierPerformance,
  getAnomalies,
  getCostAnalysis,
  getItemBurnRate
};

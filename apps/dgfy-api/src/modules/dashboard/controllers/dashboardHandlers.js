import {
  getStatsUseCase,
  getLowStockUseCase,
  getRecentMovementsUseCase
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

export const getStats = async (req, res, next) => {
  try {
    const result = await getStatsUseCase();
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'dashboard_stats_viewed',
      surface: 'dashboard',
      action: 'view_stats',
      result,
      successMetadataResolver: (data) => ({
        total_items: data?.totalItems ?? null,
        total_suppliers: data?.totalSuppliers ?? null
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
    next(error);
  }
};

export const getLowStock = async (req, res, next) => {
  try {
    const result = await getLowStockUseCase();
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'dashboard_low_stock_viewed',
      surface: 'dashboard',
      action: 'view_low_stock',
      result,
      successMetadataResolver: (data) => ({
        item_count: Array.isArray(data) ? data.length : 0
      })
    });
    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: { items: result.data },
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const getRecentMovements = async (req, res, next) => {
  try {
    const limit = req.query.limit || 10;
    const result = await getRecentMovementsUseCase({ limit });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'dashboard_recent_movements_viewed',
      surface: 'dashboard',
      action: 'view_recent_movements',
      result,
      successMetadataResolver: (data) => ({
        requested_limit: Number.parseInt(limit, 10) || null,
        movement_count: Array.isArray(data) ? data.length : 0
      })
    });
    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: { movements: result.data },
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getStats,
  getLowStock,
  getRecentMovements
};

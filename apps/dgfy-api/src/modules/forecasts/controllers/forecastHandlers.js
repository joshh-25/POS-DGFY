import { getStockForecastUseCase } from '../index.js';
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

export const getStockForecast = async (req, res, next) => {
  try {
    const daysAhead = req.query.days || 30;
    const result = await getStockForecastUseCase({ daysAhead });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'forecast_stock_levels_viewed',
      surface: 'forecast',
      action: 'view_stock_forecast',
      result,
      successMetadataResolver: (data) => ({
        days_ahead: Number.parseInt(daysAhead, 10) || null,
        forecast_count: Array.isArray(data) ? data.length : 0
      })
    });
    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: { forecasts: result.data },
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getStockForecast
};

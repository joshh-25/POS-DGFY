import { generateAlertsUseCase } from '../index.js';
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

export const generateAlerts = async (req, res, next) => {
  try {
    const result = await generateAlertsUseCase();
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'alerts_viewed',
      surface: 'alerts',
      action: 'view_alerts',
      result,
      successMetadataResolver: (data) => ({
        alert_count: Array.isArray(data) ? data.length : 0
      })
    });
    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: { alerts: result.data },
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export default {
  generateAlerts
};

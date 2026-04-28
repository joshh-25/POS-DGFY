import {
  getOnboardingStatusUseCase,
  saveOnboardingStepUseCase,
  completeOnboardingUseCase
} from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';
import {
  trackProductUsageFromResult,
  trackProductUsageEvent
} from '../../../services/productUsageTelemetryService.js';

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

const ONBOARDING_EVENT_MAP = Object.freeze({
  wizard_viewed: 'tenant_onboarding_wizard_viewed',
  reminder_shown: 'tenant_onboarding_reminder_shown',
  reminder_dismissed: 'tenant_onboarding_reminder_dismissed',
  optional_asset_skipped: 'tenant_onboarding_optional_asset_skipped',
  classifier_viewed: 'tenant_onboarding_classifier_viewed',
  classifier_saved: 'tenant_onboarding_classifier_saved',
  classifier_skipped: 'tenant_onboarding_classifier_skipped'
});

export const getOnboardingStatus = async (req, res, next) => {
  try {
    const result = await getOnboardingStatusUseCase({
      storeNameBaseline: req.tenant?.name || ''
    });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'tenant_onboarding_viewed',
      surface: 'onboarding',
      action: 'view_status',
      result
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'Tenant onboarding status retrieved successfully',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const saveOnboardingStep = async (req, res, next) => {
  try {
    const result = await saveOnboardingStepUseCase({
      stepKey: req.validatedData?.step_key,
      payload: req.validatedData?.payload || {},
      storeNameBaseline: req.tenant?.name || ''
    });

    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'tenant_onboarding_step_completed',
      surface: 'onboarding',
      action: 'save_step',
      result,
      successMetadataResolver: () => ({
        step_key: req.validatedData?.step_key || null
      })
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'Tenant onboarding step saved successfully',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const completeOnboarding = async (req, res, next) => {
  try {
    const result = await completeOnboardingUseCase({
      tenantId: req.tenant?.id || null,
      storeNameBaseline: req.tenant?.name || ''
    });

    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'tenant_onboarding_completed',
      surface: 'onboarding',
      action: 'complete',
      result
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'Tenant onboarding completed successfully',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const trackOnboardingEvent = async (req, res, next) => {
  try {
    const eventKey = String(req.validatedData?.event_key || '').trim().toLowerCase();
    const metadata = req.validatedData?.metadata && typeof req.validatedData.metadata === 'object'
      ? req.validatedData.metadata
      : {};
    const eventType = ONBOARDING_EVENT_MAP[eventKey];

    if (!eventType) {
      return res.status(422).json({
        success: false,
        data: null,
        message: 'Unsupported onboarding event key',
        error_code: 'VALIDATION_FAILED',
        errors: [{ field: 'event_key', message: 'Unsupported onboarding event key' }],
        request_id: requestId(req, res),
        timestamp: timestamp()
      });
    }

    await trackProductUsageEvent({
      req,
      user: req.user,
      eventType,
      surface: 'onboarding',
      action: 'track_event',
      outcome: 'success',
      metadata: {
        ...metadata,
        event_key: eventKey
      }
    });

    return res.status(202).json({
      success: true,
      data: {
        accepted: true,
        event_key: eventKey
      },
      message: 'Onboarding event accepted',
      timestamp: timestamp()
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getOnboardingStatus,
  saveOnboardingStep,
  completeOnboarding,
  trackOnboardingEvent
};

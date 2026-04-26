import Joi from 'joi';
import validateSchema from '../middleware/validateSchema.js';

const ONBOARDING_STEP_KEYS = Object.freeze([
  'business_profile',
  'brand_assets',
  'readiness'
]);
const MAX_EVENT_METADATA_BYTES = 8 * 1024;

export const onboardingStepSchema = Joi.object({
  step_key: Joi.string().trim().lowercase().valid(...ONBOARDING_STEP_KEYS).required(),
  payload: Joi.object().unknown(true).default({})
});

export const onboardingEventSchema = Joi.object({
  event_key: Joi.string().trim().lowercase().valid(
    'wizard_viewed',
    'reminder_shown',
    'reminder_dismissed',
    'optional_asset_skipped'
  ).required(),
  metadata: Joi.object().unknown(true).default({}).custom((value, helpers) => {
    try {
      const bytes = Buffer.byteLength(JSON.stringify(value || {}), 'utf8');
      if (bytes > MAX_EVENT_METADATA_BYTES) {
        return helpers.error('any.custom', { message: 'metadata exceeds size limit' });
      }
      return value;
    } catch {
      return helpers.error('any.custom', { message: 'metadata is not serializable' });
    }
  }, 'metadata size validation').messages({
    'any.custom': '{{#message}}'
  })
});

export const validateOnboardingStepPayload = validateSchema(onboardingStepSchema, 'body', 'validatedData');
export const validateOnboardingEventPayload = validateSchema(onboardingEventSchema, 'body', 'validatedData');

export default {
  validateOnboardingStepPayload,
  validateOnboardingEventPayload
};

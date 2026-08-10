import Joi from 'joi';
import validateSchema from '../middleware/validateSchema.js';

const ONBOARDING_STEP_KEYS = Object.freeze([
  'brand_assets',
  'primary_location',
  'bulk_items'
]);

const onboardingBulkItemRowSchema = Joi.object({
  client_row_id: Joi.string().trim().max(80).allow(null, ''),
  mode_item_preset: Joi.string().trim().max(64).allow(null, ''),
  name: Joi.string().trim().max(255).allow(null, ''),
  default_sale_price: Joi.alternatives().try(
    Joi.number().precision(4),
    Joi.string().trim().allow('')
  ).allow(null),
  cost_per_unit: Joi.number().min(0).precision(4).allow(null, ''),
  current_stock: Joi.number().min(0).precision(4).allow(null, ''),
  location_id: Joi.number().integer().positive().allow(null, '')
});
const MAX_EVENT_METADATA_BYTES = 8 * 1024;

const primaryLocationStepPayloadSchema = Joi.object({
  public_storefront_visible: Joi.boolean().strict().optional()
}).unknown(true);

export const onboardingStepSchema = Joi.object({
  step_key: Joi.string().trim().lowercase().valid(...ONBOARDING_STEP_KEYS).required(),
  payload: Joi.when('step_key', {
    is: 'primary_location',
    then: primaryLocationStepPayloadSchema.default({}),
    otherwise: Joi.object().unknown(true).default({})
  })
});

export const onboardingEventSchema = Joi.object({
  event_key: Joi.string().trim().lowercase().valid(
    'wizard_viewed',
    'reminder_shown',
    'reminder_dismissed',
    'optional_asset_skipped',
    'primary_location_saved',
    'bulk_items_saved'
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

export const onboardingBulkItemsSchema = Joi.object({
  rows: Joi.array().items(onboardingBulkItemRowSchema).min(1).max(50).required()
});

export const validateOnboardingStepPayload = validateSchema(onboardingStepSchema, 'body', 'validatedData');
export const validateOnboardingEventPayload = validateSchema(onboardingEventSchema, 'body', 'validatedData');
export const validateOnboardingBulkItemsPayload = validateSchema(onboardingBulkItemsSchema, 'body', 'validatedData');

export default {
  validateOnboardingStepPayload,
  validateOnboardingEventPayload,
  validateOnboardingBulkItemsPayload
};

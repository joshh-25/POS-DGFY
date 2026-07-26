import Joi from 'joi';
import { WORKFLOW_MODE_VALUES } from '../modules/shared/constants/workflowModes.js';

const discoveryQuerySchema = Joi.object({
    search: Joi.string().trim().allow('', null).optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    latitude: Joi.number().min(-90).max(90).allow(null).optional(),
    longitude: Joi.number().min(-180).max(180).allow(null).optional(),
    result_mode: Joi.string().trim().lowercase().valid('union', 'item_only', 'store_only').default('union'),
    stock_filter: Joi.string().trim().lowercase().valid('in_stock_only', 'include_out_of_stock').optional(),
    pin_scope: Joi.string().trim().lowercase().valid('nearest_matching_branch', 'all_matching_branches', 'tenant_primary').optional(),
    include_match_meta: Joi.boolean().truthy('true', '1').falsy('false', '0').default(true)
});

const mapPinsQuerySchema = discoveryQuerySchema.keys({
    limit: Joi.number().integer().min(1).max(100).default(100),
    include_match_meta: Joi.boolean().truthy('true', '1').falsy('false', '0').default(false),
    include_items: Joi.boolean().truthy('true', '1').falsy('false', '0').default(false),
    item_limit: Joi.number().integer().min(1).max(10).default(5)
});

const storefrontSlugParamSchema = Joi.object({
    slug: Joi.string().trim().lowercase().max(80).pattern(/^[a-z0-9-]+$/).required()
});

// Master-admin-only: creates/replaces an entity_type: 'external_listing' row —
// a store that transacts on a different platform. external_storefront_url is
// required so the card/pin never falls back to a dgfy.ph URL for it.
const externalListingBodySchema = Joi.object({
    tenant_name: Joi.string().trim().min(1).max(255).required(),
    external_storefront_url: Joi.string().trim().uri({ scheme: ['http', 'https'] }).max(500).required(),
    external_provider: Joi.string().trim().max(60).allow('', null).optional(),
    external_reference_id: Joi.string().trim().max(120).allow('', null).optional(),
    workflow_mode: Joi.string().trim().lowercase().valid(...WORKFLOW_MODE_VALUES).optional(),
    location_name: Joi.string().trim().max(255).allow('', null).optional(),
    address_line: Joi.string().trim().max(255).allow('', null).optional(),
    latitude: Joi.number().min(-90).max(90).allow(null).optional(),
    longitude: Joi.number().min(-180).max(180).allow(null).optional(),
    delivery_radius_km: Joi.number().min(0).max(1000).optional(),
    estimated_wait_minutes: Joi.number().integer().min(0).max(1440).optional(),
    supports_delivery: Joi.boolean().optional(),
    supports_pickup: Joi.boolean().optional(),
    supports_dine_in: Joi.boolean().optional(),
    store_delivery_fee: Joi.number().min(0).optional(),
    storefront_tagline: Joi.string().trim().max(120).allow('', null).optional(),
    storefront_about: Joi.string().trim().max(1000).allow('', null).optional(),
    storefront_phone: Joi.string().trim().max(50).allow('', null).optional(),
    storefront_hours: Joi.string().trim().max(120).allow('', null).optional(),
    storefront_cover_image_url: Joi.string().trim().uri({ scheme: ['http', 'https'] }).max(500).allow('', null).optional(),
    storefront_profile_image_url: Joi.string().trim().uri({ scheme: ['http', 'https'] }).max(500).allow('', null).optional(),
    storefront_categories: Joi.array().items(Joi.string().trim().max(60)).max(12).optional(),
    is_visible: Joi.boolean().optional(),
    storefront_open: Joi.boolean().optional()
});

const buildValidationErrorResponse = (error) => ({
    success: false,
    data: null,
    message: 'Validation failed',
    errors: error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message
    })),
    timestamp: new Date().toISOString()
});

const validateSchema = (schema, source, target) => (req, res, next) => {
    const { error, value } = schema.validate(req[source], {
        abortEarly: false,
        stripUnknown: true
    });

    if (error) {
        return res.status(422).json(buildValidationErrorResponse(error));
    }

    req[target] = value;
    return next();
};

export const validateStorefrontDiscoveryQuery = validateSchema(discoveryQuerySchema, 'query', 'validatedQuery');
export const validateStorefrontMapPinsQuery = validateSchema(mapPinsQuerySchema, 'query', 'validatedQuery');
export const validateStorefrontSlugParam = validateSchema(storefrontSlugParamSchema, 'params', 'validatedParams');
export const validateUpsertExternalListing = validateSchema(externalListingBodySchema, 'body', 'validatedData');

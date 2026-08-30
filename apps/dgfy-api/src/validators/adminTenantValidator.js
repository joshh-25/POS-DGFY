import Joi from 'joi';

const CUSTOMER_ACCESS_MODES = ['ghost', 'catalog', 'inquiry', 'transaction'];
const CUSTOMER_ACCESS_REGISTRATION_STAGES = ['informal', 'partial', 'registered'];

const capabilityPatchSchema = Joi.object({
    ims_enabled: Joi.boolean().strict().optional(),
    pos_enabled: Joi.boolean().strict().optional(),
    storefront_visible: Joi.boolean().strict().optional(),
    customer_access_mode: Joi.string().trim().lowercase().valid(...CUSTOMER_ACCESS_MODES).optional(),
    platform_max_customer_access_mode: Joi.string().trim().lowercase().valid(...CUSTOMER_ACCESS_MODES).optional(),
    customer_access_registration_stage: Joi.string().trim().lowercase().valid(...CUSTOMER_ACCESS_REGISTRATION_STAGES).optional(),
    reason: Joi.string().trim().min(3).max(500).required()
}).or(
    'ims_enabled',
    'pos_enabled',
    'storefront_visible',
    'customer_access_mode',
    'platform_max_customer_access_mode',
    'customer_access_registration_stage'
).unknown(false);

const capabilityAuditLogQuerySchema = Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(20)
});

// Issue #178 Phase 17: applying a Store Template to an already-provisioned
// tenant. templateKey selects which published template; reason is required
// with the same minimum length as every other audited platform-admin write
// (capabilityPatchSchema above, tenantPosMetadataPatchSchema below).
const applyTemplateSchema = Joi.object({
    templateKey: Joi.string().trim().min(1).max(100).required(),
    reason: Joi.string().trim().min(3).max(500).required()
}).unknown(false);

const tenantPosMetadataPatchSchema = Joi.object({
    software_settings: Joi.object({
        pos_software_name: Joi.string().trim().max(120).allow('').optional(),
        pos_software_version: Joi.string().trim().max(80).allow('').optional(),
        pos_software_serial_number: Joi.string().trim().max(120).allow('').optional()
    }).min(1).optional(),
    pending_action: Joi.string().trim().lowercase().valid('approve', 'reject').optional(),
    reason: Joi.string().trim().min(3).max(500).required()
}).xor('software_settings', 'pending_action').unknown(false);

// #1190 (Phase 213): landlord-admin write path for the per-tenant affiliate-enrollment cap
// (#447 D5). min(1): 0 already has a meaning -- program_enabled: false -- and two mechanisms for
// "no affiliates" is how a tenant ends up disabled two different ways that disagree. max(100) is
// a defensive typo bound, not a product limit -- see PHASE_213_PLAN.md A4.
const tenantAffiliateSlotsPatchSchema = Joi.object({
    max_affiliate_slots: Joi.number().integer().min(1).max(100).required(),
    reason: Joi.string().trim().min(3).max(500).required()
}).unknown(false);

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

export const validateTenantCapabilityPatch = (req, res, next) => {
    const { error, value } = capabilityPatchSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
        convert: true
    });

    if (error) {
        return res.status(422).json(buildValidationErrorResponse(error));
    }

    req.validatedData = value;
    return next();
};

export const validateApplyTemplateToTenant = (req, res, next) => {
    const { error, value } = applyTemplateSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
        convert: true
    });

    if (error) {
        return res.status(422).json(buildValidationErrorResponse(error));
    }

    req.validatedData = value;
    return next();
};

export const validateTenantCapabilityAuditLogQuery = (req, res, next) => {
    const { error, value } = capabilityAuditLogQuerySchema.validate(req.query, {
        abortEarly: false,
        stripUnknown: true,
        convert: true
    });

    if (error) {
        return res.status(422).json(buildValidationErrorResponse(error));
    }

    req.validatedQuery = value;
    return next();
};

export const validateTenantPosMetadataPatch = (req, res, next) => {
    const { error, value } = tenantPosMetadataPatchSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
        convert: true
    });

    if (error) {
        return res.status(422).json(buildValidationErrorResponse(error));
    }

    req.validatedData = value;
    return next();
};

export const validateTenantAffiliateSlotsPatch = (req, res, next) => {
    const { error, value } = tenantAffiliateSlotsPatchSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
        convert: true
    });

    if (error) {
        return res.status(422).json(buildValidationErrorResponse(error));
    }

    req.validatedData = value;
    return next();
};

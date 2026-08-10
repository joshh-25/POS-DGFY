import Joi from 'joi';
import { WORKFLOW_MODE_VALUES, WORKFLOW_MODE_ALIASES } from '../modules/shared/constants/workflowModes.js';

// External-engine modes ARE selectable here, unlike
// adminTemplateValidator.js's TEMPLATE_AUTHORABLE_MODES - a registration
// industry with no template (mode-only provisioning) is a legitimate,
// existing shape (healthcare, ticketing_transport, ...). Every non-alias
// member of WORKFLOW_MODE_VALUES, same accounting
// registrationIndustries.contract.test.js pins for the seed baseline.
const OFFERED_WORKFLOW_MODES = WORKFLOW_MODE_VALUES.filter((mode) => !(mode in WORKFLOW_MODE_ALIASES));

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

const validateWith = (schema, source = 'body') => (req, res, next) => {
    const { error, value } = schema.validate(req[source], {
        abortEarly: false,
        stripUnknown: true,
        convert: true
    });
    if (error) {
        return res.status(422).json(buildValidationErrorResponse(error));
    }
    req[source === 'body' ? 'validatedData' : 'validatedQuery'] = value;
    return next();
};

// reason is required on both hide and unhide - mirroring
// adminTemplateValidator.js's templateActionSchema, every audited
// platform-admin write in this codebase requires one.
const setVisibilitySchema = Joi.object({
    hidden: Joi.boolean().strict().required(),
    reason: Joi.string().trim().min(3).max(500).required()
}).unknown(false);

const auditLogQuerySchema = Joi.object({
    limit: Joi.number().integer().min(1).max(200).default(50)
}).unknown(false);

// Cross-field rules (mode must match the template's base_mode, template
// required iff the mode isn't external) can't be expressed by Joi alone -
// they are enforced in adminRegistrationIndustryUseCases.js's
// validateModeAndTemplate(), which needs a DB read the validator layer
// doesn't have. This schema only checks shape/type/presence. is_system and
// hidden are deliberately absent - .unknown(false) rejects them outright
// rather than silently stripping them (is_system is never settable via the
// API; hidden has its own dedicated endpoint below).
const createIndustrySchema = Joi.object({
    industry_key: Joi.string().trim().lowercase().pattern(/^[a-z][a-z0-9_]{1,79}$/).required().messages({
        'string.pattern.base': 'industry_key must be lowercase letters, digits, and underscores, starting with a letter'
    }),
    label: Joi.string().trim().min(1).max(120).required(),
    summary: Joi.string().trim().min(3).max(500).required(),
    niches: Joi.array().items(Joi.string().trim().min(1).max(80)).max(24).default([]),
    workflow_mode: Joi.string().trim().lowercase().valid(...OFFERED_WORKFLOW_MODES).required(),
    template_key: Joi.string().trim().min(1).max(80).allow(null).default(null),
    display_order: Joi.number().integer().min(1).max(9999).optional(),
    reason: Joi.string().trim().min(3).max(500).required()
}).unknown(false);

const updateIndustrySchema = Joi.object({
    label: Joi.string().trim().min(1).max(120).optional(),
    summary: Joi.string().trim().min(3).max(500).optional(),
    niches: Joi.array().items(Joi.string().trim().min(1).max(80)).max(24).optional(),
    workflow_mode: Joi.string().trim().lowercase().valid(...OFFERED_WORKFLOW_MODES).optional(),
    template_key: Joi.string().trim().min(1).max(80).allow(null).optional(),
    display_order: Joi.number().integer().min(1).max(9999).optional(),
    reason: Joi.string().trim().min(3).max(500).required()
}).unknown(false).or('label', 'summary', 'niches', 'workflow_mode', 'template_key', 'display_order').messages({
    'object.missing': 'At least one editable field (label, summary, niches, workflow_mode, template_key, display_order) is required'
});

export const validateCreateRegistrationIndustry = validateWith(createIndustrySchema);
export const validateUpdateRegistrationIndustry = validateWith(updateIndustrySchema);
export const validateSetRegistrationIndustryVisibility = validateWith(setVisibilitySchema);
export const validateRegistrationIndustryAuditLogQuery = validateWith(auditLogQuerySchema, 'query');

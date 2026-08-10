import Joi from 'joi';
import { WORKFLOW_MODE_VALUES, TEMPLATE_AUTHORABLE_MODES } from '../modules/shared/constants/workflowModes.js';
import { ALL_CAPABILITY_MODULE_KEYS } from '../modules/shared/constants/capabilityModules.js';

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

const createDraftTemplateSchema = Joi.object({
    template_key: Joi.string().trim().lowercase().pattern(/^[a-z][a-z0-9_]{2,79}$/).required().messages({
        'string.pattern.base': 'template_key must be lowercase letters, digits, and underscores, starting with a letter'
    }),
    label: Joi.string().trim().min(2).max(150).required(),
    // Deliberately narrower than WORKFLOW_MODE_VALUES: only modes with a
    // native or transitional engine classification (TEMPLATE_AUTHORABLE_MODES,
    // workflowModes.js) can be authored against. Rejects the deprecated
    // `manufacturing` alias and all four external-engine modes - none of
    // which any legitimate client sends (issue #178 final-touch pass). The
    // list-query filter below stays unrestricted so existing templates of
    // any mode remain listable/filterable.
    base_mode: Joi.string().trim().lowercase().valid(...TEMPLATE_AUTHORABLE_MODES).required(),
    // is_preset is accepted here (so an old client sending it isn't 422'd -
    // this schema's .unknown(false) rejects truly unrecognized keys outright,
    // it does not silently strip them) but it is a platform-owned provenance
    // flag: neither the handler nor the create use case reads it anymore,
    // so it is always ignored regardless of what's sent (issue #178
    // final-touch hardening). Set only by the seed migration/use case,
    // never by the curation surface.
    is_preset: Joi.boolean().strict().optional(),
    visibility: Joi.string().trim().lowercase().valid('visible', 'hidden').optional(),
    module_keys: Joi.array().items(Joi.string().trim().valid(...ALL_CAPABILITY_MODULE_KEYS)).min(1).required()
}).unknown(false);

const updateTemplateModulesSchema = Joi.object({
    module_keys: Joi.array().items(Joi.string().trim().valid(...ALL_CAPABILITY_MODULE_KEYS)).min(1).required(),
    reason: Joi.string().trim().min(3).max(500).required()
}).unknown(false);

const templateActionSchema = Joi.object({
    reason: Joi.string().trim().min(3).max(500).required()
}).unknown(false);

const templateListQuerySchema = Joi.object({
    status: Joi.string().trim().lowercase().valid('draft', 'published', 'deprecated').optional(),
    base_mode: Joi.string().trim().lowercase().valid(...WORKFLOW_MODE_VALUES).optional()
}).unknown(false);

const auditLogQuerySchema = Joi.object({
    limit: Joi.number().integer().min(1).max(200).default(50)
}).unknown(false);

export const validateCreateDraftTemplate = validateWith(createDraftTemplateSchema);
export const validateUpdateTemplateModules = validateWith(updateTemplateModulesSchema);
export const validateTemplateAction = validateWith(templateActionSchema);
export const validateTemplateListQuery = validateWith(templateListQuerySchema, 'query');
export const validateTemplateAuditLogQuery = validateWith(auditLogQuerySchema, 'query');

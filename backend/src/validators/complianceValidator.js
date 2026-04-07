import Joi from 'joi';

const modeChoiceSchema = Joi.object({
    mode_choice: Joi.string().trim().valid('non_compliant', 'compliant').required()
});

const profilePatchSchema = Joi.object({
    bir: Joi.object().unknown(true),
    npc: Joi.object().unknown(true),
    bsp: Joi.object().unknown(true),
    readiness: Joi.object().unknown(true)
}).min(1);

const artifactSchema = Joi.object({
    artifact_type: Joi.string().trim().valid(
        'bir_accreditation_certificate',
        'bir_ptu_document',
        'npc_dps_certificate',
        'bsp_ops_certificate',
        'ops_security_controls_attestation',
        'other'
    ).required(),
    artifact_name: Joi.string().trim().min(2).max(255).required(),
    reference_number: Joi.string().trim().max(120).allow('', null),
    valid_from: Joi.date().iso().allow(null),
    valid_until: Joi.date().iso().allow(null),
    status: Joi.string().trim().valid('pending').default('pending'),
    metadata: Joi.object().unknown(true).default({})
});

const artifactUpdateSchema = Joi.object({
    artifact_name: Joi.string().trim().min(2).max(255).optional(),
    reference_number: Joi.string().trim().max(120).allow('', null).optional(),
    valid_from: Joi.date().iso().allow(null).optional(),
    valid_until: Joi.date().iso().allow(null).optional(),
    metadata: Joi.object().unknown(true).optional()
}).min(1);

const peripheralSchema = Joi.object({
    terminal_id: Joi.string().trim().max(100).allow('', null),
    is_shared: Joi.boolean().default(false),
    device_class: Joi.string().trim().valid('receipt_printer', 'cash_drawer', 'scanner', 'payment_terminal', 'other').required(),
    brand: Joi.string().trim().min(1).max(120).required(),
    model: Joi.string().trim().min(1).max(120).required(),
    serial_number: Joi.string().trim().min(1).max(120).required(),
    accreditation_reference: Joi.string().trim().max(120).allow('', null),
    accreditation_valid_from: Joi.date().iso().allow(null),
    accreditation_valid_until: Joi.date().iso().allow(null),
    status: Joi.string().trim().valid('pending').default('pending'),
    metadata: Joi.object().unknown(true).default({})
});

const peripheralUpdateSchema = Joi.object({
    terminal_id: Joi.string().trim().max(100).allow('', null).optional(),
    is_shared: Joi.boolean().optional(),
    device_class: Joi.string().trim().valid('receipt_printer', 'cash_drawer', 'scanner', 'payment_terminal', 'other').optional(),
    brand: Joi.string().trim().min(1).max(120).optional(),
    model: Joi.string().trim().min(1).max(120).optional(),
    serial_number: Joi.string().trim().min(1).max(120).optional(),
    accreditation_reference: Joi.string().trim().max(120).allow('', null).optional(),
    accreditation_valid_from: Joi.date().iso().allow(null).optional(),
    accreditation_valid_until: Joi.date().iso().allow(null).optional(),
    metadata: Joi.object().unknown(true).optional()
}).min(1);

const artifactIdParamSchema = Joi.object({
    artifact_id: Joi.number().integer().positive().required()
});

const peripheralIdParamSchema = Joi.object({
    peripheral_id: Joi.number().integer().positive().required()
});

const verificationActionSchema = Joi.object({
    action: Joi.string().trim().valid('verify', 'reject', 'revoke').required(),
    verification_note: Joi.string().trim().max(4000).allow('', null),
    verification_evidence_ref: Joi.string().trim().max(255).allow('', null)
});

const auditLogQuerySchema = Joi.object({
    limit: Joi.number().integer().min(1).max(500).default(100)
});

const checklistQuerySchema = Joi.object({
    terminal_id: Joi.string().trim().max(100).allow('', null)
});

const preflightSchema = Joi.object({
    request_name: Joi.string().trim().max(200).allow('', null),
    surfaces: Joi.array().items(Joi.string().valid('pos', 'terminal', 'settings', 'payments', 'compliance')).default([]),
    setting_keys: Joi.array().items(Joi.string().trim().max(120)).default([]),
    setting_updates: Joi.object().unknown(true).default({}),
    requested_document_type: Joi.string().trim().valid('fiscal_invoice', 'non_fiscal_slip').allow('', null),
    terminal_id: Joi.string().trim().max(100).allow('', null),
    impact_declaration: Joi.object({
        declaration_id: Joi.string().trim().max(120).pattern(/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/).required(),
        classification: Joi.string().trim().valid('minor', 'major', 'regulatory').required(),
        summary: Joi.string().trim().max(2000).allow('', null).required(),
        affected_surfaces: Joi.array().items(Joi.string().valid('pos', 'terminal', 'settings', 'payments', 'compliance')).min(1).required(),
        reason_codes_impacted: Joi.array().items(Joi.string().trim().max(120)).min(1).required(),
        policy_version: Joi.string().trim().max(40).required(),
        verification_evidence: Joi.array().items(Joi.string().trim().max(300)).min(1).required(),
        rollback_note: Joi.string().trim().max(2000).required()
    }).required()
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

export const validateComplianceModeChoice = validateSchema(modeChoiceSchema, 'body', 'validatedData');
export const validateComplianceProfilePatch = validateSchema(profilePatchSchema, 'body', 'validatedData');
export const validateComplianceArtifactCreate = validateSchema(artifactSchema, 'body', 'validatedData');
export const validateComplianceArtifactUpdate = validateSchema(artifactUpdateSchema, 'body', 'validatedData');
export const validateCompliancePeripheralCreate = validateSchema(peripheralSchema, 'body', 'validatedData');
export const validateCompliancePeripheralUpdate = validateSchema(peripheralUpdateSchema, 'body', 'validatedData');
export const validateComplianceArtifactIdParam = validateSchema(artifactIdParamSchema, 'params', 'validatedParams');
export const validateCompliancePeripheralIdParam = validateSchema(peripheralIdParamSchema, 'params', 'validatedParams');
export const validateComplianceVerificationAction = validateSchema(verificationActionSchema, 'body', 'validatedData');
export const validateComplianceAuditLogQuery = validateSchema(auditLogQuerySchema, 'query', 'validatedQuery');
export const validateComplianceChecklistQuery = validateSchema(checklistQuerySchema, 'query', 'validatedQuery');
export const validateCompliancePreflight = validateSchema(preflightSchema, 'body', 'validatedData');

// Request validation for the voucher admin API (#614, Phase 103).
//
// Response shape (422 + `errors[]`) and the `validateSchema` middleware factory are lifted from
// `tenantLocationValidator.js` so every validation failure in this codebase looks the same.
//
// Two deliberate choices worth naming:
//
// 1. Server-owned and dangerous fields are declared `.forbidden()` EXPLICITLY rather than left to
//    `stripUnknown`. `stripUnknown` drops-and-succeeds silently, which is precisely the clobber
//    failure mode this design exists to prevent: a client that PUTs `redeemed_count: 0` should be
//    told no, not quietly ignored and left believing it worked.
// 2. Cross-field rules (date ordering, the time-window pair) run as a plain function after Joi
//    rather than as Joi `.custom()` gymnastics, because the update schema needs them evaluated
//    against a partial payload, and they produce the same `{field, message}` rows Joi does.

import Joi from 'joi';
import { VOUCHER_STATUSES } from '../modules/vouchers/domain/voucherEligibilityPolicy.js';

const VOUCHER_CODE_PATTERN = /^[A-Z0-9][A-Z0-9._-]{2,63}$/;
const TIME_24H_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// BIGINT centavos. 999_999_999_999 centavos is ~₱10 billion -- comfortably above any real campaign
// budget and comfortably below Number.MAX_SAFE_INTEGER.
const MAX_CENTAVOS = 999999999999;

const BENEFIT_AMOUNT_FIELDS = Object.freeze([
    'percent_off_bps',
    'amount_off_centavos',
    'fixed_unit_price_centavos'
]);

// Server-owned counters, identity, timestamps, the derived status, and the reserved `conditions`
// column (ADR 0066 decision 9 keeps it always-empty in v1).
const FORBIDDEN_FIELDS = Object.freeze([
    'voucher_id',
    'status',
    'conditions',
    'redeemed_count',
    'redeemed_value_centavos',
    'redeemed_quantity',
    'created_at',
    'updated_at'
]);

const forbiddenFieldSchemas = () => FORBIDDEN_FIELDS.reduce((accumulator, field) => {
    accumulator[field] = Joi.any().forbidden();
    return accumulator;
}, {});

const scopeSchema = Joi.object({
    scope_type: Joi.string().valid('item', 'item_folder').required(),
    scope_ref_id: Joi.number().integer().positive().required()
});

const scopesSchema = Joi.array()
    .items(scopeSchema)
    .max(500)
    .unique((a, b) => a.scope_type === b.scope_type && a.scope_ref_id === b.scope_ref_id);

// Deliberately carries NO `.default()` calls. Defaults belong to create only: injecting them into an
// update would silently rewrite `weekday_mask` back to 127 on any PUT that did not resend it, which
// is the same "eligible everywhere by omission" hazard the defaults exist to prevent in the first
// place. `createVoucherSchema` re-declares each defaulted key below.
const baseVoucherFields = {
    code: Joi.string().trim().uppercase().pattern(VOUCHER_CODE_PATTERN).messages({
        'string.pattern.base': 'code must be 3-64 characters of A-Z, 0-9, dot, underscore or hyphen, starting with a letter or digit'
    }),
    voucher_kind: Joi.string().valid('promo_code'),
    title: Joi.string().trim().min(2).max(255),
    subtitle: Joi.string().trim().max(255).allow(null, ''),
    badge: Joi.string().trim().max(80).allow(null, ''),
    validity_text: Joi.string().trim().max(255).allow(null, ''),
    benefit_class: Joi.string().valid('percent_off', 'amount_off', 'fixed_price'),
    min_spend_centavos: Joi.number().integer().min(0).max(MAX_CENTAVOS).allow(null),
    min_quantity: Joi.number().integer().min(1).allow(null),
    allow_below_cost: Joi.boolean(),
    stackable_with_statutory: Joi.boolean(),
    valid_from: Joi.string().trim().pattern(DATE_ONLY_PATTERN).allow(null),
    valid_until: Joi.string().trim().pattern(DATE_ONLY_PATTERN).allow(null),
    valid_time_start: Joi.string().trim().pattern(TIME_24H_PATTERN).allow(null),
    valid_time_end: Joi.string().trim().pattern(TIME_24H_PATTERN).allow(null),
    // The four eligibility masks are NOT NULL with explicit defaults (ADR 0066 decision 10,
    // `[binding]` on the invariant): "eligible everywhere by omission" -- the #459 failure mode --
    // must be unrepresentable, so `allow(null)` is absent on purpose and a mask of 0 is rejected.
    weekday_mask: Joi.number().integer().min(1).max(127),
    channels_mask: Joi.number().integer().min(1).max(3),
    fulfillment_methods_mask: Joi.number().integer().min(1).max(3),
    order_timings_mask: Joi.number().integer().min(1).max(3),
    max_redemptions: Joi.number().integer().min(1).allow(null),
    max_total_discount_centavos: Joi.number().integer().min(1).max(MAX_CENTAVOS).allow(null),
    max_benefit_quantity: Joi.number().integer().min(1).allow(null)
};

const createVoucherSchema = Joi.object({
    ...baseVoucherFields,
    ...forbiddenFieldSchemas(),
    code: baseVoucherFields.code.required(),
    title: baseVoucherFields.title.required(),
    benefit_class: baseVoucherFields.benefit_class.required(),
    voucher_kind: baseVoucherFields.voucher_kind.default('promo_code'),
    allow_below_cost: baseVoucherFields.allow_below_cost.default(false),
    stackable_with_statutory: baseVoucherFields.stackable_with_statutory.default(false),
    weekday_mask: baseVoucherFields.weekday_mask.default(127),
    channels_mask: baseVoucherFields.channels_mask.default(1),
    fulfillment_methods_mask: baseVoucherFields.fulfillment_methods_mask.default(3),
    order_timings_mask: baseVoucherFields.order_timings_mask.default(3),

    percent_off_bps: Joi.number().integer().min(1).max(10000)
        .when('benefit_class', { is: 'percent_off', then: Joi.required(), otherwise: Joi.forbidden() }),
    amount_off_centavos: Joi.number().integer().min(1).max(MAX_CENTAVOS)
        .when('benefit_class', { is: 'amount_off', then: Joi.required(), otherwise: Joi.forbidden() }),
    fixed_unit_price_centavos: Joi.number().integer().min(0).max(MAX_CENTAVOS)
        .when('benefit_class', { is: 'fixed_price', then: Joi.required(), otherwise: Joi.forbidden() }),
    // A cap on an already-absolute amount is meaningless, so it is refused rather than ignored.
    max_discount_centavos: Joi.number().integer().min(1).max(MAX_CENTAVOS).allow(null)
        .when('benefit_class', { is: 'amount_off', then: Joi.forbidden() }),

    // `fixed_price` without a scope would pin a price on the entire catalog (#584).
    scopes: scopesSchema.default([])
        .when('benefit_class', { is: 'fixed_price', then: Joi.array().min(1).required() }),

    version: Joi.any().forbidden()
});

const updateVoucherSchema = Joi.object({
    ...baseVoucherFields,
    ...forbiddenFieldSchemas(),

    // Benefit amounts stay unconditional here and are reconciled against the MERGED row in the use
    // case: the validator cannot see the stored `benefit_class`, so a Joi conditional would reject
    // legitimate single-field patches. `requireBenefitClassWithAmounts` below closes the gap the
    // conditional would otherwise have covered.
    percent_off_bps: Joi.number().integer().min(1).max(10000).allow(null),
    amount_off_centavos: Joi.number().integer().min(1).max(MAX_CENTAVOS).allow(null),
    fixed_unit_price_centavos: Joi.number().integer().min(0).max(MAX_CENTAVOS).allow(null),
    max_discount_centavos: Joi.number().integer().min(1).max(MAX_CENTAVOS).allow(null),

    scopes: scopesSchema,

    // Mandatory optimistic-lock token. `version` is forbidden on create (the server owns it from 0)
    // and required on update.
    version: Joi.number().integer().min(0).required()
})
    .min(2)
    .messages({
        'object.min': 'At least one field besides version is required for update'
    });

const voucherIdParamSchema = Joi.object({
    voucher_id: Joi.number().integer().positive().required()
});

const voucherListQuerySchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    status: Joi.string().trim().custom((value, helpers) => {
        const parts = value.split(',').map((part) => part.trim()).filter(Boolean);
        if (parts.length === 0) return helpers.error('any.invalid');
        if (parts.some((part) => !VOUCHER_STATUSES.includes(part))) return helpers.error('any.invalid');
        return parts;
    }),
    benefit_class: Joi.string().valid('percent_off', 'amount_off', 'fixed_price'),
    voucher_kind: Joi.string().valid('promo_code'),
    search: Joi.string().trim().max(255),
    include_stats: Joi.boolean().truthy('true').truthy('1').falsy('false').falsy('0').default(false),
    sort: Joi.string().valid('created_at', 'code', 'valid_until').default('created_at'),
    direction: Joi.string().lowercase().valid('asc', 'desc').default('desc')
});

const has = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const collectCrossFieldErrors = (value, { mode }) => {
    const errors = [];

    if (value.valid_from && value.valid_until && value.valid_until < value.valid_from) {
        errors.push({ field: 'valid_until', message: 'valid_until cannot be earlier than valid_from' });
    }

    const startPresent = has(value, 'valid_time_start') && value.valid_time_start != null;
    const endPresent = has(value, 'valid_time_end') && value.valid_time_end != null;

    // On update, a payload carrying only one half is reconciled against the stored row by the use
    // case; rejecting it here would block a legitimate partial patch.
    const bothKeysPresent = has(value, 'valid_time_start') && has(value, 'valid_time_end');
    if ((mode === 'create' || bothKeysPresent) && startPresent !== endPresent) {
        errors.push({
            field: 'valid_time_end',
            message: 'valid_time_start and valid_time_end must be provided together'
        });
    }

    if (startPresent && endPresent && value.valid_time_start === value.valid_time_end) {
        errors.push({
            field: 'valid_time_end',
            message: 'valid_time_start and valid_time_end cannot be equal'
        });
    }

    if (mode === 'update') {
        const sendsBenefitAmount = BENEFIT_AMOUNT_FIELDS.some((field) => has(value, field));
        if (sendsBenefitAmount && !has(value, 'benefit_class')) {
            errors.push({
                field: 'benefit_class',
                message: 'benefit_class is required when changing any benefit amount'
            });
        }
        if (has(value, 'benefit_class')) {
            BENEFIT_AMOUNT_FIELDS.forEach((field) => {
                const expected = {
                    percent_off: 'percent_off_bps',
                    amount_off: 'amount_off_centavos',
                    fixed_price: 'fixed_unit_price_centavos'
                }[value.benefit_class];
                if (field !== expected && has(value, field) && value[field] != null) {
                    errors.push({
                        field,
                        message: `${field} is not allowed for benefit_class ${value.benefit_class}`
                    });
                }
            });
            if (value.benefit_class === 'amount_off' && has(value, 'max_discount_centavos') && value.max_discount_centavos != null) {
                errors.push({
                    field: 'max_discount_centavos',
                    message: 'max_discount_centavos is not allowed for benefit_class amount_off'
                });
            }
        }
    }

    return errors;
};

const buildValidationErrorResponse = (errors) => ({
    success: false,
    data: null,
    message: 'Validation failed',
    errors,
    timestamp: new Date().toISOString()
});

const validateSchema = (schema, source, target, crossFieldMode = null) => (req, res, next) => {
    const { error, value } = schema.validate(req[source], {
        abortEarly: false,
        stripUnknown: true
    });

    if (error) {
        return res.status(422).json(buildValidationErrorResponse(error.details.map((detail) => ({
            field: detail.path.join('.'),
            message: detail.message
        }))));
    }

    if (crossFieldMode) {
        const crossFieldErrors = collectCrossFieldErrors(value, { mode: crossFieldMode });
        if (crossFieldErrors.length > 0) {
            return res.status(422).json(buildValidationErrorResponse(crossFieldErrors));
        }
    }

    req[target] = value;
    return next();
};

export const validateCreateVoucher = validateSchema(createVoucherSchema, 'body', 'validatedData', 'create');
export const validateUpdateVoucher = validateSchema(updateVoucherSchema, 'body', 'validatedData', 'update');
export const validateVoucherIdParam = validateSchema(voucherIdParamSchema, 'params', 'validatedParams');
export const validateVoucherListQuery = validateSchema(voucherListQuerySchema, 'query', 'validatedQuery');

// Exported for direct unit testing of the schema layer, without an Express round trip.
export const __testables = Object.freeze({
    createVoucherSchema,
    updateVoucherSchema,
    voucherIdParamSchema,
    voucherListQuerySchema,
    collectCrossFieldErrors
});

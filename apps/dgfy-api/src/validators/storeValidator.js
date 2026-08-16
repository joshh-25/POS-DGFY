import Joi from 'joi';
import { STOREFRONT_ORDER_METHODS } from '../modules/shared/constants/orderMethods.js';

const ORDER_METHODS = STOREFRONT_ORDER_METHODS;
const PAYMENT_TYPES = ['cash', 'gcash', 'maya', 'card', 'bank_transfer', 'qrph'];
const FULFILLMENT_STATUSES = ['placed', 'confirmed', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'completed', 'cancelled', 'rejected'];
const TRACKING_PIN_PATTERN = /^SK-(?:[A-Z0-9]{4}|[A-Z0-9]{6})$/;

const checkoutLineSchema = Joi.object({
    item_id: Joi.number().integer().positive().required(),
    quantity: Joi.number().positive().required(),
    course: Joi.string().valid('appetizer', 'main', 'dessert', 'drink', 'other').allow('', null).optional(),
    line_modifiers: Joi.array().items(Joi.object({
        modifier_group_id: Joi.number().integer().positive().allow(null).optional(),
        modifier_option_id: Joi.number().integer().positive().allow(null).optional(),
        option_id: Joi.number().integer().positive().allow(null).optional(),
        group_name: Joi.string().trim().max(120).allow('', null).optional(),
        option_name: Joi.string().trim().max(120).allow('', null).optional(),
        name: Joi.string().trim().max(120).allow('', null).optional(),
        quantity: Joi.number().integer().min(1).max(99).default(1)
    }).unknown(false)).max(30).default([]),
    modifiers: Joi.array().items(Joi.object().unknown(true)).max(30).optional()
});

export const storeRegisterSchema = Joi.object({
    name: Joi.string().trim().min(1).max(255).required(),
    email: Joi.string().email().trim().lowercase().max(255).required(),
    password: Joi.string().min(8).max(255).required().messages({
        'string.min': 'Password must be at least 8 characters',
        'string.max': 'Password must not exceed 255 characters',
        'any.required': 'Password is required'
    }),
    phone: Joi.string().trim().max(50).allow(null, '').optional()
});

const storeLoginSchema = Joi.object({
    email: Joi.string().email().trim().lowercase().max(255).required(),
    password: Joi.string().min(1).max(255).required()
});

const storeQuoteSchema = Joi.object({
    lines: Joi.array().items(checkoutLineSchema).min(1).required(),
    location_id: Joi.number().integer().positive().allow(null).optional(),
    order_method: Joi.string().valid(...ORDER_METHODS).default('delivery'),
    promo_code: Joi.string().trim().uppercase().max(40).allow('', null).optional(),
    customer_name: Joi.string().trim().max(255).allow('', null).optional(),
    customer_phone: Joi.string().trim().max(50).allow('', null).optional(),
    customer_email: Joi.string().email().trim().lowercase().max(255).allow('', null).optional(),
    delivery_address: Joi.string().trim().max(2000).allow('', null).optional(),
    delivery_latitude: Joi.number().min(-90).max(90).allow(null).optional(),
    delivery_longitude: Joi.number().min(-180).max(180).allow(null).optional(),
    scheduled_for: Joi.date().iso().allow(null).optional(),
    special_instructions: Joi.string().trim().max(2000).allow('', null).optional()
});

const storeCheckoutSchema = storeQuoteSchema.keys({
    idempotency_key: Joi.string().trim().min(8).max(120).required(),
    payment_type: Joi.string().valid(...PAYMENT_TYPES).default('cash'),
    guest_checkout_proof: Joi.string().trim().min(16).max(2048).allow('', null).optional()
});

const guestCheckoutOtpRequestSchema = Joi.object({
    email: Joi.string().email().trim().lowercase().max(255).required(),
    idempotency_key: Joi.string().trim().min(8).max(120).required()
});

const guestCheckoutOtpVerifySchema = guestCheckoutOtpRequestSchema.keys({
    code: Joi.string().pattern(/^\d{6}$/).required()
});

const storeAddressCreateSchema = Joi.object({
    label: Joi.string().trim().max(100).allow('', null).default('Address'),
    address_line: Joi.string().trim().max(4000).required(),
    latitude: Joi.number().min(-90).max(90).allow(null).optional(),
    longitude: Joi.number().min(-180).max(180).allow(null).optional(),
    is_default: Joi.boolean().default(false)
});

const storeAddressUpdateSchema = Joi.object({
    label: Joi.string().trim().max(100).allow('', null).optional(),
    address_line: Joi.string().trim().max(4000).optional(),
    latitude: Joi.number().min(-90).max(90).allow(null).optional(),
    longitude: Joi.number().min(-180).max(180).allow(null).optional(),
    is_default: Joi.boolean().optional()
}).min(1);

const storeAddressIdParamSchema = Joi.object({
    id: Joi.number().integer().positive().required()
});

const storeTrackingPinParamSchema = Joi.object({
    tracking_pin: Joi.string().trim().uppercase().pattern(TRACKING_PIN_PATTERN).required().messages({
        'string.pattern.base': 'tracking_pin must use format SK-XXXXXX (legacy SK-XXXX is also accepted)'
    })
});

const storePaymentSessionParamSchema = Joi.object({
    payment_session_id: Joi.string().trim().uppercase().pattern(/^CPS-[A-Z0-9]{10}$/).required()
});

const storeCancelOrderSchema = Joi.object({
    cancel_proof: Joi.string().trim().max(2048).optional()
});

const storeClaimOrderSchema = Joi.object({
    claim_token: Joi.string().trim().min(16).max(2048).required()
});

const storeOrderHistoryQuerySchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    fulfillment_status: Joi.string().valid(...FULFILLMENT_STATUSES).optional(),
    date_from: Joi.date().iso().optional(),
    date_to: Joi.date().iso().min(Joi.ref('date_from')).optional()
});

const storeCatalogQuerySchema = Joi.object({
    search: Joi.string().trim().allow('', null).optional(),
    limit: Joi.number().integer().min(1).max(200).default(60),
    location_id: Joi.number().integer().positive().optional()
});

const storeQrQuerySchema = Joi.object({
    code: Joi.string().trim().max(512).required(),
    location_id: Joi.number().integer().positive().optional()
});

const storefrontFollowBaseSchema = Joi.object({
    storefront_slug: Joi.string().trim().lowercase().max(120).pattern(/^[a-z0-9-]+$/).required(),
    visitor_id: Joi.string().trim().min(16).max(128).allow('', null).optional()
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

export const validateStoreRegister = validateSchema(storeRegisterSchema, 'body', 'validatedData');
export const validateStoreLogin = validateSchema(storeLoginSchema, 'body', 'validatedData');
export const validateStoreQuote = validateSchema(storeQuoteSchema, 'body', 'validatedData');
export const validateStoreCheckout = validateSchema(storeCheckoutSchema, 'body', 'validatedData');
export const validateStoreCheckoutPaymentSession = validateSchema(storeCheckoutSchema.keys({
    payment_type: Joi.string().valid('qrph', 'card', 'gcash', 'maya').default('qrph')
}), 'body', 'validatedData');
export const validateStoreGuestCheckoutOtpRequest = validateSchema(guestCheckoutOtpRequestSchema, 'body', 'validatedData');
export const validateStoreGuestCheckoutOtpVerify = validateSchema(guestCheckoutOtpVerifySchema, 'body', 'validatedData');
export const validateStoreCreateAddress = validateSchema(storeAddressCreateSchema, 'body', 'validatedData');
export const validateStoreUpdateAddress = validateSchema(storeAddressUpdateSchema, 'body', 'validatedData');
export const validateStoreAddressIdParam = validateSchema(storeAddressIdParamSchema, 'params', 'validatedParams');
export const validateStoreTrackingPinParam = validateSchema(storeTrackingPinParamSchema, 'params', 'validatedParams');
export const validateStorePaymentSessionParam = validateSchema(storePaymentSessionParamSchema, 'params', 'validatedParams');
export const validateStoreCancelOrder = validateSchema(storeCancelOrderSchema, 'body', 'validatedData');
export const validateStoreClaimOrder = validateSchema(storeClaimOrderSchema, 'body', 'validatedData');
export const validateStoreOrderHistoryQuery = validateSchema(storeOrderHistoryQuerySchema, 'query', 'validatedQuery');
export const validateStoreCatalogQuery = validateSchema(storeCatalogQuerySchema, 'query', 'validatedQuery');
export const validateStoreQrQuery = validateSchema(storeQrQuerySchema, 'query', 'validatedQuery');

const validateStorefrontFollowSource = (source, target) => (req, res, next) => {
    const { error, value } = storefrontFollowBaseSchema.validate(req[source], {
        abortEarly: false,
        stripUnknown: true
    });
    if (error) {
        return res.status(422).json(buildValidationErrorResponse(error));
    }

    const hasAuthenticatedStoreCustomer = Boolean(req.storeCustomer?.customer_id);
    const hasVisitorId = String(value?.visitor_id || '').trim().length >= 16;
    if (!hasAuthenticatedStoreCustomer && !hasVisitorId) {
        return res.status(422).json({
            success: false,
            data: null,
            message: 'Validation failed',
            errors: [{
                field: 'visitor_id',
                message: 'visitor_id is required for guest follow requests'
            }],
            timestamp: new Date().toISOString()
        });
    }

    req[target] = value;
    return next();
};

export const validateStorefrontFollowBody = validateStorefrontFollowSource('body', 'validatedData');
export const validateStorefrontFollowQuery = validateStorefrontFollowSource('query', 'validatedQuery');

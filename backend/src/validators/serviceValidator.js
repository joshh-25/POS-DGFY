import Joi from 'joi';

const BOOKING_STATUSES = ['requested', 'confirmed', 'checked_in', 'in_service', 'completed', 'cancelled', 'no_show'];
const PAYMENT_POLICIES = ['customer_choice', 'prepaid_required', 'postpaid_only', 'deposit_allowed'];
const PAYMENT_TIMINGS = ['prepaid', 'postpaid', 'deposit'];
const SERVICE_AREA_TYPES = ['in_store', 'customer_location', 'online', 'hybrid'];
const RESOURCE_TYPES = ['provider', 'room', 'equipment', 'vehicle', 'station'];
const WAITLIST_STATUSES = ['waiting', 'notified', 'booked', 'expired', 'cancelled'];
const REMINDER_STATUSES = ['pending', 'sent', 'failed', 'skipped'];
const POS_PAYMENT_TYPES = ['cash', 'gcash', 'maya', 'card', 'bank_transfer', 'qrph'];

const serviceCatalogQuerySchema = Joi.object({
    search: Joi.string().trim().allow('', null).optional(),
    limit: Joi.number().integer().min(1).max(500).default(200),
    pos_only: Joi.boolean().truthy('true').falsy('false').optional()
});

const serviceCatalogItemSchema = Joi.object({
    sku_code: Joi.string().trim().max(50).allow('', null).optional(),
    name: Joi.string().trim().min(1).max(255).required(),
    description: Joi.string().trim().max(4000).allow('', null).optional(),
    service_category: Joi.string().trim().max(120).allow('', null).optional(),
    unit_of_measure: Joi.string().trim().max(50).allow('', null).optional(),
    default_sale_price: Joi.number().min(0).precision(4).default(0),
    cost_per_unit: Joi.number().min(0).precision(4).allow(null).optional(),
    vat_type: Joi.string().valid('vatable', 'vat_exempt', 'zero_rated').default('vatable'),
    duration_minutes: Joi.number().integer().min(1).max(1440).default(60),
    buffer_before_minutes: Joi.number().integer().min(0).max(720).default(0),
    buffer_after_minutes: Joi.number().integer().min(0).max(720).default(0),
    lead_time_minutes: Joi.number().integer().min(0).max(43200).default(0),
    cancellation_window_hours: Joi.number().integer().min(0).max(720).default(24),
    bookable: Joi.boolean().default(true),
    visible_in_storefront: Joi.boolean().default(true),
    visible_in_pos: Joi.boolean().default(true),
    addons_enabled: Joi.boolean().optional(),
    payment_policy: Joi.string().valid(...PAYMENT_POLICIES).default('customer_choice'),
    service_area_type: Joi.string().valid(...SERVICE_AREA_TYPES).default('in_store'),
    intake_form_schema: Joi.object().allow(null).optional(),
    client_notes_template: Joi.string().trim().max(2000).allow('', null).optional(),
    max_capacity: Joi.number().integer().min(1).max(100000).optional()
});

const updateServiceCatalogItemSchema = serviceCatalogItemSchema.fork(['name'], (schema) => schema.optional()).keys({
    status: Joi.string().valid('active', 'inactive').optional()
}).min(1);

const itemIdParamSchema = Joi.object({
    item_id: Joi.number().integer().positive().required()
});

const bookingIdParamSchema = Joi.object({
    booking_id: Joi.number().integer().positive().required()
});

const assignmentIdParamSchema = Joi.object({
    assignment_id: Joi.number().integer().positive().required()
});

const waitlistEntryIdParamSchema = Joi.object({
    waitlist_entry_id: Joi.number().integer().positive().required()
});

const bookingReferenceParamSchema = Joi.object({
    public_reference: Joi.string().trim().uppercase().max(40).required()
});

const serviceResourceSchema = Joi.object({
    name: Joi.string().trim().min(1).max(255).required(),
    resource_type: Joi.string().valid(...RESOURCE_TYPES).default('provider'),
    location_id: Joi.number().integer().positive().allow(null).optional(),
    capacity: Joi.number().integer().min(1).max(10000).default(1),
    is_active: Joi.boolean().default(true),
    weekly_availability: Joi.object().allow(null).optional(),
    blackout_dates: Joi.array().items(Joi.string().trim().max(40)).allow(null).optional()
});

const resourceQuerySchema = Joi.object({
    include_inactive: Joi.boolean().truthy('true').falsy('false').optional()
});

const assignmentQuerySchema = Joi.object({
    include_inactive: Joi.boolean().truthy('true').falsy('false').optional(),
    item_id: Joi.number().integer().positive().optional()
});

const serviceAssignmentSchema = Joi.object({
    item_id: Joi.number().integer().positive().required(),
    user_id: Joi.number().integer().positive().allow(null).optional(),
    resource_id: Joi.number().integer().positive().allow(null).optional(),
    location_id: Joi.number().integer().positive().allow(null).optional(),
    is_active: Joi.boolean().default(true)
}).or('user_id', 'resource_id', 'location_id');

const serviceAssignmentUpdateSchema = Joi.object({
    is_active: Joi.boolean().required()
});

const bookingQuerySchema = Joi.object({
    status: Joi.string().valid(...BOOKING_STATUSES).optional(),
    statuses: Joi.string().custom((value, helpers) => {
        const statuses = String(value || '').split(',').map((entry) => entry.trim()).filter(Boolean);
        const unsupported = statuses.find((entry) => !BOOKING_STATUSES.includes(entry));
        if (unsupported) {
            return helpers.error('any.invalid');
        }
        return statuses.join(',');
    }).optional(),
    store_customer_id: Joi.number().integer().positive().optional(),
    limit: Joi.number().integer().min(1).max(300).default(100)
});

// Fields common to every booking-creation caller (public storefront and admin/POS).
// NOTE: pos_transaction_id is deliberately NOT part of this core schema. It links a
// booking to a settled POS transaction and must only ever be settable by trusted
// internal callers (see adminServiceBookingSchema below) -- accepting it from the
// public storefront route would let an unauthenticated caller attach an arbitrary
// transaction id to a booking it controls, then read that transaction's
// invoice_number/tracking_pin/total_amount back via GET .../bookings/:public_reference.
const serviceBookingCoreSchema = {
    service_item_id: Joi.number().integer().positive().required(),
    start_at: Joi.date().iso().required(),
    end_at: Joi.date().iso().greater(Joi.ref('start_at')).allow(null).optional(),
    duration_minutes: Joi.number().integer().min(1).max(1440).optional(),
    customer_name: Joi.string().trim().min(1).max(255).required(),
    customer_email: Joi.string().email({ tlds: { allow: false } }).trim().lowercase().max(255).allow('', null).optional(),
    customer_phone: Joi.string().trim().max(50).allow('', null).optional(),
    provider_user_id: Joi.number().integer().positive().allow(null).optional(),
    resource_id: Joi.number().integer().positive().allow(null).optional(),
    location_id: Joi.number().integer().positive().allow(null).optional(),
    payment_timing: Joi.string().valid(...PAYMENT_TIMINGS).default('postpaid'),
    notes: Joi.string().trim().max(4000).allow('', null).optional(),
    intake_responses: Joi.object().allow(null).optional(),
    quantity: Joi.number().integer().min(1).max(10000).optional(),
    selected_option_ids: Joi.array().items(Joi.number().integer().positive()).max(100).optional(),
    idempotency_key: Joi.string().trim().min(1).max(200).optional(),
    hold_token: Joi.string().trim().min(1).max(200).optional()
};

// Public storefront booking creation: no pos_transaction_id (see note above).
const serviceBookingSchema = Joi.object(serviceBookingCoreSchema);

// Admin/POS booking creation: may link the booking to an existing POS transaction.
const adminServiceBookingSchema = Joi.object({
    ...serviceBookingCoreSchema,
    pos_transaction_id: Joi.number().integer().positive().allow(null).optional()
});

const serviceAvailabilityQuerySchema = Joi.object({
    service_item_id: Joi.number().integer().positive().required(),
    date: Joi.string().trim().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
    quantity: Joi.number().integer().min(1).max(10000).optional(),
    resource_id: Joi.number().integer().positive().optional(),
    provider_user_id: Joi.number().integer().positive().optional(),
    location_id: Joi.number().integer().positive().optional(),
    slot_interval_minutes: Joi.number().integer().min(5).max(240).optional()
});

// Same shape as serviceBookingCoreSchema minus customer fields -- a hold reserves
// capacity ahead of the customer-detail step and never links to pos_transaction_id.
const serviceBookingHoldSchema = Joi.object({
    service_item_id: Joi.number().integer().positive().required(),
    start_at: Joi.date().iso().required(),
    end_at: Joi.date().iso().greater(Joi.ref('start_at')).allow(null).optional(),
    duration_minutes: Joi.number().integer().min(1).max(1440).optional(),
    provider_user_id: Joi.number().integer().positive().allow(null).optional(),
    resource_id: Joi.number().integer().positive().allow(null).optional(),
    location_id: Joi.number().integer().positive().allow(null).optional(),
    quantity: Joi.number().integer().min(1).max(10000).optional(),
    selected_option_ids: Joi.array().items(Joi.number().integer().positive()).max(100).optional(),
    hold_token: Joi.string().trim().min(1).max(200).optional(),
    replace_hold_token: Joi.string().trim().min(1).max(200).optional(),
    idempotency_key: Joi.string().trim().min(1).max(200).optional()
});

// One booking draft within a batch. Customer fields are optional here because the
// batch-level schema below carries the shared customer identity; a draft may still
// override any of them.
const serviceBookingDraftSchema = Joi.object({
    service_item_id: Joi.number().integer().positive().required(),
    start_at: Joi.date().iso().required(),
    end_at: Joi.date().iso().greater(Joi.ref('start_at')).allow(null).optional(),
    duration_minutes: Joi.number().integer().min(1).max(1440).optional(),
    provider_user_id: Joi.number().integer().positive().allow(null).optional(),
    resource_id: Joi.number().integer().positive().allow(null).optional(),
    location_id: Joi.number().integer().positive().allow(null).optional(),
    quantity: Joi.number().integer().min(1).max(10000).optional(),
    selected_option_ids: Joi.array().items(Joi.number().integer().positive()).max(100).optional(),
    hold_token: Joi.string().trim().min(1).max(200).optional(),
    notes: Joi.string().trim().max(4000).allow('', null).optional(),
    intake_responses: Joi.object().allow(null).optional(),
    customer_name: Joi.string().trim().min(1).max(255).optional(),
    customer_email: Joi.string().email({ tlds: { allow: false } }).trim().lowercase().max(255).allow('', null).optional(),
    customer_phone: Joi.string().trim().max(50).allow('', null).optional(),
    payment_timing: Joi.string().valid(...PAYMENT_TIMINGS).optional()
});

const serviceBookingBatchSchema = Joi.object({
    customer_name: Joi.string().trim().min(1).max(255).optional(),
    customer_email: Joi.string().email({ tlds: { allow: false } }).trim().lowercase().max(255).allow('', null).optional(),
    customer_phone: Joi.string().trim().max(50).allow('', null).optional(),
    payment_timing: Joi.string().valid(...PAYMENT_TIMINGS).optional(),
    location_id: Joi.number().integer().positive().allow(null).optional(),
    idempotency_key: Joi.string().trim().min(1).max(200).optional(),
    bookings: Joi.array().items(serviceBookingDraftSchema).min(1).required()
});

const bookingStatusSchema = Joi.object({
    status: Joi.string().valid(...BOOKING_STATUSES).required(),
    cancellation_reason: Joi.string().trim().max(500).allow('', null).optional(),
    pos_transaction_id: Joi.number().integer().positive().allow(null).optional()
});

const settleBookingPartSchema = Joi.object({
    item_id: Joi.number().integer().positive().required(),
    quantity: Joi.number().positive().precision(4).required()
});

const settleBookingSchema = Joi.object({
    parts: Joi.array().items(settleBookingPartSchema).max(50).optional(),
    payment_type: Joi.string().valid(...POS_PAYMENT_TYPES).default('cash'),
    cash_received: Joi.number().min(0).precision(4).allow(null).optional(),
    change_amount: Joi.number().min(0).precision(4).allow(null).optional(),
    terminal_id: Joi.string().trim().max(100).allow('', null).optional(),
    location_id: Joi.number().integer().positive().allow(null).optional()
});

const waitlistQuerySchema = Joi.object({
    status: Joi.string().valid(...WAITLIST_STATUSES).optional(),
    limit: Joi.number().integer().min(1).max(300).default(100)
});

const serviceWaitlistSchema = Joi.object({
    service_item_id: Joi.number().integer().positive().required(),
    customer_name: Joi.string().trim().min(1).max(255).required(),
    customer_email: Joi.string().email({ tlds: { allow: false } }).trim().lowercase().max(255).allow('', null).optional(),
    customer_phone: Joi.string().trim().max(50).allow('', null).optional(),
    preferred_start_at: Joi.date().iso().allow(null).optional(),
    preferred_end_at: Joi.date().iso().greater(Joi.ref('preferred_start_at')).allow(null).optional(),
    notes: Joi.string().trim().max(4000).allow('', null).optional()
}).or('customer_email', 'customer_phone');

const waitlistStatusSchema = Joi.object({
    status: Joi.string().valid(...WAITLIST_STATUSES).required()
});

const clientQuerySchema = Joi.object({
    limit: Joi.number().integer().min(1).max(300).default(100)
});

const reminderQuerySchema = Joi.object({
    status: Joi.string().valid(...REMINDER_STATUSES).optional(),
    limit: Joi.number().integer().min(1).max(300).default(100)
});

const queueReminderSchema = Joi.object({
    lookahead_hours: Joi.number().integer().min(1).max(168).default(24),
    limit: Joi.number().integer().min(1).max(300).default(200)
});

const claimBookingSchema = Joi.object({
    claim_token: Joi.string().trim().min(16).max(500).required()
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

export const validateServiceCatalogQuery = validateSchema(serviceCatalogQuerySchema, 'query', 'validatedQuery');
export const validateCreateServiceCatalogItem = validateSchema(serviceCatalogItemSchema, 'body', 'validatedData');
export const validateUpdateServiceCatalogItem = validateSchema(updateServiceCatalogItemSchema, 'body', 'validatedData');
export const validateServiceItemIdParam = validateSchema(itemIdParamSchema, 'params', 'validatedParams');
export const validateServiceResourceQuery = validateSchema(resourceQuerySchema, 'query', 'validatedQuery');
export const validateCreateServiceResource = validateSchema(serviceResourceSchema, 'body', 'validatedData');
export const validateServiceAssignmentQuery = validateSchema(assignmentQuerySchema, 'query', 'validatedQuery');
export const validateCreateServiceAssignment = validateSchema(serviceAssignmentSchema, 'body', 'validatedData');
export const validateUpdateServiceAssignment = validateSchema(serviceAssignmentUpdateSchema, 'body', 'validatedData');
export const validateServiceAssignmentIdParam = validateSchema(assignmentIdParamSchema, 'params', 'validatedParams');
export const validateServiceBookingQuery = validateSchema(bookingQuerySchema, 'query', 'validatedQuery');
export const validateServiceAvailabilityQuery = validateSchema(serviceAvailabilityQuerySchema, 'query', 'validatedQuery');
export const validateCreateServiceBooking = validateSchema(serviceBookingSchema, 'body', 'validatedData');
export const validateCreateAdminServiceBooking = validateSchema(adminServiceBookingSchema, 'body', 'validatedData');
export const validateCreateServiceBookingHold = validateSchema(serviceBookingHoldSchema, 'body', 'validatedData');
export const validateCreateServiceBookingBatch = validateSchema(serviceBookingBatchSchema, 'body', 'validatedData');
export const validateServiceBookingIdParam = validateSchema(bookingIdParamSchema, 'params', 'validatedParams');
export const validateServiceBookingReferenceParam = validateSchema(bookingReferenceParamSchema, 'params', 'validatedParams');
export const validateUpdateServiceBookingStatus = validateSchema(bookingStatusSchema, 'body', 'validatedData');
export const validateSettleServiceBooking = validateSchema(settleBookingSchema, 'body', 'validatedData');
export const validateClaimServiceBooking = validateSchema(claimBookingSchema, 'body', 'validatedData');
export const validateServiceWaitlistQuery = validateSchema(waitlistQuerySchema, 'query', 'validatedQuery');
export const validateCreateServiceWaitlistEntry = validateSchema(serviceWaitlistSchema, 'body', 'validatedData');
export const validateServiceWaitlistEntryIdParam = validateSchema(waitlistEntryIdParamSchema, 'params', 'validatedParams');
export const validateUpdateServiceWaitlistStatus = validateSchema(waitlistStatusSchema, 'body', 'validatedData');
export const validateServiceClientQuery = validateSchema(clientQuerySchema, 'query', 'validatedQuery');
export const validateServiceReminderQuery = validateSchema(reminderQuerySchema, 'query', 'validatedQuery');
export const validateQueueServiceReminders = validateSchema(queueReminderSchema, 'body', 'validatedData');

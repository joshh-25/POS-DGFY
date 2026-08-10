import Joi from 'joi';

const ORDER_METHODS = ['dine_in', 'takeout', 'pickup', 'delivery', 'appointment', 'walk_in'];
const ORDER_METHOD_FILTERS = [...ORDER_METHODS, 'online'];
const ORDER_SOURCES = ['in_store', 'online_store'];
const PAYMENT_TYPES = ['cash', 'gcash', 'maya', 'card', 'bank_transfer', 'employee_credit'];
const REPORT_GRANULARITIES = ['daily', 'weekly', 'monthly', 'yearly'];
const REPORT_SOURCE_FILTERS = ['in_store', 'online_store', 'delivery', 'pickup'];
const REPORT_SECTIONS = ['daily', 'monthly', 'yearly', 'comparison', 'profit_loss'];
const PAYMENT_HANDOFF_MODES = ['external', 'internal'];
const DOCUMENT_CONTEXTS = ['fiscal', 'non_fiscal', 'training_test'];
const DISCOUNT_MODES = ['none', 'preset', 'percentage', 'amount'];
const ONLINE_FULFILLMENT_STATUSES = ['placed', 'confirmed', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'completed', 'cancelled', 'rejected'];
const DISCOUNT_BENEFICIARY_CATEGORIES = ['senior', 'pwd', 'national_athlete'];
const FNB_COURSES = ['appetizer', 'main', 'dessert', 'drink', 'other'];

const restaurantServiceChargeSchema = Joi.object({
    enabled: Joi.boolean().default(false),
    label: Joi.string().trim().max(120).allow('', null).optional(),
    rate: Joi.number().min(0).max(100).precision(4).allow(null).optional(),
    amount: Joi.number().min(0).precision(4).allow(null).optional(),
    taxable: Joi.boolean().default(false)
});

const checkoutLineSchema = Joi.object({
    item_id: Joi.number().integer().positive().required().messages({
        'any.required': 'Item ID is required',
        'number.positive': 'Item ID must be positive'
    }),
    quantity: Joi.number().positive().required().messages({
        'any.required': 'Quantity is required',
        'number.positive': 'Quantity must be positive'
    }),
    sale_price: Joi.number().min(0).precision(4).allow(null).optional().messages({
        'number.min': 'Sale price must be 0 or greater'
    }),
    price_override_reason: Joi.string().trim().max(255).allow(null, '').optional(),
    course: Joi.string().valid(...FNB_COURSES).allow(null, '').optional(),
    line_modifiers: Joi.array().items(Joi.object().unknown(true)).optional(),
    modifiers: Joi.array().items(Joi.object().unknown(true)).optional(),
    special_instructions: Joi.string().trim().max(1000).allow(null, '').optional(),
    kitchen_station_id: Joi.number().integer().positive().allow(null).optional(),
    selected_option_ids: Joi.array().items(Joi.number().integer().positive()).max(100).unique().optional(),
    scan_metadata: Joi.object({
        barcode_id: Joi.number().integer().positive().optional(),
        code: Joi.string().trim().max(512).optional(),
        normalized_code: Joi.string().trim().max(512).optional(),
        scope: Joi.string().trim().max(50).optional(),
        packaging_level: Joi.string().trim().max(50).optional(),
        quantity_multiplier: Joi.number().positive().precision(4).optional(),
        location_id: Joi.number().integer().positive().optional(),
        resolved_at: Joi.date().iso().optional()
    }).unknown(true).optional()
});

const discountBeneficiarySchema = Joi.object({
    category: Joi.string().valid(...DISCOUNT_BENEFICIARY_CATEGORIES).required(),
    name: Joi.string().trim().min(2).max(120).required(),
    id_number: Joi.string().trim().min(2).max(120).required()
});

const governedDiscountSchema = Joi.object({
    type: Joi.string().valid('senior', 'pwd', 'employee', 'promo', 'manual').required(),
    label: Joi.string().trim().max(100).allow('', null).optional(),
    method: Joi.string().valid('percentage', 'fixed').optional(),
    rate: Joi.number().min(0).max(100).allow(null).optional(),
    amount: Joi.number().min(0).allow(null).optional(),
    customer_name: Joi.string().trim().max(255).allow('', null).optional(),
    id_number: Joi.string().trim().max(100).allow('', null).optional(),
    employee_name: Joi.string().trim().max(255).allow('', null).optional(),
    employee_id: Joi.string().trim().max(100).allow('', null).optional(),
    approver_user_id: Joi.number().integer().positive().allow(null).optional(),
    promo_code: Joi.string().trim().uppercase().max(40).allow('', null).optional(),
    reason: Joi.string().trim().max(500).allow('', null).optional(),
    manager_pin: Joi.string().trim().pattern(/^[0-9]{4,12}$/).allow('', null).optional(),
    eligible_item_ids: Joi.array().items(Joi.number().integer().positive()).unique().default([]),
    eligible_items: Joi.array().items(Joi.object({
        item_id: Joi.number().integer().positive().required(),
        eligible_quantity: Joi.number().positive().required()
    }).unknown(false)).max(100).default([]),
    vat_removed: Joi.number().min(0).optional(),
    vat_exempt_amount: Joi.number().min(0).optional(),
    discount_amount: Joi.number().min(0).optional()
});

const posDiscountApprovalSchema = Joi.object({
    approver_user_id: Joi.number().integer().positive().allow(null).optional(),
    manager_pin: Joi.string().trim().pattern(/^[0-9]{4,12}$/).allow('', null).optional(),
    employee_user_id: Joi.number().integer().positive().allow(null).optional(),
    discount_type: Joi.string().valid('employee', 'manual').optional()
});

const checkoutPosSchema = Joi.object({
    idempotency_key: Joi.string().trim().min(8).max(120).required().messages({
        'any.required': 'idempotency_key is required'
    }),
    terminal_id: Joi.string().trim().max(100).allow(null, ''),
    shift_id: Joi.number().integer().positive().allow(null).optional(),
    location_id: Joi.number().integer().positive().allow(null).optional(),
    document_context: Joi.string().valid(...DOCUMENT_CONTEXTS).optional(),
    order_method: Joi.string().valid(...ORDER_METHODS).default('dine_in'),
    payment_type: Joi.string().valid(...PAYMENT_TYPES).default('cash'),
    employee_credit: Joi.object({
        account_code: Joi.string().trim().uppercase().min(4).max(40).required()
    }).optional(),
    payment_handoff_mode: Joi.string().valid(...PAYMENT_HANDOFF_MODES).optional(),
    cash_received: Joi.number().min(0).precision(4).allow(null).optional(),
    change_amount: Joi.number().min(0).precision(4).allow(null).optional(),
    service_fee_amount: Joi.number().min(0).precision(4).allow(null).optional().messages({
        'number.min': 'Service fee amount must be 0 or greater'
    }),
    fnb_check_id: Joi.number().integer().positive().allow(null).optional(),
    check_id: Joi.number().integer().positive().allow(null).optional(),
    fnb_table_id: Joi.number().integer().positive().allow(null).optional(),
    table_id: Joi.number().integer().positive().allow(null).optional(),
    fnb_table_label_snapshot: Joi.string().trim().max(120).allow('', null).optional(),
    table_label_snapshot: Joi.string().trim().max(120).allow('', null).optional(),
    fnb_guest_count: Joi.number().integer().min(1).max(500).allow(null).optional(),
    guest_count: Joi.number().integer().min(1).max(500).allow(null).optional(),
    fnb_server_id: Joi.number().integer().positive().allow(null).optional(),
    server_id: Joi.number().integer().positive().allow(null).optional(),
    restaurant_service_charge: restaurantServiceChargeSchema.optional(),
    discount_mode: Joi.string().valid(...DISCOUNT_MODES).optional(),
    discount_amount: Joi.number().min(0).precision(4).default(0),
    discount_profile_name: Joi.string().trim().max(80).allow('', null).optional(),
    discount_rate: Joi.number().min(0).max(100).precision(2).allow(null).optional(),
    customer_name: Joi.string().trim().max(255).allow('', null).optional(),
    customer_email: Joi.string().trim().email({ tlds: { allow: false } }).allow('', null).optional(),
    customer_phone: Joi.string().trim().max(50).allow('', null).optional(),
    buyer_name: Joi.string().trim().max(255).allow('', null).optional(),
    buyer_tin: Joi.string().trim().max(40).allow('', null).optional(),
    buyer_business_style: Joi.string().trim().max(255).allow('', null).optional(),
    buyer_address: Joi.string().trim().max(1000).allow('', null).optional(),
    special_instructions: Joi.string().trim().max(500).allow('', null).optional(),
    discount_beneficiary: discountBeneficiarySchema.optional(),
    governed_discount: governedDiscountSchema.optional(),
    lines: Joi.array().items(checkoutLineSchema).min(1).required().messages({
        'array.min': 'At least one line item is required'
    })
}).custom((value, helpers) => {
    const discountAmount = Number(value?.discount_amount || 0);
    const hasProfile = Boolean(String(value?.discount_profile_name || '').trim());
    const hasDiscountRate = value?.discount_rate !== undefined && value?.discount_rate !== null;
    const discountMode = String(value?.discount_mode || '').trim() || (hasProfile ? 'preset' : (hasDiscountRate ? 'percentage' : (discountAmount > 0 ? 'amount' : 'none')));

    if (value.payment_type === 'employee_credit' && !value.employee_credit) {
        return helpers.error('any.invalid', {
            message: 'employee_credit account_code is required'
        });
    }

    if (value.payment_type !== 'employee_credit' && value.employee_credit) {
        return helpers.error('any.invalid', {
            message: 'employee_credit details are only allowed for Employee Credit payments'
        });
    }

    if (discountMode === 'none' && (hasProfile || hasDiscountRate || discountAmount > 0)) {
        return helpers.error('any.invalid', {
            message: 'discount_mode none cannot include discount values'
        });
    }

    if (discountMode === 'preset' && !hasProfile) {
        return helpers.error('any.invalid', {
            message: 'discount_mode preset requires discount_profile_name'
        });
    }

    if (discountMode === 'amount' && (hasProfile || hasDiscountRate)) {
        return helpers.error('any.invalid', {
            message: 'discount_mode amount cannot include discount profile or rate'
        });
    }

    if (discountMode === 'percentage' && hasProfile) {
        return helpers.error('any.invalid', {
            message: 'discount_mode percentage cannot include discount profile'
        });
    }

    if (hasDiscountRate && !hasProfile && discountAmount <= 0) {
        return helpers.error('any.invalid', {
            message: 'manual discount_rate requires discount_amount'
        });
    }

    // Manual discount (without profile) is allowed in MSME-friendly checkout.
    if (discountAmount > 0 && !hasProfile) {
        return value;
    }

    return value;
}).messages({
    'any.invalid': '{{#message}}'
});

const listTransactionsQuerySchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(200).default(20),
    search: Joi.string().trim().allow('', null).optional(),
    status: Joi.string().valid('completed', 'voided').optional(),
    date_from: Joi.date().iso().optional(),
    date_to: Joi.date().iso().min(Joi.ref('date_from')).optional(),
    cashier_id: Joi.number().integer().positive().optional(),
    location_id: Joi.number().integer().positive().optional(),
    payment_type: Joi.string().valid(...PAYMENT_TYPES).optional(),
    order_method: Joi.string().valid(...ORDER_METHOD_FILTERS).optional(),
    order_source: Joi.string().valid(...ORDER_SOURCES).optional()
});

const posCatalogQuerySchema = Joi.object({
    search: Joi.string().allow('', null).default(''),
    limit: Joi.number().integer().min(1).max(500).default(100),
    folder_id: Joi.number().integer().positive().optional(),
    location_id: Joi.number().integer().positive().optional()
});
const mobilePosCatalogBootstrapQuerySchema = Joi.object({
    search: Joi.string().allow('', null).default(''),
    limit: Joi.number().integer().min(1).max(500).default(100),
    location_id: Joi.number().integer().positive().optional()
});

const posScanSchema = Joi.object({
    code: Joi.string().trim().max(512).required(),
    location_id: Joi.number().integer().positive().allow(null).optional(),
    terminal_id: Joi.string().trim().max(100).allow(null, '').optional(),
    quantity: Joi.number().positive().precision(4).default(1)
});

const verifyTerminalSchema = Joi.object({
    terminal_id: Joi.string().trim().uppercase().max(100).pattern(/^[A-Za-z0-9._-]{2,100}$/).required()
});

const posCashierLoginSchema = Joi.object({
    identifier: Joi.string().trim().min(2).max(100).required().messages({
        'any.required': 'Cashier username or email is required',
        'string.empty': 'Cashier username or email is required',
        'string.min': 'Cashier username or email must be at least 2 characters'
    }),
    password: Joi.string().min(1).max(128).required().messages({
        'any.required': 'Cashier password is required',
        'string.empty': 'Cashier password is required'
    })
});

const setupCashierSchema = Joi.object({
    username: Joi.string().trim().min(2).max(50).required().messages({
        'any.required': 'Cashier username is required',
        'string.min': 'Cashier username must be at least 2 characters',
        'string.max': 'Cashier username must be 50 characters or fewer'
    }),
    email: Joi.string().trim().email({ tlds: { allow: false } }).max(100).required().messages({
        'any.required': 'Cashier email is required',
        'string.email': 'Cashier email must be valid'
    }),
    phone_number: Joi.string().trim().pattern(/^[+0-9().\-\s]{7,40}$/).allow('', null).optional().messages({
        'string.pattern.base': 'Phone number must be 7-40 characters and may only contain digits, spaces, +, -, parentheses, and periods'
    }),
    password: Joi.string().min(8).max(128).required().messages({
        'any.required': 'Cashier password is required',
        'string.min': 'Cashier password must be at least 8 characters'
    }),
    location_ids: Joi.array()
        .items(Joi.number().integer().positive())
        .min(1)
        .unique()
        .required()
        .messages({
            'any.required': 'At least one cashier store assignment is required',
            'array.min': 'At least one cashier store assignment is required',
            'array.unique': 'Cashier store assignments must not contain duplicates'
        })
});

const posCatalogOverridesQuerySchema = Joi.object({
    search: Joi.string().allow('', null).default(''),
    limit: Joi.number().integer().min(1).max(1000).default(200)
});

const posTransactionIdParamSchema = Joi.object({
    id: Joi.number().integer().positive().required()
});

const posCatalogOverrideParamSchema = Joi.object({
    item_id: Joi.number().integer().positive().required()
});

const updatePosCatalogOverrideSchema = Joi.object({
    pos_visible: Joi.boolean().optional(),
    pos_always_available: Joi.boolean().optional(),
    pos_best_seller_mode: Joi.string().trim().lowercase().valid('auto', 'force', 'never').optional()
}).or('pos_visible', 'pos_always_available', 'pos_best_seller_mode');

const zReadingDateParamSchema = Joi.object({
    date: Joi.date().iso().required()
});

const zReadingQuerySchema = Joi.object({
    location_id: Joi.number().integer().positive().optional()
});

const closeDaySchema = Joi.object({
    business_date: Joi.date().iso().optional(),
    day_close_pin: Joi.string().trim().pattern(/^[0-9]{4,12}$/).required().messages({
        'any.required': 'POS Day Close PIN is required',
        'string.pattern.base': 'POS Day Close PIN must contain 4 to 12 digits'
    })
});

const xReadingQuerySchema = Joi.object({
    business_date: Joi.date().iso().optional(),
    terminal_id: Joi.string().trim().max(100).allow(null, '').optional()
});

const governedResetSchema = Joi.object({
    reason: Joi.string().trim().min(8).max(255).required(),
    evidence_ref: Joi.string().trim().max(255).allow(null, '').optional(),
    confirmation_text: Joi.string().trim().valid('INCREMENT RESET COUNTER').required()
});

const terminalCurrentShiftQuerySchema = Joi.object({
    terminal_id: Joi.string().trim().max(100).allow(null, '').optional(),
    location_id: Joi.number().integer().positive().optional()
});

const terminalDashboardTodayQuerySchema = Joi.object({
    terminal_id: Joi.string().trim().max(100).allow(null, '').optional(),
    location_id: Joi.number().integer().positive().optional(),
    business_date: Joi.date().iso().optional()
});

const posReportsQuerySchema = Joi.object({
    date_from: Joi.date().iso().required(),
    date_to: Joi.date().iso().min(Joi.ref('date_from')).required(),
    granularity: Joi.string().valid(...REPORT_GRANULARITIES).default('daily'),
    cashier_id: Joi.number().integer().positive().optional(),
    location_id: Joi.number().integer().positive().optional(),
    terminal_id: Joi.string().trim().max(100).allow(null, '').optional(),
    payment_type: Joi.string().valid(...PAYMENT_TYPES).optional(),
    source: Joi.string().valid(...REPORT_SOURCE_FILTERS).optional(),
    category_id: Joi.number().integer().positive().optional(),
    category: Joi.string().trim().max(120).allow('', null).optional()
});

const posReportsExportQuerySchema = posReportsQuerySchema.keys({
    section: Joi.string().valid(...REPORT_SECTIONS).default('daily'),
    format: Joi.string().valid('csv').default('csv')
});

const incomingOnlineOrdersQuerySchema = Joi.object({
    shift_id: Joi.number().integer().positive().required(),
    location_id: Joi.number().integer().positive().optional(),
    limit: Joi.number().integer().min(1).max(500).default(200)
});

const deliveryPersonnelListQuerySchema = Joi.object({
    location_id: Joi.number().integer().positive().optional()
});

const adminLocationMonitorQuerySchema = Joi.object({
    location_id: Joi.number().integer().positive().required(),
    limit: Joi.number().integer().min(1).max(500).default(200)
});

const shiftIdParamSchema = Joi.object({
    id: Joi.number().integer().positive().required()
});

const openTerminalShiftSchema = Joi.object({
    idempotency_key: Joi.string().trim().min(8).max(120).optional(),
    terminal_id: Joi.string().trim().max(100).pattern(/^[A-Za-z0-9._-]{2,100}$/).required().messages({
        'any.required': 'terminal_id is required',
        'string.pattern.base': 'terminal_id may only contain letters, numbers, dot, underscore, or hyphen'
    }),
    location_id: Joi.number().integer().positive().allow(null).optional(),
    business_date: Joi.date().iso().optional(),
    opening_float_amount: Joi.number().min(0).precision(4).required().messages({
        'any.required': 'Opening cash amount is required',
        'number.base': 'Opening cash amount must be a valid number',
        'number.min': 'Opening cash amount must be 0 or greater'
    }),
    opening_note: Joi.string().trim().max(255).allow(null, '').optional()
});

const switchTerminalShiftLocationSchema = Joi.object({
    idempotency_key: Joi.string().trim().min(8).max(120).optional(),
    terminal_id: Joi.string().trim().max(100).pattern(/^[A-Za-z0-9._-]{2,100}$/).allow(null, '').optional().messages({
        'string.pattern.base': 'terminal_id may only contain letters, numbers, dot, underscore, or hyphen'
    }),
    target_location_id: Joi.number().integer().positive().required(),
    reason: Joi.string().trim().min(8).max(255).required()
});

const cashDrawerEventSchema = Joi.object({
    idempotency_key: Joi.string().trim().min(8).max(120).optional(),
    event_type: Joi.string().valid('cash_in', 'cash_out', 'opening_adjustment', 'closing_adjustment').required(),
    amount: Joi.number().positive().precision(4).required(),
    reason: Joi.string().trim().min(3).max(255).required()
});

const closeTerminalShiftSchema = Joi.object({
    idempotency_key: Joi.string().trim().min(8).max(120).optional(),
    terminal_id: Joi.string().trim().uppercase().max(100).allow('', null).optional(),
    closing_cash_amount: Joi.number().min(0).precision(4).required(),
    closing_note: Joi.string().trim().max(255).allow(null, '').optional(),
    override_reason: Joi.string().trim().min(8).max(255).allow(null, '').optional()
});

const forceCloseStaleTerminalShiftSchema = Joi.object({
    idempotency_key: Joi.string().trim().min(8).max(120).required(),
    closing_cash_amount: Joi.number().min(0).precision(4).required(),
    reason: Joi.string().trim().min(8).max(255).required()
});

const updateOnlineOrderStatusSchema = Joi.object({
    idempotency_key: Joi.string().trim().min(8).max(120).optional(),
    fulfillment_status: Joi.string().valid(...ONLINE_FULFILLMENT_STATUSES).required(),
    reason: Joi.string().trim().min(3).max(255).when('fulfillment_status', {
        is: 'rejected',
        then: Joi.required(),
        otherwise: Joi.optional().allow('', null)
    })
});

const updateDeliveryJobStatusSchema = Joi.object({
    idempotency_key: Joi.string().trim().min(8).max(120).optional(),
    status: Joi.string().valid('assigned', 'picked_up', 'delivered').required()
});

const assignDeliveryPersonnelSchema = Joi.object({
    idempotency_key: Joi.string().trim().min(8).max(120).required(),
    delivery_personnel_id: Joi.number().integer().positive().required()
});
const collectCashPickupOrderSchema = Joi.object({
    idempotency_key: Joi.string().trim().min(8).max(120).required(),
    terminal_id: Joi.string().trim().max(100).required(),
    cash_received: Joi.number().positive().precision(4).required()
});

// A client-side driver (iMin native bridge, a future Web Bluetooth ESC/POS
// driver) reports its own outcome here instead of asking the backend to
// dispatch physically. See ADR 0053 and posDeviceUseCases.js.
const deviceClientResultSchema = Joi.object({
    success: Joi.boolean().required(),
    message: Joi.string().trim().max(500).allow('', null).optional(),
    reason_code: Joi.string().trim().max(100).allow('', null).optional()
});

const devicePrintReceiptSchema = Joi.object({
    idempotency_key: Joi.string().trim().min(8).max(120).optional(),
    transaction_id: Joi.number().integer().positive().required(),
    copies: Joi.number().integer().min(1).max(5).default(1),
    paper_width: Joi.string().valid('80mm', '57mm').default('80mm'),
    reason: Joi.string().trim().max(255).allow('', null).optional(),
    terminal_id: Joi.string().trim().max(100).allow(null, '').optional(),
    client_driver_id: Joi.string().trim().max(60).optional(),
    client_result: deviceClientResultSchema.optional()
});

const devicePrintShiftSummarySchema = Joi.object({
    idempotency_key: Joi.string().trim().min(8).max(120).optional(),
    copies: Joi.number().integer().min(1).max(3).default(1),
    paper_width: Joi.string().valid('80mm', '57mm').default('80mm'),
    reason: Joi.string().trim().max(255).allow('', null).optional(),
    terminal_id: Joi.string().trim().max(100).allow(null, '').optional(),
    client_driver_id: Joi.string().trim().max(60).optional(),
    client_result: deviceClientResultSchema.optional()
});

const devicePrintZReadingSchema = Joi.object({
    idempotency_key: Joi.string().trim().min(8).max(120).optional(),
    copies: Joi.number().integer().min(1).max(3).default(1),
    paper_width: Joi.string().valid('80mm', '57mm').default('80mm'),
    reason: Joi.string().trim().max(255).allow('', null).optional(),
    terminal_id: Joi.string().trim().max(100).allow(null, '').optional(),
    client_driver_id: Joi.string().trim().max(60).optional(),
    client_result: deviceClientResultSchema.optional()
});

const deviceOpenDrawerSchema = Joi.object({
    idempotency_key: Joi.string().trim().min(8).max(120).optional(),
    shift_id: Joi.number().integer().positive().required(),
    transaction_id: Joi.number().integer().positive().allow(null).optional(),
    reason: Joi.string().trim().min(3).max(255).required(),
    terminal_id: Joi.string().trim().max(100).allow(null, '').optional(),
    client_driver_id: Joi.string().trim().max(60).optional(),
    client_result: deviceClientResultSchema.optional()
});

const fiscalPrintEventSchema = Joi.object({
    reason: Joi.string().trim().max(255).allow('', null).optional()
});

const voidPosTransactionSchema = Joi.object({
    reason: Joi.string().trim().min(3).max(255).required(),
    shift_id: Joi.number().integer().positive().required(),
    terminal_id: Joi.string().trim().max(100).allow(null, '').optional()
});

const esalesGenerateSchema = Joi.object({
    report_month: Joi.string().trim().pattern(/^\d{4}-\d{2}$/).required()
});

const esalesStatusSchema = Joi.object({
    status: Joi.string().valid('submitted', 'accepted', 'rejected').required(),
    status_evidence_ref: Joi.string().trim().max(255).allow('', null).optional(),
    status_note: Joi.string().trim().max(500).allow('', null).optional()
});

const fiscalTerminalRegistrationSchema = Joi.object({
    terminal_id: Joi.string().trim().max(100).pattern(/^[A-Za-z0-9._-]{2,100}$/).required(),
    location_id: Joi.number().integer().positive().allow(null).optional(),
    min_number: Joi.string().trim().max(80).allow('', null).optional(),
    machine_serial_number: Joi.string().trim().max(120).allow('', null).optional(),
    software_version: Joi.string().trim().max(80).allow('', null).optional(),
    software_serial_number: Joi.string().trim().max(120).allow('', null).optional(),
    ptu_number: Joi.string().trim().max(80).allow('', null).optional(),
    receipt_printer_binding: Joi.string().trim().max(120).allow('', null).optional(),
    cash_drawer_binding: Joi.string().trim().max(120).allow('', null).optional(),
    accreditation_status: Joi.string().valid('draft', 'pending_review', 'verified', 'revoked').default('draft'),
    evidence_ref: Joi.string().trim().max(255).allow('', null).optional()
});

const mobilePosCheckoutSyncEntrySchema = Joi.object({
    local_transaction_id: Joi.string().trim().max(120).required(),
    payload: Joi.object().required().unknown(true)
});

const mobilePosCheckoutSyncSchema = Joi.object({
    device_id: Joi.string().trim().max(120).required(),
    client_sync_run_id: Joi.string().trim().max(120).allow('', null).optional(),
    timezone: Joi.string().trim().max(80).allow('', null).optional(),
    entries: Joi.array().items(mobilePosCheckoutSyncEntrySchema).required()
});

const mobilePosShiftSyncEntrySchema = Joi.object({
    local_operation_id: Joi.string().trim().max(120).required(),
    operation_type: Joi.string().valid('shift_open', 'switch_location', 'cash_event', 'shift_close').required(),
    shift_id: Joi.number().integer().positive().allow(null).optional(),
    payload: Joi.object().required().unknown(true)
});

const mobilePosShiftSyncSchema = Joi.object({
    device_id: Joi.string().trim().max(120).required(),
    client_sync_run_id: Joi.string().trim().max(120).allow('', null).optional(),
    timezone: Joi.string().trim().max(80).allow('', null).optional(),
    entries: Joi.array().items(mobilePosShiftSyncEntrySchema).required()
});

const mobilePosHardwareEventSyncEntrySchema = Joi.object({
    local_event_id: Joi.string().trim().max(120).required(),
    event_type: Joi.string().trim().max(120).required(),
    payload: Joi.object().unknown(true).default({})
});

const mobilePosHardwareEventSyncSchema = Joi.object({
    device_id: Joi.string().trim().max(120).required(),
    client_sync_run_id: Joi.string().trim().max(120).allow('', null).optional(),
    timezone: Joi.string().trim().max(80).allow('', null).optional(),
    entries: Joi.array().items(mobilePosHardwareEventSyncEntrySchema).required()
});

const mobilePosItemSyncEntrySchema = Joi.object({
    local_transaction_id: Joi.string().trim().max(120).required(),
    // op lives inside payload, not as a sibling field - mobile's
    // LiveSyncTransport hardcodes the { local_transaction_id, payload }
    // entry envelope for every entity (see checkout sync above), so the
    // repository can only shape what's inside payload itself.
    payload: Joi.object({
        op: Joi.string().valid('create', 'update', 'delete').required()
    }).required().unknown(true)
});

const mobilePosItemSyncSchema = Joi.object({
    device_id: Joi.string().trim().max(120).required(),
    client_sync_run_id: Joi.string().trim().max(120).allow('', null).optional(),
    timezone: Joi.string().trim().max(80).allow('', null).optional(),
    entries: Joi.array().items(mobilePosItemSyncEntrySchema).required()
});

const mobilePosCheckpointAckSchema = Joi.object({
    checkpoint_token: Joi.string().trim().min(8).max(512).required(),
    consumed_slot: Joi.boolean().optional(),
    last_successful_sync_at: Joi.date().iso().allow(null).optional()
});

const employeeCreditUserParamSchema = Joi.object({
    userId: Joi.number().integer().positive().required()
});

const employeeCreditAccountParamSchema = Joi.object({
    accountId: Joi.number().integer().positive().required()
});

const employeeParamSchema = Joi.object({
    employeeId: Joi.number().integer().positive().required()
});

const employeeListQuerySchema = Joi.object({
    include_inactive: Joi.boolean().truthy('true').falsy('false').default(false)
});

const employeeCreateSchema = Joi.object({
    employee_code: Joi.string().trim().uppercase().min(2).max(40).pattern(/^[A-Z0-9._-]+$/).required(),
    full_name: Joi.string().trim().min(2).max(255).required(),
    email: Joi.string().trim().email().max(255).allow('', null).optional(),
    phone: Joi.string().trim().max(40).allow('', null).optional(),
    location_id: Joi.number().integer().positive().allow(null).optional(),
    is_active: Joi.boolean().default(true)
});

const employeeUpdateSchema = Joi.object({
    employee_code: Joi.string().trim().uppercase().min(2).max(40).pattern(/^[A-Z0-9._-]+$/).optional(),
    full_name: Joi.string().trim().min(2).max(255).optional(),
    email: Joi.string().trim().email().max(255).allow('', null).optional(),
    phone: Joi.string().trim().max(40).allow('', null).optional(),
    location_id: Joi.number().integer().positive().allow(null).optional(),
    is_active: Joi.boolean().optional()
}).min(1);

const employeeCreditAccountUpdateSchema = Joi.object({
    is_eligible: Joi.boolean().optional(),
    credit_limit: Joi.number().min(0).precision(4).allow(null).optional(),
    adjustment_amount: Joi.number().precision(4).default(0),
    reason: Joi.string().trim().min(3).max(500).allow('', null).optional(),
    idempotency_key: Joi.string().trim().min(8).max(120).allow('', null).optional()
}).or('is_eligible', 'credit_limit', 'adjustment_amount');

const employeeCreditRepaymentSchema = Joi.object({
    amount: Joi.number().positive().precision(4).required(),
    reason: Joi.string().trim().min(3).max(500).required(),
    idempotency_key: Joi.string().trim().min(8).max(120).required()
});

const employeeCreditOutstandingAdjustmentSchema = Joi.object({
    adjustment_amount: Joi.number().precision(4).invalid(0).required(),
    reason: Joi.string().trim().min(3).max(500).required(),
    idempotency_key: Joi.string().trim().min(8).max(120).required()
});

const employeeCreditLookupQuerySchema = Joi.object({
    account_code: Joi.string().trim().uppercase().min(4).max(40).required()
});

const employeeCreditCheckoutOptionsQuerySchema = Joi.object({
    search: Joi.string().trim().max(100).allow('').default(''),
    location_id: Joi.number().integer().positive().optional(),
    limit: Joi.number().integer().min(1).max(100).default(50)
});

const employeeCreditReportQuerySchema = Joi.object({
    date_from: Joi.date().iso().optional(),
    date_to: Joi.date().iso().min(Joi.ref('date_from')).optional(),
    account_id: Joi.number().integer().positive().optional(),
    entry_type: Joi.string().valid('grant', 'debit', 'charge', 'repayment', 'reversal', 'adjustment', 'expiration').optional(),
    limit: Joi.number().integer().min(1).max(1000).default(500)
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

export const validatePosCheckout = validateSchema(checkoutPosSchema, 'body', 'validatedData');
export const validatePosDiscountApproval = validateSchema(posDiscountApprovalSchema, 'body', 'validatedData');
export const validatePosTransactionsQuery = validateSchema(listTransactionsQuerySchema, 'query', 'validatedQuery');
export const validatePosCatalogQuery = validateSchema(posCatalogQuerySchema, 'query', 'validatedQuery');
export const validatePosReportsQuery = validateSchema(posReportsQuerySchema, 'query', 'validatedQuery');
export const validateMobilePosCatalogBootstrapQuery = validateSchema(mobilePosCatalogBootstrapQuerySchema, 'query', 'validatedQuery');
export const validatePosScan = validateSchema(posScanSchema, 'body', 'validatedData');
export const validateVerifyTerminal = validateSchema(verifyTerminalSchema, 'body', 'validatedData');
export const validatePosCashierLogin = validateSchema(posCashierLoginSchema, 'body', 'validatedData');
export const validateSetupCashier = validateSchema(setupCashierSchema, 'body', 'validatedData');
export const validatePosCatalogOverridesQuery = validateSchema(posCatalogOverridesQuerySchema, 'query', 'validatedQuery');
export const validatePosTransactionIdParam = validateSchema(posTransactionIdParamSchema, 'params', 'validatedParams');
export const validatePosCatalogOverrideParam = validateSchema(posCatalogOverrideParamSchema, 'params', 'validatedParams');
export const validateUpdatePosCatalogOverride = validateSchema(updatePosCatalogOverrideSchema, 'body', 'validatedData');
export const validateZReadingDateParam = validateSchema(zReadingDateParamSchema, 'params', 'validatedParams');
export const validateZReadingQuery = validateSchema(zReadingQuerySchema, 'query', 'validatedQuery');
export const validateCloseDayBody = validateSchema(closeDaySchema, 'body', 'validatedData');
export const validateXReadingQuery = validateSchema(xReadingQuerySchema, 'query', 'validatedQuery');
export const validateGovernedResetBody = validateSchema(governedResetSchema, 'body', 'validatedData');
export const validateTerminalCurrentShiftQuery = validateSchema(terminalCurrentShiftQuerySchema, 'query', 'validatedQuery');
export const validateTerminalDashboardTodayQuery = validateSchema(terminalDashboardTodayQuerySchema, 'query', 'validatedQuery');
export const validatePosReportsExportQuery = validateSchema(posReportsExportQuerySchema, 'query', 'validatedQuery');
export const validateIncomingOnlineOrdersQuery = validateSchema(incomingOnlineOrdersQuerySchema, 'query', 'validatedQuery');
export const validateDeliveryPersonnelListQuery = validateSchema(deliveryPersonnelListQuerySchema, 'query', 'validatedQuery');
export const validateAdminLocationMonitorQuery = validateSchema(adminLocationMonitorQuerySchema, 'query', 'validatedQuery');
export const validateShiftIdParam = validateSchema(shiftIdParamSchema, 'params', 'validatedParams');
export const validateOpenTerminalShift = validateSchema(openTerminalShiftSchema, 'body', 'validatedData');
export const validateSwitchTerminalShiftLocation = validateSchema(switchTerminalShiftLocationSchema, 'body', 'validatedData');
export const validateCashDrawerEvent = validateSchema(cashDrawerEventSchema, 'body', 'validatedData');
export const validateCloseTerminalShift = validateSchema(closeTerminalShiftSchema, 'body', 'validatedData');
export const validateForceCloseStaleTerminalShift = validateSchema(forceCloseStaleTerminalShiftSchema, 'body', 'validatedData');
export const validateUpdateOnlineOrderStatus = validateSchema(updateOnlineOrderStatusSchema, 'body', 'validatedData');
export const validateUpdateDeliveryJobStatus = validateSchema(updateDeliveryJobStatusSchema, 'body', 'validatedData');
export const validateAssignDeliveryPersonnel = validateSchema(assignDeliveryPersonnelSchema, 'body', 'validatedData');
export const validateCollectCashPickupOrder = validateSchema(collectCashPickupOrderSchema, 'body', 'validatedData');
export const validateCollectCashDeliveryOrder = validateSchema(collectCashPickupOrderSchema, 'body', 'validatedData');
export const validatePosDeviceReceiptPrint = validateSchema(devicePrintReceiptSchema, 'body', 'validatedData');
export const validatePosDeviceShiftSummaryPrint = validateSchema(devicePrintShiftSummarySchema, 'body', 'validatedData');
export const validatePosDeviceZReadingPrint = validateSchema(devicePrintZReadingSchema, 'body', 'validatedData');
export const validatePosDeviceDrawerOpen = validateSchema(deviceOpenDrawerSchema, 'body', 'validatedData');
export const validateFiscalPrintEvent = validateSchema(fiscalPrintEventSchema, 'body', 'validatedData');
export const validateVoidPosTransaction = validateSchema(voidPosTransactionSchema, 'body', 'validatedData');
export const validateGenerateESalesReport = validateSchema(esalesGenerateSchema, 'body', 'validatedData');
export const validateUpdateESalesReportStatus = validateSchema(esalesStatusSchema, 'body', 'validatedData');
export const validateFiscalTerminalRegistration = validateSchema(fiscalTerminalRegistrationSchema, 'body', 'validatedData');
export const validateMobilePosCheckoutSync = validateSchema(mobilePosCheckoutSyncSchema, 'body', 'validatedData');
export const validateMobilePosItemSync = validateSchema(mobilePosItemSyncSchema, 'body', 'validatedData');
export const validateMobilePosShiftSync = validateSchema(mobilePosShiftSyncSchema, 'body', 'validatedData');
export const validateMobilePosHardwareEventSync = validateSchema(mobilePosHardwareEventSyncSchema, 'body', 'validatedData');
export const validateMobilePosCheckpointAck = validateSchema(mobilePosCheckpointAckSchema, 'body', 'validatedData');
export const validateEmployeeCreditUserParam = validateSchema(employeeCreditUserParamSchema, 'params', 'validatedParams');
export const validateEmployeeCreditAccountParam = validateSchema(employeeCreditAccountParamSchema, 'params', 'validatedParams');
export const validateEmployeeParam = validateSchema(employeeParamSchema, 'params', 'validatedParams');
export const validateEmployeeListQuery = validateSchema(employeeListQuerySchema, 'query', 'validatedQuery');
export const validateEmployeeCreate = validateSchema(employeeCreateSchema, 'body', 'validatedData');
export const validateEmployeeUpdate = validateSchema(employeeUpdateSchema, 'body', 'validatedData');
export const validateEmployeeCreditAccountUpdate = validateSchema(employeeCreditAccountUpdateSchema, 'body', 'validatedData');
export const validateEmployeeCreditRepayment = validateSchema(employeeCreditRepaymentSchema, 'body', 'validatedData');
export const validateEmployeeCreditOutstandingAdjustment = validateSchema(employeeCreditOutstandingAdjustmentSchema, 'body', 'validatedData');
export const validateEmployeeCreditLookupQuery = validateSchema(employeeCreditLookupQuerySchema, 'query', 'validatedQuery');
export const validateEmployeeCreditCheckoutOptionsQuery = validateSchema(employeeCreditCheckoutOptionsQuerySchema, 'query', 'validatedQuery');
export const validateEmployeeCreditReportQuery = validateSchema(employeeCreditReportQuerySchema, 'query', 'validatedQuery');

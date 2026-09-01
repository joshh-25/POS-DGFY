import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const PosTransaction = sequelize.define('PosTransaction', {
    pos_transaction_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    invoice_number: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true
    },
    document_type: {
        type: DataTypes.ENUM('non_fiscal_slip', 'fiscal_invoice'),
        allowNull: false,
        defaultValue: 'non_fiscal_slip'
    },
    document_context: {
        type: DataTypes.ENUM('fiscal', 'non_fiscal', 'training_test'),
        allowNull: false,
        defaultValue: 'non_fiscal'
    },
    idempotency_key: {
        type: DataTypes.STRING(120),
        allowNull: false,
        unique: true
    },
    request_hash: {
        type: DataTypes.STRING(64),
        allowNull: false
    },
    cashier_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    shift_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    operator_session_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    terminal_id: {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    order_source: {
        type: DataTypes.ENUM('in_store', 'online_store'),
        allowNull: false,
        defaultValue: 'in_store'
    },
    order_method: {
        type: DataTypes.ENUM('dine_in', 'takeout', 'pickup', 'delivery', 'online', 'appointment', 'walk_in'),
        allowNull: false,
        defaultValue: 'dine_in'
    },
    fulfillment_status: {
        type: DataTypes.ENUM(
            'placed',
            'confirmed',
            'preparing',
            'packed',
            'ready_for_pickup',
            'out_for_delivery',
            'completed',
            'cancelled',
            'rejected'
        ),
        allowNull: true,
        defaultValue: null
    },
    location_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    tracking_pin: {
        type: DataTypes.STRING(20),
        allowNull: true,
        unique: true
    },
    customer_name: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    customer_phone: {
        type: DataTypes.STRING(50),
        allowNull: true
    },
    customer_email: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    buyer_tin: {
        type: DataTypes.STRING(40),
        allowNull: true
    },
    buyer_business_style: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    buyer_address: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    delivery_address: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    delivery_latitude: {
        type: DataTypes.DECIMAL(10, 8),
        allowNull: true
    },
    delivery_longitude: {
        type: DataTypes.DECIMAL(11, 8),
        allowNull: true
    },
    scheduled_for: {
        type: DataTypes.DATE,
        allowNull: true
    },
    special_instructions: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    delivery_fee: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false,
        defaultValue: 0
    },
    store_customer_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    outside_radius_flag: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    // Phase 236 (#1328, epic #1321): observation-only server-side road-distance capture. Neither
    // field feeds delivery_fee/total_amount computation anywhere in this codebase -- see
    // docs/compliance/impact-declarations/2026-09-02-server-side-road-distance-capture-observation-only.md.
    delivery_distance_meters: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    delivery_distance_source: {
        type: DataTypes.ENUM('road', 'fallback', 'none'),
        allowNull: false,
        defaultValue: 'none'
    },
    // Phase 237 (#1329, epic #1321). Money-provenance columns for the resolved delivery-fee
    // breakdown -- see
    // docs/compliance/impact-declarations/2026-09-02-storefront-calculated-and-free-delivery-fee-modes.md
    // and the ADR 0012 amendment dated 2026-09-02. `delivery_fee_base - delivery_fee_waiver ===
    // delivery_fee` whenever delivery_fee_override is null. fallbackApplied/outOfRange are
    // deliberately NOT persisted here -- fully derivable from `delivery_fee_mode = 'calculated' AND
    // delivery_distance_source <> 'road'` (plus the config-malformed case), so a derivable boolean
    // never drifts out of sync with the columns it's derived from.
    delivery_fee_mode: {
        type: DataTypes.ENUM('fixed', 'calculated', 'free'),
        allowNull: false,
        defaultValue: 'fixed'
    },
    delivery_fee_base: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false,
        defaultValue: 0
    },
    delivery_fee_waiver: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false,
        defaultValue: 0
    },
    // Nullable is load-bearing: NULL means "no override", 0.0000 means "staff set it free" -- the
    // same null-vs-zero convention Phase 140 already established for downpayment_amount.
    delivery_fee_override: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: true,
        defaultValue: null
    },
    delivery_fee_calc_version: {
        type: DataTypes.SMALLINT.UNSIGNED,
        allowNull: false,
        defaultValue: 1
    },
    accepted_by: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    accepted_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    // Phase 210 (#1179). Separate from accepted_by/accepted_at because a reject can now happen
    // after an accept (confirmed -> rejected) -- the two events have different actors and times.
    rejection_reason: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    rejected_by: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    rejected_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    // Phase 211 (#1180). Retail-only "packed" fulfillment step: two nullable, additive columns
    // attributing the event. No Sequelize association (mirrors rejected_by/rejected_at, which
    // also has none).
    packed_by: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    packed_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    payment_type: {
        // 'cheque' added by ADR 0077 (scoped supersession of ADR 0063 clause 4) -- Phase 202
        // (#1085). Split-tender allocations copy their method onto this column
        // (splitPaymentUseCases.js), so it has to widen alongside pos_order_payments and
        // pos_payment_allocations or a cheque split allocation fails at the write.
        type: DataTypes.ENUM('cash', 'gcash', 'maya', 'card', 'bank_transfer', 'qrph', 'employee_credit', 'grab_pay', 'shopeepay', 'cheque'),
        allowNull: false,
        defaultValue: 'cash'
    },
    payment_timing: {
        type: DataTypes.ENUM('upfront', 'on_pickup', 'on_delivery'),
        allowNull: false,
        defaultValue: 'upfront'
    },
    cash_received: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
    change_amount: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
    payment_status: {
        // 'partially_paid' added by ADR 0069 clause 4 (carried over from ADR 0068 clause 4,
        // unchanged by the supersession) -- Phase 137 (#819).
        type: DataTypes.ENUM('unpaid', 'payment_pending', 'paid', 'partially_paid', 'failed', 'refund_pending', 'partial_refunded', 'refunded'),
        allowNull: false,
        defaultValue: 'paid'
    },
    payment_collected_at: { type: DataTypes.DATE, allowNull: true },
    payment_collected_by: { type: DataTypes.INTEGER, allowNull: true },
    payment_collected_shift_id: { type: DataTypes.INTEGER, allowNull: true },
    payment_collected_terminal_id: { type: DataTypes.STRING(100), allowNull: true },
    payment_reference: {
        type: DataTypes.STRING(120),
        allowNull: true
    },
    payment_checkout_url: {
        type: DataTypes.STRING(1000),
        allowNull: true
    },
    payment_provider: {
        type: DataTypes.STRING(40),
        allowNull: true
    },
    payment_session_reference: {
        type: DataTypes.STRING(40),
        allowNull: true
    },
    payment_breakdown: {
        type: DataTypes.JSON,
        allowNull: true
    },
    employee_credit_account_id: { type: DataTypes.INTEGER, allowNull: true },
    employee_credit_user_id: { type: DataTypes.INTEGER, allowNull: true },
    employee_credit_employee_id: { type: DataTypes.INTEGER, allowNull: true },
    employee_credit_employee_name_snapshot: { type: DataTypes.STRING(255), allowNull: true },
    employee_credit_account_code_snapshot: { type: DataTypes.STRING(40), allowNull: true },
    employee_credit_amount: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
    employee_credit_balance_after: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
    employee_credit_outstanding_after: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
    employee_credit_authorization_reference: { type: DataTypes.STRING(80), allowNull: true },
    subtotal_amount: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false,
        defaultValue: 0
    },
    vatable_sales: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false,
        defaultValue: 0
    },
    vat_amount: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false,
        defaultValue: 0
    },
    vat_exempt_sales: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false,
        defaultValue: 0
    },
    zero_rated_sales: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false,
        defaultValue: 0
    },
    discount_amount: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false,
        defaultValue: 0
    },
    discount_label_snapshot: {
        type: DataTypes.STRING(80),
        allowNull: true
    },
    discount_rate_snapshot: {
        type: DataTypes.DECIMAL(7, 4),
        allowNull: true
    },
    service_fee_amount: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false,
        defaultValue: 0
    },
    service_fee_label_snapshot: {
        type: DataTypes.STRING(80),
        allowNull: true
    },
    service_fee_method_snapshot: {
        type: DataTypes.ENUM('dine_in', 'takeout', 'pickup', 'delivery', 'online', 'appointment', 'walk_in'),
        allowNull: true
    },
    service_fee_overridden: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    fnb_check_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    fnb_table_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    fnb_table_label_snapshot: {
        type: DataTypes.STRING(120),
        allowNull: true
    },
    fnb_guest_count: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    fnb_server_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    restaurant_service_charge_amount: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false,
        defaultValue: 0
    },
    restaurant_service_charge_label_snapshot: {
        type: DataTypes.STRING(120),
        allowNull: true
    },
    restaurant_service_charge_rate_snapshot: {
        type: DataTypes.DECIMAL(7, 4),
        allowNull: true
    },
    restaurant_service_charge_taxable: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    fnb_metadata: {
        type: DataTypes.JSON,
        allowNull: true
    },
    total_amount: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false,
        defaultValue: 0
    },
    amount_paid: {
        // ADR 0069 clause 4a (carried over from ADR 0068 clause 4a): peso DECIMAL(14,4),
        // matching every other pos_transaction_* money column -- never centavos.
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false,
        defaultValue: 0
    },
    balance_due: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false,
        defaultValue: 0
    },
    status: {
        type: DataTypes.ENUM('completed', 'voided'),
        allowNull: false,
        defaultValue: 'completed'
    },
    voided_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    voided_by: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    void_reason: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    fiscal_lifecycle_state: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: 'original'
    },
    fiscal_reprint_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    fiscal_void_event_hash: {
        type: DataTypes.STRING(64),
        allowNull: true
    },
    fiscal_document_template_version: {
        type: DataTypes.STRING(40),
        allowNull: true
    },
    fiscal_document_hash: {
        type: DataTypes.STRING(64),
        allowNull: true
    },
    fiscal_document_snapshot: {
        type: DataTypes.JSON,
        allowNull: true
    }
}, {
    tableName: 'pos_transactions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        { fields: ['invoice_number'] },
        { fields: ['document_type'] },
        { fields: ['document_context'] },
        { fields: ['idempotency_key'] },
        { fields: ['tracking_pin'] },
        { fields: ['order_source'] },
        { fields: ['fulfillment_status'] },
        { fields: ['payment_status'] },
        { fields: ['payment_session_reference'] },
        { fields: ['location_id'] },
        { fields: ['store_customer_id'] },
        { fields: ['buyer_tin'] },
        { fields: ['fnb_check_id'] },
        { fields: ['fnb_table_id'] },
        { fields: ['fnb_server_id'] },
        { fields: ['cashier_id'] },
        { fields: ['shift_id'] },
        { name: 'idx_pos_transactions_operator_session_id', fields: ['operator_session_id'] },
        { fields: ['fiscal_document_hash'] },
        { fields: ['fiscal_lifecycle_state'] },
        { fields: ['created_at'] },
        { fields: ['status'] }
    ]
});

export default PosTransaction;

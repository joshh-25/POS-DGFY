/**
 * Phase 14 sales-history legacy fixtures (SHM-01..04).
 *
 * Builders return fresh objects so mapper tests can mutate without leaking
 * state across cases, matching the Phase 13 fixture convention
 * (`tests/fixtures/phase13/legacyProductRecords.js`).
 *
 * `POS_TRANSACTION_FIELD_NAMES` and `POS_TRANSACTION_LINE_FIELD_NAMES` are
 * 1:1 with `backend/src/models/PosTransaction.js` and
 * `backend/src/models/PosTransactionLine.js` (including the Sequelize
 * `created_at`/`updated_at` timestamp columns). They exist so the mapping
 * test can assert *every* current legacy model field is classified into a
 * first-class target column, `additional_fees`, or an explicit
 * `legacy_snapshot` allowlist entry — never silently dropped.
 */

export const POS_TRANSACTION_FIELD_NAMES = Object.freeze([
    'pos_transaction_id',
    'invoice_number',
    'document_type',
    'document_context',
    'idempotency_key',
    'request_hash',
    'cashier_id',
    'shift_id',
    'terminal_id',
    'order_source',
    'order_method',
    'fulfillment_status',
    'location_id',
    'tracking_pin',
    'customer_name',
    'customer_phone',
    'customer_email',
    'buyer_tin',
    'buyer_business_style',
    'buyer_address',
    'delivery_address',
    'delivery_latitude',
    'delivery_longitude',
    'scheduled_for',
    'special_instructions',
    'delivery_fee',
    'store_customer_id',
    'outside_radius_flag',
    'accepted_by',
    'accepted_at',
    'payment_type',
    'cash_received',
    'change_amount',
    'payment_status',
    'payment_collected_at',
    'payment_collected_by',
    'payment_collected_shift_id',
    'payment_collected_terminal_id',
    'payment_reference',
    'payment_checkout_url',
    'payment_provider',
    'payment_session_reference',
    'subtotal_amount',
    'vatable_sales',
    'vat_amount',
    'vat_exempt_sales',
    'zero_rated_sales',
    'discount_amount',
    'discount_label_snapshot',
    'discount_rate_snapshot',
    'service_fee_amount',
    'service_fee_label_snapshot',
    'service_fee_method_snapshot',
    'service_fee_overridden',
    'fnb_check_id',
    'fnb_table_id',
    'fnb_table_label_snapshot',
    'fnb_guest_count',
    'fnb_server_id',
    'restaurant_service_charge_amount',
    'restaurant_service_charge_label_snapshot',
    'restaurant_service_charge_rate_snapshot',
    'restaurant_service_charge_taxable',
    'fnb_metadata',
    'total_amount',
    'status',
    'voided_at',
    'voided_by',
    'void_reason',
    'fiscal_lifecycle_state',
    'fiscal_reprint_count',
    'fiscal_void_event_hash',
    'fiscal_document_template_version',
    'fiscal_document_hash',
    'fiscal_document_snapshot',
    'created_at',
    'updated_at'
]);

export const POS_TRANSACTION_LINE_FIELD_NAMES = Object.freeze([
    'line_id',
    'pos_transaction_id',
    'item_id',
    'quantity',
    'unit_of_measure',
    'cost_snapshot',
    'stock_effect_type',
    'stock_exempt_reason',
    'sale_price',
    'sale_price_overridden',
    'price_override_reason',
    'line_subtotal',
    'vat_type_snapshot',
    'vat_rate_snapshot',
    'fnb_course_snapshot',
    'fnb_modifiers_snapshot',
    'fnb_special_instructions',
    'fnb_kitchen_station_snapshot',
    'created_at',
    'updated_at'
]);

export function phase14ContextFixture(overrides = {}) {
    return {
        legacyTenantDbName: 'sku_alpha',
        targetBusinessDbName: 'dgfy_business_alpha',
        expectedBusinessId: 'biz-uuid-1',
        resolvedLocationId: 55,
        resolvedTerminalId: 66,
        resolvedCashierId: 77,
        resolvedAvailmentId: 9001,
        resolvedProductId: 8801,
        resolvedProductName: 'House Blend Coffee',
        ...overrides
    };
}

/**
 * A maximally-populated finalized (legacy `status: 'completed'`) header with
 * a distinct, non-null sentinel value in every current `PosTransaction`
 * field, so field-coverage tests can prove nothing is silently dropped.
 */
export function legacyFullPosTransactionFixture(overrides = {}) {
    return {
        pos_transaction_id: 9101,
        invoice_number: 'INV-2026-0001',
        document_type: 'fiscal_invoice',
        document_context: 'fiscal',
        idempotency_key: 'idem-key-9101',
        request_hash: 'req-hash-9101',
        cashier_id: 501,
        shift_id: 601,
        terminal_id: 'TERMINAL-01',
        order_source: 'in_store',
        order_method: 'dine_in',
        fulfillment_status: 'completed',
        location_id: 701,
        tracking_pin: 'PIN-1234',
        customer_name: 'Jane Buyer',
        customer_phone: '+639170000001',
        customer_email: 'jane.buyer@example.test',
        buyer_tin: '123-456-789-000',
        buyer_business_style: 'Retail Trading',
        buyer_address: '123 Buyer St, Quezon City',
        delivery_address: '456 Delivery Ave, Quezon City',
        delivery_latitude: '14.65000000',
        delivery_longitude: '121.03000000',
        scheduled_for: '2026-07-10T09:00:00.000Z',
        special_instructions: 'Ring doorbell twice',
        delivery_fee: '25.0000',
        store_customer_id: 8001,
        outside_radius_flag: true,
        accepted_by: 502,
        accepted_at: '2026-07-10T08:05:00.000Z',
        payment_type: 'gcash',
        cash_received: '500.0000',
        change_amount: '10.5000',
        payment_status: 'paid',
        payment_collected_at: '2026-07-10T08:10:00.000Z',
        payment_collected_by: 503,
        payment_collected_shift_id: 602,
        payment_collected_terminal_id: 'TERMINAL-02',
        payment_reference: 'PAYREF-9101',
        payment_checkout_url: 'https://pay.example.test/checkout/9101',
        payment_provider: 'paymongo',
        payment_session_reference: 'SESSREF-9101',
        subtotal_amount: '1000.0000',
        vatable_sales: '900.0000',
        vat_amount: '108.0000',
        vat_exempt_sales: '100.0000',
        zero_rated_sales: '0.0000',
        discount_amount: '50.0000',
        discount_label_snapshot: 'Loyalty Discount',
        discount_rate_snapshot: '0.0500',
        service_fee_amount: '15.0000',
        service_fee_label_snapshot: 'Service Charge',
        service_fee_method_snapshot: 'dine_in',
        service_fee_overridden: false,
        fnb_check_id: 901,
        fnb_table_id: 902,
        fnb_table_label_snapshot: 'Table 12',
        fnb_guest_count: 4,
        fnb_server_id: 504,
        restaurant_service_charge_amount: '30.0000',
        restaurant_service_charge_label_snapshot: 'Restaurant Service Charge',
        restaurant_service_charge_rate_snapshot: '0.1000',
        restaurant_service_charge_taxable: true,
        fnb_metadata: { course_pacing: 'staggered' },
        total_amount: '1058.0000',
        status: 'completed',
        voided_at: null,
        voided_by: null,
        void_reason: null,
        fiscal_lifecycle_state: 'original',
        fiscal_reprint_count: 0,
        fiscal_void_event_hash: null,
        fiscal_document_template_version: 'v1',
        fiscal_document_hash: 'fiscal-hash-9101',
        fiscal_document_snapshot: { total_amount: '1058.0000' },
        created_at: '2026-07-10T08:00:00.000Z',
        updated_at: '2026-07-10T08:15:00.000Z',
        ...overrides
    };
}

/**
 * A voided header exercising D-14-04/D-14-05: reuses `status: 'voided'`
 * (no new enum value) with void metadata preserved only in the snapshot.
 */
export function legacyVoidedPosTransactionFixture(overrides = {}) {
    return legacyFullPosTransactionFixture({
        pos_transaction_id: 9102,
        invoice_number: 'INV-2026-0002',
        status: 'voided',
        voided_at: '2026-07-10T09:30:00.000Z',
        voided_by: 505,
        void_reason: 'Customer requested cancellation',
        ...overrides
    });
}

export function legacyPosTransactionUnsupportedStatusFixture(overrides = {}) {
    return legacyFullPosTransactionFixture({
        pos_transaction_id: 9103,
        invoice_number: 'INV-2026-0003',
        status: 'draft',
        ...overrides
    });
}

/**
 * D-14-02/D-14-03: location/terminal/cashier are all present on the legacy
 * row but none resolve to a target ID — every attribution finding fires
 * while the availment is still inserted.
 */
export function legacyPosTransactionUnmappedAttributionFixture(overrides = {}) {
    return legacyFullPosTransactionFixture({
        pos_transaction_id: 9104,
        invoice_number: 'INV-2026-0004',
        location_id: 9999,
        terminal_id: 'GHOST-TERMINAL',
        cashier_id: 9998,
        ...overrides
    });
}

/** Legacy row with no location/terminal/cashier attribution at all. */
export function legacyPosTransactionWithoutAttributionFixture(overrides = {}) {
    return legacyFullPosTransactionFixture({
        pos_transaction_id: 9105,
        invoice_number: 'INV-2026-0005',
        location_id: null,
        terminal_id: null,
        cashier_id: null,
        ...overrides
    });
}

export function legacyPosTransactionTrainingTestFixture(overrides = {}) {
    return legacyFullPosTransactionFixture({
        pos_transaction_id: 9106,
        invoice_number: 'INV-2026-0006',
        document_context: 'training_test',
        ...overrides
    });
}

/**
 * A maximally-populated line with a distinct, non-null sentinel value in
 * every current `PosTransactionLine` field.
 */
export function legacyFullPosTransactionLineFixture(overrides = {}) {
    return {
        line_id: 9201,
        pos_transaction_id: 9101,
        item_id: 401,
        quantity: '2.000000000000',
        unit_of_measure: 'cup',
        cost_snapshot: '55.0000',
        stock_effect_type: 'inventory_issue',
        stock_exempt_reason: null,
        sale_price: '125.0000',
        sale_price_overridden: false,
        price_override_reason: null,
        line_subtotal: '250.0000',
        vat_type_snapshot: 'vatable',
        vat_rate_snapshot: '0.1200',
        fnb_course_snapshot: 'main',
        fnb_modifiers_snapshot: [{ modifier: 'extra shot', price: '20.0000' }],
        fnb_special_instructions: 'No sugar',
        fnb_kitchen_station_snapshot: { station: 'bar' },
        created_at: '2026-07-10T08:00:05.000Z',
        updated_at: '2026-07-10T08:00:05.000Z',
        ...overrides
    };
}

export function legacyPosTransactionLineMissingParentFixture(overrides = {}) {
    return legacyFullPosTransactionLineFixture({
        line_id: 9202,
        pos_transaction_id: 9999,
        ...overrides
    });
}

export function legacyPosTransactionLineMissingProductFixture(overrides = {}) {
    return legacyFullPosTransactionLineFixture({
        line_id: 9203,
        item_id: 9999,
        ...overrides
    });
}

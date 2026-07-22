import {
    MAPPING_REASON_CODES,
    OUT_OF_SCOPE_LEGACY_TABLES,
    isInScopeLegacyTable,
    buildLegacyPosSnapshot,
    buildLegacyPosLineSnapshot,
    mapPosTransactionToAvailment,
    mapPosTransactionLineToAvailmentItem
} from '../src/data/mappings.js';
import {
    POS_TRANSACTION_FIELD_NAMES,
    POS_TRANSACTION_LINE_FIELD_NAMES,
    phase14ContextFixture,
    legacyFullPosTransactionFixture,
    legacyVoidedPosTransactionFixture,
    legacyPosTransactionUnsupportedStatusFixture,
    legacyPosTransactionUnmappedAttributionFixture,
    legacyPosTransactionWithoutAttributionFixture,
    legacyPosTransactionTrainingTestFixture,
    legacyFullPosTransactionLineFixture,
    legacyPosTransactionLineMissingParentFixture,
    legacyPosTransactionLineMissingProductFixture
} from './fixtures/phase14/legacySalesRecords.js';

// ---------------------------------------------------------------------------
// Field classification — proves every current legacy model field maps to a
// first-class target column, additional_fees, or an explicit snapshot
// allowlist entry, with no gaps and no arbitrary spread.
// ---------------------------------------------------------------------------

// Consumed directly into a first-class availments column (or additional_fees)
// and never duplicated into legacy_snapshot.
const HEADER_DIRECT_ONLY_FIELDS = [
    'subtotal_amount',
    'discount_amount',
    'vat_amount',
    'vat_exempt_sales',
    'total_amount',
    'service_fee_amount',
    'delivery_fee',
    'created_at',
    'updated_at'
];

// Drive a resolved first-class column AND survive in the snapshot under a
// renamed (legacy_-prefixed) key, per D-14-01/02/03/04/05.
const HEADER_DUAL_PURPOSE_RENAME_MAP = {
    location_id: 'legacy_location_id',
    terminal_id: 'legacy_terminal_id',
    cashier_id: 'legacy_cashier_id',
    shift_id: 'legacy_shift_id',
    status: 'legacy_status'
};

const HEADER_SNAPSHOT_ONLY_FIELDS = POS_TRANSACTION_FIELD_NAMES.filter(
    (field) => !HEADER_DIRECT_ONLY_FIELDS.includes(field) && !Object.hasOwn(HEADER_DUAL_PURPOSE_RENAME_MAP, field)
);

const EXPECTED_LEGACY_POS_SNAPSHOT_KEYS = [
    ...HEADER_SNAPSHOT_ONLY_FIELDS,
    ...Object.values(HEADER_DUAL_PURPOSE_RENAME_MAP)
].sort();

const LINE_DIRECT_ONLY_FIELDS = [
    'quantity',
    'sale_price',
    'stock_effect_type',
    'vat_type_snapshot',
    'vat_rate_snapshot',
    'created_at',
    'updated_at'
];

const LINE_DUAL_PURPOSE_RENAME_MAP = {
    pos_transaction_id: 'legacy_pos_transaction_id',
    item_id: 'legacy_item_id'
};

const LINE_SNAPSHOT_ONLY_FIELDS = POS_TRANSACTION_LINE_FIELD_NAMES.filter(
    (field) => !LINE_DIRECT_ONLY_FIELDS.includes(field) && !Object.hasOwn(LINE_DUAL_PURPOSE_RENAME_MAP, field)
);

const EXPECTED_LEGACY_POS_LINE_SNAPSHOT_KEYS = [
    ...LINE_SNAPSHOT_ONLY_FIELDS,
    ...Object.values(LINE_DUAL_PURPOSE_RENAME_MAP)
].sort();

describe('Phase 14 field classification completeness', () => {
    test('every current PosTransaction field is classified as direct-only, dual-purpose, or snapshot-only with no gaps or overlaps', () => {
        const classifiedFields = new Set([
            ...HEADER_DIRECT_ONLY_FIELDS,
            ...Object.keys(HEADER_DUAL_PURPOSE_RENAME_MAP),
            ...HEADER_SNAPSHOT_ONLY_FIELDS
        ]);

        expect(classifiedFields.size).toBe(POS_TRANSACTION_FIELD_NAMES.length);
        POS_TRANSACTION_FIELD_NAMES.forEach((field) => {
            expect(classifiedFields.has(field)).toBe(true);
        });
    });

    test('every current PosTransactionLine field is classified as direct-only, dual-purpose, or snapshot-only with no gaps or overlaps', () => {
        const classifiedFields = new Set([
            ...LINE_DIRECT_ONLY_FIELDS,
            ...Object.keys(LINE_DUAL_PURPOSE_RENAME_MAP),
            ...LINE_SNAPSHOT_ONLY_FIELDS
        ]);

        expect(classifiedFields.size).toBe(POS_TRANSACTION_LINE_FIELD_NAMES.length);
        POS_TRANSACTION_LINE_FIELD_NAMES.forEach((field) => {
            expect(classifiedFields.has(field)).toBe(true);
        });
    });

    test('buildLegacyPosSnapshot exposes exactly the classified snapshot keys, never an arbitrary spread', () => {
        const snapshot = buildLegacyPosSnapshot(legacyFullPosTransactionFixture());
        expect(Object.keys(snapshot).sort()).toEqual(EXPECTED_LEGACY_POS_SNAPSHOT_KEYS);
    });

    test('buildLegacyPosLineSnapshot exposes exactly the classified snapshot keys, never an arbitrary spread', () => {
        const snapshot = buildLegacyPosLineSnapshot(legacyFullPosTransactionLineFixture());
        expect(Object.keys(snapshot).sort()).toEqual(EXPECTED_LEGACY_POS_LINE_SNAPSHOT_KEYS);
    });

    test('an unexpected new legacy header column never leaks into target_payload or the snapshot', () => {
        const result = mapPosTransactionToAvailment(
            legacyFullPosTransactionFixture({ unexpected_future_column: 'SHOULD-NEVER-LEAK' }),
            phase14ContextFixture()
        );

        expect(JSON.stringify(result)).not.toMatch(/SHOULD-NEVER-LEAK/);
    });

    test('an unexpected new legacy line column never leaks into target_payload or the snapshot', () => {
        const result = mapPosTransactionLineToAvailmentItem(
            legacyFullPosTransactionLineFixture({ unexpected_future_column: 'SHOULD-NEVER-LEAK' }),
            phase14ContextFixture()
        );

        expect(JSON.stringify(result)).not.toMatch(/SHOULD-NEVER-LEAK/);
    });
});

// ---------------------------------------------------------------------------
// mapPosTransactionToAvailment
// ---------------------------------------------------------------------------

describe('mapPosTransactionToAvailment', () => {
    test('maps a finalized header with a complete, exact target payload', () => {
        const legacy = legacyFullPosTransactionFixture();
        const result = mapPosTransactionToAvailment(legacy, phase14ContextFixture());

        expect(result.operation).toBe('insert');
        expect(result.entity_type).toBe('availment');
        expect(result.target_table).toBe('availments');
        expect(result.target_database).toBe('dgfy_business_alpha');
        expect(result.findings).toEqual([]);

        expect(Object.keys(result.target_payload).sort()).toEqual([
            'additional_fees',
            'branch_id',
            'business_id',
            'cashier_account_id',
            'created_at',
            'discount_amount',
            'document_context',
            'finalized_at',
            'legacy_snapshot',
            'shift_id',
            'source_reference',
            'source_system',
            'status',
            'subtotal_amount',
            'terminal_id',
            'total_amount',
            'updated_at',
            'vat_amount',
            'vat_exempt_amount'
        ].sort());

        expect(result.target_payload).toMatchObject({
            business_id: 'biz-uuid-1',
            branch_id: 55,
            terminal_id: 66,
            cashier_account_id: 77,
            shift_id: null,
            status: 'finalized',
            document_context: 'fiscal',
            subtotal_amount: '1000.0000',
            discount_amount: '50.0000',
            vat_amount: '108.0000',
            vat_exempt_amount: '100.0000',
            total_amount: '1058.0000',
            source_system: 'legacy_migration',
            source_reference: 'legacy_pos:INV-2026-0001',
            created_at: legacy.created_at,
            updated_at: legacy.updated_at,
            finalized_at: legacy.created_at
        });

        // Serialized payloads use the real source field name, never the
        // CONTEXT-doc shorthand `service_fee`.
        expect(result.target_payload.additional_fees).toEqual({
            service_fee_amount: '15.0000',
            delivery_fee: '25.0000'
        });

        expect(result.legacy_id_map_key).toEqual({
            legacy_source: 'sku_alpha',
            legacy_table: 'pos_transactions',
            legacy_id: '9101'
        });
    });

    test('maps a voided header to status "voided" with void metadata only in the snapshot (D-14-04/D-14-05)', () => {
        const legacy = legacyVoidedPosTransactionFixture();
        const result = mapPosTransactionToAvailment(legacy, phase14ContextFixture());

        expect(result.operation).toBe('insert');
        expect(result.target_payload.status).toBe('voided');
        expect(result.target_payload.source_system).toBe('legacy_migration');
        expect(result.target_payload).not.toHaveProperty('voided_at');
        expect(result.target_payload).not.toHaveProperty('voided_by');

        const snapshot = result.target_payload.legacy_snapshot.legacy_pos;
        expect(snapshot.legacy_status).toBe('voided');
        expect(snapshot.voided_at).toBe(legacy.voided_at);
        expect(snapshot.voided_by).toBe(legacy.voided_by);
        expect(snapshot.void_reason).toBe(legacy.void_reason);
    });

    test('unsupported status is a blocking skip with unsupported_sale_status finding', () => {
        const result = mapPosTransactionToAvailment(
            legacyPosTransactionUnsupportedStatusFixture(),
            phase14ContextFixture()
        );

        expect(result.operation).toBe('skip');
        expect(result.target_payload).toBeNull();
        expect(result.findings).toHaveLength(1);
        expect(result.findings[0].reason_code).toBe(MAPPING_REASON_CODES.UNSUPPORTED_SALE_STATUS);
        expect(result.findings[0].severity).toBe('skip');
    });

    test('unresolved location/terminal/cashier attribution stays a non-blocking insert with three findings and preserved raw values', () => {
        const legacy = legacyPosTransactionUnmappedAttributionFixture();
        const result = mapPosTransactionToAvailment(legacy, phase14ContextFixture({
            resolvedLocationId: null,
            resolvedTerminalId: null,
            resolvedCashierId: null
        }));

        expect(result.operation).toBe('insert');
        expect(result.target_payload.branch_id).toBeNull();
        expect(result.target_payload.terminal_id).toBeNull();
        expect(result.target_payload.cashier_account_id).toBeNull();

        const reasonCodes = result.findings.map((finding) => finding.reason_code).sort();
        expect(reasonCodes).toEqual([
            MAPPING_REASON_CODES.SALE_CASHIER_NOT_MAPPED,
            MAPPING_REASON_CODES.SALE_LOCATION_NOT_MAPPED,
            MAPPING_REASON_CODES.SALE_TERMINAL_NOT_MAPPED
        ].sort());
        result.findings.forEach((finding) => expect(finding.severity).toBe('orphan'));

        const snapshot = result.target_payload.legacy_snapshot.legacy_pos;
        expect(snapshot.legacy_location_id).toBe(legacy.location_id);
        expect(snapshot.legacy_terminal_id).toBe(legacy.terminal_id);
        expect(snapshot.legacy_cashier_id).toBe(legacy.cashier_id);
    });

    test('no attribution present on the legacy row produces no attribution findings', () => {
        const result = mapPosTransactionToAvailment(
            legacyPosTransactionWithoutAttributionFixture(),
            phase14ContextFixture({ resolvedLocationId: null, resolvedTerminalId: null, resolvedCashierId: null })
        );

        expect(result.operation).toBe('insert');
        expect(result.findings).toEqual([]);
        expect(result.target_payload.branch_id).toBeNull();
        expect(result.target_payload.terminal_id).toBeNull();
        expect(result.target_payload.cashier_account_id).toBeNull();
    });

    test('legacy shift_id is never mapped to target shift_id, only preserved in the snapshot', () => {
        const legacy = legacyFullPosTransactionFixture({ shift_id: 4242 });
        const result = mapPosTransactionToAvailment(legacy, phase14ContextFixture());

        expect(result.target_payload.shift_id).toBeNull();
        expect(result.target_payload.legacy_snapshot.legacy_pos.legacy_shift_id).toBe(4242);
    });

    test('document_context "training_test" maps to null with the original value preserved in the snapshot', () => {
        const result = mapPosTransactionToAvailment(
            legacyPosTransactionTrainingTestFixture(),
            phase14ContextFixture()
        );

        expect(result.target_payload.document_context).toBeNull();
        expect(result.target_payload.legacy_snapshot.legacy_pos.document_context).toBe('training_test');
    });

    test('preserves historical created_at/updated_at rather than a migration timestamp', () => {
        const legacy = legacyFullPosTransactionFixture({
            created_at: '2020-01-01T00:00:00.000Z',
            updated_at: '2020-01-02T00:00:00.000Z'
        });
        const result = mapPosTransactionToAvailment(legacy, phase14ContextFixture());

        expect(result.target_payload.created_at).toBe('2020-01-01T00:00:00.000Z');
        expect(result.target_payload.updated_at).toBe('2020-01-02T00:00:00.000Z');
        expect(result.target_payload.finalized_at).toBe('2020-01-01T00:00:00.000Z');
    });
});

// ---------------------------------------------------------------------------
// mapPosTransactionLineToAvailmentItem
// ---------------------------------------------------------------------------

describe('mapPosTransactionLineToAvailmentItem', () => {
    test('maps a normal line with a complete, exact target payload', () => {
        const legacy = legacyFullPosTransactionLineFixture();
        const result = mapPosTransactionLineToAvailmentItem(legacy, phase14ContextFixture());

        expect(result.operation).toBe('insert');
        expect(result.entity_type).toBe('availment_item');
        expect(result.target_table).toBe('availment_items');
        expect(result.target_database).toBe('dgfy_business_alpha');
        expect(result.findings).toEqual([]);

        expect(Object.keys(result.target_payload).sort()).toEqual([
            'availment_id',
            'business_id',
            'created_at',
            'legacy_snapshot',
            'product_id',
            'product_name',
            'quantity',
            'source_reference',
            'source_system',
            'stock_effect_type',
            'tax_rate',
            'tax_treatment',
            'unit_price',
            'updated_at'
        ].sort());

        expect(result.target_payload).toMatchObject({
            business_id: 'biz-uuid-1',
            availment_id: 9001,
            product_id: 8801,
            product_name: 'House Blend Coffee',
            quantity: '2.000000000000',
            unit_price: '125.0000',
            stock_effect_type: 'inventory_issue',
            tax_treatment: 'vatable',
            tax_rate: '0.1200',
            source_system: 'legacy_migration',
            source_reference: 'legacy_pos_line:9201',
            created_at: legacy.created_at,
            updated_at: legacy.updated_at
        });

        expect(result.legacy_id_map_key).toEqual({
            legacy_source: 'sku_alpha',
            legacy_table: 'pos_transaction_lines',
            legacy_id: '9201'
        });
    });

    test('missing resolved parent availment is a blocking skip with availment_parent_not_mapped', () => {
        const result = mapPosTransactionLineToAvailmentItem(
            legacyPosTransactionLineMissingParentFixture(),
            phase14ContextFixture({ resolvedAvailmentId: null })
        );

        expect(result.operation).toBe('skip');
        expect(result.target_payload).toBeNull();
        expect(result.findings).toHaveLength(1);
        expect(result.findings[0].reason_code).toBe(MAPPING_REASON_CODES.AVAILMENT_PARENT_NOT_MAPPED);
    });

    test('missing resolved product is a blocking skip with sale_product_not_mapped', () => {
        const result = mapPosTransactionLineToAvailmentItem(
            legacyPosTransactionLineMissingProductFixture(),
            phase14ContextFixture({ resolvedProductId: null })
        );

        expect(result.operation).toBe('skip');
        expect(result.target_payload).toBeNull();
        expect(result.findings).toHaveLength(1);
        expect(result.findings[0].reason_code).toBe(MAPPING_REASON_CODES.SALE_PRODUCT_NOT_MAPPED);
    });

    test('missing both required dependencies still blocks on the parent-availment check first, never inserting a partially linked row', () => {
        const result = mapPosTransactionLineToAvailmentItem(
            legacyPosTransactionLineMissingParentFixture(),
            phase14ContextFixture({ resolvedAvailmentId: null, resolvedProductId: null })
        );

        expect(result.operation).toBe('skip');
        expect(result.target_payload).toBeNull();
        expect(result.findings[0].reason_code).toBe(MAPPING_REASON_CODES.AVAILMENT_PARENT_NOT_MAPPED);
    });
});

// ---------------------------------------------------------------------------
// Reason codes and out-of-scope table membership
// ---------------------------------------------------------------------------

describe('Phase 14 mapping reason codes', () => {
    test('declares the sales-history-specific finding reason codes', () => {
        expect(MAPPING_REASON_CODES.UNSUPPORTED_SALE_STATUS).toBe('unsupported_sale_status');
        expect(MAPPING_REASON_CODES.SALE_LOCATION_NOT_MAPPED).toBe('sale_location_not_mapped');
        expect(MAPPING_REASON_CODES.SALE_TERMINAL_NOT_MAPPED).toBe('sale_terminal_not_mapped');
        expect(MAPPING_REASON_CODES.SALE_CASHIER_NOT_MAPPED).toBe('sale_cashier_not_mapped');
        expect(MAPPING_REASON_CODES.AVAILMENT_PARENT_NOT_MAPPED).toBe('availment_parent_not_mapped');
        expect(MAPPING_REASON_CODES.SALE_PRODUCT_NOT_MAPPED).toBe('sale_product_not_mapped');
    });
});

describe('Phase 14 scope unblock (SHM-02)', () => {
    test('pos_transaction_lines is no longer in OUT_OF_SCOPE_LEGACY_TABLES', () => {
        expect(OUT_OF_SCOPE_LEGACY_TABLES).not.toContain('pos_transaction_lines');
        expect(isInScopeLegacyTable('pos_transaction_lines')).toBe(true);
    });

    test('pos_transactions remains in scope (already unblocked in Phase 12)', () => {
        expect(isInScopeLegacyTable('pos_transactions')).toBe(true);
    });
});

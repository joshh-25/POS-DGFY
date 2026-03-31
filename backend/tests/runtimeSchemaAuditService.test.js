import { auditRuntimeSchemaReadiness } from '../src/services/runtimeSchemaAuditService.js';
import { jest } from '@jest/globals';

const buildHealthySequelizeMock = () => ({
    query: jest.fn(async () => ([
        { name: '20260325000002-create-pos-transactions.cjs' },
        { name: '20260325000003-add-pos-reference-type-and-settings.cjs' },
        { name: '20260327000001-add-pos-strict-compliance-setting.cjs' },
        { name: '20260327000002-add-pos-discount-snapshot-columns.cjs' },
        { name: '20260328000001-add-pos-order-method-fees.cjs' },
        { name: '20260328000002-widen-pos-discount-rate-snapshot.cjs' },
        { name: '20260328000003-add-pos-catalog-overrides-and-user-roles.cjs' },
        { name: '20260330000001-add-pos-terminal-shifts-and-cash-events.cjs' },
        { name: '20260330000002-add-show-in-pos-filter-to-item-folders.cjs' },
        { name: '20260330000003-create-tenant-locations.cjs' },
        { name: '20260330000004-add-storefront-operational-settings.cjs' },
        { name: '20260330000005-add-pickup-to-pos-order-method-enums.cjs' },
        { name: '20260330000006-expand-pos-transactions-for-online-orders.cjs' },
        { name: '20260330000007-create-store-customers-and-addresses.cjs' },
        { name: '20260331000008-make-pos-cashier-nullable-for-online-store.cjs' },
        { name: '20260331000009-create-storefront-discovery-index.cjs' },
        { name: '20260331000010-add-primary-storefront-location.cjs' }
    ])),
    getQueryInterface: () => ({
        describeTable: jest.fn(async (tableName) => {
            const map = {
                tenants: {
                    id: {},
                    name: {},
                    company_token: {},
                    db_name: {},
                    db_host: {},
                    status: {},
                    plan: {},
                    subscription_status: {},
                    current_period_end: {},
                    payment_method: {},
                    rejection_reason: {}
                },
                users: {
                    user_id: {},
                    role: {},
                    is_master_admin: {},
                    deleted_at: {}
                },
                items: {
                    item_id: {},
                    vat_type: {}
                },
                item_folders: {
                    folder_id: {},
                    name: {},
                    show_in_pos_filter: {}
                },
                pos_catalog_overrides: {
                    pos_catalog_override_id: {},
                    item_id: {},
                    pos_visible: {},
                    pos_image_url: {}
                },
                pos_transactions: {
                    pos_transaction_id: {},
                    cashier_id: { allowNull: true },
                    discount_rate_snapshot: {},
                    service_fee_amount: {},
                    service_fee_label_snapshot: {},
                    service_fee_method_snapshot: {},
                    service_fee_overridden: {},
                    shift_id: {},
                    order_source: {},
                    fulfillment_status: {},
                    location_id: {},
                    tracking_pin: {},
                    delivery_fee: {},
                    store_customer_id: {},
                    accepted_by: {},
                    accepted_at: {}
                },
                pos_transaction_lines: {
                    line_id: {},
                    vat_type_snapshot: {},
                    vat_rate_snapshot: {},
                    sale_price_overridden: {},
                    price_override_reason: {}
                },
                pos_terminal_shifts: {
                    pos_terminal_shift_id: {},
                    business_date: {},
                    terminal_id: {},
                    cashier_id: {},
                    status: {}
                },
                pos_cash_drawer_events: {
                    pos_cash_drawer_event_id: {},
                    pos_terminal_shift_id: {},
                    event_type: {},
                    amount: {},
                    recorded_by: {}
                },
                system_settings: {
                    setting_id: {},
                    setting_key: {},
                    setting_value: {},
                    data_type: {}
                },
                tenant_locations: {
                    location_id: {},
                    tenant_id: {},
                    name: {},
                    address_line: {},
                    latitude: {},
                    longitude: {},
                    is_active: {},
                    is_primary_storefront: {}
                },
                store_customers: {
                    customer_id: {},
                    email: {},
                    password_hash: {},
                    name: {},
                    is_active: {}
                },
                customer_addresses: {
                    address_id: {},
                    customer_id: {},
                    address_line: {},
                    is_default: {}
                },
                storefront_discovery_index: {
                    storefront_discovery_index_id: {},
                    tenant_id: {},
                    slug: {},
                    is_visible: {},
                    last_synced_at: {}
                }
            };

            if (!map[tableName]) throw new Error(`Unknown table ${tableName}`);
            return map[tableName];
        })
    })
});

describe('runtimeSchemaAuditService', () => {
    it('returns healthy when required migrations and columns are present', async () => {
        const result = await auditRuntimeSchemaReadiness({
            sequelizeInstance: buildHealthySequelizeMock()
        });

        expect(result.status).toBe('healthy');
        expect(result.missingMigrations).toEqual([]);
        expect(result.missingColumns).toEqual([]);
        expect(result.issueCount).toBe(0);
    });

    it('returns degraded when required migration and required columns are missing', async () => {
        const mock = buildHealthySequelizeMock();
        mock.query = jest.fn(async () => ([
            { name: '20260325000002-create-pos-transactions.cjs' }
        ]));
        mock.getQueryInterface = () => ({
            describeTable: jest.fn(async (tableName) => {
                if (tableName === 'items') return { item_id: {} };
                if (tableName === 'item_folders') return { folder_id: {}, name: {} };
                if (tableName === 'users') return { user_id: {} };
                if (tableName === 'tenants') return { id: {}, name: {}, company_token: {}, db_name: {}, status: {}, plan: {} };
                if (tableName === 'pos_catalog_overrides') return { pos_catalog_override_id: {}, item_id: {} };
                if (tableName === 'pos_transactions') return { pos_transaction_id: {} };
                if (tableName === 'pos_transaction_lines') return { line_id: {} };
                if (tableName === 'pos_terminal_shifts') return { pos_terminal_shift_id: {} };
                if (tableName === 'pos_cash_drawer_events') return { pos_cash_drawer_event_id: {} };
                if (tableName === 'system_settings') return { setting_id: {}, setting_key: {}, setting_value: {}, data_type: {} };
                return {};
            })
        });

        const result = await auditRuntimeSchemaReadiness({
            sequelizeInstance: mock
        });

        expect(result.status).toBe('degraded');
        expect(result.missingMigrations.length).toBeGreaterThan(0);
        expect(result.missingColumns).toEqual(expect.arrayContaining([
            expect.objectContaining({ table: 'items', column: 'vat_type' }),
            expect.objectContaining({ table: 'item_folders', column: 'show_in_pos_filter' }),
            expect.objectContaining({ table: 'users', column: 'role' }),
            expect.objectContaining({ table: 'pos_catalog_overrides', column: 'pos_visible' }),
            expect.objectContaining({ table: 'pos_transactions', column: 'service_fee_amount' })
        ]));
    });

    it('returns degraded when cashier_id nullability contract drifts from online-store requirements', async () => {
        const mock = buildHealthySequelizeMock();
        mock.getQueryInterface = () => ({
            describeTable: jest.fn(async (tableName) => {
                const table = await buildHealthySequelizeMock().getQueryInterface().describeTable(tableName);
                if (tableName === 'pos_transactions') {
                    return {
                        ...table,
                        cashier_id: { allowNull: false }
                    };
                }
                return table;
            })
        });

        const result = await auditRuntimeSchemaReadiness({
            sequelizeInstance: mock
        });

        expect(result.status).toBe('degraded');
        expect(result.issues).toEqual(expect.arrayContaining([
            expect.objectContaining({
                scope: 'schema',
                type: 'invalid_column_contract',
                table: 'pos_transactions',
                column: 'cashier_id'
            })
        ]));
    });

    it('reports warnings for optional columns without degrading healthy required checks', async () => {
        const mock = buildHealthySequelizeMock();
        mock.getQueryInterface = () => ({
            describeTable: jest.fn(async (tableName) => {
                if (tableName === 'tenants') {
                    return {
                        id: {},
                        name: {},
                        company_token: {},
                        db_name: {},
                        db_host: {},
                        status: {},
                        plan: {}
                    };
                }
                return buildHealthySequelizeMock().getQueryInterface().describeTable(tableName);
            })
        });

        const result = await auditRuntimeSchemaReadiness({
            sequelizeInstance: mock
        });

        expect(result.status).toBe('healthy');
        expect(result.warningCount).toBeGreaterThan(0);
        expect(result.optionalMissingColumns).toEqual(expect.arrayContaining([
            expect.objectContaining({ table: 'tenants', column: 'payment_method' })
        ]));
    });
});

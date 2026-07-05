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
        { name: '20260331000010-add-primary-storefront-location.cjs' },
        { name: '20260406000001-add-tenant-compliance-program.cjs' },
        { name: '20260407000002-compliance-hardening-phase1-2.cjs' },
        { name: '20260408000004-add-pos-operation-replays.cjs' },
        { name: '20260408000005-add-security-signal-audit-enum.cjs' },
        { name: '20260422000001-add-compliance-downgrade-override-controls.cjs' },
        { name: '20260422000002-harden-compliance-downgrade-controls.cjs' },
        { name: '20260416000007-add-multi-location-inventory-ledger.cjs' },
        { name: '20260416000008-backfill-user-location-grants.cjs' },
        { name: '20260424000001-add-storefront-branding-assets-to-discovery-index.cjs' },
        { name: '20260424000002-harden-storefront-asset-settings-constraints.cjs' },
        { name: '20260424000003-enforce-storefront-asset-settings-via-triggers.cjs' },
        { name: '20260427000001-add-storefront-pos-read-path-indexes.cjs' },
        { name: '20260428000001-add-storefront-profile-content-to-discovery-index.cjs' },
        { name: '20260429000001-add-storefront-v2-profile-fields-to-discovery-index.cjs' },
        { name: '20260429000002-create-storefront-follows.cjs' },
        { name: '20260504000001-add-customer-access-fields-to-discovery-index.cjs' },
        { name: '20260601000001-add-rmo-fiscal-document-snapshot-fields.cjs' },
        { name: '20260629000001-add-pos-always-available-contract.cjs' },
        { name: '20260705000001-add-admin-provisioned-membership-source.cjs' }
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
                    compliance_mode_state: {},
                    compliance_mode_choice_required: {},
                    compliance_profile: {},
                    compliance_mode_override_by: {},
                    compliance_mode_override_at: {},
                    compliance_mode_revert_by: {},
                    compliance_mode_revert_at: {},
                    compliance_cycle_version: {},
                    compliance_revert_last_cycle_version: {},
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
                    pos_image_url: {},
                    pos_always_available: { allowNull: false }
                },
                pos_transactions: {
                    pos_transaction_id: {},
                    document_type: {},
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
                    accepted_at: {},
                    buyer_tin: { allowNull: true },
                    buyer_business_style: { allowNull: true },
                    buyer_address: { allowNull: true },
                    fiscal_document_template_version: { allowNull: true },
                    fiscal_document_hash: { allowNull: true },
                    fiscal_document_snapshot: { allowNull: true },
                    fiscal_lifecycle_state: { allowNull: false },
                    fiscal_reprint_count: { allowNull: false },
                    fiscal_void_event_hash: { allowNull: true },
                    void_reason: { allowNull: true }
                },
                stock_movements: {
                    movement_id: {},
                    item_id: {},
                    movement_type: {},
                    quantity: {},
                    location_id: {},
                    source_location_id: {},
                    destination_location_id: {}
                },
                fifo_batches: {
                    batch_id: {},
                    item_id: {},
                    location_id: {},
                    quantity: {},
                    quantity_consumed: {}
                },
                item_location_stocks: {
                    item_location_stock_id: {},
                    item_id: {},
                    location_id: {},
                    quantity_on_hand: {}
                },
                user_location_grants: {
                    user_location_grant_id: {},
                    user_id: {},
                    location_id: {},
                    created_by: {}
                },
                tenant_compliance_artifacts: {
                    tenant_compliance_artifact_id: {},
                    tenant_id: {},
                    artifact_type: {},
                    status: {},
                    verification_status: {}
                },
                tenant_compliance_peripherals: {
                    tenant_compliance_peripheral_id: {},
                    tenant_id: {},
                    device_class: {},
                    status: {},
                    is_shared: {},
                    verification_status: {}
                },
                pos_transaction_lines: {
                    line_id: {},
                    vat_type_snapshot: {},
                    vat_rate_snapshot: {},
                    sale_price_overridden: {},
                    price_override_reason: {},
                    stock_effect_type: { allowNull: false },
                    stock_exempt_reason: { allowNull: true }
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
                pos_operation_replays: {
                    pos_operation_replay_id: {},
                    operation_key: {},
                    idempotency_key: {},
                    request_hash: {},
                    replay_status: {}
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
                storefront_follows: {
                    storefront_follow_id: {},
                    tenant_id: {},
                    storefront_slug: {},
                    visitor_fingerprint: {}
                },
                dgfy_account_tenant_memberships: {
                    id: {},
                    dgfy_account_id: {},
                    tenant_id: {},
                    tenant_user_id: {},
                    role: {},
                    status: {},
                    source: {
                        allowNull: false,
                        type: "ENUM('founder','invite','admin_handover','admin_provisioned')"
                    }
                },
                storefront_discovery_index: {
                    storefront_discovery_index_id: {},
                    tenant_id: {},
                    slug: {},
                    is_visible: {},
                    storefront_cover_image_url: {},
                    storefront_profile_image_url: {},
                    storefront_ui_v2_enabled: {},
                    storefront_categories: {},
                    storefront_gallery_images: {},
                    storefront_delivery_partners: {},
                    storefront_follow_enabled: {},
                    storefront_share_enabled: {},
                    storefront_review_summary: {},
                    customer_access_mode: {},
                    effective_customer_access_mode: {},
                    max_customer_access_mode: {},
                    inventory_display_mode: {},
                    inventory_low_stock_display_threshold: {},
                    access_capabilities: {},
                    access_limitation_reason: {},
                    customer_access_modes_enabled: {},
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
                if (tableName === 'stock_movements') return { movement_id: {} };
                if (tableName === 'fifo_batches') return { batch_id: {} };
                if (tableName === 'item_location_stocks') return { item_location_stock_id: {} };
                if (tableName === 'user_location_grants') return { user_location_grant_id: {} };
                if (tableName === 'pos_transaction_lines') return { line_id: {} };
                if (tableName === 'pos_terminal_shifts') return { pos_terminal_shift_id: {} };
                if (tableName === 'pos_cash_drawer_events') return { pos_cash_drawer_event_id: {} };
                if (tableName === 'pos_operation_replays') return { pos_operation_replay_id: {} };
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
            expect.objectContaining({ table: 'pos_transactions', column: 'service_fee_amount' }),
            expect.objectContaining({ table: 'pos_transactions', column: 'buyer_tin' })
        ]));
    });

    it('returns degraded when June POS fiscal-prep migration is missing from a stale runtime', async () => {
        const mock = buildHealthySequelizeMock();
        const requiredMigration = '20260601000001-add-rmo-fiscal-document-snapshot-fields.cjs';
        mock.query = jest.fn(async () => (
            (await buildHealthySequelizeMock().query())
                .filter((row) => row.name !== requiredMigration)
        ));

        const result = await auditRuntimeSchemaReadiness({
            sequelizeInstance: mock
        });

        expect(result.status).toBe('degraded');
        expect(result.missingMigrations).toContain(requiredMigration);
        expect(result.issues).toEqual(expect.arrayContaining([
            expect.objectContaining({
                scope: 'migration',
                type: 'missing_required_migration',
                migration: requiredMigration
            })
        ]));
    });

    it('returns degraded when POS Always Available contract migration or columns are missing', async () => {
        const mock = buildHealthySequelizeMock();
        const requiredMigration = '20260629000001-add-pos-always-available-contract.cjs';
        mock.query = jest.fn(async () => (
            (await buildHealthySequelizeMock().query())
                .filter((row) => row.name !== requiredMigration)
        ));
        mock.getQueryInterface = () => ({
            describeTable: jest.fn(async (tableName) => {
                const table = await buildHealthySequelizeMock().getQueryInterface().describeTable(tableName);
                if (tableName === 'pos_catalog_overrides') {
                    const { pos_always_available, ...withoutAlwaysAvailable } = table;
                    return withoutAlwaysAvailable;
                }
                if (tableName === 'pos_transaction_lines') {
                    const { stock_effect_type, stock_exempt_reason, ...withoutStockEffect } = table;
                    return withoutStockEffect;
                }
                return table;
            })
        });

        const result = await auditRuntimeSchemaReadiness({
            sequelizeInstance: mock
        });

        expect(result.status).toBe('degraded');
        expect(result.missingMigrations).toContain(requiredMigration);
        expect(result.missingColumns).toEqual(expect.arrayContaining([
            expect.objectContaining({ table: 'pos_catalog_overrides', column: 'pos_always_available' }),
            expect.objectContaining({ table: 'pos_transaction_lines', column: 'stock_effect_type' }),
            expect.objectContaining({ table: 'pos_transaction_lines', column: 'stock_exempt_reason' })
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

    it('returns degraded when fiscal-prep POS columns have unsafe nullability', async () => {
        const mock = buildHealthySequelizeMock();
        mock.getQueryInterface = () => ({
            describeTable: jest.fn(async (tableName) => {
                const table = await buildHealthySequelizeMock().getQueryInterface().describeTable(tableName);
                if (tableName === 'pos_transactions') {
                    return {
                        ...table,
                        buyer_tin: { allowNull: false }
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
                column: 'buyer_tin',
                expected: { allowNull: true },
                actual: { allowNull: false }
            })
        ]));
    });

    it('returns degraded when DGFY membership source enum is stale', async () => {
        const mock = buildHealthySequelizeMock();
        const requiredMigration = '20260705000001-add-admin-provisioned-membership-source.cjs';
        mock.query = jest.fn(async () => (
            (await buildHealthySequelizeMock().query())
                .filter((row) => row.name !== requiredMigration)
        ));
        mock.getQueryInterface = () => ({
            describeTable: jest.fn(async (tableName) => {
                const table = await buildHealthySequelizeMock().getQueryInterface().describeTable(tableName);
                if (tableName === 'dgfy_account_tenant_memberships') {
                    return {
                        ...table,
                        source: {
                            allowNull: false,
                            type: "ENUM('founder','invite','admin_handover')"
                        }
                    };
                }
                return table;
            })
        });

        const result = await auditRuntimeSchemaReadiness({
            sequelizeInstance: mock
        });

        expect(result.status).toBe('degraded');
        expect(result.missingMigrations).toContain(requiredMigration);
        expect(result.issues).toEqual(expect.arrayContaining([
            expect.objectContaining({
                scope: 'schema',
                type: 'invalid_column_contract',
                table: 'dgfy_account_tenant_memberships',
                column: 'source',
                expected: { enumValues: ['founder', 'invite', 'admin_handover', 'admin_provisioned'] },
                actual: { enumValues: ['founder', 'invite', 'admin_handover'] }
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
                        plan: {},
                        compliance_mode_state: {},
                        compliance_mode_choice_required: {},
                        compliance_profile: {},
                        compliance_mode_override_by: {},
                        compliance_mode_override_at: {},
                        compliance_mode_revert_by: {},
                        compliance_mode_revert_at: {},
                        compliance_cycle_version: {},
                        compliance_revert_last_cycle_version: {}
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

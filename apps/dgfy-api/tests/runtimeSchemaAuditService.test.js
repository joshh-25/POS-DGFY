import {
    auditRuntimeSchemaReadiness,
    OPTIONAL_TABLE_COLUMNS,
    REQUIRED_COLUMN_CONTRACTS,
    REQUIRED_RUNTIME_MIGRATIONS,
    REQUIRED_TABLE_COLUMNS
} from '../src/services/runtimeSchemaAuditService.js';
import { jest } from '@jest/globals';

const buildHealthySequelizeMock = () => {
    const tableNames = new Set([
        ...Object.keys(REQUIRED_TABLE_COLUMNS),
        ...Object.keys(OPTIONAL_TABLE_COLUMNS)
    ]);
    const describedTables = Object.fromEntries([...tableNames].map((tableName) => {
        const requiredColumns = REQUIRED_TABLE_COLUMNS[tableName] || [];
        const optionalColumns = OPTIONAL_TABLE_COLUMNS[tableName] || [];
        const contracts = REQUIRED_COLUMN_CONTRACTS[tableName] || {};
        const columns = new Set([...requiredColumns, ...optionalColumns]);
        const definitions = Object.fromEntries([...columns].map((columnName) => {
            const contract = contracts[columnName] || {};
            const definition = {};
            if (Object.prototype.hasOwnProperty.call(contract, 'allowNull')) {
                definition.allowNull = contract.allowNull;
            }
            if (Array.isArray(contract.enumValues)) {
                definition.values = [...contract.enumValues];
            }
            return [columnName, definition];
        }));
        return [tableName, definitions];
    }));

    return {
        query: jest.fn(async () => REQUIRED_RUNTIME_MIGRATIONS.map((name) => ({ name }))),
        getQueryInterface: () => ({
            describeTable: jest.fn(async (tableName) => {
                if (!Object.prototype.hasOwnProperty.call(describedTables, tableName)) {
                    throw new Error(`Unknown fixture table: ${tableName}`);
                }
                return { ...describedTables[tableName] };
            })
        })
    };
};

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
            expect.objectContaining({ table: 'item_folders', column: 'is_active' }),
            expect.objectContaining({ table: 'users', column: 'role' }),
            expect.objectContaining({ table: 'pos_catalog_overrides', column: 'pos_visible' }),
            expect.objectContaining({ table: 'pos_transactions', column: 'service_fee_amount' }),
            expect.objectContaining({ table: 'pos_transactions', column: 'buyer_tin' }),
            expect.objectContaining({ table: 'pos_transactions', column: 'payment_collected_at' })
        ]));
    });

    it('audits registration draft migrations, required upload columns, and extraction enum values', async () => {
        const mock = buildHealthySequelizeMock();
        const requiredMigration = '20261008000001-extend-company-registration-uploads-for-drafts.cjs';
        mock.query = jest.fn(async () => (
            (await buildHealthySequelizeMock().query())
                .filter((row) => row.name !== requiredMigration)
        ));
        mock.getQueryInterface = () => ({
            describeTable: jest.fn(async (tableName) => {
                const table = await buildHealthySequelizeMock().getQueryInterface().describeTable(tableName);
                if (tableName === 'company_registration_uploads') {
                    delete table.upload_status;
                    delete table.category;
                    table.extraction_status = { type: "ENUM('not_started','queued','processing','succeeded','failed','not_applicable')" };
                }
                return table;
            })
        });

        const result = await auditRuntimeSchemaReadiness({ sequelizeInstance: mock });

        expect(result.status).toBe('degraded');
        expect(result.missingMigrations).toContain(requiredMigration);
        expect(result.missingColumns).toEqual(expect.arrayContaining([
            { table: 'company_registration_uploads', column: 'upload_status' },
            { table: 'company_registration_uploads', column: 'category' }
        ]));
        expect(result.issues).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'invalid_column_contract', table: 'company_registration_uploads', column: 'extraction_status' })
        ]));
    });

    it('returns degraded when the cash pickup collection migration or fields are missing', async () => {
        const mock = buildHealthySequelizeMock();
        const requiredMigration = '20260711000001-add-pickup-cash-collection-fields.cjs';
        mock.query = jest.fn(async () => (
            (await buildHealthySequelizeMock().query())
                .filter((row) => row.name !== requiredMigration)
        ));
        mock.getQueryInterface = () => ({
            describeTable: jest.fn(async (tableName) => {
                const table = await buildHealthySequelizeMock().getQueryInterface().describeTable(tableName);
                if (tableName === 'pos_transactions') {
                    delete table.payment_collected_at;
                    delete table.payment_collected_by;
                    delete table.payment_collected_shift_id;
                    delete table.payment_collected_terminal_id;
                }
                return table;
            })
        });

        const result = await auditRuntimeSchemaReadiness({ sequelizeInstance: mock });

        expect(result.status).toBe('degraded');
        expect(result.missingMigrations).toContain(requiredMigration);
        expect(result.missingColumns).toEqual(expect.arrayContaining([
            expect.objectContaining({ table: 'pos_transactions', column: 'payment_collected_at' }),
            expect.objectContaining({ table: 'pos_transactions', column: 'payment_collected_by' }),
            expect.objectContaining({ table: 'pos_transactions', column: 'payment_collected_shift_id' }),
            expect.objectContaining({ table: 'pos_transactions', column: 'payment_collected_terminal_id' })
        ]));
    });

    it('returns degraded when the delivery job migration or contract is missing', async () => {
        const mock = buildHealthySequelizeMock();
        const requiredMigration = '20260710000001-create-delivery-jobs.cjs';
        mock.query = jest.fn(async () => (
            (await buildHealthySequelizeMock().query())
                .filter((row) => row.name !== requiredMigration)
        ));
        mock.getQueryInterface = () => ({
            describeTable: jest.fn(async (tableName) => {
                const table = await buildHealthySequelizeMock().getQueryInterface().describeTable(tableName);
                if (tableName === 'delivery_jobs') {
                    const { status, ...withoutStatus } = table;
                    return withoutStatus;
                }
                return table;
            })
        });

        const result = await auditRuntimeSchemaReadiness({ sequelizeInstance: mock });

        expect(result.status).toBe('degraded');
        expect(result.missingMigrations).toContain(requiredMigration);
        expect(result.missingColumns).toEqual(expect.arrayContaining([
            expect.objectContaining({ table: 'delivery_jobs', column: 'status' })
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

    it('returns degraded when Annex B evidence migration or Z-reading evidence column is missing', async () => {
        const mock = buildHealthySequelizeMock();
        const requiredMigration = '20261003000001-add-annex-b-item-4-6-evidence-contract.cjs';
        mock.query = jest.fn(async () => (
            (await buildHealthySequelizeMock().query())
                .filter((row) => row.name !== requiredMigration)
        ));
        mock.getQueryInterface = () => ({
            describeTable: jest.fn(async (tableName) => {
                const table = await buildHealthySequelizeMock().getQueryInterface().describeTable(tableName);
                if (tableName === 'pos_z_reading_snapshots') {
                    const { reading_payload_hash, ...withoutPayloadHash } = table;
                    return withoutPayloadHash;
                }
                return table;
            })
        });

        const result = await auditRuntimeSchemaReadiness({ sequelizeInstance: mock });

        expect(result.status).toBe('degraded');
        expect(result.missingMigrations).toContain(requiredMigration);
        expect(result.missingColumns).toContainEqual({
            table: 'pos_z_reading_snapshots',
            column: 'reading_payload_hash'
        });
        expect(result.issues).toEqual(expect.arrayContaining([
            expect.objectContaining({
                scope: 'migration',
                type: 'missing_required_migration',
                migration: requiredMigration
            }),
            expect.objectContaining({
                scope: 'schema',
                type: 'missing_required_column',
                table: 'pos_z_reading_snapshots',
                column: 'reading_payload_hash'
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

    it('returns degraded when items.category enum is missing the service-mode value', async () => {
        const mock = buildHealthySequelizeMock();
        const requiredMigration = '20260502000001-add-services-mode-booking-tables.cjs';
        mock.query = jest.fn(async () => (
            (await buildHealthySequelizeMock().query())
                .filter((row) => row.name !== requiredMigration)
        ));
        mock.getQueryInterface = () => ({
            describeTable: jest.fn(async (tableName) => {
                const table = await buildHealthySequelizeMock().getQueryInterface().describeTable(tableName);
                if (tableName === 'items') {
                    return {
                        ...table,
                        category: { type: "ENUM('raw_material','packaging','product','supplies')" }
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
                table: 'items',
                column: 'category',
                expected: { enumValues: ['raw_material', 'packaging', 'product', 'supplies', 'service'] },
                actual: { enumValues: ['raw_material', 'packaging', 'product', 'supplies'] }
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

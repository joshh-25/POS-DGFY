import { describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20260925000002-add-configurable-pos-discount-rule-fields.cjs');

const ADDITIVE_COLUMN_NAMES = [
    'discount_key',
    'description',
    'is_approved',
    'configuration_source',
    'configuration_version'
];

const ALL_DISCOUNT_TYPES = "enum('senior','pwd','employee','promo','manual','custom')";

const buildDatabase = ({ rows = [], legacyProfiles = null, hasSettings = true, hasTenants = false } = {}) => ({
    tables: new Set([
        'pos_discount_rules',
        ...(hasSettings ? ['system_settings'] : []),
        ...(hasTenants ? ['tenants'] : [])
    ]),
    columns: new Map([
        ['type', { columnType: "enum('senior','pwd','employee','promo','manual')", isNullable: 'NO' }]
    ]),
    indexes: new Set(),
    rows: rows.map((row) => ({ ...row })),
    legacyProfiles,
    executedDdl: []
});

const buildQueryInterface = ({ databases, activeTenantDatabases = [] }) => {
    const schema = new Map(Object.entries(databases));
    let nextRuleId = Math.max(
        0,
        ...[...schema.values()].flatMap((database) => database.rows.map((row) => Number(row.id) || 0))
    ) + 1;

    const query = jest.fn(async (sql, options = {}) => {
        if (sql === 'SELECT DATABASE() AS dbName') return [[{ dbName: 'landlord_db' }]];

        if (sql.includes('information_schema.tables')) {
            const [databaseName, tableName] = options.replacements;
            return [[{ count: schema.get(databaseName)?.tables.has(tableName) ? 1 : 0 }]];
        }

        if (sql.includes('information_schema.columns')) {
            const [databaseName, tableName, columnName] = options.replacements;
            const database = schema.get(databaseName);
            return [[database?.tables.has(tableName) && database.columns.has(columnName)
                ? database.columns.get(columnName)
                : undefined]].filter((rows) => rows[0]);
        }

        if (sql.includes('information_schema.statistics')) {
            const [databaseName, tableName, indexName] = options.replacements;
            return [[{ count: schema.get(databaseName)?.tables.has(tableName)
                && schema.get(databaseName)?.indexes.has(indexName) ? 1 : 0 }]];
        }

        if (sql.includes('SELECT DISTINCT db_name') && sql.includes('`landlord_db`.`tenants`')) {
            return [[...activeTenantDatabases.map((dbName) => ({ db_name: dbName }))]];
        }

        const tableMatch = sql.match(/(?:FROM|INTO|UPDATE) `([^`]+)`\.`pos_discount_rules`/);
        const sourceTableMatch = sql.match(/(?:FROM|INTO|UPDATE) `([^`]+)`\.`[^`]+`/);
        const databaseName = tableMatch?.[1] || sourceTableMatch?.[1];
        const database = databaseName ? schema.get(databaseName) : null;

        if (sql.includes('SELECT id, name, type, discount_key')) {
            return [[...(database?.rows || []).map(({ id, name, type, discount_key }) => ({
                id,
                name,
                type,
                discount_key
            }))]];
        }

        if (sql.includes('SELECT discount_key, configuration_source')) {
            return [[...(database?.rows || []).map(({ discount_key, configuration_source }) => ({
                discount_key,
                configuration_source
            }))]];
        }

        if (sql.includes('SELECT setting_value') && sql.includes('FROM `') && sql.includes('`.`system_settings`')) {
            if (options.replacements?.[0] !== 'pos_discount_profiles' || database?.legacyProfiles == null) return [[]];
            return [[{ setting_value: database.legacyProfiles }]];
        }

        if (sql.startsWith('SELECT `discount_key`, COUNT(*) AS duplicateCount')) return [[]];

        if (sql.startsWith('SELECT COUNT(*) AS count') && sql.includes("WHERE type = 'custom'")) {
            const customRuleCount = (database?.rows || []).filter((row) => (
                row.type === 'custom' || row.configuration_source === 'legacy_profile'
            )).length;
            return [[{ count: customRuleCount }]];
        }

        if (sql.startsWith('UPDATE ') && sql.includes('SET `discount_key` = ?')) {
            const [discountKey, ruleId] = options.replacements;
            const row = database?.rows.find((entry) => Number(entry.id) === Number(ruleId));
            if (row) row.discount_key = discountKey;
            return [[], {}];
        }

        if (sql.startsWith('INSERT INTO ') && sql.includes("VALUES (?, ?, 'custom', 'percentage'")) {
            const [discountKey, name, rate, description, isActive, isApproved] = options.replacements;
            database.rows.push({
                id: nextRuleId++,
                discount_key: discountKey,
                name,
                type: 'custom',
                method: 'percentage',
                rate,
                description,
                is_active: Boolean(isActive),
                is_approved: Boolean(isApproved),
                configuration_source: 'legacy_profile',
                configuration_version: 1
            });
            return [[], {}];
        }

        if (sql.startsWith('UPDATE ')) return [[], {}];

        if (sql.startsWith('ALTER TABLE ')) {
            const tableNameMatch = sql.match(/ALTER TABLE `([^`]+)`\.`([^`]+)`/);
            const targetDatabase = schema.get(tableNameMatch?.[1]);
            const operation = sql.match(/\s(ADD|DROP|MODIFY)\s+(?:UNIQUE INDEX|INDEX|COLUMN)?\s*`?([^`\s(]+)`?/);
            const targetName = operation?.[2];

            if (sql.includes('ADD COLUMN')) {
                targetDatabase.columns.set(targetName, { columnType: 'varchar', isNullable: 'YES' });
            } else if (sql.includes('DROP COLUMN')) {
                targetDatabase.columns.delete(targetName);
            } else if (sql.includes("MODIFY COLUMN `type` ENUM")) {
                targetDatabase.columns.set('type', { columnType: ALL_DISCOUNT_TYPES, isNullable: 'NO' });
            } else if (sql.includes('MODIFY COLUMN `discount_key` VARCHAR(80) NOT NULL')) {
                targetDatabase.columns.set('discount_key', { columnType: 'varchar(80)', isNullable: 'NO' });
            } else if (sql.includes('ADD UNIQUE INDEX') || sql.includes('ADD INDEX')) {
                targetDatabase.indexes.add(targetName);
            } else if (sql.includes('DROP INDEX')) {
                targetDatabase.indexes.delete(targetName);
            }
            targetDatabase.executedDdl.push(sql);
            return [[], {}];
        }

        throw new Error(`Unexpected migration query: ${sql}`);
    });

    return {
        sequelize: { query },
        schema,
        query
    };
};

describe('configurable POS discount migration', () => {
    it('migrates every active tenant, backfills legacy profiles, and is safe to rerun', async () => {
        const queryInterface = buildQueryInterface({
            activeTenantDatabases: ['tenant_one', 'tenant_one', 'tenant_two'],
            databases: {
                landlord_db: buildDatabase({
                    hasTenants: true,
                    legacyProfiles: JSON.stringify([
                        { name: 'PWD', percentage: 15 },
                        { name: 'Invalid', percentage: 140 }
                    ]),
                    rows: [{
                        id: 1,
                        name: 'Senior Citizen',
                        type: 'senior',
                        discount_key: ' Senior Citizen '
                    }]
                }),
                tenant_one: buildDatabase({
                    legacyProfiles: [
                        { name: 'Employee Discount', percentage: 12, active: false, approved: false }
                    ],
                    rows: [{
                        id: 2,
                        name: 'Custom Staff',
                        type: 'custom',
                        discount_key: null
                    }]
                }),
                tenant_two: buildDatabase({ hasSettings: false })
            }
        });
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        await migration.up(queryInterface);

        for (const databaseName of ['landlord_db', 'tenant_one', 'tenant_two']) {
            const database = queryInterface.schema.get(databaseName);
            expect({
                databaseName,
                missingColumns: ADDITIVE_COLUMN_NAMES.filter((columnName) => !database.columns.has(columnName))
            }).toEqual({ databaseName, missingColumns: [] });
            expect(database.columns.get('type').columnType).toBe(ALL_DISCOUNT_TYPES);
            expect(database.columns.get('discount_key').isNullable).toBe('NO');
            expect(database.indexes).toEqual(new Set([
                'uq_pos_discount_rules_discount_key',
                'idx_pos_discount_rules_enabled_approved'
            ]));
        }

        expect(queryInterface.schema.get('landlord_db').rows).toEqual(expect.arrayContaining([
            expect.objectContaining({ name: 'Senior Citizen', discount_key: 'senior-citizen' }),
            expect.objectContaining({
                name: 'PWD',
                type: 'custom',
                rate: 15,
                configuration_source: 'legacy_profile',
                is_active: true,
                is_approved: true
            })
        ]));
        expect(queryInterface.schema.get('tenant_one').rows).toEqual(expect.arrayContaining([
            expect.objectContaining({ name: 'Custom Staff', discount_key: 'custom-custom-staff-2' }),
            expect.objectContaining({
                name: 'Employee Discount',
                configuration_source: 'legacy_profile',
                is_active: false,
                is_approved: false
            })
        ]));
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Skipped 1 invalid legacy discount profile'));

        const ddlCountAfterFirstRun = [...queryInterface.schema.values()]
            .reduce((total, database) => total + database.executedDdl.length, 0);
        const migratedRowCounts = [...queryInterface.schema.values()]
            .map((database) => database.rows.length);

        await migration.up(queryInterface);

        expect([...queryInterface.schema.values()].map((database) => database.rows.length))
            .toEqual(migratedRowCounts);
        expect([...queryInterface.schema.values()]
            .reduce((total, database) => total + database.executedDdl.length, 0))
            .toBe(ddlCountAfterFirstRun);
        warnSpy.mockRestore();
    });

    it('refuses rollback while custom or migrated rules still exist', async () => {
        const queryInterface = buildQueryInterface({
            databases: {
                landlord_db: buildDatabase({
                    rows: [{
                        id: 1,
                        name: 'Employee Discount',
                        type: 'custom',
                        discount_key: 'custom-employee'
                    }]
                })
            }
        });

        await expect(migration.down(queryInterface)).rejects.toThrow(
            'Cannot roll back configurable POS discounts in landlord_db'
        );
    });
});

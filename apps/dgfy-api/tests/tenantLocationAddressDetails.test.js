import { describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'module';
import { REQUIRED_TENANT_SCHEMA_COLUMNS } from '../scripts/sync-tenant-schemas.js';
import { validateCreateTenantLocation, validateUpdateTenantLocation } from '../src/validators/tenantLocationValidator.js';
import { buildCreateTenantLocationUseCase } from '../src/modules/tenantLocations/usecases/tenantLocationUseCases.js';
import { buildMaterializeApprovedCompanyRegistration } from '../src/modules/tenants/usecases/materializeApprovedCompanyRegistration.js';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20261019000003-add-address-details-to-tenant-locations.cjs');

// #2595: store locations keep the merchant's street number, unit, floor or building apart from
// the geocoded location; address_line stays the full display address.

const runValidator = (validator, body) => {
    const req = { body };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    const next = jest.fn();
    validator(req, res, next);
    return { req, res, next };
};

const baseBody = { name: 'Jaro branch', address_line: '118, E. Lopez Street, Jaro, Iloilo City', latitude: 10.72, longitude: 122.56 };

describe('tenant location address_details validation (#2595)', () => {
    it('accepts trimmed details, a blank value and null, and keeps them optional', () => {
        expect(runValidator(validateCreateTenantLocation, { ...baseBody, address_details: '  118, Ground floor ' }).req.validatedData.address_details)
            .toBe('118, Ground floor');
        expect(runValidator(validateCreateTenantLocation, { ...baseBody, address_details: '' }).next).toHaveBeenCalled();
        expect(runValidator(validateCreateTenantLocation, { ...baseBody, address_details: null }).next).toHaveBeenCalled();
        expect(runValidator(validateCreateTenantLocation, baseBody).next).toHaveBeenCalled();
        expect(runValidator(validateUpdateTenantLocation, { address_details: 'Unit 3B' }).req.validatedData)
            .toEqual(expect.objectContaining({ address_details: 'Unit 3B' }));
    });

    it('rejects details over 255 characters', () => {
        const { res, next } = runValidator(validateCreateTenantLocation, { ...baseBody, address_details: 'a'.repeat(256) });
        expect(res.status).toHaveBeenCalledWith(422);
        expect(next).not.toHaveBeenCalled();
    });
});

describe('tenant location create normalizes address_details (#2595)', () => {
    const buildRepository = () => {
        const transaction = { finished: false, commit: jest.fn(async () => { transaction.finished = true; }), rollback: jest.fn(async () => { transaction.finished = true; }), LOCK: { UPDATE: 'UPDATE' } };
        return {
            beginTransaction: jest.fn().mockResolvedValue(transaction),
            findByName: jest.fn().mockResolvedValue(null),
            findActivePrimary: jest.fn().mockResolvedValue({ location_id: 1 }),
            create: jest.fn().mockImplementation(async (payload) => ({ location_id: 5, ...payload })),
            clearPrimaryFlags: jest.fn(),
            findById: jest.fn().mockResolvedValue({ location_id: 5 })
        };
    };

    it('stores trimmed details, and null when blank or missing', async () => {
        const repository = buildRepository();
        const useCase = buildCreateTenantLocationUseCase({ tenantLocationRepository: repository });

        await useCase({ payload: { ...baseBody, address_details: ' 118 ' } });
        await useCase({ payload: { ...baseBody, address_details: '   ' } });
        await useCase({ payload: baseBody });

        expect(repository.create.mock.calls.map(([payload]) => payload.address_details)).toEqual(['118', null, null]);
    });
});

describe('tenant schema registry (#2595)', () => {
    it('repairs a tenant missing tenant_locations.address_details with a nullable column', () => {
        expect(REQUIRED_TENANT_SCHEMA_COLUMNS.tenant_locations.address_details.sql)
            .toContain('ADD COLUMN `address_details` VARCHAR(255) NULL');
    });
});

describe('add address_details to tenant_locations migration (#2595)', () => {
    const buildQueryInterface = ({ tenants = ['tenant_a', 'tenant_b'], withColumn = [], withoutTable = [] } = {}) => {
        const queries = [];
        const query = jest.fn(async (sql, options = {}) => {
            queries.push(sql);
            const [schema, table, column] = options.replacements || [];
            if (sql.startsWith('SELECT DATABASE()')) return [[{ dbName: 'landlord' }]];
            if (sql.includes('FROM tenants')) return [tenants.map((db_name) => ({ db_name }))];
            if (sql.includes('information_schema.tables')) {
                return [[{ count: table === 'tenants' || !withoutTable.includes(schema) ? 1 : 0 }]];
            }
            if (sql.includes('information_schema.columns')) {
                return [[{ count: withColumn.includes(schema) && column === 'address_details' ? 1 : 0 }]];
            }
            return [[]];
        });
        return { queryInterface: { sequelize: { query } }, queries };
    };
    const alterStatements = (queries) => queries.filter((sql) => sql.startsWith('ALTER TABLE'));

    it('adds the nullable column to the landlord and every active tenant schema', async () => {
        const { queryInterface, queries } = buildQueryInterface();
        await migration.up(queryInterface);

        expect(alterStatements(queries)).toEqual([
            'ALTER TABLE `landlord`.`tenant_locations` ADD COLUMN `address_details` VARCHAR(255) NULL COMMENT \'Merchant-entered street number, unit, floor or building (#2595)\' AFTER `address_line`',
            'ALTER TABLE `tenant_a`.`tenant_locations` ADD COLUMN `address_details` VARCHAR(255) NULL COMMENT \'Merchant-entered street number, unit, floor or building (#2595)\' AFTER `address_line`',
            'ALTER TABLE `tenant_b`.`tenant_locations` ADD COLUMN `address_details` VARCHAR(255) NULL COMMENT \'Merchant-entered street number, unit, floor or building (#2595)\' AFTER `address_line`'
        ]);
    });

    it('skips schemas that already have the column or lack the table', async () => {
        const { queryInterface, queries } = buildQueryInterface({ withColumn: ['tenant_a'], withoutTable: ['landlord'] });
        await migration.up(queryInterface);

        expect(alterStatements(queries)).toHaveLength(1);
        expect(alterStatements(queries)[0]).toContain('`tenant_b`');
    });

    it('drops the column only where it exists on down', async () => {
        const { queryInterface, queries } = buildQueryInterface({ withColumn: ['tenant_b'] });
        await migration.down(queryInterface);

        expect(alterStatements(queries)).toEqual(['ALTER TABLE `tenant_b`.`tenant_locations` DROP COLUMN `address_details`']);
    });

    it('refuses an unsafe tenant database name', async () => {
        const { queryInterface } = buildQueryInterface({ tenants: ['bad`name'] });
        await expect(migration.up(queryInterface)).rejects.toThrow('Unsafe database identifier');
    });
});

describe('approved registration copies address_details to the primary location (#2595)', () => {
    it('writes the captured details beside the full address', async () => {
        const created = [];
        const models = {
            SystemSetting: { findOne: jest.fn(async () => null), create: jest.fn(async (values) => values) },
            TenantLocation: { findOne: jest.fn(async () => null), create: jest.fn(async (values) => { created.push(values); return values; }) }
        };
        const materialize = buildMaterializeApprovedCompanyRegistration({
            connector: { getConnection: jest.fn().mockResolvedValue({ transaction: jest.fn(async (callback) => callback({})) }) },
            modelFactory: jest.fn().mockReturnValue(models),
            logger: { warn: jest.fn() }
        });

        await materialize({
            tenant: { id: 'tenant-1', name: 'Jaro Foods' },
            application: {
                id: 'application-1',
                current_attempt_no: 1,
                attempts: [{ submission_snapshot: { company_name: 'Jaro Foods', hours: [], location: {
                    name: 'Main', address_line: '118, E. Lopez Street, Jaro', address_details: ' 118 ', latitude: 10.72, longitude: 122.56
                } } }]
            }
        });

        expect(created[0]).toEqual(expect.objectContaining({ address_line: '118, E. Lopez Street, Jaro', address_details: '118' }));
    });
});

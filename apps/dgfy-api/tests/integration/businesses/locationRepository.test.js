import crypto from 'crypto';
import { Sequelize } from 'sequelize';
import { LocationRepository } from '../../../src/modules/businesses/repositories/locationRepository.js';
import { TenantConnector } from '../../../src/infra/tenantConnector.js';

/**
 * Wave 7 gap-closure (04-07-PLAN.md, Task 1) real-MySQL-backed
 * LocationRepository test. Mirrors ./businessRepository.test.js's/
 * ../../unit/... gating pattern exactly: skips cleanly (never fails) unless
 * explicitly opted in with real MySQL admin credentials, so this suite never
 * assumes a database is reachable in CI or a fresh sandbox.
 *
 * CLOSES the prior in-memory-Map bridging test (04-03.5-SUMMARY.md's Known
 * Stub) — this suite now proves the REAL production repository class
 * against a real, disposable `dgfy_business_*` MySQL database via
 * TenantConnector, including the fail-closed paths for missing/provisioning/
 * inactive/unverified/unreachable tenant registry state.
 */
const RUN_INTEGRATION = process.env.RUN_LOCATION_REPOSITORY_INTEGRATION === 'true';

const ADMIN_DB_CONFIG = {
    host: process.env.BUSINESS_IT_DB_HOST || process.env.DB_HOST || 'localhost',
    port: Number(process.env.BUSINESS_IT_DB_PORT || process.env.DB_PORT || 3306),
    user: process.env.BUSINESS_IT_DB_USER || process.env.DB_USER || 'root',
    password: process.env.BUSINESS_IT_DB_PASSWORD || process.env.DB_PASSWORD || ''
};

if (!RUN_INTEGRATION) {
    // eslint-disable-next-line no-console
    console.log(
        '[locationRepository.test.js] SKIPPED — set RUN_LOCATION_REPOSITORY_INTEGRATION=true '
        + '(with MySQL admin credentials via BUSINESS_IT_DB_HOST/PORT/USER/PASSWORD, or the '
        + 'existing DB_HOST/PORT/USER/PASSWORD convention) to run this real MySQL-backed '
        + 'LocationRepository test locally or in CI.'
    );
}

const describeIfIntegration = RUN_INTEGRATION ? describe : describe.skip;

function isolatedDbName(prefix) {
    return `${prefix}_it_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
}

async function withAdminConnection(fn) {
    const adminSequelize = new Sequelize('information_schema', ADMIN_DB_CONFIG.user, ADMIN_DB_CONFIG.password, {
        host: ADMIN_DB_CONFIG.host,
        port: ADMIN_DB_CONFIG.port,
        dialect: 'mysql',
        logging: false
    });
    try {
        return await fn(adminSequelize);
    } finally {
        await adminSequelize.close();
    }
}

/**
 * Minimal registry double — a real BusinessDatabaseRegistryRepository is
 * landlord dgfy_core-backed (its own separately-gated suite); this suite is
 * scoped to LocationRepository's own tenant-DB behavior, so a lightweight
 * in-memory registry double (matching the exact
 * `{database_name, status, verified_at}` shape LocationRepository consumes)
 * is sufficient and avoids provisioning a second real database.
 */
function fakeRegistry(entriesByBusinessId) {
    return {
        async findByBusinessId(businessId) {
            return entriesByBusinessId[businessId] || null;
        }
    };
}

describeIfIntegration('LocationRepository (real MySQL, dgfy_business_*.locations via TenantConnector)', () => {
    const businessDbName = isolatedDbName('dgfy_business');
    let tenantConnector;

    beforeAll(async () => {
        await withAdminConnection(async (adminSequelize) => {
            await adminSequelize.query(`CREATE DATABASE IF NOT EXISTS \`${businessDbName}\``);
        });
        tenantConnector = new TenantConnector(ADMIN_DB_CONFIG);
        const connection = tenantConnector.getConnection(businessDbName);
        await connection.getQueryInterface().createTable('locations', {
            id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
            name: { type: Sequelize.STRING(255), allowNull: false },
            address_line: { type: Sequelize.TEXT, allowNull: false },
            latitude: { type: Sequelize.DECIMAL(10, 8), allowNull: true },
            longitude: { type: Sequelize.DECIMAL(11, 8), allowNull: true },
            is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
            is_primary: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
            created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
            updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
        });
    });

    afterAll(async () => {
        if (tenantConnector) await tenantConnector.closeAll();
        await withAdminConnection(async (adminSequelize) => {
            await adminSequelize.query(`DROP DATABASE IF EXISTS \`${businessDbName}\``);
        });
    });

    afterEach(async () => {
        const connection = tenantConnector.getConnection(businessDbName);
        await connection.query('DELETE FROM locations');
    });

    function buildRepository(registryOverrides = {}) {
        const registry = fakeRegistry({
            'biz-active-verified': {
                database_name: businessDbName,
                status: 'active',
                verified_at: new Date()
            },
            ...registryOverrides
        });
        return new LocationRepository({ tenantConnector, businessDatabaseRegistryRepository: registry });
    }

    describe('create / findById / findAll (active + verified registry entry)', () => {
        it('a fresh repository instance can re-read a created location from the same tenant database', async () => {
            const repository = buildRepository();
            const created = await repository.create({
                businessId: 'biz-active-verified',
                name: 'Main Branch',
                address_line: '123 Main St'
            });

            expect(created.id).toEqual(expect.any(Number));
            expect(created.is_primary).toBe(true);
            expect(created.is_active).toBe(true);

            // Fresh instance, same TenantConnector/registry — proves durable
            // persistence, not in-process object identity.
            const freshRepository = buildRepository();
            const reRead = await freshRepository.findById('biz-active-verified', created.id);

            expect(reRead).toEqual(expect.objectContaining({
                id: created.id,
                name: 'Main Branch',
                address_line: '123 Main St'
            }));
        });

        it('does NOT auto-assign is_primary for a second location', async () => {
            const repository = buildRepository();
            await repository.create({ businessId: 'biz-active-verified', name: 'A1', address_line: 'Addr A1' });
            const second = await repository.create({
                businessId: 'biz-active-verified',
                name: 'A2',
                address_line: 'Addr A2'
            });

            expect(second.is_primary).toBe(false);
        });
    });

    describe('updatePrimary (primary-location semantics persist)', () => {
        it('clears the previous primary and sets the new one — only one active primary at a time', async () => {
            const repository = buildRepository();
            const first = await repository.create({ businessId: 'biz-active-verified', name: 'A1', address_line: 'Addr A1' });
            const second = await repository.create({ businessId: 'biz-active-verified', name: 'A2', address_line: 'Addr A2' });

            await repository.updatePrimary('biz-active-verified', second.id);

            const freshRepository = buildRepository();
            const refreshedFirst = await freshRepository.findById('biz-active-verified', first.id);
            const refreshedSecond = await freshRepository.findById('biz-active-verified', second.id);

            expect(refreshedFirst.is_primary).toBe(false);
            expect(refreshedSecond.is_primary).toBe(true);

            const all = await freshRepository.findAll('biz-active-verified');
            expect(all.filter((location) => location.is_primary)).toHaveLength(1);
        });
    });

    describe('delete / restore (soft delete persists)', () => {
        it('soft-delete persists — is_active becomes false, record remains in findAll', async () => {
            const repository = buildRepository();
            const first = await repository.create({ businessId: 'biz-active-verified', name: 'A1', address_line: 'Addr A1' });
            await repository.create({ businessId: 'biz-active-verified', name: 'A2', address_line: 'Addr A2' });

            await repository.delete('biz-active-verified', first.id);

            const freshRepository = buildRepository();
            const all = await freshRepository.findAll('biz-active-verified');
            expect(all).toHaveLength(2);
            expect(all.find((location) => location.id === first.id).is_active).toBe(false);
        });

        it('list/get exclude soft-deleted rows only when the caller filters (repository itself still returns them)', async () => {
            const repository = buildRepository();
            const first = await repository.create({ businessId: 'biz-active-verified', name: 'A1', address_line: 'Addr A1' });
            await repository.delete('biz-active-verified', first.id);

            const freshRepository = buildRepository();
            const stillFindable = await freshRepository.findById('biz-active-verified', first.id);
            expect(stillFindable.is_active).toBe(false);

            const restored = await freshRepository.restore('biz-active-verified', first.id);
            expect(restored.is_active).toBe(true);
        });
    });

    describe('fail-closed tenant database resolution (Wave 7 Test 4)', () => {
        it('returns TenantDatabaseUnavailableError("missing") when no registry row exists for the business', async () => {
            const repository = buildRepository();

            await expect(repository.findAll('no-such-business')).rejects.toMatchObject({
                name: 'TenantDatabaseUnavailableError',
                reason: 'missing'
            });
        });

        it('returns TenantDatabaseUnavailableError("provisioning") when the registry row is still provisioning', async () => {
            const repository = buildRepository({
                'biz-provisioning': { database_name: businessDbName, status: 'provisioning', verified_at: null }
            });

            await expect(repository.findAll('biz-provisioning')).rejects.toMatchObject({
                name: 'TenantDatabaseUnavailableError',
                reason: 'provisioning'
            });
        });

        it('returns TenantDatabaseUnavailableError("inactive") when the registry status is not active', async () => {
            const repository = buildRepository({
                'biz-deprecated': { database_name: businessDbName, status: 'deprecated', verified_at: new Date() }
            });

            await expect(repository.findAll('biz-deprecated')).rejects.toMatchObject({
                name: 'TenantDatabaseUnavailableError',
                reason: 'inactive'
            });
        });

        it('returns TenantDatabaseUnavailableError("unverified") when active but verified_at is not populated', async () => {
            const repository = buildRepository({
                'biz-unverified': { database_name: businessDbName, status: 'active', verified_at: null }
            });

            await expect(repository.findAll('biz-unverified')).rejects.toMatchObject({
                name: 'TenantDatabaseUnavailableError',
                reason: 'unverified'
            });
        });

        it('returns TenantDatabaseUnavailableError("unreachable") when the tenant schema does not actually exist', async () => {
            const repository = buildRepository({
                'biz-unreachable': {
                    database_name: `dgfy_business_never_created_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`,
                    status: 'active',
                    verified_at: new Date()
                }
            });

            await expect(repository.findAll('biz-unreachable')).rejects.toMatchObject({
                name: 'TenantDatabaseUnavailableError',
                reason: 'unreachable'
            });
        });

        it('performs no location write when the tenant database is not active/verified', async () => {
            const repository = buildRepository({
                'biz-provisioning-2': { database_name: businessDbName, status: 'provisioning', verified_at: null }
            });

            await expect(repository.create({
                businessId: 'biz-provisioning-2',
                name: 'Should Not Persist',
                address_line: 'Nowhere'
            })).rejects.toMatchObject({ name: 'TenantDatabaseUnavailableError' });

            const freshRepository = buildRepository();
            const found = await freshRepository.findByName('biz-active-verified', 'Should Not Persist');
            expect(found).toBeNull();
        });
    });
});

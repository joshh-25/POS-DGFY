import crypto from 'crypto';
import request from 'supertest';
import express from 'express';
import bcrypt from 'bcryptjs';
import { Sequelize } from 'sequelize';
import defineAccountModel from '../../../src/models/Landlord/Account.js';
import defineBusinessModel from '../../../src/models/Landlord/Business.js';
import defineBusinessMembershipModel from '../../../src/models/Landlord/BusinessMembership.js';
import defineBusinessDatabaseRegistryModel from '../../../src/models/Landlord/BusinessDatabaseRegistry.js';
import defineAccountStaffAssignmentModel from '../../../src/models/Tenant/AccountStaffAssignment.js';
import { buildAccountsModule, createAccountRoutes, buildAccountAuthMiddleware } from '../../../src/modules/accounts/index.js';
import { buildBusinessesModule, createBusinessRoutes, createInvitationRoutes } from '../../../src/modules/businesses/index.js';
import { TenantConnector } from '../../../src/infra/tenantConnector.js';

/**
 * HTTP-layer integration tests for the tenant session activation endpoint
 * (Wave 4, Task 7). Mirrors ../businesses/businessRoutes.test.js's/
 * ../businesses/locationRoutes.test.js's gating pattern: skips cleanly
 * (never fails) unless explicitly opted in with real MySQL admin
 * credentials, so this suite never assumes a database is reachable in CI or
 * a fresh sandbox.
 *
 * Unlike locationRoutes.test.js (which never had a real tenant database to
 * connect to), this suite exercises REAL landlord (dgfy_core-shaped) AND
 * REAL per-tenant (dgfy_business_*-shaped) MySQL databases — closing the
 * "in-memory bridging" stub 04-03.5-SUMMARY.md flagged as pending this wave.
 * Each business created in this suite gets its own freshly-provisioned,
 * disposable tenant database (via provisionTenantDatabase()) with the real
 * AccountStaffAssignment model synced into it, and a real
 * business_database_registry row pointing at it — this test does NOT use
 * apps/dgfy-migration-runner's migration files (same precedent as
 * ../businesses/businessRepository.test.js: targets the real Sequelize
 * models directly).
 */
const RUN_INTEGRATION = process.env.RUN_TENANT_SESSION_ROUTES_INTEGRATION === 'true';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-at-least-32-characters-long';

const ADMIN_DB_CONFIG = {
    host: process.env.BUSINESS_IT_DB_HOST || process.env.DB_HOST || 'localhost',
    port: Number(process.env.BUSINESS_IT_DB_PORT || process.env.DB_PORT || 3306),
    user: process.env.BUSINESS_IT_DB_USER || process.env.DB_USER || 'root',
    password: process.env.BUSINESS_IT_DB_PASSWORD || process.env.DB_PASSWORD || ''
};

if (!RUN_INTEGRATION) {
    // eslint-disable-next-line no-console
    console.log(
        '[tenantSessionRoutes.test.js] SKIPPED — set RUN_TENANT_SESSION_ROUTES_INTEGRATION=true '
        + '(with MySQL admin credentials via BUSINESS_IT_DB_HOST/PORT/USER/PASSWORD, or the '
        + 'existing DB_HOST/PORT/USER/PASSWORD convention) to run this real MySQL-backed '
        + 'landlord + tenant tenant-session HTTP route test locally or in CI.'
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

describeIfIntegration('Tenant session HTTP routes (real MySQL landlord + tenant databases)', () => {
    const landlordDbName = isolatedDbName('dgfy_core');
    const provisionedTenantDbNames = [];

    let landlordSequelize;
    let tenantConnector;
    let Account;
    let businessRepository;
    let businessDatabaseRegistryRepository;
    let accountStaffAssignmentRepository;
    let app;

    async function provisionTenantDatabase() {
        const databaseName = isolatedDbName('dgfy_business');
        await withAdminConnection(async (adminSequelize) => {
            await adminSequelize.query(`CREATE DATABASE IF NOT EXISTS \`${databaseName}\``);
        });
        const connection = tenantConnector.getConnection(databaseName);
        const model = defineAccountStaffAssignmentModel(connection);
        await model.sync({ force: true });
        provisionedTenantDbNames.push(databaseName);
        return databaseName;
    }

    beforeAll(async () => {
        await withAdminConnection(async (adminSequelize) => {
            await adminSequelize.query(`CREATE DATABASE IF NOT EXISTS \`${landlordDbName}\``);
        });

        landlordSequelize = new Sequelize(landlordDbName, ADMIN_DB_CONFIG.user, ADMIN_DB_CONFIG.password, {
            host: ADMIN_DB_CONFIG.host,
            port: ADMIN_DB_CONFIG.port,
            dialect: 'mysql',
            logging: false
        });

        Account = defineAccountModel(landlordSequelize);
        const Business = defineBusinessModel(landlordSequelize);
        const BusinessMembership = defineBusinessMembershipModel(landlordSequelize);
        const BusinessDatabaseRegistry = defineBusinessDatabaseRegistryModel(landlordSequelize);
        await landlordSequelize.sync({ force: true });

        tenantConnector = new TenantConnector(ADMIN_DB_CONFIG);

        const businessesModule = buildBusinessesModule({
            businessModel: Business,
            businessMembershipModel: BusinessMembership,
            businessDatabaseRegistryModel: BusinessDatabaseRegistry,
            sequelize: landlordSequelize,
            sendEmail: async () => ({ sent: false, reason: 'test_double' }),
            tenantConnector
        });
        businessRepository = businessesModule.repository;
        businessDatabaseRegistryRepository = businessesModule.businessDatabaseRegistryRepository;
        accountStaffAssignmentRepository = businessesModule.accountStaffAssignmentRepository;
        const businessUseCases = businessesModule.useCases;

        const { useCases: accountUseCases } = buildAccountsModule({
            accountModel: Account,
            hashPassword: (password) => bcrypt.hash(password, 10),
            bcrypt,
            businessRepository
        });

        const authenticateAccount = buildAccountAuthMiddleware({ getAccount: accountUseCases.getAccount });

        app = express();
        app.use(express.json());
        app.use('/accounts', createAccountRoutes(accountUseCases, { authenticateAccount }));
        app.use('/businesses', createBusinessRoutes(businessUseCases, { authenticateAccount }));
        app.use('/invitations', createInvitationRoutes(businessUseCases));
    });

    afterAll(async () => {
        if (tenantConnector) await tenantConnector.closeAll();
        if (landlordSequelize) await landlordSequelize.close();
        await withAdminConnection(async (adminSequelize) => {
            await adminSequelize.query(`DROP DATABASE IF EXISTS \`${landlordDbName}\``);
            for (const dbName of provisionedTenantDbNames) {
                await adminSequelize.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
            }
        });
    });

    afterEach(async () => {
        await Account.destroy({ truncate: true, force: true });
    });

    async function registerAndGetToken(overrides = {}) {
        const email = overrides.email || `owner-${crypto.randomUUID()}@example.com`;
        const response = await request(app).post('/accounts/register').send({
            email,
            password: 'StrongPass123',
            first_name: 'Owner',
            ...overrides
        });
        return { token: response.body.data.token, accountId: response.body.data.account.id, email };
    }

    /**
     * Creates a business (owner auto-assigned), provisions a fresh tenant
     * database for it, and registers the business_database_registry pointer
     * — the full real end-to-end wiring the activate-session endpoint reads.
     */
    async function createBusinessWithTenant(ownerToken, handle) {
        const createResponse = await request(app)
            .post('/businesses')
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({ legal_name: 'Acme Inc.', display_name: 'Acme Store', business_handle: handle });
        const businessId = createResponse.body.data.business.id;

        const databaseName = await provisionTenantDatabase();
        await businessDatabaseRegistryRepository.create({
            businessId,
            stableOpaqueSuffix: databaseName.replace('dgfy_business_it_', ''),
            databaseName,
            status: 'active'
        });

        return { businessId, databaseName };
    }

    describe('POST /businesses/:id/activate-session', () => {
        it('owner activates their business and receives HTTP 200 + tenant context (owner bypass)', async () => {
            const { token } = await registerAndGetToken();
            const { businessId, databaseName } = await createBusinessWithTenant(token, 'owner-activate');

            const response = await request(app)
                .post(`/businesses/${businessId}/activate-session`)
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
            expect(response.body.data.business_id).toBe(businessId);
            expect(response.body.data.tenant_database).toBe(databaseName);
            expect(response.body.data.active_assignment).toBeNull();
        });

        it('staff with a real tenant-local assignment activates the business with HTTP 200', async () => {
            const { token: ownerToken } = await registerAndGetToken();
            const { businessId, databaseName } = await createBusinessWithTenant(ownerToken, 'staff-activate');

            const { token: staffToken, accountId: staffAccountId } = await registerAndGetToken();
            await businessRepository.createMembership({ accountId: staffAccountId, businessId, role: 'member' });
            await accountStaffAssignmentRepository.create(databaseName, {
                dgfyAccountId: staffAccountId,
                staffAccountId: 1,
                role: 'staff',
                status: 'active'
            });

            const response = await request(app)
                .post(`/businesses/${businessId}/activate-session`)
                .set('Authorization', `Bearer ${staffToken}`);

            expect(response.status).toBe(200);
            expect(response.body.data.active_assignment.dgfy_account_id).toBe(staffAccountId);
        });

        it('rejects a user without membership with HTTP 403 (NO_MEMBERSHIP)', async () => {
            const { token: ownerToken } = await registerAndGetToken();
            const { businessId } = await createBusinessWithTenant(ownerToken, 'no-membership');

            const { token: outsiderToken } = await registerAndGetToken();
            const response = await request(app)
                .post(`/businesses/${businessId}/activate-session`)
                .set('Authorization', `Bearer ${outsiderToken}`);

            expect(response.status).toBe(403);
            expect(response.body.error.details.error_code).toBe('NO_MEMBERSHIP');
        });

        it('rejects a staff member without a tenant-local assignment with HTTP 403 (NO_TENANT_ASSIGNMENT)', async () => {
            const { token: ownerToken } = await registerAndGetToken();
            const { businessId } = await createBusinessWithTenant(ownerToken, 'no-assignment');

            const { token: staffToken, accountId: staffAccountId } = await registerAndGetToken();
            await businessRepository.createMembership({ accountId: staffAccountId, businessId, role: 'member' });
            // No account_staff_assignments row created in the tenant DB.

            const response = await request(app)
                .post(`/businesses/${businessId}/activate-session`)
                .set('Authorization', `Bearer ${staffToken}`);

            expect(response.status).toBe(403);
            expect(response.body.error.details.error_code).toBe('NO_TENANT_ASSIGNMENT');
        });

        it('rejects a non-existent business with HTTP 404', async () => {
            const { token } = await registerAndGetToken();

            const response = await request(app)
                .post(`/businesses/${crypto.randomUUID()}/activate-session`)
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(404);
        });

        it('rejects an unauthenticated request with HTTP 401', async () => {
            const response = await request(app).post(`/businesses/${crypto.randomUUID()}/activate-session`);
            expect(response.status).toBe(401);
        });
    });

    describe('Tenant isolation: mid-session business switching (D-14)', () => {
        it('activates two different businesses with the same session token, no re-login, no cross-tenant leakage', async () => {
            const { token } = await registerAndGetToken();
            const { businessId: businessIdA, databaseName: databaseNameA } = await createBusinessWithTenant(token, 'switch-a');
            const { businessId: businessIdB, databaseName: databaseNameB } = await createBusinessWithTenant(token, 'switch-b');

            const responseA = await request(app)
                .post(`/businesses/${businessIdA}/activate-session`)
                .set('Authorization', `Bearer ${token}`);
            expect(responseA.status).toBe(200);
            expect(responseA.body.data.business_id).toBe(businessIdA);
            expect(responseA.body.data.tenant_database).toBe(databaseNameA);

            const responseB = await request(app)
                .post(`/businesses/${businessIdB}/activate-session`)
                .set('Authorization', `Bearer ${token}`);
            expect(responseB.status).toBe(200);
            expect(responseB.body.data.business_id).toBe(businessIdB);
            expect(responseB.body.data.tenant_database).toBe(databaseNameB);

            // Same session token used throughout (no re-login/second register
            // call), and each activation resolved a genuinely distinct
            // tenant database — no cross-tenant leakage.
            expect(databaseNameA).not.toBe(databaseNameB);
        });
    });
});

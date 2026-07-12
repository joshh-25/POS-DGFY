import crypto from 'crypto';
import request from 'supertest';
import express from 'express';
import bcrypt from 'bcryptjs';
import { Sequelize } from 'sequelize';
import defineAccountModel from '../../../src/models/Landlord/Account.js';
import defineBusinessModel from '../../../src/models/Landlord/Business.js';
import defineBusinessMembershipModel from '../../../src/models/Landlord/BusinessMembership.js';
import defineBusinessDatabaseRegistryModel from '../../../src/models/Landlord/BusinessDatabaseRegistry.js';
import { buildAccountsModule, createAccountRoutes, buildAccountAuthMiddleware } from '../../../src/modules/accounts/index.js';
import { buildBusinessesModule, createBusinessRoutes, createInvitationRoutes } from '../../../src/modules/businesses/index.js';

/**
 * HTTP-layer integration tests for the tenant registry lookup endpoint
 * (Wave 6 gap-closure, Task 2: GET /businesses/:id/tenant-registry). Mirrors
 * ../businesses/businessRoutes.test.js's gating pattern: skips cleanly
 * (never fails) unless explicitly opted in with real MySQL admin
 * credentials, so this suite never assumes a database is reachable in CI or
 * a fresh sandbox.
 *
 * Landlord-only (dgfy_core-shaped) — unlike
 * ../tenancy/tenantSessionRoutes.test.js, this endpoint never touches a real
 * tenant database (D-14: registry lookup has no session-activation side
 * effect), so no TenantConnector/tenant-DB provisioning is needed here.
 */
const RUN_INTEGRATION = process.env.RUN_TENANT_REGISTRY_ROUTES_INTEGRATION === 'true';

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
        '[tenantRegistryRoutes.test.js] SKIPPED — set RUN_TENANT_REGISTRY_ROUTES_INTEGRATION=true '
        + '(with MySQL admin credentials via BUSINESS_IT_DB_HOST/PORT/USER/PASSWORD, or the '
        + 'existing DB_HOST/PORT/USER/PASSWORD convention) to run this real MySQL-backed '
        + 'tenant registry lookup HTTP route test locally or in CI.'
    );
}

const describeIfIntegration = RUN_INTEGRATION ? describe : describe.skip;

function isolatedDbName() {
    return `dgfy_core_it_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
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

describeIfIntegration('Tenant registry lookup HTTP route (real MySQL, GET /businesses/:id/tenant-registry)', () => {
    const dbName = isolatedDbName();
    let sequelize;
    let Account;
    let app;

    beforeAll(async () => {
        await withAdminConnection(async (adminSequelize) => {
            await adminSequelize.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
        });

        sequelize = new Sequelize(dbName, ADMIN_DB_CONFIG.user, ADMIN_DB_CONFIG.password, {
            host: ADMIN_DB_CONFIG.host,
            port: ADMIN_DB_CONFIG.port,
            dialect: 'mysql',
            logging: false
        });

        Account = defineAccountModel(sequelize);
        const Business = defineBusinessModel(sequelize);
        const BusinessMembership = defineBusinessMembershipModel(sequelize);
        const BusinessDatabaseRegistry = defineBusinessDatabaseRegistryModel(sequelize);
        await sequelize.sync({ force: true });

        const businessesModule = buildBusinessesModule({
            businessModel: Business,
            businessMembershipModel: BusinessMembership,
            businessDatabaseRegistryModel: BusinessDatabaseRegistry,
            sequelize,
            sendEmail: async () => ({ sent: false, reason: 'test_double' })
        });
        const businessUseCases = businessesModule.useCases;

        const { useCases: accountUseCases } = buildAccountsModule({
            accountModel: Account,
            hashPassword: (password) => bcrypt.hash(password, 10),
            bcrypt,
            businessRepository: businessesModule.repository
        });

        const authenticateAccount = buildAccountAuthMiddleware({ getAccount: accountUseCases.getAccount });

        app = express();
        app.use(express.json());
        app.use('/accounts', createAccountRoutes(accountUseCases, { authenticateAccount }));
        app.use('/businesses', createBusinessRoutes(businessUseCases, { authenticateAccount }));
        app.use('/invitations', createInvitationRoutes(businessUseCases));
    });

    afterAll(async () => {
        if (sequelize) await sequelize.close();
        await withAdminConnection(async (adminSequelize) => {
            await adminSequelize.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
        });
    });

    // Deliberately NO afterEach truncation: MySQL/InnoDB refuses to TRUNCATE
    // a table referenced by a live FK constraint (business_memberships.
    // account_id -> accounts.id) regardless of row count, so this always
    // threw on the very first call once real migrations created the FK.
    // Every business_handle/email literal below is already unique per test
    // case within this file (mirrors phase4FullFlow.test.js's approach),
    // and afterAll drops the whole per-file landlord database, so no
    // cross-test truncation is needed.

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

    describe('GET /businesses/:id/tenant-registry', () => {
        it('returns safe tenant registry metadata for an active member with HTTP 200', async () => {
            const { token } = await registerAndGetToken();
            const createResponse = await request(app)
                .post('/businesses')
                .set('Authorization', `Bearer ${token}`)
                .send({ legal_name: 'Acme Inc.', display_name: 'Acme Store', business_handle: 'registry-lookup-test' });
            const businessId = createResponse.body.data.business.id;

            // Create-business already writes provisioning registry metadata
            // (Task 1); the response itself already surfaces it, but this
            // asserts the SEPARATE read-only lookup endpoint independently.
            const response = await request(app)
                .get(`/businesses/${businessId}/tenant-registry`)
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
            expect(response.body.data.tenant_registry.business_id).toBe(businessId);
            expect(response.body.data.tenant_registry.database_name).toMatch(/^dgfy_business_/);
            expect(response.body.data.tenant_registry.status).toBe('provisioning');

            // No credentials/connector config leak (T-04-06-02).
            expect(response.body.data.tenant_registry).not.toHaveProperty('host');
            expect(response.body.data.tenant_registry).not.toHaveProperty('user');
            expect(response.body.data.tenant_registry).not.toHaveProperty('password');
            expect(response.body.data.tenant_registry).not.toHaveProperty('dsn');

            // No session-activation side effect/fields leak into this
            // response (D-14) — those only ever appear from
            // POST /businesses/:id/activate-session.
            expect(response.body.data).not.toHaveProperty('tenant_database');
            expect(response.body.data).not.toHaveProperty('active_assignment');
        });

        it('rejects a non-member with HTTP 403', async () => {
            const { token } = await registerAndGetToken();
            const createResponse = await request(app)
                .post('/businesses')
                .set('Authorization', `Bearer ${token}`)
                .send({ legal_name: 'Acme Inc.', display_name: 'Acme Store', business_handle: 'registry-nonmember-test' });
            const businessId = createResponse.body.data.business.id;

            const { token: otherToken } = await registerAndGetToken();
            const response = await request(app)
                .get(`/businesses/${businessId}/tenant-registry`)
                .set('Authorization', `Bearer ${otherToken}`);

            expect(response.status).toBe(403);
        });

        it('returns HTTP 404 for a non-existent business', async () => {
            const { token } = await registerAndGetToken();

            const response = await request(app)
                .get(`/businesses/${crypto.randomUUID()}/tenant-registry`)
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(404);
        });

        it('rejects an unauthenticated request with HTTP 401', async () => {
            const response = await request(app).get(`/businesses/${crypto.randomUUID()}/tenant-registry`);
            expect(response.status).toBe(401);
        });
    });
});

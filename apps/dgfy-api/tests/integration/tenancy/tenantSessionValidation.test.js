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
 * Wave 5 (04-05-PLAN.md, Task 5) — tenant session validation, edge-case, and
 * replay/idempotency integration tests, enforcing D-04/API-04. Mirrors
 * ./tenantSessionFlows.test.js's gating pattern and real landlord + tenant
 * database wiring.
 */
const RUN_INTEGRATION = process.env.RUN_TENANT_SESSION_VALIDATION_INTEGRATION === 'true';

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
        '[tenantSessionValidation.test.js] SKIPPED — set RUN_TENANT_SESSION_VALIDATION_INTEGRATION=true '
        + '(with MySQL admin credentials via BUSINESS_IT_DB_HOST/PORT/USER/PASSWORD, or the '
        + 'existing DB_HOST/PORT/USER/PASSWORD convention) to run this real MySQL-backed '
        + 'tenant session validation integration test locally or in CI.'
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

describeIfIntegration('Tenant session validation & edge cases (real MySQL landlord + tenant databases)', () => {
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

    async function createBusinessWithoutTenant(ownerToken, handle) {
        const createResponse = await request(app)
            .post('/businesses')
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({ legal_name: 'Acme Inc.', display_name: 'Acme Store', business_handle: handle });
        return createResponse.body.data.business.id;
    }

    describe('D-04 Enforcement (API-04)', () => {
        it('rejects activation with HTTP 403 + NO_MEMBERSHIP when the caller has no membership', async () => {
            const { token: ownerToken } = await registerAndGetToken();
            const { businessId } = await createBusinessWithTenant(ownerToken, 'd04-no-membership');

            const { token: outsiderToken } = await registerAndGetToken();
            const response = await request(app)
                .post(`/businesses/${businessId}/activate-session`)
                .set('Authorization', `Bearer ${outsiderToken}`);

            expect(response.status).toBe(403);
            expect(response.body.error.details.error_code).toBe('NO_MEMBERSHIP');
        });

        it('rejects activation with HTTP 403 + NO_TENANT_ASSIGNMENT when a staff member has membership but no tenant assignment', async () => {
            const { token: ownerToken } = await registerAndGetToken();
            const { businessId } = await createBusinessWithTenant(ownerToken, 'd04-no-assignment');

            const { token: staffToken, accountId: staffAccountId } = await registerAndGetToken();
            await businessRepository.createMembership({ accountId: staffAccountId, businessId, role: 'member' });

            const response = await request(app)
                .post(`/businesses/${businessId}/activate-session`)
                .set('Authorization', `Bearer ${staffToken}`);

            expect(response.status).toBe(403);
            expect(response.body.error.details.error_code).toBe('NO_TENANT_ASSIGNMENT');
        });

        it('an owner bypasses the assignment requirement and activates with HTTP 200', async () => {
            const { token: ownerToken } = await registerAndGetToken();
            const { businessId } = await createBusinessWithTenant(ownerToken, 'd04-owner-bypass');

            const response = await request(app)
                .post(`/businesses/${businessId}/activate-session`)
                .set('Authorization', `Bearer ${ownerToken}`);

            expect(response.status).toBe(200);
            expect(response.body.data.active_assignment).toBeNull();
        });

        it('activates with HTTP 200 when both membership and assignment requirements are met', async () => {
            const { token: ownerToken } = await registerAndGetToken();
            const { businessId, databaseName } = await createBusinessWithTenant(ownerToken, 'd04-both-met');

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
        });
    });

    describe('Edge Cases', () => {
        it('returns HTTP 404 for a non-existent business', async () => {
            const { token } = await registerAndGetToken();

            const response = await request(app)
                .post(`/businesses/${crypto.randomUUID()}/activate-session`)
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(404);
        });

        it('returns HTTP 404 (NO_TENANT_DATABASE) when the business has no database registry entry', async () => {
            const { token } = await registerAndGetToken();
            const businessId = await createBusinessWithoutTenant(token, 'no-registry-edge');

            const response = await request(app)
                .post(`/businesses/${businessId}/activate-session`)
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(404);
            expect(response.body.error.details.error_code).toBe('NO_TENANT_DATABASE');
        });

        it('rejects an unauthenticated activation request with HTTP 401', async () => {
            const response = await request(app).post(`/businesses/${crypto.randomUUID()}/activate-session`);
            expect(response.status).toBe(401);
        });
    });

    describe('Concurrent Session Activations', () => {
        it('two concurrent activation requests for different businesses both resolve correctly (no cross-contamination)', async () => {
            const { token } = await registerAndGetToken();
            const { businessId: businessIdA, databaseName: databaseNameA } = await createBusinessWithTenant(token, 'concurrent-a');
            const { businessId: businessIdB, databaseName: databaseNameB } = await createBusinessWithTenant(token, 'concurrent-b');

            const [responseA, responseB] = await Promise.all([
                request(app).post(`/businesses/${businessIdA}/activate-session`).set('Authorization', `Bearer ${token}`),
                request(app).post(`/businesses/${businessIdB}/activate-session`).set('Authorization', `Bearer ${token}`)
            ]);

            expect(responseA.status).toBe(200);
            expect(responseB.status).toBe(200);
            expect(responseA.body.data.tenant_database).toBe(databaseNameA);
            expect(responseB.body.data.tenant_database).toBe(databaseNameB);
        });
    });

    describe('Replay & Idempotency', () => {
        it('activating the same business twice both succeed; the second is idempotent', async () => {
            const { token } = await registerAndGetToken();
            const { businessId, databaseName } = await createBusinessWithTenant(token, 'replay-same-business');

            const first = await request(app)
                .post(`/businesses/${businessId}/activate-session`)
                .set('Authorization', `Bearer ${token}`);
            const second = await request(app)
                .post(`/businesses/${businessId}/activate-session`)
                .set('Authorization', `Bearer ${token}`);

            expect(first.status).toBe(200);
            expect(second.status).toBe(200);
            expect(first.body.data.tenant_database).toBe(databaseName);
            expect(second.body.data.tenant_database).toBe(databaseName);
        });

        it('activating Business A, then B, then A again all succeed with the correct context each time', async () => {
            const { token } = await registerAndGetToken();
            const { businessId: businessIdA, databaseName: databaseNameA } = await createBusinessWithTenant(token, 'replay-a-b-a-a');
            const { businessId: businessIdB, databaseName: databaseNameB } = await createBusinessWithTenant(token, 'replay-a-b-a-b');

            const firstA = await request(app)
                .post(`/businesses/${businessIdA}/activate-session`)
                .set('Authorization', `Bearer ${token}`);
            const thenB = await request(app)
                .post(`/businesses/${businessIdB}/activate-session`)
                .set('Authorization', `Bearer ${token}`);
            const backToA = await request(app)
                .post(`/businesses/${businessIdA}/activate-session`)
                .set('Authorization', `Bearer ${token}`);

            expect(firstA.status).toBe(200);
            expect(firstA.body.data.tenant_database).toBe(databaseNameA);
            expect(thenB.status).toBe(200);
            expect(thenB.body.data.tenant_database).toBe(databaseNameB);
            expect(backToA.status).toBe(200);
            expect(backToA.body.data.tenant_database).toBe(databaseNameA);
        });
    });
});

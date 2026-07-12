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
import { TenantConnector } from '../../../src/infra/tenantConnector.js';
import { provisionAndActivateTenantDatabase } from '../../helpers/tenantSchemaProvisioning.js';

/**
 * Wave 5 (04-05-PLAN.md, Task 4) — business validation, access-control, and
 * replay/idempotency integration tests. Mirrors ./businessFlows.test.js's
 * gating pattern: skips cleanly unless explicitly opted in with real MySQL
 * admin credentials.
 *
 * Wave 7 gap-closure (04-07-PLAN.md): staff onboarding (invitation/direct
 * add) now persists through a real tenant database, so `createBusiness()`
 * below provisions + marks active/verified a real per-business tenant
 * database (mirrors ../tenancy/tenantSessionFlows.test.js's
 * `createBusinessWithTenant()` helper) before every test in this file
 * exercises a staff-onboarding endpoint.
 *
 * Wave 8 gap-closure (04-08-PLAN.md, Task 2): `createBusiness()` now runs
 * the accepted operator/migration-runner handoff via
 * ../../helpers/tenantSchemaProvisioning.js's provisionAndActivateTenantDatabase()
 * instead of creating a duplicate registry row.
 */
const RUN_INTEGRATION = process.env.RUN_BUSINESS_VALIDATION_INTEGRATION === 'true';

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
        '[businessValidation.test.js] SKIPPED — set RUN_BUSINESS_VALIDATION_INTEGRATION=true '
        + '(with MySQL admin credentials via BUSINESS_IT_DB_HOST/PORT/USER/PASSWORD, or the '
        + 'existing DB_HOST/PORT/USER/PASSWORD convention) to run this real MySQL-backed '
        + 'business validation integration test locally or in CI.'
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

describeIfIntegration('Business validation, access control, and replay (real MySQL)', () => {
    const dbName = isolatedDbName();
    const provisionedTenantDbNames = [];
    let sequelize;
    let tenantConnector;
    let businessDatabaseRegistryRepository;
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

        tenantConnector = new TenantConnector(ADMIN_DB_CONFIG);

        const businessesModule = buildBusinessesModule({
            businessModel: Business,
            businessMembershipModel: BusinessMembership,
            businessDatabaseRegistryModel: BusinessDatabaseRegistry,
            sequelize,
            sendEmail: async () => ({ sent: true, reason: 'test_double' }),
            tenantConnector
        });
        const { repository: businessRepository, useCases: businessUseCases } = businessesModule;
        businessDatabaseRegistryRepository = businessesModule.businessDatabaseRegistryRepository;

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
        if (sequelize) await sequelize.close();
        await withAdminConnection(async (adminSequelize) => {
            await adminSequelize.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
            for (const tenantDbName of provisionedTenantDbNames) {
                await adminSequelize.query(`DROP DATABASE IF EXISTS \`${tenantDbName}\``);
            }
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

    /**
     * Wave 8 gap-closure (04-08-PLAN.md, Task 2): creates a business via HTTP
     * (registry row auto-created as `provisioning`), then runs the accepted
     * operator/migration-runner handoff — see
     * ../../helpers/tenantSchemaProvisioning.js.
     */
    async function createBusiness(token, overrides = {}) {
        const response = await request(app)
            .post('/businesses')
            .set('Authorization', `Bearer ${token}`)
            .send({
                legal_name: 'Acme Inc.',
                display_name: 'Acme Store',
                business_handle: `acme-${crypto.randomUUID().slice(0, 8)}`,
                ...overrides
            });
        const businessId = response.body.data.business.id;

        await provisionAndActivateTenantDatabase({
            businessDatabaseRegistryRepository,
            tenantConnector,
            withAdminConnection,
            businessId,
            provisionedTenantDbNames
        });

        return businessId;
    }

    /**
     * Creates a business via HTTP but deliberately does NOT run the
     * operator/migration-runner handoff — the registry row stays
     * `provisioning` (Wave 8 gap-closure, 04-08-PLAN.md, Task 2).
     */
    async function createBusinessStillProvisioning(token, overrides = {}) {
        const response = await request(app)
            .post('/businesses')
            .set('Authorization', `Bearer ${token}`)
            .send({
                legal_name: 'Acme Inc.',
                display_name: 'Acme Store',
                business_handle: `acme-provisioning-${crypto.randomUUID().slice(0, 8)}`,
                ...overrides
            });
        return response.body.data.business.id;
    }

    describe('Business Creation Validation', () => {
        it('rejects a duplicate business_handle with HTTP 409', async () => {
            const { token } = await registerAndGetToken();
            await createBusiness(token, { business_handle: 'dup-validation-test' });

            const { token: secondToken } = await registerAndGetToken();
            const response = await request(app)
                .post('/businesses')
                .set('Authorization', `Bearer ${secondToken}`)
                .send({ legal_name: 'Other Inc.', display_name: 'Other Store', business_handle: 'dup-validation-test' });

            expect(response.status).toBe(409);
        });

        it('rejects a missing legal_name with HTTP 400', async () => {
            const { token } = await registerAndGetToken();
            const response = await request(app)
                .post('/businesses')
                .set('Authorization', `Bearer ${token}`)
                .send({ display_name: 'Acme Store', business_handle: 'missing-legal-name' });

            expect(response.status).toBe(400);
        });

        it('rejects a missing business_handle with HTTP 400', async () => {
            const { token } = await registerAndGetToken();
            const response = await request(app)
                .post('/businesses')
                .set('Authorization', `Bearer ${token}`)
                .send({ legal_name: 'Acme Inc.', display_name: 'Acme Store' });

            expect(response.status).toBe(400);
        });

        it('rejects an invalid handle format (uppercase/special chars) with HTTP 400', async () => {
            const { token } = await registerAndGetToken();
            const response = await request(app)
                .post('/businesses')
                .set('Authorization', `Bearer ${token}`)
                .send({ legal_name: 'Acme Inc.', display_name: 'Acme Store', business_handle: 'Invalid Handle!!' });

            expect(response.status).toBe(400);
        });
    });

    describe('Staff Onboarding Validation', () => {
        it('rejects a duplicate staff email in the same business with HTTP 409', async () => {
            const { token } = await registerAndGetToken();
            const businessId = await createBusiness(token);

            await request(app)
                .post(`/businesses/${businessId}/staff`)
                .set('Authorization', `Bearer ${token}`)
                .send({ email: 'dupstaff@example.com', name: 'Person' });

            const response = await request(app)
                .post(`/businesses/${businessId}/staff`)
                .set('Authorization', `Bearer ${token}`)
                .send({ email: 'dupstaff@example.com', name: 'Person Again' });

            expect(response.status).toBe(409);
        });

        it('rejects an invalid email format with HTTP 400', async () => {
            const { token } = await registerAndGetToken();
            const businessId = await createBusiness(token);

            const response = await request(app)
                .post(`/businesses/${businessId}/staff`)
                .set('Authorization', `Bearer ${token}`)
                .send({ email: '', name: 'No Email' });

            expect(response.status).toBe(400);
        });

        it('rejects a non-owner trying to onboard staff with HTTP 403', async () => {
            const { token } = await registerAndGetToken();
            const businessId = await createBusiness(token);
            const { token: otherToken } = await registerAndGetToken();

            const response = await request(app)
                .post(`/businesses/${businessId}/staff`)
                .set('Authorization', `Bearer ${otherToken}`)
                .send({ email: 'nope@example.com', name: 'Nope' });

            expect(response.status).toBe(403);
        });

        it('Wave 8 (04-08-PLAN.md, Task 2): rejects invitation-based onboarding with HTTP 503 while the tenant database is still provisioning', async () => {
            const { token } = await registerAndGetToken();
            const businessId = await createBusinessStillProvisioning(token);

            const response = await request(app)
                .post(`/businesses/${businessId}/staff`)
                .set('Authorization', `Bearer ${token}`)
                .send({ email: 'pre-handoff@example.com', name: 'Pre Handoff' });

            expect(response.status).toBe(503);
            expect(response.body.error.details.error_code).toBe('TENANT_DATABASE_UNAVAILABLE');
            expect(response.body.error.details.reason).toBe('provisioning');
        });
    });

    describe('Access Control', () => {
        it('rejects a non-owner updating the business with HTTP 403', async () => {
            const { token } = await registerAndGetToken();
            const businessId = await createBusiness(token);
            const { token: otherToken } = await registerAndGetToken();

            const response = await request(app)
                .patch(`/businesses/${businessId}`)
                .set('Authorization', `Bearer ${otherToken}`)
                .send({ display_name: 'Hijacked' });

            expect(response.status).toBe(403);
        });

        it('rejects a non-member viewing the business with HTTP 403', async () => {
            const { token } = await registerAndGetToken();
            const businessId = await createBusiness(token);
            const { token: otherToken } = await registerAndGetToken();

            const response = await request(app).get(`/businesses/${businessId}`).set('Authorization', `Bearer ${otherToken}`);

            expect(response.status).toBe(403);
        });

        it('allows the owner to update the business with HTTP 200', async () => {
            const { token } = await registerAndGetToken();
            const businessId = await createBusiness(token);

            const response = await request(app)
                .patch(`/businesses/${businessId}`)
                .set('Authorization', `Bearer ${token}`)
                .send({ display_name: 'Legit Update' });

            expect(response.status).toBe(200);
            expect(response.body.data.business.display_name).toBe('Legit Update');
        });
    });

    describe('Replay & Idempotency', () => {
        it('creating a business twice with the same handle: first succeeds, second fails with 409', async () => {
            const { token } = await registerAndGetToken();
            const first = await request(app)
                .post('/businesses')
                .set('Authorization', `Bearer ${token}`)
                .send({ legal_name: 'Acme Inc.', display_name: 'Acme Store', business_handle: 'replay-handle-test' });

            const { token: secondToken } = await registerAndGetToken();
            const second = await request(app)
                .post('/businesses')
                .set('Authorization', `Bearer ${secondToken}`)
                .send({ legal_name: 'Other Inc.', display_name: 'Other Store', business_handle: 'replay-handle-test' });

            expect(first.status).toBe(201);
            expect(second.status).toBe(409);
        });

        it('accepting the same invitation twice: first succeeds, second fails', async () => {
            const { token } = await registerAndGetToken();
            const businessId = await createBusiness(token);
            const inviteResponse = await request(app)
                .post(`/businesses/${businessId}/staff`)
                .set('Authorization', `Bearer ${token}`)
                .send({ email: 'replay-invite@example.com', name: 'Replay Invite' });
            const invitationToken = inviteResponse.body.data.invitation.token;

            const first = await request(app).post(`/invitations/${invitationToken}/accept`).send({});
            const second = await request(app).post(`/invitations/${invitationToken}/accept`).send({});

            expect(first.status).toBe(200);
            expect(second.status).toBe(409);
        });

        it('onboarding the same staff twice via direct add: first succeeds, second fails with 409', async () => {
            const { token } = await registerAndGetToken();
            const businessId = await createBusiness(token);

            const first = await request(app)
                .post(`/businesses/${businessId}/staff`)
                .set('Authorization', `Bearer ${token}`)
                .send({ mode: 'direct', email: 'replay-direct@example.com', name: 'Replay Direct' });
            const second = await request(app)
                .post(`/businesses/${businessId}/staff`)
                .set('Authorization', `Bearer ${token}`)
                .send({ mode: 'direct', email: 'replay-direct@example.com', name: 'Replay Direct Again' });

            expect(first.status).toBe(201);
            expect(second.status).toBe(409);
        });
    });
});

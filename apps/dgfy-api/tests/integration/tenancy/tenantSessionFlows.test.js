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
import defineTerminalIdentityModel from '../../../src/models/Tenant/TerminalIdentity.js';
import { buildAccountsModule, createAccountRoutes, buildAccountAuthMiddleware } from '../../../src/modules/accounts/index.js';
import { buildBusinessesModule, createBusinessRoutes, createInvitationRoutes } from '../../../src/modules/businesses/index.js';
import { TenantConnector } from '../../../src/infra/tenantConnector.js';

/**
 * Wave 5 (04-05-PLAN.md, Task 5) — comprehensive tenant session success-flow
 * integration tests: D-04 session creation (owner bypass + staff
 * assignment), mid-session business switching, tenant isolation, staff
 * assignment verification, and terminal identity isolation.
 *
 * Mirrors ../businesses/tenantSessionRoutes.test.js's gating pattern and
 * real landlord + real per-tenant-database wiring: skips cleanly unless
 * explicitly opted in with real MySQL admin credentials.
 */
const RUN_INTEGRATION = process.env.RUN_TENANT_SESSION_FLOWS_INTEGRATION === 'true';

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
        '[tenantSessionFlows.test.js] SKIPPED — set RUN_TENANT_SESSION_FLOWS_INTEGRATION=true '
        + '(with MySQL admin credentials via BUSINESS_IT_DB_HOST/PORT/USER/PASSWORD, or the '
        + 'existing DB_HOST/PORT/USER/PASSWORD convention) to run this real MySQL-backed '
        + 'tenant session flows integration test locally or in CI.'
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

describeIfIntegration('Tenant session success flows (real MySQL landlord + tenant databases)', () => {
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
        const assignmentModel = defineAccountStaffAssignmentModel(connection);
        const terminalModel = defineTerminalIdentityModel(connection);
        await assignmentModel.sync({ force: true });
        await terminalModel.sync({ force: true });
        provisionedTenantDbNames.push(databaseName);
        return { databaseName, terminalModel };
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

        const { databaseName, terminalModel } = await provisionTenantDatabase();
        await businessDatabaseRegistryRepository.create({
            businessId,
            stableOpaqueSuffix: databaseName.replace('dgfy_business_it_', ''),
            databaseName,
            status: 'active'
        });

        return { businessId, databaseName, terminalModel };
    }

    describe('Tenant Session Creation (D-04 Enforcement)', () => {
        it('an owner (no assignment requirement) activates a session with HTTP 200 + context', async () => {
            const { token } = await registerAndGetToken();
            const { businessId, databaseName } = await createBusinessWithTenant(token, 'session-owner');

            const response = await request(app)
                .post(`/businesses/${businessId}/activate-session`)
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
            expect(response.body.data).toMatchObject({
                business_id: businessId,
                tenant_database: databaseName,
                active_assignment: null
            });
            expect(response.body.data.dgfy_account_id).toEqual(expect.any(String));
        });

        it('staff with membership + assignment activates a session with HTTP 200 + assignment context', async () => {
            const { token: ownerToken } = await registerAndGetToken();
            const { businessId, databaseName } = await createBusinessWithTenant(ownerToken, 'session-staff');

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
            expect(response.body.data.active_assignment.status).toBe('active');
        });
    });

    describe('Mid-Session Business Switching', () => {
        it('an unbound (multi-business) login can activate Business A, then B, without re-login', async () => {
            const { token, email } = await registerAndGetToken();
            const { businessId: businessIdA } = await createBusinessWithTenant(token, 'switch-flow-a');
            const { businessId: businessIdB } = await createBusinessWithTenant(token, 'switch-flow-b');

            const loginResponse = await request(app).post('/accounts/login').send({ email, password: 'StrongPass123' });
            expect(loginResponse.body.data.businesses).toHaveLength(2);
            expect(loginResponse.body.data.active_business_id).toBeUndefined();

            const activateA = await request(app)
                .post(`/businesses/${businessIdA}/activate-session`)
                .set('Authorization', `Bearer ${token}`);
            expect(activateA.status).toBe(200);
            expect(activateA.body.data.business_id).toBe(businessIdA);

            const activateB = await request(app)
                .post(`/businesses/${businessIdB}/activate-session`)
                .set('Authorization', `Bearer ${token}`);
            expect(activateB.status).toBe(200);
            expect(activateB.body.data.business_id).toBe(businessIdB);
        });
    });

    describe('Tenant Isolation', () => {
        it('user A activating Business A and user B activating Business B each resolve their own distinct tenant database', async () => {
            const { token: tokenA } = await registerAndGetToken();
            const { businessId: businessIdA, databaseName: databaseNameA } = await createBusinessWithTenant(tokenA, 'isolation-a');

            const { token: tokenB } = await registerAndGetToken();
            const { businessId: businessIdB, databaseName: databaseNameB } = await createBusinessWithTenant(tokenB, 'isolation-b');

            const responseA = await request(app)
                .post(`/businesses/${businessIdA}/activate-session`)
                .set('Authorization', `Bearer ${tokenA}`);
            const responseB = await request(app)
                .post(`/businesses/${businessIdB}/activate-session`)
                .set('Authorization', `Bearer ${tokenB}`);

            expect(responseA.body.data.tenant_database).toBe(databaseNameA);
            expect(responseB.body.data.tenant_database).toBe(databaseNameB);
            expect(databaseNameA).not.toBe(databaseNameB);
        });

        it('user A has no membership in Business B and cannot activate a session for it — no cross-tenant leakage', async () => {
            const { token: tokenA } = await registerAndGetToken();
            await createBusinessWithTenant(tokenA, 'no-leak-a');

            const { token: tokenB } = await registerAndGetToken();
            const { businessId: businessIdB } = await createBusinessWithTenant(tokenB, 'no-leak-b');

            const response = await request(app)
                .post(`/businesses/${businessIdB}/activate-session`)
                .set('Authorization', `Bearer ${tokenA}`);

            expect(response.status).toBe(403);
            expect(response.body.error.details.error_code).toBe('NO_MEMBERSHIP');
        });
    });

    describe('Staff Assignment Verification', () => {
        it('staff in Business A cannot access Business B until explicitly assigned, then can', async () => {
            const { token: ownerAToken } = await registerAndGetToken();
            await createBusinessWithTenant(ownerAToken, 'assign-verify-a');

            const { token: ownerBToken } = await registerAndGetToken();
            const { businessId: businessIdB, databaseName: databaseNameB } = await createBusinessWithTenant(ownerBToken, 'assign-verify-b');

            const { token: staffToken, accountId: staffAccountId } = await registerAndGetToken();
            await businessRepository.createMembership({ accountId: staffAccountId, businessId: businessIdB, role: 'member' });

            const beforeAssignment = await request(app)
                .post(`/businesses/${businessIdB}/activate-session`)
                .set('Authorization', `Bearer ${staffToken}`);
            expect(beforeAssignment.status).toBe(403);
            expect(beforeAssignment.body.error.details.error_code).toBe('NO_TENANT_ASSIGNMENT');

            await accountStaffAssignmentRepository.create(databaseNameB, {
                dgfyAccountId: staffAccountId,
                staffAccountId: 1,
                role: 'staff',
                status: 'active'
            });

            const afterAssignment = await request(app)
                .post(`/businesses/${businessIdB}/activate-session`)
                .set('Authorization', `Bearer ${staffToken}`);
            expect(afterAssignment.status).toBe(200);
            expect(afterAssignment.body.data.active_assignment.dgfy_account_id).toBe(staffAccountId);
        });
    });

    describe('Terminal Identity Verification', () => {
        it('a terminal created in Business A\'s tenant database is not visible when querying Business B\'s tenant database', async () => {
            const { token: ownerAToken } = await registerAndGetToken();
            const { terminalModel: terminalModelA } = await createBusinessWithTenant(ownerAToken, 'terminal-a');

            const { token: ownerBToken } = await registerAndGetToken();
            const { terminalModel: terminalModelB } = await createBusinessWithTenant(ownerBToken, 'terminal-b');

            await terminalModelA.create({ terminal_code: 'TERM-A-001', label: 'Front Counter', status: 'active' });

            const foundInA = await terminalModelA.findOne({ where: { terminal_code: 'TERM-A-001' } });
            const foundInB = await terminalModelB.findOne({ where: { terminal_code: 'TERM-A-001' } });

            expect(foundInA).not.toBeNull();
            expect(foundInB).toBeNull();
        });
    });
});

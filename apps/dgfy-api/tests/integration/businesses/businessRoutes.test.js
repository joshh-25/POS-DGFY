import crypto from 'crypto';
import request from 'supertest';
import express from 'express';
import bcrypt from 'bcryptjs';
import { Sequelize } from 'sequelize';
import defineAccountModel from '../../../src/models/Landlord/Account.js';
import defineBusinessModel from '../../../src/models/Landlord/Business.js';
import defineBusinessMembershipModel from '../../../src/models/Landlord/BusinessMembership.js';
import { buildAccountsModule, createAccountRoutes, buildAccountAuthMiddleware } from '../../../src/modules/accounts/index.js';
import { buildBusinessesModule, createBusinessRoutes, createInvitationRoutes } from '../../../src/modules/businesses/index.js';

/**
 * HTTP-layer integration tests for the businesses module (Wave 3, Task 7).
 * Mirrors the gating pattern established by
 * ../accounts/accountRepository.test.js/accountRoutes.test.js: skips
 * cleanly (never fails) unless explicitly opted in with real MySQL admin
 * credentials, so this suite never assumes a database is reachable in CI or
 * a fresh sandbox.
 *
 * Builds a standalone Express app wired through the exact same
 * dependency-injected accounts + businesses module surface as production
 * (routes/index.js) would use, so this test exercises real routing/
 * controller/middleware/access-control wiring, not a hand-rolled
 * substitute.
 */
const RUN_INTEGRATION = process.env.RUN_BUSINESS_ROUTES_INTEGRATION === 'true';

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
        '[businessRoutes.test.js] SKIPPED — set RUN_BUSINESS_ROUTES_INTEGRATION=true '
        + '(with MySQL admin credentials via BUSINESS_IT_DB_HOST/PORT/USER/PASSWORD, or the '
        + 'existing DB_HOST/PORT/USER/PASSWORD convention) to run this real MySQL-backed '
        + 'business HTTP route test locally or in CI.'
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

describeIfIntegration('Business HTTP routes (real MySQL, create/list/get/update/staff/accept)', () => {
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
        await sequelize.sync({ force: true });

        const { repository: businessRepository, useCases: businessUseCases } = buildBusinessesModule({
            businessModel: Business,
            businessMembershipModel: BusinessMembership,
            sequelize,
            sendEmail: async () => ({ sent: false, reason: 'test_double' })
        });

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
        if (sequelize) await sequelize.close();
        await withAdminConnection(async (adminSequelize) => {
            await adminSequelize.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
        });
    });

    afterEach(async () => {
        await Account.destroy({ truncate: true, force: true });
        // businesses/business_memberships are truncated via the FK cascade
        // is not guaranteed across truncate; explicitly clear both models.
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

    describe('POST /businesses', () => {
        it('creates a business and auto-assigns the creator as owner, returning HTTP 201', async () => {
            const { token } = await registerAndGetToken();

            const response = await request(app)
                .post('/businesses')
                .set('Authorization', `Bearer ${token}`)
                .send({ legal_name: 'Acme Inc.', display_name: 'Acme Store', business_handle: 'acme-store' });

            expect(response.status).toBe(201);
            expect(response.body.data.business.business_handle).toBe('acme-store');
            expect(response.body.data.membership.role).toBe('owner');
        });

        it('rejects a duplicate business_handle with HTTP 409', async () => {
            const { token } = await registerAndGetToken();
            await request(app)
                .post('/businesses')
                .set('Authorization', `Bearer ${token}`)
                .send({ legal_name: 'Acme Inc.', display_name: 'Acme Store', business_handle: 'dup-handle' });

            const { token: secondToken } = await registerAndGetToken();
            const response = await request(app)
                .post('/businesses')
                .set('Authorization', `Bearer ${secondToken}`)
                .send({ legal_name: 'Other Inc.', display_name: 'Other Store', business_handle: 'dup-handle' });

            expect(response.status).toBe(409);
        });

        it('rejects an unauthenticated request with HTTP 401', async () => {
            const response = await request(app)
                .post('/businesses')
                .send({ legal_name: 'Acme Inc.', display_name: 'Acme Store', business_handle: 'acme-store-2' });

            expect(response.status).toBe(401);
        });
    });

    describe('GET /businesses', () => {
        it('lists the authenticated account businesses with HTTP 200', async () => {
            const { token } = await registerAndGetToken();
            await request(app)
                .post('/businesses')
                .set('Authorization', `Bearer ${token}`)
                .send({ legal_name: 'Acme Inc.', display_name: 'Acme Store', business_handle: 'list-test' });

            const response = await request(app).get('/businesses').set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
            expect(response.body.data.businesses).toHaveLength(1);
        });
    });

    describe('GET /businesses/:id', () => {
        it('returns business details for a member with HTTP 200', async () => {
            const { token } = await registerAndGetToken();
            const createResponse = await request(app)
                .post('/businesses')
                .set('Authorization', `Bearer ${token}`)
                .send({ legal_name: 'Acme Inc.', display_name: 'Acme Store', business_handle: 'detail-test' });
            const businessId = createResponse.body.data.business.id;

            const response = await request(app).get(`/businesses/${businessId}`).set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
            expect(response.body.data.business.id).toBe(businessId);
        });

        it('rejects a non-member with HTTP 403', async () => {
            const { token } = await registerAndGetToken();
            const createResponse = await request(app)
                .post('/businesses')
                .set('Authorization', `Bearer ${token}`)
                .send({ legal_name: 'Acme Inc.', display_name: 'Acme Store', business_handle: 'nonmember-test' });
            const businessId = createResponse.body.data.business.id;

            const { token: otherToken } = await registerAndGetToken();
            const response = await request(app).get(`/businesses/${businessId}`).set('Authorization', `Bearer ${otherToken}`);

            expect(response.status).toBe(403);
        });
    });

    describe('PATCH /businesses/:id', () => {
        it('updates a business as the owner with HTTP 200', async () => {
            const { token } = await registerAndGetToken();
            const createResponse = await request(app)
                .post('/businesses')
                .set('Authorization', `Bearer ${token}`)
                .send({ legal_name: 'Acme Inc.', display_name: 'Acme Store', business_handle: 'update-test' });
            const businessId = createResponse.body.data.business.id;

            const response = await request(app)
                .patch(`/businesses/${businessId}`)
                .set('Authorization', `Bearer ${token}`)
                .send({ display_name: 'Acme Storefront' });

            expect(response.status).toBe(200);
            expect(response.body.data.business.display_name).toBe('Acme Storefront');
        });

        it('rejects a non-owner with HTTP 403', async () => {
            const { token } = await registerAndGetToken();
            const createResponse = await request(app)
                .post('/businesses')
                .set('Authorization', `Bearer ${token}`)
                .send({ legal_name: 'Acme Inc.', display_name: 'Acme Store', business_handle: 'nonowner-test' });
            const businessId = createResponse.body.data.business.id;

            const { token: otherToken } = await registerAndGetToken();
            const response = await request(app)
                .patch(`/businesses/${businessId}`)
                .set('Authorization', `Bearer ${otherToken}`)
                .send({ display_name: 'Hijacked' });

            expect(response.status).toBe(403);
        });
    });

    describe('POST /businesses/:id/staff + GET /businesses/:id/staff', () => {
        it('onboards staff via invitation (HTTP 202) and lists members (HTTP 200)', async () => {
            const { token } = await registerAndGetToken();
            const createResponse = await request(app)
                .post('/businesses')
                .set('Authorization', `Bearer ${token}`)
                .send({ legal_name: 'Acme Inc.', display_name: 'Acme Store', business_handle: 'staff-invite-test' });
            const businessId = createResponse.body.data.business.id;

            const inviteResponse = await request(app)
                .post(`/businesses/${businessId}/staff`)
                .set('Authorization', `Bearer ${token}`)
                .send({ email: 'staff@example.com', name: 'Staff Person' });

            expect(inviteResponse.status).toBe(202);
            expect(inviteResponse.body.data.invitation.token).toEqual(expect.any(String));

            const membersResponse = await request(app)
                .get(`/businesses/${businessId}/staff`)
                .set('Authorization', `Bearer ${token}`);

            expect(membersResponse.status).toBe(200);
            expect(membersResponse.body.data.members).toHaveLength(1); // owner only — invitation is not a membership yet
        });

        it('onboards staff directly with HTTP 201', async () => {
            const { token } = await registerAndGetToken();
            const createResponse = await request(app)
                .post('/businesses')
                .set('Authorization', `Bearer ${token}`)
                .send({ legal_name: 'Acme Inc.', display_name: 'Acme Store', business_handle: 'staff-direct-test' });
            const businessId = createResponse.body.data.business.id;

            const response = await request(app)
                .post(`/businesses/${businessId}/staff`)
                .set('Authorization', `Bearer ${token}`)
                .send({ mode: 'direct', email: 'directstaff@example.com', name: 'Direct Staff', initialPassword: 'TempPass123' });

            expect(response.status).toBe(201);
            expect(response.body.data.staffAccount.email).toBe('directstaff@example.com');
        });

        it('rejects onboarding by a non-owner with HTTP 403', async () => {
            const { token } = await registerAndGetToken();
            const createResponse = await request(app)
                .post('/businesses')
                .set('Authorization', `Bearer ${token}`)
                .send({ legal_name: 'Acme Inc.', display_name: 'Acme Store', business_handle: 'staff-forbidden-test' });
            const businessId = createResponse.body.data.business.id;

            const { token: otherToken } = await registerAndGetToken();
            const response = await request(app)
                .post(`/businesses/${businessId}/staff`)
                .set('Authorization', `Bearer ${otherToken}`)
                .send({ email: 'nope@example.com' });

            expect(response.status).toBe(403);
        });
    });

    describe('POST /invitations/:token/accept', () => {
        it('accepts a valid invitation with HTTP 200', async () => {
            const { token } = await registerAndGetToken();
            const createResponse = await request(app)
                .post('/businesses')
                .set('Authorization', `Bearer ${token}`)
                .send({ legal_name: 'Acme Inc.', display_name: 'Acme Store', business_handle: 'accept-test' });
            const businessId = createResponse.body.data.business.id;

            const inviteResponse = await request(app)
                .post(`/businesses/${businessId}/staff`)
                .set('Authorization', `Bearer ${token}`)
                .send({ email: 'acceptme@example.com', name: 'Accept Me' });
            const invitationToken = inviteResponse.body.data.invitation.token;

            const response = await request(app).post(`/invitations/${invitationToken}/accept`).send({});

            expect(response.status).toBe(200);
            expect(response.body.data.assignment.email).toBe('acceptme@example.com');
        });

        it('rejects an invalid token with HTTP 404', async () => {
            const response = await request(app).post('/invitations/not-a-real-token/accept').send({});
            expect(response.status).toBe(404);
        });
    });

    describe('GET /accounts login → businesses list (D-05)', () => {
        it('login returns the created business after account creates it', async () => {
            const { token, email } = await registerAndGetToken();
            await request(app)
                .post('/businesses')
                .set('Authorization', `Bearer ${token}`)
                .send({ legal_name: 'Acme Inc.', display_name: 'Acme Store', business_handle: 'login-list-test' });

            const loginResponse = await request(app)
                .post('/accounts/login')
                .send({ email, password: 'StrongPass123' });

            expect(loginResponse.status).toBe(200);
            expect(loginResponse.body.data.businesses).toHaveLength(1);
            expect(loginResponse.body.data.active_business_id).toBe(loginResponse.body.data.businesses[0].id);
        });
    });
});

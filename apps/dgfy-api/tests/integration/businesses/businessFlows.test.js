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
 * Wave 5 (04-05-PLAN.md, Task 4) — comprehensive business success-flow
 * integration tests: creation/ownership, business selection & mid-session
 * switching (D-05), staff onboarding (invitation + direct), and member
 * access. Mirrors ../accounts/accountFlows.test.js's gating pattern: skips
 * cleanly unless explicitly opted in with real MySQL admin credentials.
 */
const RUN_INTEGRATION = process.env.RUN_BUSINESS_FLOWS_INTEGRATION === 'true';

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
        '[businessFlows.test.js] SKIPPED — set RUN_BUSINESS_FLOWS_INTEGRATION=true '
        + '(with MySQL admin credentials via BUSINESS_IT_DB_HOST/PORT/USER/PASSWORD, or the '
        + 'existing DB_HOST/PORT/USER/PASSWORD convention) to run this real MySQL-backed '
        + 'business flows integration test locally or in CI.'
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

describeIfIntegration('Business success flows (real MySQL): creation, switching, staff onboarding, access', () => {
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
            sendEmail: async () => ({ sent: true, reason: 'test_double' })
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
        return response.body.data.business.id;
    }

    describe('Business Creation', () => {
        it('creates a business with HTTP 201 and auto-assigns the creator as owner', async () => {
            const { token, accountId } = await registerAndGetToken();

            const response = await request(app)
                .post('/businesses')
                .set('Authorization', `Bearer ${token}`)
                .send({ legal_name: 'Acme Inc.', display_name: 'Acme Store', business_handle: 'creation-flow-test' });

            expect(response.status).toBe(201);
            expect(response.body.data.membership.role).toBe('owner');
            expect(response.body.data.membership.account_id).toBe(accountId);
        });

        it('re-reads the business and verifies all fields persisted', async () => {
            const { token } = await registerAndGetToken();
            const createResponse = await request(app)
                .post('/businesses')
                .set('Authorization', `Bearer ${token}`)
                .send({ legal_name: 'Acme Inc.', display_name: 'Acme Store', business_handle: 'reread-test' });

            const businessId = createResponse.body.data.business.id;
            const getResponse = await request(app).get(`/businesses/${businessId}`).set('Authorization', `Bearer ${token}`);

            expect(getResponse.body.data.business).toMatchObject({
                id: businessId,
                legal_name: 'Acme Inc.',
                display_name: 'Acme Store',
                business_handle: 'reread-test',
                status: 'active'
            });
        });

        it('re-reads the membership and verifies the creator is owner', async () => {
            const { token } = await registerAndGetToken();
            const createResponse = await request(app)
                .post('/businesses')
                .set('Authorization', `Bearer ${token}`)
                .send({ legal_name: 'Acme Inc.', display_name: 'Acme Store', business_handle: 'membership-reread-test' });
            const businessId = createResponse.body.data.business.id;

            const membersResponse = await request(app)
                .get(`/businesses/${businessId}/staff`)
                .set('Authorization', `Bearer ${token}`);

            expect(membersResponse.body.data.members).toHaveLength(1);
            expect(membersResponse.body.data.members[0].role).toBe('owner');
        });
    });

    describe('Business Selection & Switching (D-05)', () => {
        it('a user with exactly 1 business auto-binds active_business_id on login', async () => {
            const { token, email } = await registerAndGetToken();
            await createBusiness(token, { business_handle: `single-biz-${crypto.randomUUID().slice(0, 8)}` });

            const loginResponse = await request(app).post('/accounts/login').send({ email, password: 'StrongPass123' });

            expect(loginResponse.body.data.businesses).toHaveLength(1);
            expect(loginResponse.body.data.active_business_id).toBe(loginResponse.body.data.businesses[0].id);
        });

        it('a user with 2+ businesses gets an unbound session and the full business list', async () => {
            const { token, email } = await registerAndGetToken();
            await createBusiness(token, { business_handle: `multi-a-${crypto.randomUUID().slice(0, 8)}` });
            await createBusiness(token, { business_handle: `multi-b-${crypto.randomUUID().slice(0, 8)}` });

            const loginResponse = await request(app).post('/accounts/login').send({ email, password: 'StrongPass123' });

            expect(loginResponse.body.data.businesses).toHaveLength(2);
            expect(loginResponse.body.data.active_business_id).toBeUndefined();
        });
    });

    describe('Staff Onboarding (Invitation)', () => {
        it('owner sends an invitation with HTTP 202 and staff accepts it with HTTP 200', async () => {
            const { token } = await registerAndGetToken();
            const businessId = await createBusiness(token);

            const inviteResponse = await request(app)
                .post(`/businesses/${businessId}/staff`)
                .set('Authorization', `Bearer ${token}`)
                .send({ email: 'invitee@example.com', name: 'Invitee Person' });

            expect(inviteResponse.status).toBe(202);
            const invitationToken = inviteResponse.body.data.invitation.token;

            const acceptResponse = await request(app).post(`/invitations/${invitationToken}/accept`).send({});
            expect(acceptResponse.status).toBe(200);
            expect(acceptResponse.body.data.assignment.email).toBe('invitee@example.com');
        });
    });

    describe('Staff Onboarding (Direct Add)', () => {
        it('owner directly adds staff with HTTP 201 and no invitation is created', async () => {
            const { token } = await registerAndGetToken();
            const businessId = await createBusiness(token);

            const response = await request(app)
                .post(`/businesses/${businessId}/staff`)
                .set('Authorization', `Bearer ${token}`)
                .send({ mode: 'direct', email: 'directstaff@example.com', name: 'Direct Staff', initialPassword: 'TempPass123' });

            expect(response.status).toBe(201);
            expect(response.body.data.staffAccount.email).toBe('directstaff@example.com');
            expect(response.body.data.staffAccount).not.toHaveProperty('token');
        });
    });

    describe('Business Member Access', () => {
        it('owner views the business and can see all members and roles', async () => {
            const { token } = await registerAndGetToken();
            const businessId = await createBusiness(token);
            await request(app)
                .post(`/businesses/${businessId}/staff`)
                .set('Authorization', `Bearer ${token}`)
                .send({ email: 'member-access@example.com', name: 'Member' });

            const response = await request(app).get(`/businesses/${businessId}/staff`).set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
            expect(response.body.data.members.length).toBeGreaterThanOrEqual(1);
            expect(response.body.data.members[0]).toHaveProperty('role');
        });

        it('a non-member cannot view the business staff list — HTTP 403', async () => {
            const { token } = await registerAndGetToken();
            const businessId = await createBusiness(token);
            const { token: strangerToken } = await registerAndGetToken();

            const response = await request(app)
                .get(`/businesses/${businessId}/staff`)
                .set('Authorization', `Bearer ${strangerToken}`);

            expect(response.status).toBe(403);
        });

        it('a non-member sees 403 on business details; the owner (a member) sees 200 — access control is role-gated, not identity-gated', async () => {
            const { token: ownerToken } = await registerAndGetToken();
            const businessId = await createBusiness(ownerToken);
            const { token: nonMemberToken } = await registerAndGetToken();

            const nonMemberResponse = await request(app)
                .get(`/businesses/${businessId}`)
                .set('Authorization', `Bearer ${nonMemberToken}`);
            expect(nonMemberResponse.status).toBe(403);

            const ownerResponse = await request(app)
                .get(`/businesses/${businessId}`)
                .set('Authorization', `Bearer ${ownerToken}`);
            expect(ownerResponse.status).toBe(200);
            expect(ownerResponse.body.data.business.id).toBe(businessId);
        });
    });
});

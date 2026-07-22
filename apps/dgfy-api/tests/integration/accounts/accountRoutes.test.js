import crypto from 'crypto';
import request from 'supertest';
import express from 'express';
import bcrypt from 'bcryptjs';
import { Sequelize } from 'sequelize';
import defineAccountModel from '../../../src/models/Landlord/Account.js';
import {
    buildAccountsModule,
    createAccountRoutes,
    buildAccountAuthMiddleware
} from '../../../src/modules/accounts/index.js';

/**
 * HTTP-layer integration tests for the accounts module (Wave 2, Task 3).
 * Mirrors the gating pattern established by Wave 1's
 * tests/integration/accounts/accountRepository.test.js (and
 * apps/dgfy-migration-runner's phase02/phase03Integration.test.js): skips
 * cleanly (never fails) unless explicitly opted in with real MySQL admin
 * credentials, so this suite never assumes a database is reachable in CI or
 * a fresh sandbox.
 *
 * Creates its own uniquely-suffixed, disposable dgfy_core-shaped database
 * and builds a standalone Express app wired through the exact same
 * dependency-injected accounts module surface as production would use
 * (buildAccountsModule + createAccountRoutes + buildAccountAuthMiddleware),
 * so this test exercises real routing/controller/middleware wiring, not a
 * hand-rolled substitute.
 */
const RUN_INTEGRATION = process.env.RUN_ACCOUNT_ROUTES_INTEGRATION === 'true';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-at-least-32-characters-long';

const ADMIN_DB_CONFIG = {
    host: process.env.ACCOUNT_IT_DB_HOST || process.env.DB_HOST || 'localhost',
    port: Number(process.env.ACCOUNT_IT_DB_PORT || process.env.DB_PORT || 3306),
    user: process.env.ACCOUNT_IT_DB_USER || process.env.DB_USER || 'root',
    password: process.env.ACCOUNT_IT_DB_PASSWORD || process.env.DB_PASSWORD || ''
};

if (!RUN_INTEGRATION) {
    // eslint-disable-next-line no-console
    console.log(
        '[accountRoutes.test.js] SKIPPED — set RUN_ACCOUNT_ROUTES_INTEGRATION=true '
        + '(with MySQL admin credentials via ACCOUNT_IT_DB_HOST/PORT/USER/PASSWORD, or the '
        + 'existing DB_HOST/PORT/USER/PASSWORD convention) to run this real MySQL-backed '
        + 'account HTTP route test locally or in CI.'
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

describeIfIntegration('Account HTTP routes (real MySQL, register/login/me/getAccount)', () => {
    const dbName = isolatedDbName();
    let sequelize;
    let Account;
    let app;
    let previousAdminEmails;

    beforeAll(async () => {
        previousAdminEmails = process.env.ACCOUNT_ADMIN_EMAILS;
        process.env.ACCOUNT_ADMIN_EMAILS = 'admin@example.com';

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
        await sequelize.sync({ force: true });

        const { useCases } = buildAccountsModule({
            accountModel: Account,
            hashPassword: (password) => bcrypt.hash(password, 10),
            bcrypt
        });

        const authenticateAccount = buildAccountAuthMiddleware({ getAccount: useCases.getAccount });

        app = express();
        app.use(express.json());
        app.use('/accounts', createAccountRoutes(useCases, { authenticateAccount }));
    });

    afterAll(async () => {
        process.env.ACCOUNT_ADMIN_EMAILS = previousAdminEmails;
        if (sequelize) await sequelize.close();
        await withAdminConnection(async (adminSequelize) => {
            await adminSequelize.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
        });
    });

    afterEach(async () => {
        await Account.destroy({ truncate: true, force: true });
    });

    const validRegistration = (overrides = {}) => ({
        email: 'jane@example.com',
        password: 'StrongPass123',
        first_name: 'Jane',
        last_name: 'Doe',
        phone: '+639171234567',
        ...overrides
    });

    describe('POST /accounts/register', () => {
        it('creates an account and returns HTTP 201', async () => {
            const response = await request(app).post('/accounts/register').send(validRegistration());

            expect(response.status).toBe(201);
            expect(response.body.success).toBe(true);
            expect(response.body.data.account).toMatchObject({ email: 'jane@example.com', first_name: 'Jane' });
            expect(response.body.data.account).not.toHaveProperty('password_hash');
            expect(response.body.data.token).toEqual(expect.any(String));
        });

        it('rejects a duplicate email with HTTP 409', async () => {
            await request(app).post('/accounts/register').send(validRegistration());
            const response = await request(app)
                .post('/accounts/register')
                .send(validRegistration({ phone: '+639171234568' }));

            expect(response.status).toBe(409);
            expect(response.body.success).toBe(false);
        });

        it('rejects a missing email with HTTP 400', async () => {
            const response = await request(app).post('/accounts/register').send(validRegistration({ email: '' }));

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
        });

        it('rejects a password shorter than 8 characters with HTTP 400', async () => {
            const response = await request(app)
                .post('/accounts/register')
                .send(validRegistration({ password: 'short', email: 'short@example.com' }));

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
        });
    });

    describe('POST /accounts/login', () => {
        beforeEach(async () => {
            await request(app).post('/accounts/register').send(validRegistration());
        });

        it('logs in with valid credentials and returns HTTP 200 with a session + businesses list', async () => {
            const response = await request(app)
                .post('/accounts/login')
                .send({ email: 'jane@example.com', password: 'StrongPass123' });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.token).toEqual(expect.any(String));
            expect(response.body.data.account.email).toBe('jane@example.com');
            expect(response.body.data.businesses).toEqual([]);
        });

        it('rejects the wrong password with HTTP 401', async () => {
            const response = await request(app)
                .post('/accounts/login')
                .send({ email: 'jane@example.com', password: 'WrongPass123' });

            expect(response.status).toBe(401);
            expect(response.body.success).toBe(false);
        });

        it('rejects a non-existent email with HTTP 401', async () => {
            const response = await request(app)
                .post('/accounts/login')
                .send({ email: 'nobody@example.com', password: 'StrongPass123' });

            expect(response.status).toBe(401);
            expect(response.body.success).toBe(false);
        });
    });

    describe('GET /accounts/me', () => {
        let token;

        beforeEach(async () => {
            const registerResponse = await request(app).post('/accounts/register').send(validRegistration());
            token = registerResponse.body.data.token;
        });

        it('returns the authenticated account with HTTP 200', async () => {
            const response = await request(app).get('/accounts/me').set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
            expect(response.body.data.account.email).toBe('jane@example.com');
        });

        it('rejects an unauthenticated request with HTTP 401', async () => {
            const response = await request(app).get('/accounts/me');

            expect(response.status).toBe(401);
            expect(response.body.success).toBe(false);
        });
    });

    describe('PATCH /accounts/me', () => {
        let token;

        beforeEach(async () => {
            const registerResponse = await request(app).post('/accounts/register').send(validRegistration());
            token = registerResponse.body.data.token;
        });

        it('updates the profile and returns HTTP 200', async () => {
            const response = await request(app)
                .patch('/accounts/me')
                .set('Authorization', `Bearer ${token}`)
                .send({ first_name: 'Janet' });

            expect(response.status).toBe(200);
            expect(response.body.data.account.first_name).toBe('Janet');
        });

        it('rejects an email update that collides with another account with HTTP 409', async () => {
            await request(app)
                .post('/accounts/register')
                .send(validRegistration({ email: 'other@example.com', phone: '+639171234569' }));

            const response = await request(app)
                .patch('/accounts/me')
                .set('Authorization', `Bearer ${token}`)
                .send({ email: 'other@example.com' });

            expect(response.status).toBe(409);
            expect(response.body.success).toBe(false);
        });

        it('rejects an unauthenticated request with HTTP 401', async () => {
            const response = await request(app).patch('/accounts/me').send({ first_name: 'Janet' });

            expect(response.status).toBe(401);
            expect(response.body.success).toBe(false);
        });

        it('rejects a password update shorter than 8 characters with HTTP 400', async () => {
            const response = await request(app)
                .patch('/accounts/me')
                .set('Authorization', `Bearer ${token}`)
                .send({ password: 'short' });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
        });
    });

    describe('GET /accounts/:id', () => {
        let selfToken;
        let selfId;
        let adminToken;
        let otherId;

        beforeEach(async () => {
            const selfRegister = await request(app).post('/accounts/register').send(validRegistration());
            selfToken = selfRegister.body.data.token;
            selfId = selfRegister.body.data.account.id;

            const otherRegister = await request(app)
                .post('/accounts/register')
                .send(validRegistration({ email: 'other@example.com', phone: '+639171234569' }));
            otherId = otherRegister.body.data.account.id;

            const adminRegister = await request(app)
                .post('/accounts/register')
                .send(validRegistration({ email: 'admin@example.com', phone: '+639171234570' }));
            adminToken = adminRegister.body.data.token;
        });

        it('allows self access and returns HTTP 200', async () => {
            const response = await request(app).get(`/accounts/${selfId}`).set('Authorization', `Bearer ${selfToken}`);

            expect(response.status).toBe(200);
            expect(response.body.data.account.id).toBe(selfId);
        });

        it('allows admin access to another account and returns HTTP 200', async () => {
            const response = await request(app).get(`/accounts/${otherId}`).set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.data.account.id).toBe(otherId);
        });

        it('rejects non-admin access to another account with HTTP 403', async () => {
            const response = await request(app).get(`/accounts/${otherId}`).set('Authorization', `Bearer ${selfToken}`);

            expect(response.status).toBe(403);
            expect(response.body.success).toBe(false);
        });

        it('returns HTTP 404 for a non-existent account id', async () => {
            const response = await request(app)
                .get(`/accounts/${crypto.randomUUID()}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(404);
            expect(response.body.success).toBe(false);
        });
    });

    describe('response envelope', () => {
        it('always uses the useCaseResponder success/data/error/message shape', async () => {
            const response = await request(app)
                .post('/accounts/register')
                .send(validRegistration({ email: 'shape@example.com', phone: '+639171234571' }));

            expect(response.body).toEqual(expect.objectContaining({
                success: true,
                data: expect.any(Object),
                error: null,
                message: null
            }));
        });
    });
});

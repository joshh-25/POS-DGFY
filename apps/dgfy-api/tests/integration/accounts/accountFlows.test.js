import crypto from 'crypto';
import request from 'supertest';
import express from 'express';
import bcrypt from 'bcryptjs';
import { Sequelize } from 'sequelize';
import defineAccountModel from '../../../src/models/Landlord/Account.js';
import { buildAccountsModule, createAccountRoutes, buildAccountAuthMiddleware } from '../../../src/modules/accounts/index.js';

/**
 * Wave 5 (04-05-PLAN.md, Task 1) — comprehensive account success-flow
 * integration tests: registration, login, profile update, and lookup,
 * each verified end-to-end with a re-read from the database to prove
 * persistence, not just the HTTP response shape.
 *
 * Mirrors the gating pattern established by every prior Phase 4 wave's
 * integration suite (../accounts/accountRoutes.test.js et al.): skips
 * cleanly (never fails) unless explicitly opted in with real MySQL admin
 * credentials, so this suite never assumes a database is reachable in CI or
 * a fresh sandbox. Uses the exact same dependency-injected accounts module
 * composition as production (buildAccountsModule + createAccountRoutes +
 * buildAccountAuthMiddleware).
 */
const RUN_INTEGRATION = process.env.RUN_ACCOUNT_FLOWS_INTEGRATION === 'true';

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
        '[accountFlows.test.js] SKIPPED — set RUN_ACCOUNT_FLOWS_INTEGRATION=true '
        + '(with MySQL admin credentials via ACCOUNT_IT_DB_HOST/PORT/USER/PASSWORD, or the '
        + 'existing DB_HOST/PORT/USER/PASSWORD convention) to run this real MySQL-backed '
        + 'account flows integration test locally or in CI.'
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

describeIfIntegration('Account success flows (real MySQL): registration, login, profile, lookup', () => {
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

    describe('Registration Flow', () => {
        it('registers a new user and returns HTTP 201 with an unverified account', async () => {
            const response = await request(app).post('/accounts/register').send(validRegistration());

            expect(response.status).toBe(201);
            expect(response.body.data.account.status).toBe('active');
            expect(response.body.data.account.is_email_verified).toBe(false);
        });

        it('re-reads the account and verifies every field persisted', async () => {
            await request(app).post('/accounts/register').send(validRegistration());

            const row = await Account.findOne({ where: { email: 'jane@example.com' } });
            expect(row).not.toBeNull();
            expect(row.first_name).toBe('Jane');
            expect(row.last_name).toBe('Doe');
            expect(row.phone).toBe('+639171234567');
            expect(row.status).toBe('active');
            expect(row.email_verified_at).toBeNull();
        });

        it('allows login immediately after registration (unverified users can log in per D-01)', async () => {
            await request(app).post('/accounts/register').send(validRegistration());

            const response = await request(app)
                .post('/accounts/login')
                .send({ email: 'jane@example.com', password: 'StrongPass123' });

            expect(response.status).toBe(200);
            expect(response.body.data.token).toEqual(expect.any(String));
        });

        it('rejects a concurrent duplicate-email registration: first succeeds, second fails with 409', async () => {
            const [first, second] = await Promise.all([
                request(app).post('/accounts/register').send(validRegistration()),
                request(app).post('/accounts/register').send(validRegistration({ phone: '+639171234568' }))
            ]);

            const statuses = [first.status, second.status].sort();
            expect(statuses).toEqual([201, 409]);

            const count = await Account.count({ where: { email: 'jane@example.com' } });
            expect(count).toBe(1);
        });
    });

    describe('Login & Session Flow', () => {
        beforeEach(async () => {
            await request(app).post('/accounts/register').send(validRegistration());
        });

        it('logs in with correct credentials and returns HTTP 200 + sessionToken + empty businesses list', async () => {
            const response = await request(app)
                .post('/accounts/login')
                .send({ email: 'jane@example.com', password: 'StrongPass123' });

            expect(response.status).toBe(200);
            expect(response.body.data.token).toEqual(expect.any(String));
            expect(response.body.data.businesses).toEqual([]);
        });

        it('updates last_login_at on login', async () => {
            const before = await Account.findOne({ where: { email: 'jane@example.com' } });
            expect(before.last_login_at).toBeNull();

            await request(app).post('/accounts/login').send({ email: 'jane@example.com', password: 'StrongPass123' });

            const after = await Account.findOne({ where: { email: 'jane@example.com' } });
            expect(after.last_login_at).not.toBeNull();
        });

        it('re-reads the account and verifies last_login_at changed across two logins', async () => {
            await request(app).post('/accounts/login').send({ email: 'jane@example.com', password: 'StrongPass123' });
            const firstLoginAt = (await Account.findOne({ where: { email: 'jane@example.com' } })).last_login_at;

            await new Promise((resolve) => setTimeout(resolve, 1100));
            await request(app).post('/accounts/login').send({ email: 'jane@example.com', password: 'StrongPass123' });
            const secondLoginAt = (await Account.findOne({ where: { email: 'jane@example.com' } })).last_login_at;

            expect(new Date(secondLoginAt).getTime()).toBeGreaterThan(new Date(firstLoginAt).getTime());
        });

        it('logout is stateless — the same token remains valid for a subsequent request (no server-side revocation)', async () => {
            const loginResponse = await request(app)
                .post('/accounts/login')
                .send({ email: 'jane@example.com', password: 'StrongPass123' });
            const { token } = loginResponse.body.data;

            // No server-side logout endpoint/state exists (JWT stateless design) —
            // the same token continues to authenticate successfully afterward.
            const afterLogoutResponse = await request(app).get('/accounts/me').set('Authorization', `Bearer ${token}`);
            expect(afterLogoutResponse.status).toBe(200);
        });

        it('supports multiple concurrent logins, each returning a valid session token', async () => {
            const [first, second] = await Promise.all([
                request(app).post('/accounts/login').send({ email: 'jane@example.com', password: 'StrongPass123' }),
                request(app).post('/accounts/login').send({ email: 'jane@example.com', password: 'StrongPass123' })
            ]);

            expect(first.status).toBe(200);
            expect(second.status).toBe(200);
            expect(first.body.data.token).toEqual(expect.any(String));
            expect(second.body.data.token).toEqual(expect.any(String));
        });
    });

    describe('Profile Update Flow', () => {
        let token;

        beforeEach(async () => {
            const registerResponse = await request(app).post('/accounts/register').send(validRegistration());
            token = registerResponse.body.data.token;
        });

        it('updates name and phone and returns HTTP 200 with the updated account', async () => {
            const response = await request(app)
                .patch('/accounts/me')
                .set('Authorization', `Bearer ${token}`)
                .send({ first_name: 'Janet', phone: '+639171239999' });

            expect(response.status).toBe(200);
            expect(response.body.data.account.first_name).toBe('Janet');
            expect(response.body.data.account.phone).toBe('+639171239999');
        });

        it('re-reads the account and verifies name and phone changed', async () => {
            await request(app)
                .patch('/accounts/me')
                .set('Authorization', `Bearer ${token}`)
                .send({ first_name: 'Janet', phone: '+639171239999' });

            const row = await Account.findOne({ where: { email: 'jane@example.com' } });
            expect(row.first_name).toBe('Janet');
            expect(row.phone).toBe('+639171239999');
        });

        it('rejects updating the email to one already used by another account with HTTP 409', async () => {
            await request(app)
                .post('/accounts/register')
                .send(validRegistration({ email: 'taken@example.com', phone: '+639171234599' }));

            const response = await request(app)
                .patch('/accounts/me')
                .set('Authorization', `Bearer ${token}`)
                .send({ email: 'taken@example.com' });

            expect(response.status).toBe(409);
        });

        it('updates the password and allows login again with the new password', async () => {
            await request(app)
                .patch('/accounts/me')
                .set('Authorization', `Bearer ${token}`)
                .send({ password: 'NewStrongPass456' });

            const response = await request(app)
                .post('/accounts/login')
                .send({ email: 'jane@example.com', password: 'NewStrongPass456' });

            expect(response.status).toBe(200);
        });

        it('applies a partial update (only name) and leaves other fields untouched', async () => {
            const response = await request(app)
                .patch('/accounts/me')
                .set('Authorization', `Bearer ${token}`)
                .send({ first_name: 'OnlyNameChanged' });

            expect(response.status).toBe(200);
            expect(response.body.data.account.first_name).toBe('OnlyNameChanged');
            expect(response.body.data.account.last_name).toBe('Doe');
            expect(response.body.data.account.phone).toBe('+639171234567');
        });
    });

    describe('Account Lookup Flow', () => {
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

        it('allows a user to look up their own account with HTTP 200 + full details', async () => {
            const response = await request(app).get(`/accounts/${selfId}`).set('Authorization', `Bearer ${selfToken}`);

            expect(response.status).toBe(200);
            expect(response.body.data.account.id).toBe(selfId);
            expect(response.body.data.account.email).toBe('jane@example.com');
        });

        it('allows an admin to look up another account with HTTP 200 + full details', async () => {
            const response = await request(app).get(`/accounts/${otherId}`).set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.data.account.id).toBe(otherId);
        });

        it('rejects a non-admin looking up another account with HTTP 403 Forbidden', async () => {
            const response = await request(app).get(`/accounts/${otherId}`).set('Authorization', `Bearer ${selfToken}`);

            expect(response.status).toBe(403);
        });

        it('returns HTTP 404 Not Found for a non-existent account', async () => {
            const response = await request(app)
                .get(`/accounts/${crypto.randomUUID()}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(404);
        });
    });
});

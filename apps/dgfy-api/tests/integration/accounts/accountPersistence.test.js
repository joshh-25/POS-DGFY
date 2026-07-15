import crypto from 'crypto';
import request from 'supertest';
import express from 'express';
import bcrypt from 'bcryptjs';
import { Sequelize } from 'sequelize';
import defineAccountModel from '../../../src/models/Landlord/Account.js';
import { buildAccountsModule, createAccountRoutes, buildAccountAuthMiddleware } from '../../../src/modules/accounts/index.js';

/**
 * Wave 5 (04-05-PLAN.md, Task 3) — account persistence/durability
 * integration tests: proves data survives a fresh connection re-read,
 * transaction rollback leaves data unchanged, concurrent modifications
 * remain consistent, and password hashes are never stored in plaintext.
 *
 * Mirrors ./accountFlows.test.js's gating pattern: skips cleanly (never
 * fails) unless explicitly opted in with real MySQL admin credentials.
 */
const RUN_INTEGRATION = process.env.RUN_ACCOUNT_PERSISTENCE_INTEGRATION === 'true';

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
        '[accountPersistence.test.js] SKIPPED — set RUN_ACCOUNT_PERSISTENCE_INTEGRATION=true '
        + '(with MySQL admin credentials via ACCOUNT_IT_DB_HOST/PORT/USER/PASSWORD, or the '
        + 'existing DB_HOST/PORT/USER/PASSWORD convention) to run this real MySQL-backed '
        + 'account persistence integration test locally or in CI.'
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

describeIfIntegration('Account persistence & durability (real MySQL)', () => {
    const dbName = isolatedDbName();
    let sequelize;
    let secondConnection;
    let Account;
    let SecondAccount;
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
        await sequelize.sync({ force: true });

        // A genuinely separate Sequelize connection pool to the SAME
        // database, used to prove writes made through `app`'s connection are
        // durable and visible from an entirely different connection (proves
        // transaction commit, not just in-process cache visibility).
        secondConnection = new Sequelize(dbName, ADMIN_DB_CONFIG.user, ADMIN_DB_CONFIG.password, {
            host: ADMIN_DB_CONFIG.host,
            port: ADMIN_DB_CONFIG.port,
            dialect: 'mysql',
            logging: false
        });
        SecondAccount = defineAccountModel(secondConnection);

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
        if (secondConnection) await secondConnection.close();
        if (sequelize) await sequelize.close();
        await withAdminConnection(async (adminSequelize) => {
            await adminSequelize.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
        });
    });

    afterEach(async () => {
        await Account.destroy({ truncate: true, force: true });
    });

    const validRegistration = (overrides = {}) => ({
        email: 'durable@example.com',
        password: 'StrongPass123',
        first_name: 'Durable',
        last_name: 'User',
        phone: '+639171230001',
        ...overrides
    });

    describe('Registration Persistence', () => {
        it('registers an account, then queries it via a fresh, independent connection — data intact', async () => {
            const response = await request(app).post('/accounts/register').send(validRegistration());
            expect(response.status).toBe(201);

            // Fresh connection proves the write was actually committed to disk,
            // not just cached in the writer connection's own pool.
            const row = await SecondAccount.findOne({ where: { email: 'durable@example.com' } });
            expect(row).not.toBeNull();
            expect(row.first_name).toBe('Durable');
            expect(row.phone).toBe('+639171230001');
        });
    });

    describe('Profile Update Persistence', () => {
        it('updates account fields, then reads via a separate connection — updated values visible', async () => {
            const registerResponse = await request(app).post('/accounts/register').send(validRegistration());
            const { token } = registerResponse.body.data;

            const updateResponse = await request(app)
                .patch('/accounts/me')
                .set('Authorization', `Bearer ${token}`)
                .send({ first_name: 'Updated', last_name: 'Name' });
            expect(updateResponse.status).toBe(200);

            const row = await SecondAccount.findOne({ where: { email: 'durable@example.com' } });
            expect(row.first_name).toBe('Updated');
            expect(row.last_name).toBe('Name');
        });
    });

    describe('Transaction Rollback', () => {
        it('leaves the original account unchanged when an email update fails due to a duplicate', async () => {
            const registerResponse = await request(app).post('/accounts/register').send(validRegistration());
            const { token } = registerResponse.body.data;

            await request(app)
                .post('/accounts/register')
                .send(validRegistration({ email: 'taken@example.com', phone: '+639171230002' }));

            const failedUpdate = await request(app)
                .patch('/accounts/me')
                .set('Authorization', `Bearer ${token}`)
                .send({ email: 'taken@example.com' });
            expect(failedUpdate.status).toBe(409);

            const row = await SecondAccount.findOne({ where: { email: 'durable@example.com' } });
            expect(row).not.toBeNull();
            expect(row.first_name).toBe('Durable');
        });
    });

    describe('Concurrent Modifications', () => {
        it('handles two concurrent updates to the same account, ending in a consistent final state', async () => {
            const registerResponse = await request(app).post('/accounts/register').send(validRegistration());
            const { token } = registerResponse.body.data;

            const [first, second] = await Promise.all([
                request(app)
                    .patch('/accounts/me')
                    .set('Authorization', `Bearer ${token}`)
                    .send({ first_name: 'FirstWriter' }),
                request(app)
                    .patch('/accounts/me')
                    .set('Authorization', `Bearer ${token}`)
                    .send({ first_name: 'SecondWriter' })
            ]);

            // Both concurrent partial updates succeed (last-write-wins on the
            // shared first_name field) — no crash, no data corruption.
            expect(first.status).toBe(200);
            expect(second.status).toBe(200);

            const row = await SecondAccount.findOne({ where: { email: 'durable@example.com' } });
            expect(['FirstWriter', 'SecondWriter']).toContain(row.first_name);
        });
    });

    describe('Password Hash Verification', () => {
        it('never stores the plaintext password; stores a bcrypt hash instead', async () => {
            await request(app).post('/accounts/register').send(validRegistration());

            const row = await SecondAccount.findOne({ where: { email: 'durable@example.com' } });
            expect(row.password_hash).not.toBe('StrongPass123');
            // bcrypt hash format: $2a$/$2b$/$2y$ + cost factor + 53-char salt+hash
            expect(row.password_hash).toMatch(/^\$2[aby]\$\d{2}\$.{53}$/);
        });

        it('the stored hash validates correctly against the original password via bcrypt.compare', async () => {
            await request(app).post('/accounts/register').send(validRegistration());

            const row = await SecondAccount.findOne({ where: { email: 'durable@example.com' } });
            const matches = await bcrypt.compare('StrongPass123', row.password_hash);
            expect(matches).toBe(true);

            const wrongMatches = await bcrypt.compare('WrongPassword', row.password_hash);
            expect(wrongMatches).toBe(false);
        });
    });
});

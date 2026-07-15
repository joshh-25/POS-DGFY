import crypto from 'crypto';
import { Sequelize } from 'sequelize';
import defineAccountModel from '../../../src/models/Landlord/Account.js';
import { AccountRepository } from '../../../src/modules/accounts/repositories/accountRepository.js';

/**
 * Real-MySQL-backed AccountRepository translation test (Task 6). Mirrors
 * the gating pattern established in
 * apps/dgfy-migration-runner/tests/phase02Integration.test.js and
 * phase03Integration.test.js: skips cleanly (never fails) unless explicitly
 * opted in with real MySQL admin credentials, so this suite never assumes a
 * database is reachable in CI or a fresh sandbox.
 *
 * Creates/drops its own uniquely-suffixed, disposable dgfy_core-shaped
 * database (never a real/shared one) and syncs the Account model directly
 * (this test targets Model<->Entity translation, not the migration runner's
 * own migration files).
 */
const RUN_INTEGRATION = process.env.RUN_ACCOUNT_REPOSITORY_INTEGRATION === 'true';

const ADMIN_DB_CONFIG = {
    host: process.env.ACCOUNT_IT_DB_HOST || process.env.DB_HOST || 'localhost',
    port: Number(process.env.ACCOUNT_IT_DB_PORT || process.env.DB_PORT || 3306),
    user: process.env.ACCOUNT_IT_DB_USER || process.env.DB_USER || 'root',
    password: process.env.ACCOUNT_IT_DB_PASSWORD || process.env.DB_PASSWORD || ''
};

if (!RUN_INTEGRATION) {
    // eslint-disable-next-line no-console
    console.log(
        '[accountRepository.test.js] SKIPPED — set RUN_ACCOUNT_REPOSITORY_INTEGRATION=true '
        + '(with MySQL admin credentials via ACCOUNT_IT_DB_HOST/PORT/USER/PASSWORD, or the '
        + 'existing DB_HOST/PORT/USER/PASSWORD convention) to run this real MySQL-backed '
        + 'AccountRepository translation test locally or in CI.'
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

describeIfIntegration('AccountRepository (real MySQL, dgfy_core.accounts translation)', () => {
    const dbName = isolatedDbName();
    let sequelize;
    let Account;
    let repository;

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
        repository = new AccountRepository(Account);
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

    describe('create', () => {
        it('inserts an account and returns an entity with the correct values', async () => {
            const created = await repository.create({
                email: 'Jane@Example.com',
                password_hash: 'hashed',
                first_name: 'Jane',
                last_name: 'Doe',
                phone: '+639171234567'
            });

            expect(created.id).toEqual(expect.any(String));
            expect(created.email).toBe('jane@example.com'); // model setter lowercases on write
            expect(created.status).toBe('active');
        });

        it('rejects a duplicate email at the DB constraint level', async () => {
            await repository.create({ email: 'dup@example.com', password_hash: 'hashed' });
            await expect(
                repository.create({ email: 'dup@example.com', password_hash: 'hashed' })
            ).rejects.toThrow();
        });

        it('rejects a null email (not-null constraint)', async () => {
            await expect(
                repository.create({ email: null, password_hash: 'hashed' })
            ).rejects.toThrow();
        });

        it('persists all optional fields and translates them to the entity', async () => {
            const created = await repository.create({
                email: 'full@example.com',
                password_hash: 'hashed',
                first_name: 'Full',
                last_name: 'Fields',
                phone: '+639170000000',
                status: 'active'
            });

            expect(created.first_name).toBe('Full');
            expect(created.last_name).toBe('Fields');
            expect(created.phone).toBe('+639170000000');
        });
    });

    describe('findById', () => {
        it('returns the matching entity', async () => {
            const created = await repository.create({ email: 'findme@example.com', password_hash: 'hashed' });
            const found = await repository.findById(created.id);
            expect(found.email).toBe('findme@example.com');
        });

        it('returns null for a non-existent id', async () => {
            const found = await repository.findById(crypto.randomUUID());
            expect(found).toBeNull();
        });
    });

    describe('findByEmail', () => {
        it('returns the matching entity case-insensitively', async () => {
            await repository.create({ email: 'CaseTest@Example.com', password_hash: 'hashed' });
            const found = await repository.findByEmail('casetest@example.com');
            expect(found).not.toBeNull();
            expect(found.email).toBe('casetest@example.com');
        });

        it('returns null when no account matches', async () => {
            const found = await repository.findByEmail('nobody@example.com');
            expect(found).toBeNull();
        });
    });

    describe('update', () => {
        it('updates one field and leaves the rest unchanged', async () => {
            const created = await repository.create({
                email: 'update@example.com',
                password_hash: 'hashed',
                first_name: 'Before'
            });

            const updated = await repository.update(created.id, { first_name: 'After' });

            expect(updated.first_name).toBe('After');
            expect(updated.email).toBe('update@example.com');
        });

        it('rejects updating email to one already in use', async () => {
            await repository.create({ email: 'taken@example.com', password_hash: 'hashed' });
            const created = await repository.create({ email: 'mine@example.com', password_hash: 'hashed' });

            await expect(
                repository.update(created.id, { email: 'taken@example.com' })
            ).rejects.toThrow();
        });
    });

    describe('Model <-> Entity translation', () => {
        it('round-trips all fields through modelToEntity()/entityToModel()', async () => {
            const created = await repository.create({
                email: 'roundtrip@example.com',
                password_hash: 'hashed',
                first_name: 'Round',
                last_name: 'Trip',
                phone: '+639171111111'
            });

            const model = await Account.findByPk(created.id);
            const entity = repository.modelToEntity(model);
            const backToModelFields = repository.entityToModel(entity);

            expect(entity.email).toBe('roundtrip@example.com');
            expect(backToModelFields.email).toBe(entity.email);
            expect(backToModelFields.first_name).toBe(entity.first_name);
            expect(backToModelFields.phone).toBe(entity.phone);
        });
    });
});

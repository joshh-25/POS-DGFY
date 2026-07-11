import crypto from 'crypto';
import { Sequelize } from 'sequelize';
import defineAccountModel from '../../../src/models/Landlord/Account.js';
import defineBusinessModel from '../../../src/models/Landlord/Business.js';
import defineBusinessMembershipModel from '../../../src/models/Landlord/BusinessMembership.js';
import { BusinessRepository } from '../../../src/modules/businesses/repositories/businessRepository.js';

/**
 * Real-MySQL-backed BusinessRepository test (Task 7). Mirrors the gating
 * pattern established by
 * ../accounts/accountRepository.test.js/accountRoutes.test.js and
 * apps/dgfy-migration-runner's phase02/phase03Integration.test.js: skips
 * cleanly (never fails) unless explicitly opted in with real MySQL admin
 * credentials, so this suite never assumes a database is reachable in CI or
 * a fresh sandbox.
 *
 * Creates/drops its own uniquely-suffixed, disposable dgfy_core-shaped
 * database (never a real/shared one) and syncs the Account/Business/
 * BusinessMembership models directly (this test targets repository
 * behavior against the real Sequelize models, not the migration runner's
 * own migration files).
 */
const RUN_INTEGRATION = process.env.RUN_BUSINESS_REPOSITORY_INTEGRATION === 'true';

const ADMIN_DB_CONFIG = {
    host: process.env.BUSINESS_IT_DB_HOST || process.env.DB_HOST || 'localhost',
    port: Number(process.env.BUSINESS_IT_DB_PORT || process.env.DB_PORT || 3306),
    user: process.env.BUSINESS_IT_DB_USER || process.env.DB_USER || 'root',
    password: process.env.BUSINESS_IT_DB_PASSWORD || process.env.DB_PASSWORD || ''
};

if (!RUN_INTEGRATION) {
    // eslint-disable-next-line no-console
    console.log(
        '[businessRepository.test.js] SKIPPED — set RUN_BUSINESS_REPOSITORY_INTEGRATION=true '
        + '(with MySQL admin credentials via BUSINESS_IT_DB_HOST/PORT/USER/PASSWORD, or the '
        + 'existing DB_HOST/PORT/USER/PASSWORD convention) to run this real MySQL-backed '
        + 'BusinessRepository test locally or in CI.'
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

describeIfIntegration('BusinessRepository (real MySQL, dgfy_core.businesses/business_memberships)', () => {
    const dbName = isolatedDbName();
    let sequelize;
    let Account;
    let Business;
    let BusinessMembership;
    let repository;
    let ownerAccountId;

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
        Business = defineBusinessModel(sequelize);
        BusinessMembership = defineBusinessMembershipModel(sequelize);
        await sequelize.sync({ force: true });

        repository = new BusinessRepository({
            businessModel: Business,
            businessMembershipModel: BusinessMembership,
            sequelize
        });
    });

    afterAll(async () => {
        if (sequelize) await sequelize.close();
        await withAdminConnection(async (adminSequelize) => {
            await adminSequelize.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
        });
    });

    beforeEach(async () => {
        const account = await Account.create({ email: `owner-${crypto.randomUUID()}@example.com`, password_hash: 'hashed' });
        ownerAccountId = account.id;
    });

    afterEach(async () => {
        await BusinessMembership.destroy({ truncate: true, force: true });
        await Business.destroy({ truncate: true, force: true });
        await Account.destroy({ truncate: true, force: true });
    });

    describe('create', () => {
        it('inserts a business and auto-assigns the creator as owner in one transaction (D-10)', async () => {
            const { business, membership } = await repository.create({
                business_handle: 'Acme-Store',
                legal_name: 'Acme Inc.',
                display_name: 'Acme Store',
                creatorAccountId: ownerAccountId
            });

            expect(business.id).toEqual(expect.any(String));
            expect(business.business_handle).toBe('acme-store'); // model setter lowercases
            expect(business.status).toBe('active');

            expect(membership.account_id).toBe(ownerAccountId);
            expect(membership.business_id).toBe(business.id);
            expect(membership.role).toBe('owner');
            expect(membership.status).toBe('active');
        });

        it('rejects a duplicate business_handle at the DB constraint level', async () => {
            await repository.create({
                business_handle: 'dup-handle',
                legal_name: 'First',
                display_name: 'First',
                creatorAccountId: ownerAccountId
            });

            await expect(repository.create({
                business_handle: 'dup-handle',
                legal_name: 'Second',
                display_name: 'Second',
                creatorAccountId: ownerAccountId
            })).rejects.toThrow();
        });
    });

    describe('findById / findByHandle', () => {
        it('finds a business by id and case-insensitively by handle', async () => {
            const { business } = await repository.create({
                business_handle: 'Case-Test',
                legal_name: 'Case Test',
                display_name: 'Case Test',
                creatorAccountId: ownerAccountId
            });

            const byId = await repository.findById(business.id);
            expect(byId.id).toBe(business.id);

            const byHandle = await repository.findByHandle('CASE-TEST');
            expect(byHandle.id).toBe(business.id);
        });

        it('returns null for a non-existent id/handle', async () => {
            expect(await repository.findById(crypto.randomUUID())).toBeNull();
            expect(await repository.findByHandle('nope')).toBeNull();
        });
    });

    describe('update', () => {
        it('updates one field and leaves the rest unchanged', async () => {
            const { business } = await repository.create({
                business_handle: 'update-test',
                legal_name: 'Before',
                display_name: 'Before',
                creatorAccountId: ownerAccountId
            });

            const updated = await repository.update(business.id, { display_name: 'After' });

            expect(updated.display_name).toBe('After');
            expect(updated.legal_name).toBe('Before');
        });
    });

    describe('findAccountBusinesses', () => {
        it('lists every business the account has an active membership in', async () => {
            const { business: businessOne } = await repository.create({
                business_handle: 'biz-one',
                legal_name: 'Biz One',
                display_name: 'Biz One',
                creatorAccountId: ownerAccountId
            });
            const { business: businessTwo } = await repository.create({
                business_handle: 'biz-two',
                legal_name: 'Biz Two',
                display_name: 'Biz Two',
                creatorAccountId: ownerAccountId
            });

            const businesses = await repository.findAccountBusinesses(ownerAccountId);

            expect(businesses.map((b) => b.id).sort()).toEqual([businessOne.id, businessTwo.id].sort());
        });

        it('returns an empty list for an account with no memberships', async () => {
            const otherAccount = await Account.create({ email: `nomember-${crypto.randomUUID()}@example.com`, password_hash: 'hashed' });
            const businesses = await repository.findAccountBusinesses(otherAccount.id);
            expect(businesses).toEqual([]);
        });
    });

    describe('listMembers / createMembership / getMembership', () => {
        it('lists all members including a newly added one', async () => {
            const { business } = await repository.create({
                business_handle: 'members-test',
                legal_name: 'Members Test',
                display_name: 'Members Test',
                creatorAccountId: ownerAccountId
            });
            const secondAccount = await Account.create({ email: `member-${crypto.randomUUID()}@example.com`, password_hash: 'hashed' });

            await repository.createMembership({ accountId: secondAccount.id, businessId: business.id, role: 'manager' });

            const members = await repository.listMembers(business.id);
            expect(members).toHaveLength(2);

            const ownerMembership = await repository.getMembership(ownerAccountId, business.id);
            expect(ownerMembership.role).toBe('owner');
        });
    });
});

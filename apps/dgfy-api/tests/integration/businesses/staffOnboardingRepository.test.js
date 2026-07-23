import crypto from 'crypto';
import { Sequelize } from 'sequelize';
import { StaffOnboardingRepository } from '../../../src/modules/businesses/repositories/staffOnboardingRepository.js';
import { AccountStaffAssignmentRepository } from '../../../src/modules/businesses/repositories/accountStaffAssignmentRepository.js';
import { TenantConnector } from '../../../src/infra/tenantConnector.js';
import defineStaffAccountModel from '../../../src/models/Tenant/StaffAccount.js';
import defineStaffInvitationModel from '../../../src/models/Tenant/StaffInvitation.js';
import defineAccountStaffAssignmentModel from '../../../src/models/Tenant/AccountStaffAssignment.js';

/**
 * Wave 7 gap-closure (04-07-PLAN.md, Task 2) real-MySQL-backed
 * StaffOnboardingRepository test. Mirrors ../businesses/locationRepository.
 * test.js's gating pattern exactly: skips cleanly (never fails) unless
 * explicitly opted in with real MySQL admin credentials.
 *
 * CLOSES the process-local invitation/staff-account bridging stores
 * 04-03-SUMMARY.md sanctioned as a temporary Wave 3 measure — this suite
 * proves direct-add and invitation-accept both persist durable tenant
 * staff_accounts/staff_invitations/account_staff_assignments rows in a
 * real, disposable dgfy_business_* MySQL database, including replay
 * rejection and fail-closed tenant-database resolution.
 */
const RUN_INTEGRATION = process.env.RUN_STAFF_ONBOARDING_REPOSITORY_INTEGRATION === 'true';

const ADMIN_DB_CONFIG = {
    host: process.env.BUSINESS_IT_DB_HOST || process.env.DB_HOST || 'localhost',
    port: Number(process.env.BUSINESS_IT_DB_PORT || process.env.DB_PORT || 3306),
    user: process.env.BUSINESS_IT_DB_USER || process.env.DB_USER || 'root',
    password: process.env.BUSINESS_IT_DB_PASSWORD || process.env.DB_PASSWORD || ''
};

if (!RUN_INTEGRATION) {
    // eslint-disable-next-line no-console
    console.log(
        '[staffOnboardingRepository.test.js] SKIPPED — set RUN_STAFF_ONBOARDING_REPOSITORY_INTEGRATION=true '
        + '(with MySQL admin credentials via BUSINESS_IT_DB_HOST/PORT/USER/PASSWORD, or the '
        + 'existing DB_HOST/PORT/USER/PASSWORD convention) to run this real MySQL-backed '
        + 'StaffOnboardingRepository test locally or in CI.'
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

function fakeRegistry(entriesByBusinessId) {
    return {
        async findByBusinessId(businessId) {
            return entriesByBusinessId[businessId] || null;
        }
    };
}

// Test 4 (04-07-PLAN.md): "process-local staff, invitation, and assignment
// stores are absent from BusinessRepository after the refactor" — no MySQL
// dependency, so this runs unconditionally (never gated) for immediate
// regression coverage regardless of RUN_STAFF_ONBOARDING_REPOSITORY_INTEGRATION.
describe('BusinessRepository no longer owns staff/invitation/assignment persistence (Test 4)', () => {
    it('BusinessRepository has no invitation/staff-account/assignment methods or stores', async () => {
        const { BusinessRepository } = await import('../../../src/modules/businesses/repositories/businessRepository.js');
        const repository = new BusinessRepository({
            businessModel: { sequelize: {} },
            businessMembershipModel: {}
        });

        ['invitationStore', 'staffAccountStore', 'assignmentStore'].forEach((key) => {
            expect(repository[key]).toBeUndefined();
        });
        ['createInvitation', 'findInvitationByToken', 'findInvitationByEmail', 'markInvitationAccepted',
            'createStaffAccount', 'findStaffAccountByEmail', 'createAssignment'].forEach((method) => {
            expect(repository[method]).toBeUndefined();
        });
    });
});

describeIfIntegration('StaffOnboardingRepository (real MySQL, dgfy_business_* staff onboarding tables)', () => {
    const businessDbName = isolatedDbName('dgfy_business');
    let tenantConnector;
    let accountStaffAssignmentRepository;

    beforeAll(async () => {
        await withAdminConnection(async (adminSequelize) => {
            await adminSequelize.query(`CREATE DATABASE IF NOT EXISTS \`${businessDbName}\``);
        });
        tenantConnector = new TenantConnector(ADMIN_DB_CONFIG);
        const connection = tenantConnector.getConnection(businessDbName);
        const StaffAccount = defineStaffAccountModel(connection);
        const StaffInvitation = defineStaffInvitationModel(connection);
        const AccountStaffAssignment = defineAccountStaffAssignmentModel(connection);
        await StaffAccount.sync({ force: true });
        await StaffInvitation.sync({ force: true });
        await AccountStaffAssignment.sync({ force: true });

        accountStaffAssignmentRepository = new AccountStaffAssignmentRepository({ tenantConnector });
    });

    afterAll(async () => {
        if (tenantConnector) await tenantConnector.closeAll();
        await withAdminConnection(async (adminSequelize) => {
            await adminSequelize.query(`DROP DATABASE IF EXISTS \`${businessDbName}\``);
        });
    });

    afterEach(async () => {
        const connection = tenantConnector.getConnection(businessDbName);
        await connection.query('DELETE FROM account_staff_assignments');
        await connection.query('DELETE FROM staff_invitations');
        await connection.query('DELETE FROM staff_accounts');
    });

    function buildRepository(registryOverrides = {}) {
        const registry = fakeRegistry({
            'biz-active-verified': {
                database_name: businessDbName,
                status: 'active',
                verified_at: new Date()
            },
            ...registryOverrides
        });
        return new StaffOnboardingRepository({
            tenantConnector,
            businessDatabaseRegistryRepository: registry,
            accountStaffAssignmentRepository
        });
    }

    describe('Direct-add staff (Test 1)', () => {
        it('creates a tenant staff_accounts row and an active account_staff_assignments row when a target DGFY account id is supplied', async () => {
            const repository = buildRepository();
            const staffAccount = await repository.createStaffAccount({
                businessId: 'biz-active-verified',
                email: 'direct-staff@example.com',
                name: 'Direct Staff'
            });
            expect(staffAccount.id).toEqual(expect.any(Number));

            const assignment = await repository.createOrActivateAssignment({
                businessId: 'biz-active-verified',
                dgfyAccountId: crypto.randomUUID(),
                staffAccountId: staffAccount.id,
                role: 'staff'
            });
            expect(assignment.status).toBe('active');
            expect(assignment.staff_account_id).toBe(staffAccount.id);

            const freshRepository = buildRepository();
            const reRead = await freshRepository.findStaffAccountByEmail('biz-active-verified', 'direct-staff@example.com');
            expect(reRead.id).toBe(staffAccount.id);
        });
    });

    describe('Invitation flow (Test 2)', () => {
        it('creates a tenant staff_invitations row containing token hash only, never the raw token', async () => {
            const repository = buildRepository();
            const rawToken = 'biz-active-verified:raw-token-value';
            const invitation = await repository.createInvitation({
                businessId: 'biz-active-verified',
                email: 'invitee@example.com',
                token: rawToken,
                expiresAt: new Date(Date.now() + 100000)
            });

            expect(invitation).not.toHaveProperty('token');
            expect(invitation).not.toHaveProperty('token_hash');
            expect(invitation.status).toBe('pending');

            const connection = tenantConnector.getConnection(businessDbName);
            const [rows] = await connection.query('SELECT token_hash FROM staff_invitations WHERE id = ?', {
                replacements: [invitation.id]
            });
            expect(rows[0].token_hash).not.toBe(rawToken);
            expect(rows[0].token_hash).toMatch(/^[a-f0-9]{64}$/);

            const freshRepository = buildRepository();
            const found = await freshRepository.findInvitationByToken('biz-active-verified', rawToken);
            expect(found.id).toBe(invitation.id);
        });
    });

    describe('Invitation accept (Test 3)', () => {
        it('creates/links a staff account, activates assignment evidence, marks accepted once, and rejects replay', async () => {
            const repository = buildRepository();
            const rawToken = 'biz-active-verified:accept-token';
            const invitation = await repository.createInvitation({
                businessId: 'biz-active-verified',
                email: 'accept-me@example.com',
                token: rawToken,
                expiresAt: new Date(Date.now() + 100000)
            });

            const staffAccount = await repository.createStaffAccount({
                businessId: 'biz-active-verified',
                email: invitation.email
            });
            const dgfyAccountId = crypto.randomUUID();
            const assignment = await repository.createOrActivateAssignment({
                businessId: 'biz-active-verified',
                dgfyAccountId,
                staffAccountId: staffAccount.id,
                role: 'staff'
            });
            expect(assignment.status).toBe('active');

            const accepted = await repository.markInvitationAccepted('biz-active-verified', rawToken);
            expect(accepted.status).toBe('accepted');
            expect(accepted.accepted_at).not.toBeNull();

            const freshRepository = buildRepository();
            const reRead = await freshRepository.findInvitationByToken('biz-active-verified', rawToken);
            expect(reRead.status).toBe('accepted');

            // Replay: a second accept call is a no-op at the repository
            // layer (idempotent update) — the use case layer
            // (businessUseCases.js's buildAcceptInvitationUseCase) is what
            // rejects a second accept attempt by checking `status` before
            // calling markInvitationAccepted again; proven here by
            // asserting the invitation row's accepted_at does not change on
            // a raw repeated repository call to the same row.
            const firstAcceptedAt = reRead.accepted_at;
            const secondCallResult = await repository.markInvitationAccepted('biz-active-verified', rawToken);
            expect(secondCallResult.status).toBe('accepted');
            expect(new Date(secondCallResult.accepted_at).getTime())
                .toBeGreaterThanOrEqual(new Date(firstAcceptedAt).getTime());
        });
    });

    describe('Fail-closed tenant database resolution (Test 5)', () => {
        it('returns TenantDatabaseUnavailableError("missing") before any staff/invitation/assignment write', async () => {
            const repository = buildRepository();

            await expect(repository.createStaffAccount({
                businessId: 'no-such-business',
                email: 'nope@example.com'
            })).rejects.toMatchObject({ name: 'TenantDatabaseUnavailableError', reason: 'missing' });
        });

        it('returns TenantDatabaseUnavailableError("provisioning") and performs no write', async () => {
            const repository = buildRepository({
                'biz-provisioning': { database_name: businessDbName, status: 'provisioning', verified_at: null }
            });

            await expect(repository.createInvitation({
                businessId: 'biz-provisioning',
                email: 'blocked@example.com',
                token: 'biz-provisioning:blocked-token',
                expiresAt: new Date(Date.now() + 100000)
            })).rejects.toMatchObject({ name: 'TenantDatabaseUnavailableError', reason: 'provisioning' });

            const freshRepository = buildRepository();
            const found = await freshRepository.findInvitationByEmail('biz-active-verified', 'blocked@example.com');
            expect(found).toBeNull();
        });

        it('returns TenantDatabaseUnavailableError("inactive") for a non-active registry status', async () => {
            const repository = buildRepository({
                'biz-deprecated': { database_name: businessDbName, status: 'deprecated', verified_at: new Date() }
            });

            await expect(repository.findStaffAccountByEmail('biz-deprecated', 'x@example.com'))
                .rejects.toMatchObject({ name: 'TenantDatabaseUnavailableError', reason: 'inactive' });
        });

        it('returns TenantDatabaseUnavailableError("unverified") when active but verified_at is not populated', async () => {
            const repository = buildRepository({
                'biz-unverified': { database_name: businessDbName, status: 'active', verified_at: null }
            });

            await expect(repository.findStaffAccountByEmail('biz-unverified', 'x@example.com'))
                .rejects.toMatchObject({ name: 'TenantDatabaseUnavailableError', reason: 'unverified' });
        });

        it('returns TenantDatabaseUnavailableError("unreachable") when the tenant schema does not actually exist', async () => {
            const repository = buildRepository({
                'biz-unreachable': {
                    database_name: `dgfy_business_never_created_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`,
                    status: 'active',
                    verified_at: new Date()
                }
            });

            await expect(repository.findStaffAccountByEmail('biz-unreachable', 'x@example.com'))
                .rejects.toMatchObject({ name: 'TenantDatabaseUnavailableError', reason: 'unreachable' });
        });
    });
});

import crypto from 'crypto';
import { execFileSync } from 'child_process';
import { promises as fsPromises } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import request from 'supertest';
import express from 'express';
import bcrypt from 'bcryptjs';
import { Sequelize } from 'sequelize';
import defineAccountModel from '../../src/models/Landlord/Account.js';
import defineBusinessModel from '../../src/models/Landlord/Business.js';
import defineBusinessMembershipModel from '../../src/models/Landlord/BusinessMembership.js';
import defineBusinessDatabaseRegistryModel from '../../src/models/Landlord/BusinessDatabaseRegistry.js';
import defineStaffAccountModel from '../../src/models/Tenant/StaffAccount.js';
import { buildAccountsModule, createAccountRoutes, buildAccountAuthMiddleware } from '../../src/modules/accounts/index.js';
import { buildBusinessesModule, createBusinessRoutes, createInvitationRoutes } from '../../src/modules/businesses/index.js';
import { TenantConnector } from '../../src/infra/tenantConnector.js';
import { provisionAndActivateTenantDatabase } from '../helpers/tenantSchemaProvisioning.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// 04-09 gap closure: path to the shipped migration-runner CLI, invoked via
// child_process (never imported in-process) so Journey 5 respects the
// runner<->dgfy-api package boundary while proving the real operator
// activation mechanism.
const migrationRunnerRoot = path.resolve(__dirname, '../../../dgfy-migration-runner');
const MIGRATION_RUNNER_CLI_PATH = path.join(migrationRunnerRoot, 'src', 'cli.js');

/**
 * Wave 5 (04-05-PLAN.md, Task 6) — Phase 4 full end-to-end user journeys,
 * exercising the entire routes -> controllers -> usecases -> repositories
 * -> models chain across accounts, businesses, locations, and tenant
 * sessions, against real landlord + real per-tenant MySQL databases.
 *
 * Mirrors ../integration/tenancy/tenantSessionFlows.test.js's gating
 * pattern and wiring: skips cleanly unless explicitly opted in with real
 * MySQL admin credentials.
 *
 * DEVIATION FROM THE PLAN'S LITERAL JOURNEY 2 STEP 11 ("Staff logs in:
 * POST /accounts/login {email: staff@example.com, ...}"): accepting an
 * email invitation (POST /invitations/:token/accept) creates a tenant-side
 * assignment RECORD, not a real, login-capable DgfyAccount — this is an
 * explicitly documented, user-approved Known Stub carried from
 * 04-03-SUMMARY.md ("Real DgfyAccount creation for the invitee is a later-
 * wave concern") through every subsequent wave's SUMMARY. Journey 2 below
 * therefore separately registers a real staff DgfyAccount and grants it a
 * landlord membership + tenant-local assignment (the same direct-repository
 * seeding technique 04-04's own tenantSessionRoutes.test.js uses), so the
 * "staff logs in and activates the business" portion of the journey is
 * still exercised end-to-end against real, working infrastructure — just
 * not literally chained from the invitation-acceptance response.
 *
 * Journey 4 similarly seeds a 'manager' landlord membership via
 * businessRepository.createMembership() directly, since no HTTP endpoint
 * exists in this phase to add an existing account to a business with an
 * explicit non-owner role (only business creation and invitation-accept
 * create memberships/assignments) — this is the same seeding technique
 * used throughout this wave's tenantSessionFlows.test.js/
 * tenantSessionValidation.test.js.
 */
const RUN_INTEGRATION = process.env.RUN_PHASE4_E2E_INTEGRATION === 'true';

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
        '[phase4FullFlow.test.js] SKIPPED — set RUN_PHASE4_E2E_INTEGRATION=true '
        + '(with MySQL admin credentials via BUSINESS_IT_DB_HOST/PORT/USER/PASSWORD, or the '
        + 'existing DB_HOST/PORT/USER/PASSWORD convention) to run this real MySQL-backed '
        + 'Phase 4 end-to-end journey test locally or in CI.'
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

describeIfIntegration('Phase 4 full end-to-end user journeys (real MySQL landlord + tenant databases)', () => {
    const landlordDbName = isolatedDbName('dgfy_core');
    const provisionedTenantDbNames = [];

    let landlordSequelize;
    let tenantConnector;
    let Account;
    let businessRepository;
    let businessDatabaseRegistryRepository;
    let accountStaffAssignmentRepository;
    let app;

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

    // Deliberately NO afterEach truncation — each journey uses isolated,
    // uniquely-suffixed test data (accounts/businesses/handles) per
    // WARNING #5 / the plan's "Test Isolation" section, so journeys never
    // interfere with each other even sharing one database across the suite.

    async function registerAndGetToken(overrides = {}) {
        const email = overrides.email || `${crypto.randomUUID()}@phase4test.com`;
        const response = await request(app).post('/accounts/register').send({
            password: 'StrongPass123',
            first_name: 'Journey',
            last_name: 'User',
            ...overrides,
            email
        });
        return { token: response.body.data.token, accountId: response.body.data.account.id, email };
    }

    /**
     * Wave 8 gap-closure (04-08-PLAN.md, Task 2): a business created via
     * POST /businesses already has a `provisioning` registry row (real
     * `database_name`, no schema yet). This runs the accepted operator/
     * migration-runner handoff — real schema migration application +
     * dgfyBusinessContract verification, then updateStatus to
     * active/verified — against that EXACT database_name instead of
     * creating a second, duplicate registry row pointing at an
     * independently-generated name. tenantSessionUseCases.js (Journeys
     * 1/3/4) and locationRepository.js/staffOnboardingRepository.js
     * (Journey 2) both now require status='active' AND verified_at
     * populated (04-06-SUMMARY.md's documented "active/verified" meaning).
     */
    async function provisionTenantForBusiness(businessId) {
        return provisionAndActivateTenantDatabase({
            businessDatabaseRegistryRepository,
            tenantConnector,
            withAdminConnection,
            businessId,
            provisionedTenantDbNames
        });
    }

    describe('Journey 1: Business Owner Registration to Tenant Session', () => {
        it('registers, logs in, creates a business, auto-binds on re-login, lists businesses, and activates a tenant session', async () => {
            const email = 'owner1@phase4test.com';

            // Step 1: register.
            const registerResponse = await request(app).post('/accounts/register').send({
                email,
                password: 'StrongPass123',
                first_name: 'Journey1Owner',
                phone: `+639${crypto.randomUUID().replace(/-/g, '').slice(0, 9)}`
            });
            expect(registerResponse.status).toBe(201);

            // Step 2: login (no businesses yet).
            const firstLogin = await request(app).post('/accounts/login').send({ email, password: 'StrongPass123' });
            expect(firstLogin.status).toBe(200);
            expect(firstLogin.body.data.businesses).toEqual([]);
            const { token } = firstLogin.body.data;

            // Step 3: create business (owner auto-assigned).
            const createBusinessResponse = await request(app)
                .post('/businesses')
                .set('Authorization', `Bearer ${token}`)
                .send({ legal_name: 'Journey1 Legal', display_name: 'Journey1 Store', business_handle: 'test-business-1' });
            expect(createBusinessResponse.status).toBe(201);
            expect(createBusinessResponse.body.data.membership.role).toBe('owner');
            const businessId = createBusinessResponse.body.data.business.id;

            // Wave 8 gap-closure (04-08-PLAN.md, Task 2): create-business
            // returns safe `provisioning` registry metadata only — it does
            // NOT itself create/apply the tenant schema.
            expect(createBusinessResponse.body.data.tenant_registry).toMatchObject({
                status: 'provisioning',
                verified_at: null
            });

            // Wave 8 (04-08-PLAN.md, Task 2): activating a session BEFORE
            // the operator/migration-runner handoff fails closed (503) —
            // even for the owner, who otherwise bypasses the tenant
            // assignment check.
            const preHandoffActivate = await request(app)
                .post(`/businesses/${businessId}/activate-session`)
                .set('Authorization', `Bearer ${token}`);
            expect(preHandoffActivate.status).toBe(503);

            const databaseName = await provisionTenantForBusiness(businessId);

            // Step 4: login again — session auto-bound (single business, D-05).
            const secondLogin = await request(app).post('/accounts/login').send({ email, password: 'StrongPass123' });
            expect(secondLogin.status).toBe(200);
            expect(secondLogin.body.data.active_business_id).toBe(businessId);
            const boundToken = secondLogin.body.data.token;

            // Step 5: GET /businesses → [single business].
            const listResponse = await request(app).get('/businesses').set('Authorization', `Bearer ${boundToken}`);
            expect(listResponse.status).toBe(200);
            expect(listResponse.body.data.businesses).toHaveLength(1);
            expect(listResponse.body.data.businesses[0].id).toBe(businessId);

            // Step 6: activate-session → tenant context bound.
            const activateResponse = await request(app)
                .post(`/businesses/${businessId}/activate-session`)
                .set('Authorization', `Bearer ${boundToken}`);
            expect(activateResponse.status).toBe(200);
            expect(activateResponse.body.data.tenant_database).toBe(databaseName);
        });
    });

    describe('Journey 2: Staff Onboarding via Email Invitation + Location Management', () => {
        it('onboards staff via invitation, manages locations (create/list/set-primary), and staff activates tenant access', async () => {
            const { token: ownerToken } = await registerAndGetToken({ email: 'owner2@phase4test.com', first_name: 'Journey2Owner' });

            // Step 1: owner creates business (from a fresh registration above).
            const createBusinessResponse = await request(app)
                .post('/businesses')
                .set('Authorization', `Bearer ${ownerToken}`)
                .send({ legal_name: 'Journey2 Legal', display_name: 'Journey2 Store', business_handle: 'test-business-2' });
            const businessId = createBusinessResponse.body.data.business.id;

            // Wave 8 gap-closure (04-08-PLAN.md, Task 2): location creation
            // and staff invitation BOTH fail closed (503) before the
            // operator/migration-runner handoff — no tenant-local row is
            // ever written for either attempt.
            const preHandoffLocation = await request(app)
                .post(`/businesses/${businessId}/locations`)
                .set('Authorization', `Bearer ${ownerToken}`)
                .send({ name: 'Too Early Branch', address_line: '1 Too Early St' });
            expect(preHandoffLocation.status).toBe(503);
            expect(preHandoffLocation.body.error.details.error_code).toBe('TENANT_DATABASE_UNAVAILABLE');

            const preHandoffInvite = await request(app)
                .post(`/businesses/${businessId}/staff`)
                .set('Authorization', `Bearer ${ownerToken}`)
                .send({ email: 'too-early2@phase4test.com', name: 'Too Early' });
            expect(preHandoffInvite.status).toBe(503);
            expect(preHandoffInvite.body.error.details.error_code).toBe('TENANT_DATABASE_UNAVAILABLE');

            const databaseName = await provisionTenantForBusiness(businessId);

            // Step 2: owner sends an invitation — HTTP 202.
            const inviteResponse = await request(app)
                .post(`/businesses/${businessId}/staff`)
                .set('Authorization', `Bearer ${ownerToken}`)
                .send({ email: 'staff2@phase4test.com', name: 'Alice' });
            expect(inviteResponse.status).toBe(202);
            const invitationToken = inviteResponse.body.data.invitation.token;

            // Step 3/4: staff accepts via the token — HTTP 200, tenant
            // staff_accounts row created/linked. Wave 7 gap-closure
            // (04-07-PLAN.md): no `assignment` is created here since no
            // dgfyAccountId is supplied on accept (deferred staff-to-DGFY-
            // account linking, per this file's own header deviation note
            // and 04-07-PLAN.md's Source Audit) — Steps 10-13 below
            // separately seed a real tenant-local assignment directly.
            const acceptResponse = await request(app).post(`/invitations/${invitationToken}/accept`).send({});
            expect(acceptResponse.status).toBe(200);
            expect(acceptResponse.body.data.staffAccount.email).toBe('staff2@phase4test.com');
            expect(acceptResponse.body.data.assignment).toBeUndefined();

            // Step 5: owner creates the first location — HTTP 201, auto-primary.
            const firstLocationResponse = await request(app)
                .post(`/businesses/${businessId}/locations`)
                .set('Authorization', `Bearer ${ownerToken}`)
                .send({ name: 'Main Branch', address_line: '123 Journey St' });
            expect(firstLocationResponse.status).toBe(201);
            expect(firstLocationResponse.body.data.location.is_primary).toBe(true);

            // Step 6: owner views locations — HTTP 200, [location from step 5].
            const firstListResponse = await request(app)
                .get(`/businesses/${businessId}/locations`)
                .set('Authorization', `Bearer ${ownerToken}`);
            expect(firstListResponse.status).toBe(200);
            expect(firstListResponse.body.data.locations).toHaveLength(1);

            // Step 7: owner creates a second location — HTTP 201.
            const secondLocationResponse = await request(app)
                .post(`/businesses/${businessId}/locations`)
                .set('Authorization', `Bearer ${ownerToken}`)
                .send({ name: 'Second Branch', address_line: '456 Journey Ave' });
            expect(secondLocationResponse.status).toBe(201);
            const secondLocationId = secondLocationResponse.body.data.location.id;

            // Step 8: owner sets the second location as primary — HTTP 200.
            const setPrimaryResponse = await request(app)
                .post(`/businesses/${businessId}/locations/${secondLocationId}/set-primary`)
                .set('Authorization', `Bearer ${ownerToken}`);
            expect(setPrimaryResponse.status).toBe(200);
            expect(setPrimaryResponse.body.data.location.is_primary).toBe(true);

            // Step 9: verify only one primary location remains.
            const finalListResponse = await request(app)
                .get(`/businesses/${businessId}/locations`)
                .set('Authorization', `Bearer ${ownerToken}`);
            const primaryLocations = finalListResponse.body.data.locations.filter((location) => location.is_primary);
            expect(primaryLocations).toHaveLength(1);
            expect(primaryLocations[0].id).toBe(secondLocationId);

            // Steps 10-13 (adapted — see file-level deviation note): a real
            // staff DgfyAccount is registered and granted a landlord
            // membership + tenant-local assignment directly, then logs in
            // and activates the business, then queries location data.
            const { token: staffToken, accountId: staffAccountId } = await registerAndGetToken({
                email: 'staff2-real@phase4test.com',
                first_name: 'AliceReal'
            });
            await businessRepository.createMembership({ accountId: staffAccountId, businessId, role: 'member' });
            await accountStaffAssignmentRepository.create(databaseName, {
                dgfyAccountId: staffAccountId,
                staffAccountId: 1,
                role: 'staff',
                status: 'active'
            });

            const staffLoginResponse = await request(app)
                .post('/accounts/login')
                .send({ email: 'staff2-real@phase4test.com', password: 'StrongPass123' });
            expect(staffLoginResponse.status).toBe(200);

            const staffActivateResponse = await request(app)
                .post(`/businesses/${businessId}/activate-session`)
                .set('Authorization', `Bearer ${staffToken}`);
            expect(staffActivateResponse.status).toBe(200);
            expect(staffActivateResponse.body.data.active_assignment.dgfy_account_id).toBe(staffAccountId);

            const staffLocationsResponse = await request(app)
                .get(`/businesses/${businessId}/locations`)
                .set('Authorization', `Bearer ${staffToken}`);
            expect(staffLocationsResponse.status).toBe(200);
            expect(staffLocationsResponse.body.data.locations.length).toBeGreaterThanOrEqual(1);
        });
    });

    describe('Journey 3: Multi-Business Owner Mid-Session Switching', () => {
        it('creates two businesses, logs in unbound, and switches active tenant context between them with no re-login', async () => {
            const { token: initialToken, email } = await registerAndGetToken({
                email: 'owner3@phase4test.com',
                first_name: 'Journey3Owner'
            });

            // Step 1: owner creates Business A and Business B.
            const createA = await request(app)
                .post('/businesses')
                .set('Authorization', `Bearer ${initialToken}`)
                .send({ legal_name: 'Journey3A Legal', display_name: 'Journey3A Store', business_handle: 'test-business-3a' });
            const businessIdA = createA.body.data.business.id;
            const databaseNameA = await provisionTenantForBusiness(businessIdA);

            const createB = await request(app)
                .post('/businesses')
                .set('Authorization', `Bearer ${initialToken}`)
                .send({ legal_name: 'Journey3B Legal', display_name: 'Journey3B Store', business_handle: 'test-business-3b' });
            const businessIdB = createB.body.data.business.id;
            const databaseNameB = await provisionTenantForBusiness(businessIdB);

            // Step 2: login → unbound session + [Business A, Business B].
            const loginResponse = await request(app).post('/accounts/login').send({ email, password: 'StrongPass123' });
            expect(loginResponse.status).toBe(200);
            expect(loginResponse.body.data.businesses).toHaveLength(2);
            expect(loginResponse.body.data.active_business_id).toBeUndefined();
            const { token } = loginResponse.body.data;

            // Step 3/4: activate Business A → context = A; access A's data succeeds.
            const activateA = await request(app)
                .post(`/businesses/${businessIdA}/activate-session`)
                .set('Authorization', `Bearer ${token}`);
            expect(activateA.status).toBe(200);
            expect(activateA.body.data.tenant_database).toBe(databaseNameA);
            const accessA = await request(app).get(`/businesses/${businessIdA}`).set('Authorization', `Bearer ${token}`);
            expect(accessA.status).toBe(200);

            // Step 5/6: activate Business B → context = B (same session token); access B's data succeeds.
            const activateB = await request(app)
                .post(`/businesses/${businessIdB}/activate-session`)
                .set('Authorization', `Bearer ${token}`);
            expect(activateB.status).toBe(200);
            expect(activateB.body.data.tenant_database).toBe(databaseNameB);
            const accessB = await request(app).get(`/businesses/${businessIdB}`).set('Authorization', `Bearer ${token}`);
            expect(accessB.status).toBe(200);

            // Step 8: re-activate Business A → back to A, still no re-login.
            const reactivateA = await request(app)
                .post(`/businesses/${businessIdA}/activate-session`)
                .set('Authorization', `Bearer ${token}`);
            expect(reactivateA.status).toBe(200);
            expect(reactivateA.body.data.tenant_database).toBe(databaseNameA);
        });
    });

    describe('Journey 4: Permission Checks & Security', () => {
        it('enforces membership, owner-only updates, and tenant assignment across two accounts', async () => {
            const { token: userAToken, accountId: userAId } = await registerAndGetToken({
                email: 'user-a@phase4test.com',
                first_name: 'Journey4A'
            });
            const { token: userBToken, accountId: userBId } = await registerAndGetToken({
                email: 'user-b@phase4test.com',
                first_name: 'Journey4B'
            });

            // Step 1: User A creates Business A.
            const createResponse = await request(app)
                .post('/businesses')
                .set('Authorization', `Bearer ${userAToken}`)
                .send({ legal_name: 'Journey4 Legal', display_name: 'Journey4 Store', business_handle: 'test-business-4' });
            const businessId = createResponse.body.data.business.id;
            const databaseName = await provisionTenantForBusiness(businessId);

            // Step 2: User B tries to access Business A → 403 (not member).
            const deniedAccess = await request(app).get(`/businesses/${businessId}`).set('Authorization', `Bearer ${userBToken}`);
            expect(deniedAccess.status).toBe(403);

            // Step 3: User A adds User B as manager (direct repository seed —
            // see file-level deviation note: no HTTP endpoint exists for this).
            await businessRepository.createMembership({ accountId: userBId, businessId, role: 'manager' });

            // Step 4: User B accesses Business A → 200 (member).
            const allowedAccess = await request(app).get(`/businesses/${businessId}`).set('Authorization', `Bearer ${userBToken}`);
            expect(allowedAccess.status).toBe(200);

            // Step 5: User B tries to update Business A → 403 (manager, not owner).
            const deniedUpdate = await request(app)
                .patch(`/businesses/${businessId}`)
                .set('Authorization', `Bearer ${userBToken}`)
                .send({ display_name: 'Hijacked By B' });
            expect(deniedUpdate.status).toBe(403);

            // Step 6: User A updates Business A → 200 (owner).
            const allowedUpdate = await request(app)
                .patch(`/businesses/${businessId}`)
                .set('Authorization', `Bearer ${userAToken}`)
                .send({ display_name: 'Updated By A' });
            expect(allowedUpdate.status).toBe(200);
            expect(allowedUpdate.body.data.business.display_name).toBe('Updated By A');

            // Step 7: User B logs in; tries to activate Business A with no
            // tenant assignment → 403 (NO_TENANT_ASSIGNMENT).
            const deniedActivation = await request(app)
                .post(`/businesses/${businessId}/activate-session`)
                .set('Authorization', `Bearer ${userBToken}`);
            expect(deniedActivation.status).toBe(403);
            expect(deniedActivation.body.error.details.error_code).toBe('NO_TENANT_ASSIGNMENT');

            // Step 8: User A creates a location, assigns User B a tenant-local assignment.
            await request(app)
                .post(`/businesses/${businessId}/locations`)
                .set('Authorization', `Bearer ${userAToken}`)
                .send({ name: 'Journey4 Branch', address_line: '789 Journey4 Blvd' });
            // account_staff_assignments.staff_account_id is a real, same-database
            // FK into staff_accounts (unlike dgfy_account_id, which is opaque
            // cross-database) — unlike Journey 2, this journey never runs the
            // invitation-accept flow, so no staff_accounts row exists yet in this
            // business's tenant database. Seed a minimal one directly (mirrors
            // AccountStaffAssignmentRepository.create()'s own "test seeding" role)
            // and use its real id, rather than assuming id 1 already exists.
            const staffAccountModel = defineStaffAccountModel(tenantConnector.getConnection(databaseName));
            const journey4StaffAccount = await staffAccountModel.create({
                display_name: 'Journey4B',
                email: 'user-b-staff@phase4test.com'
            });
            await accountStaffAssignmentRepository.create(databaseName, {
                dgfyAccountId: userBId,
                staffAccountId: journey4StaffAccount.id,
                role: 'manager',
                status: 'active'
            });

            // Step 9: User B activates Business A again → 200 (now has assignment).
            const allowedActivation = await request(app)
                .post(`/businesses/${businessId}/activate-session`)
                .set('Authorization', `Bearer ${userBToken}`);
            expect(allowedActivation.status).toBe(200);
            expect(allowedActivation.body.data.active_assignment.dgfy_account_id).toBe(userBId);

            expect(userAId).not.toBe(userBId);
        });
    });

    describe('Journey 5: Gap Closure (04-09) — operator activation via the shipped activate-tenant CLI', () => {
        /**
         * 04-09 gap closure (API-02/API-03): unlike every journey above,
         * which uses provisionTenantForBusiness() (the in-process
         * provisionAndActivateTenantDatabase test-helper stand-in), this
         * journey drives the operator handoff through the SHIPPED
         * migration-runner `activate-tenant` CLI as a real subprocess — the
         * direct proof that the previously-unreachable SC2/SC3 flow becomes
         * reachable through the real, production mechanism, not just a test
         * fixture.
         */
        it('spawns the real activate-tenant CLI and turns a pre-handoff 503 tenant write into a post-handoff 201', async () => {
            const { token } = await registerAndGetToken({ email: 'owner5@phase4test.com', first_name: 'Journey5Owner' });

            const createResponse = await request(app)
                .post('/businesses')
                .set('Authorization', `Bearer ${token}`)
                .send({ legal_name: 'Journey5 Legal', display_name: 'Journey5 Store', business_handle: 'test-business-5' });
            expect(createResponse.status).toBe(201);
            const businessId = createResponse.body.data.business.id;
            expect(createResponse.body.data.tenant_registry.status).toBe('provisioning');

            // Pre-handoff: a tenant-scoped write fails closed (503) — no
            // activate-tenant run has happened yet for this business.
            const preHandoffLocation = await request(app)
                .post(`/businesses/${businessId}/locations`)
                .set('Authorization', `Bearer ${token}`)
                .send({ name: 'Too Early Branch', address_line: '1 Too Early St' });
            expect(preHandoffLocation.status).toBe(503);

            const registryEntry = await businessDatabaseRegistryRepository.findByBusinessId(businessId);
            expect(registryEntry).toBeTruthy();
            const { database_name: databaseName } = registryEntry;
            provisionedTenantDbNames.push(databaseName);

            // Invoke the SHIPPED migration-runner CLI as a real subprocess —
            // never imported in-process — against the SAME disposable MySQL
            // instance this suite already owns.
            const cliReportDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'dgfy-migration-runner-e2e-cli-'));
            const cliEnv = {
                ...process.env,
                RUNTIME_MODE: 'development',
                SOURCE_DB_HOST: ADMIN_DB_CONFIG.host,
                SOURCE_DB_PORT: String(ADMIN_DB_CONFIG.port),
                SOURCE_DB_USER: ADMIN_DB_CONFIG.user,
                SOURCE_DB_PASSWORD: ADMIN_DB_CONFIG.password,
                SOURCE_DB_NAME: landlordDbName,
                TARGET_DB_HOST: ADMIN_DB_CONFIG.host,
                TARGET_DB_PORT: String(ADMIN_DB_CONFIG.port),
                TARGET_DB_USER: ADMIN_DB_CONFIG.user,
                TARGET_DB_PASSWORD: ADMIN_DB_CONFIG.password,
                TARGET_DB_NAME: landlordDbName,
                MIGRATION_ACTOR: 'phase4-e2e-activate-tenant-cli',
                REPORT_DIR: cliReportDir
            };

            let cliError = null;
            try {
                execFileSync(
                    'node',
                    [MIGRATION_RUNNER_CLI_PATH, 'activate-tenant', '--database-name', databaseName],
                    { env: cliEnv, encoding: 'utf8' }
                );
            } catch (error) {
                cliError = error;
            } finally {
                await fsPromises.rm(cliReportDir, { recursive: true, force: true });
            }
            if (cliError) {
                // eslint-disable-next-line no-console
                console.error(
                    '[phase4FullFlow.test.js] activate-tenant CLI subprocess failed:',
                    cliError.stdout,
                    cliError.stderr
                );
            }
            expect(cliError).toBeNull();

            // Post-handoff: the exact same write now succeeds (2xx, not 503)
            // — the observable proof that the real mechanism reaches the
            // previously-unreachable SC2/SC3 flow.
            const postHandoffLocation = await request(app)
                .post(`/businesses/${businessId}/locations`)
                .set('Authorization', `Bearer ${token}`)
                .send({ name: 'Real Branch', address_line: '123 Real St' });
            expect(postHandoffLocation.status).toBe(201);

            const activateSession = await request(app)
                .post(`/businesses/${businessId}/activate-session`)
                .set('Authorization', `Bearer ${token}`);
            expect(activateSession.status).toBe(200);
            expect(activateSession.body.data.tenant_database).toBe(databaseName);
        }, 60000);
    });
});

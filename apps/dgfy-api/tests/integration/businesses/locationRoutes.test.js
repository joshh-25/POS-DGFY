import crypto from 'crypto';
import request from 'supertest';
import express from 'express';
import bcrypt from 'bcryptjs';
import { Sequelize } from 'sequelize';
import defineAccountModel from '../../../src/models/Landlord/Account.js';
import defineBusinessModel from '../../../src/models/Landlord/Business.js';
import defineBusinessMembershipModel from '../../../src/models/Landlord/BusinessMembership.js';
import defineBusinessDatabaseRegistryModel from '../../../src/models/Landlord/BusinessDatabaseRegistry.js';
import { buildAccountsModule, createAccountRoutes, buildAccountAuthMiddleware } from '../../../src/modules/accounts/index.js';
import { buildBusinessesModule, createBusinessRoutes, createInvitationRoutes } from '../../../src/modules/businesses/index.js';
import { TenantConnector } from '../../../src/infra/tenantConnector.js';
import { provisionAndActivateTenantDatabase } from '../../helpers/tenantSchemaProvisioning.js';

/**
 * HTTP-layer integration tests for the location/branch endpoints (Wave 3.5,
 * Task 7). Mirrors ./businessRoutes.test.js's gating pattern: skips cleanly
 * (never fails) unless explicitly opted in with real MySQL admin
 * credentials, so this suite never assumes a database is reachable in CI or
 * a fresh sandbox.
 *
 * UPDATED (Phase 04 UAT gap closure): this file originally predated Wave 4's
 * real TenantConnector/BusinessDatabaseRegistry infrastructure and assumed
 * location data lived in LocationRepository's in-memory Map with no tenant
 * activation required. That assumption stopped being true once Wave 4/06/07
 * wired locationRepository.js onto a real per-tenant database gated on an
 * active/verified registry entry — every location call here was returning
 * 404 NO_TENANT_DATABASE against real MySQL. createBusiness() below now
 * mirrors ../businessValidation.test.js's pattern: create via HTTP, then run
 * the operator/migration-runner handoff test double (see
 * ../../helpers/tenantSchemaProvisioning.js) so the business has a real,
 * active/verified dgfy_business_* database before any location endpoint is
 * exercised — matching how a location would actually become reachable in
 * production per the current (post-04-09) activation flow.
 */
const RUN_INTEGRATION = process.env.RUN_LOCATION_ROUTES_INTEGRATION === 'true';

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
        '[locationRoutes.test.js] SKIPPED — set RUN_LOCATION_ROUTES_INTEGRATION=true '
        + '(with MySQL admin credentials via BUSINESS_IT_DB_HOST/PORT/USER/PASSWORD, or the '
        + 'existing DB_HOST/PORT/USER/PASSWORD convention) to run this real MySQL-backed '
        + 'location HTTP route test locally or in CI.'
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

describeIfIntegration('Location HTTP routes (real MySQL landlord + real per-tenant database)', () => {
    const dbName = isolatedDbName();
    const provisionedTenantDbNames = [];
    let sequelize;
    let tenantConnector;
    let businessDatabaseRegistryRepository;
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
        const BusinessDatabaseRegistry = defineBusinessDatabaseRegistryModel(sequelize);
        await sequelize.sync({ force: true });

        tenantConnector = new TenantConnector(ADMIN_DB_CONFIG);

        const businessesModule = buildBusinessesModule({
            businessModel: Business,
            businessMembershipModel: BusinessMembership,
            businessDatabaseRegistryModel: BusinessDatabaseRegistry,
            sequelize,
            sendEmail: async () => ({ sent: false, reason: 'test_double' }),
            tenantConnector
        });
        const { repository: businessRepository, useCases: businessUseCases } = businessesModule;
        businessDatabaseRegistryRepository = businessesModule.businessDatabaseRegistryRepository;

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
        if (sequelize) await sequelize.close();
        await withAdminConnection(async (adminSequelize) => {
            await adminSequelize.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
            for (const tenantDbName of provisionedTenantDbNames) {
                await adminSequelize.query(`DROP DATABASE IF EXISTS \`${tenantDbName}\``);
            }
        });
    });

    // Deliberately NO afterEach truncation: MySQL/InnoDB refuses to TRUNCATE
    // a table referenced by a live FK constraint (business_memberships.
    // account_id -> accounts.id) regardless of row count, so this always
    // threw on the very first call once real migrations created the FK.
    // Every business_handle/email literal below is already unique per test
    // case within this file (mirrors phase4FullFlow.test.js's approach),
    // and afterAll drops the whole per-file landlord database, so no
    // cross-test truncation is needed.

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

    /**
     * Creates a business via HTTP (registry row auto-created as
     * `provisioning`), then runs the accepted operator/migration-runner
     * handoff — see ../../helpers/tenantSchemaProvisioning.js — so the
     * business has a real, active/verified tenant database before any
     * location endpoint is exercised. Mirrors ../businessValidation.test.js's
     * createBusiness().
     */
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
        const businessId = response.body.data.business.id;

        await provisionAndActivateTenantDatabase({
            businessDatabaseRegistryRepository,
            tenantConnector,
            withAdminConnection,
            businessId,
            provisionedTenantDbNames
        });

        return businessId;
    }

    describe('POST /businesses/:businessId/locations', () => {
        it('creates the first location for a business with HTTP 201 and auto-primary', async () => {
            const { token } = await registerAndGetToken();
            const businessId = await createBusiness(token);

            const response = await request(app)
                .post(`/businesses/${businessId}/locations`)
                .set('Authorization', `Bearer ${token}`)
                .send({ name: 'Main Branch', address_line: '123 Main St' });

            expect(response.status).toBe(201);
            expect(response.body.data.location.is_primary).toBe(true);
        });

        it('rejects missing name/address_line with HTTP 400', async () => {
            const { token } = await registerAndGetToken();
            const businessId = await createBusiness(token);

            const response = await request(app)
                .post(`/businesses/${businessId}/locations`)
                .set('Authorization', `Bearer ${token}`)
                .send({ name: '' });

            expect(response.status).toBe(400);
        });

        it('rejects a non-owner with HTTP 403', async () => {
            const { token } = await registerAndGetToken();
            const businessId = await createBusiness(token);
            const { token: otherToken } = await registerAndGetToken();

            const response = await request(app)
                .post(`/businesses/${businessId}/locations`)
                .set('Authorization', `Bearer ${otherToken}`)
                .send({ name: 'Hijacked Branch', address_line: '999 Nowhere St' });

            expect(response.status).toBe(403);
        });

        it('rejects a non-member with HTTP 403', async () => {
            const businessId = await createBusiness((await registerAndGetToken()).token);
            const { token: strangerToken } = await registerAndGetToken();

            const response = await request(app)
                .post(`/businesses/${businessId}/locations`)
                .set('Authorization', `Bearer ${strangerToken}`)
                .send({ name: 'Stranger Branch', address_line: '1 Stranger Ave' });

            expect(response.status).toBe(403);
        });

        it('returns HTTP 404 for a non-existent business', async () => {
            const { token } = await registerAndGetToken();

            const response = await request(app)
                .post('/businesses/00000000-0000-0000-0000-000000000000/locations')
                .set('Authorization', `Bearer ${token}`)
                .send({ name: 'Ghost Branch', address_line: 'Nowhere' });

            expect(response.status).toBe(404);
        });
    });

    describe('GET /businesses/:businessId/locations', () => {
        it('lists locations with HTTP 200, excluding inactive by default', async () => {
            const { token } = await registerAndGetToken();
            const businessId = await createBusiness(token);
            const createRes = await request(app)
                .post(`/businesses/${businessId}/locations`)
                .set('Authorization', `Bearer ${token}`)
                .send({ name: 'Main Branch', address_line: '123 Main St' });
            const secondRes = await request(app)
                .post(`/businesses/${businessId}/locations`)
                .set('Authorization', `Bearer ${token}`)
                .send({ name: 'Second Branch', address_line: '456 Second St' });

            await request(app)
                .delete(`/businesses/${businessId}/locations/${secondRes.body.data.location.id}`)
                .set('Authorization', `Bearer ${token}`);

            const response = await request(app)
                .get(`/businesses/${businessId}/locations`)
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
            expect(response.body.data.locations).toHaveLength(1);
            expect(response.body.data.locations[0].id).toBe(createRes.body.data.location.id);
        });

        it('includes inactive locations when include_inactive=true', async () => {
            const { token } = await registerAndGetToken();
            const businessId = await createBusiness(token);
            await request(app)
                .post(`/businesses/${businessId}/locations`)
                .set('Authorization', `Bearer ${token}`)
                .send({ name: 'Main Branch', address_line: '123 Main St' });
            const secondRes = await request(app)
                .post(`/businesses/${businessId}/locations`)
                .set('Authorization', `Bearer ${token}`)
                .send({ name: 'Second Branch', address_line: '456 Second St' });
            await request(app)
                .delete(`/businesses/${businessId}/locations/${secondRes.body.data.location.id}`)
                .set('Authorization', `Bearer ${token}`);

            const response = await request(app)
                .get(`/businesses/${businessId}/locations?include_inactive=true`)
                .set('Authorization', `Bearer ${token}`);

            expect(response.body.data.locations).toHaveLength(2);
        });
    });

    describe('GET /businesses/:businessId/locations/:locationId', () => {
        it('returns location details with HTTP 200', async () => {
            const { token } = await registerAndGetToken();
            const businessId = await createBusiness(token);
            const createRes = await request(app)
                .post(`/businesses/${businessId}/locations`)
                .set('Authorization', `Bearer ${token}`)
                .send({ name: 'Main Branch', address_line: '123 Main St' });

            const response = await request(app)
                .get(`/businesses/${businessId}/locations/${createRes.body.data.location.id}`)
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
            expect(response.body.data.location.name).toBe('Main Branch');
        });

        it('returns HTTP 404 for a non-existent location', async () => {
            const { token } = await registerAndGetToken();
            const businessId = await createBusiness(token);

            const response = await request(app)
                .get(`/businesses/${businessId}/locations/999999`)
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(404);
        });
    });

    describe('PATCH /businesses/:businessId/locations/:locationId', () => {
        it('updates a location as the owner with HTTP 200 (partial update)', async () => {
            const { token } = await registerAndGetToken();
            const businessId = await createBusiness(token);
            const createRes = await request(app)
                .post(`/businesses/${businessId}/locations`)
                .set('Authorization', `Bearer ${token}`)
                .send({ name: 'Main Branch', address_line: '123 Main St' });

            const response = await request(app)
                .patch(`/businesses/${businessId}/locations/${createRes.body.data.location.id}`)
                .set('Authorization', `Bearer ${token}`)
                .send({ name: 'Renamed Branch' });

            expect(response.status).toBe(200);
            expect(response.body.data.location.name).toBe('Renamed Branch');
            expect(response.body.data.location.address_line).toBe('123 Main St');
        });

        it('rejects a non-owner with HTTP 403', async () => {
            const { token } = await registerAndGetToken();
            const businessId = await createBusiness(token);
            const createRes = await request(app)
                .post(`/businesses/${businessId}/locations`)
                .set('Authorization', `Bearer ${token}`)
                .send({ name: 'Main Branch', address_line: '123 Main St' });
            const { token: otherToken } = await registerAndGetToken();

            const response = await request(app)
                .patch(`/businesses/${businessId}/locations/${createRes.body.data.location.id}`)
                .set('Authorization', `Bearer ${otherToken}`)
                .send({ name: 'Hijacked' });

            expect(response.status).toBe(403);
        });
    });

    describe('POST /businesses/:businessId/locations/:locationId/set-primary', () => {
        it('switches primary with HTTP 200', async () => {
            const { token } = await registerAndGetToken();
            const businessId = await createBusiness(token);
            await request(app)
                .post(`/businesses/${businessId}/locations`)
                .set('Authorization', `Bearer ${token}`)
                .send({ name: 'Main Branch', address_line: '123 Main St' });
            const secondRes = await request(app)
                .post(`/businesses/${businessId}/locations`)
                .set('Authorization', `Bearer ${token}`)
                .send({ name: 'Second Branch', address_line: '456 Second St' });

            const response = await request(app)
                .post(`/businesses/${businessId}/locations/${secondRes.body.data.location.id}/set-primary`)
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
            expect(response.body.data.location.is_primary).toBe(true);
        });
    });

    describe('DELETE /businesses/:businessId/locations/:locationId', () => {
        it('soft-deletes a location with HTTP 200 when another active location remains', async () => {
            const { token } = await registerAndGetToken();
            const businessId = await createBusiness(token);
            await request(app)
                .post(`/businesses/${businessId}/locations`)
                .set('Authorization', `Bearer ${token}`)
                .send({ name: 'Main Branch', address_line: '123 Main St' });
            const secondRes = await request(app)
                .post(`/businesses/${businessId}/locations`)
                .set('Authorization', `Bearer ${token}`)
                .send({ name: 'Second Branch', address_line: '456 Second St' });

            const response = await request(app)
                .delete(`/businesses/${businessId}/locations/${secondRes.body.data.location.id}`)
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
            expect(response.body.data.location.is_active).toBe(false);
        });

        it('refuses to delete the last remaining location with HTTP 409', async () => {
            const { token } = await registerAndGetToken();
            const businessId = await createBusiness(token);
            const createRes = await request(app)
                .post(`/businesses/${businessId}/locations`)
                .set('Authorization', `Bearer ${token}`)
                .send({ name: 'Only Branch', address_line: '1 Only St' });

            const response = await request(app)
                .delete(`/businesses/${businessId}/locations/${createRes.body.data.location.id}`)
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(409);
        });

        it('rejects a non-owner with HTTP 403', async () => {
            const { token } = await registerAndGetToken();
            const businessId = await createBusiness(token);
            await request(app)
                .post(`/businesses/${businessId}/locations`)
                .set('Authorization', `Bearer ${token}`)
                .send({ name: 'Main Branch', address_line: '123 Main St' });
            const secondRes = await request(app)
                .post(`/businesses/${businessId}/locations`)
                .set('Authorization', `Bearer ${token}`)
                .send({ name: 'Second Branch', address_line: '456 Second St' });
            const { token: otherToken } = await registerAndGetToken();

            const response = await request(app)
                .delete(`/businesses/${businessId}/locations/${secondRes.body.data.location.id}`)
                .set('Authorization', `Bearer ${otherToken}`);

            expect(response.status).toBe(403);
        });
    });

    describe('tenant isolation across businesses', () => {
        it('locations created under Business A never appear under Business B', async () => {
            const { token } = await registerAndGetToken();
            const businessAId = await createBusiness(token, { business_handle: `biz-a-${crypto.randomUUID().slice(0, 8)}` });
            const businessBId = await createBusiness(token, { business_handle: `biz-b-${crypto.randomUUID().slice(0, 8)}` });

            await request(app)
                .post(`/businesses/${businessAId}/locations`)
                .set('Authorization', `Bearer ${token}`)
                .send({ name: 'A Branch', address_line: 'A Addr' });

            const businessBLocations = await request(app)
                .get(`/businesses/${businessBId}/locations`)
                .set('Authorization', `Bearer ${token}`);

            expect(businessBLocations.body.data.locations).toHaveLength(0);
        });
    });
});

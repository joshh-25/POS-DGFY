import crypto from 'crypto';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import { Sequelize } from 'sequelize';
import { BookingRepository } from '../../../src/modules/booking/repositories/bookingRepository.js';
import { TenantConnector } from '../../../src/infra/tenantConnector.js';

/**
 * Real-MySQL-backed concurrency proof for BookingRepository.createBooking()'s
 * atomic guarded UPDATE (BOK-02, 08-RESEARCH.md Pattern D / Pitfall 3).
 * Mirrors ../businesses/locationRepository.test.js's gating convention
 * exactly: skips cleanly (never fails) unless explicitly opted in with real
 * MySQL admin credentials, so this suite never assumes a database is
 * reachable in CI or a fresh sandbox.
 *
 * Provisions a real tenant schema via the REAL migration-runner migrations
 * (business foundation + Phase 8 commerce foundation — the same require()
 * pattern tests/helpers/tenantSchemaProvisioning.js uses for the business
 * foundation migration, extended here with the commerce-foundation
 * migration this plan's bookings/booking_capacity tables need), seeds one
 * bookable service Product with concurrent_capacity=1 at one branch/slot,
 * then fires N concurrent createBooking calls and asserts exactly one
 * success and no oversell (slots_remaining never goes below 0).
 */
const RUN_INTEGRATION = process.env.RUN_BOOKING_CAPACITY_INTEGRATION === 'true';

const ADMIN_DB_CONFIG = {
    host: process.env.BUSINESS_IT_DB_HOST || process.env.DB_HOST || 'localhost',
    port: Number(process.env.BUSINESS_IT_DB_PORT || process.env.DB_PORT || 3306),
    user: process.env.BUSINESS_IT_DB_USER || process.env.DB_USER || 'root',
    password: process.env.BUSINESS_IT_DB_PASSWORD || process.env.DB_PASSWORD || ''
};

if (!RUN_INTEGRATION) {
    // eslint-disable-next-line no-console
    console.log(
        '[bookingCapacity.test.js] SKIPPED — set RUN_BOOKING_CAPACITY_INTEGRATION=true '
        + '(with MySQL admin credentials via BUSINESS_IT_DB_HOST/PORT/USER/PASSWORD, or the '
        + 'existing DB_HOST/PORT/USER/PASSWORD convention) to run this real MySQL-backed '
        + 'booking-capacity concurrency test locally or in CI.'
    );
}

const describeIfIntegration = RUN_INTEGRATION ? describe : describe.skip;

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationRunnerRoot = path.resolve(__dirname, '../../../../dgfy-migration-runner');

// The real migration-runner schema migration files (CommonJS, per
// apps/dgfy-migration-runner's own sequelize-cli migration convention) —
// required (not imported) via createRequire so this ESM test file can load
// them cross-package without adding a new package dependency. Mirrors
// tests/helpers/tenantSchemaProvisioning.js's exact require() pattern,
// extended with the commerce-foundation migration (08-01) this plan's
// bookings/booking_capacity tables come from.
const businessFoundationMigration = require(
    path.join(migrationRunnerRoot, 'src/migrations/schema/20260710021000-create-dgfy-business-foundation.cjs')
);
const commerceFoundationMigration = require(
    path.join(migrationRunnerRoot, 'src/migrations/schema/20260712100000-create-commerce-foundation.cjs')
);

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

/**
 * Minimal registry double — a real BusinessDatabaseRegistryRepository is
 * landlord dgfy_core-backed (its own separately-gated suite); this suite is
 * scoped to BookingRepository's own tenant-DB behavior, mirroring
 * locationRepository.test.js's fakeRegistry() helper.
 */
function fakeRegistry(entriesByBusinessId) {
    return {
        async findByBusinessId(businessId) {
            return entriesByBusinessId[businessId] || null;
        }
    };
}

describeIfIntegration('BookingRepository.createBooking concurrency (real MySQL, BOK-02 no-oversell)', () => {
    const businessDbName = isolatedDbName('dgfy_business');
    const businessId = 'biz-booking-it';
    let tenantConnector;
    let productId;
    let branchId;
    const slotStart = new Date('2026-09-01T10:00:00.000Z');

    beforeAll(async () => {
        await withAdminConnection(async (adminSequelize) => {
            await adminSequelize.query(`CREATE DATABASE IF NOT EXISTS \`${businessDbName}\``);
        });

        tenantConnector = new TenantConnector(ADMIN_DB_CONFIG);
        const connection = tenantConnector.getConnection(businessDbName);
        const queryInterface = connection.getQueryInterface();

        await businessFoundationMigration.up(queryInterface, Sequelize);
        await commerceFoundationMigration.up(queryInterface, Sequelize);

        const { Location, Product } = tenantConnector.getModels(businessDbName);

        const location = await Location.create({
            name: 'Main Branch',
            address_line: '1 Test St',
            is_active: true,
            is_primary: true
        });
        branchId = location.id;

        const product = await Product.create({
            business_id: businessId,
            name: 'Haircut',
            category: 'service',
            inventory_mode: 'non_stock',
            is_bookable: true,
            slot_duration_minutes: 30,
            concurrent_capacity: 1,
            is_active: true
        });
        productId = product.id;
    });

    afterAll(async () => {
        if (tenantConnector) await tenantConnector.closeAll();
        await withAdminConnection(async (adminSequelize) => {
            await adminSequelize.query(`DROP DATABASE IF EXISTS \`${businessDbName}\``);
        });
    });

    function buildRepository() {
        const registry = fakeRegistry({
            [businessId]: { database_name: businessDbName, status: 'active', verified_at: new Date() }
        });
        return new BookingRepository({ tenantConnector, businessDatabaseRegistryRepository: registry });
    }

    it('N simultaneous createBooking calls against a capacity-1 slot yield exactly 1 success and no oversell', async () => {
        const repository = buildRepository();
        const concurrentRequests = 8;

        const results = await Promise.allSettled(
            Array.from({ length: concurrentRequests }, () => repository.createBooking(businessId, {
                productId,
                branchId,
                slotStart,
                concurrentCapacity: 1
            }))
        );

        const successes = results.filter((result) => result.status === 'fulfilled');
        const conflicts = results.filter(
            (result) => result.status === 'rejected' && result.reason?.name === 'BookingCapacityFullError'
        );

        expect(successes).toHaveLength(1);
        expect(conflicts).toHaveLength(concurrentRequests - 1);

        const { BookingCapacity, Booking } = tenantConnector.getModels(businessDbName);
        const capacityRow = await BookingCapacity.findOne({
            where: { product_id: productId, branch_id: branchId, slot_start: slotStart }
        });
        expect(capacityRow.slots_remaining).toBe(0);

        const bookingRows = await Booking.findAll({
            where: { product_id: productId, branch_id: branchId, slot_start: slotStart }
        });
        expect(bookingRows).toHaveLength(1);
    });
});

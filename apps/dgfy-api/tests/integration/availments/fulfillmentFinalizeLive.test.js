import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Sequelize } from 'sequelize';
import defineAccountModel from '../../../src/models/Landlord/Account.js';
import defineBusinessModel from '../../../src/models/Landlord/Business.js';
import defineBusinessMembershipModel from '../../../src/models/Landlord/BusinessMembership.js';
import defineBusinessDatabaseRegistryModel from '../../../src/models/Landlord/BusinessDatabaseRegistry.js';
import { buildBusinessesModule } from '../../../src/modules/businesses/index.js';
import { buildProductsModule } from '../../../src/modules/products/index.js';
import { buildInventoryModule } from '../../../src/modules/inventory/index.js';
import { buildComplianceModule } from '../../../src/modules/compliance/index.js';
import { buildShiftsModule } from '../../../src/modules/shifts/index.js';
import { buildAvailmentsModule } from '../../../src/modules/availments/index.js';
import { buildFulfillmentModule } from '../../../src/modules/fulfillment/index.js';
import { TenantConnector } from '../../../src/infra/tenantConnector.js';
import { provisionAndActivateTenantDatabase } from '../../helpers/tenantSchemaProvisioning.js';

/**
 * fulfillmentFinalizeLive.test.js — 11-04-PLAN.md Task 3's live-MySQL proof:
 * a real POS/dine-in finalize and a real online/storefront finalize, each
 * driven through the SAME composition wiring apps/dgfy-api/src/routes/
 * index.js uses in production (buildFulfillmentModule() BEFORE
 * buildAvailmentsModule(), recordStageEvents threaded into both finalize
 * seams — mirrors routes/index.js's own ordering/comment), run against a
 * real dgfy_business_* tenant database (never a mocked port). Mirrors
 * ../availments/finalizeLive.test.js's gating/isolated-database convention
 * (Phase 9/4/8 precedent) so CI without MySQL stays green: SKIPPED unless
 * LIVE_TENANT_DB is set.
 *
 * This is the D-05/D-06 stage-event auto-write proof the [BLOCKING] gate in
 * 11-04-PLAN.md's objective calls for: Sequelize model definitions and
 * unit/mocked-port tests all pass WITHOUT the availment_stage_events/
 * courier_assignments tables (or the three availments.fulfillment_*
 * columns) existing in real MySQL, so only a live finalize against a real
 * tenant proves the D-05 full stage sequence and D-06 fulfillment_mode
 * persistence are real.
 *
 * The throwaway tenant provisioned below gets the fulfillment migration
 * applied automatically: ../../helpers/tenantSchemaProvisioning.js's
 * applyAndVerifyBusinessSchema() dynamically loads every
 * `meta.targetKind === 'business'` migration file (filename-sorted), which
 * now includes 20260715120000-create-availment-fulfillment.cjs — no
 * additional manual migration-apply step is needed in this file (unlike
 * finalizeLive.test.js's own Phase-9-specific migration, which predates
 * that helper's dynamic-load fix and still applies its migration by hand).
 *
 * Three behaviors proven against real MySQL, matching 11-04-PLAN.md's
 * must_haves:
 *  1. A POS/dine-in finalize (buildFinalizeAvailmentUseCase ->
 *     AvailmentRepository.finalizePersist) writes exactly 5
 *     availment_stage_events rows in the sequence placed -> confirmed ->
 *     preparing -> ready -> completed, and denormalizes the availment's
 *     fulfillment_mode/fulfillment_status/fulfillment_stage to
 *     'dine_in'/'completed'/'completed' (A1 default + D-05).
 *  2. A storefront/online finalize (buildFinalizeStorefrontOrderUseCase ->
 *     AvailmentRepository.finalizeStorefrontOrder) persists the threaded
 *     fulfillmentMode (previously-dropped Landmine 2, closed by D-06/L2)
 *     and writes exactly ONE 'placed' availment_stage_events row.
 *  3. The append-only-vs-mutable divergence (T-11-04-02, Landmine 3): a raw
 *     UPDATE against an availment_stage_events row is rejected by the
 *     DB-level BEFORE UPDATE SIGNAL '45000' trigger, while the same raw
 *     UPDATE against a courier_assignments row's payout_status succeeds —
 *     proving the trigger scoping from the 11-01 migration is real, not
 *     just documented.
 *
 * commitReservation is a lightweight always-succeeding test double (mirrors
 * tests/availments/storefrontFinalize.test.js's own `jest.fn().mockResolvedValue({
 * isSuccess: true })` convention) — this file's scope is the fulfillment
 * stage-event auto-write, not a second proof of the 10-02 inventory-
 * reservation commit path (already covered by storefrontE2E.test.js/
 * webhookFinalize.test.js).
 */

const liveTenantDbEnv = process.env.LIVE_TENANT_DB || '';
const RUN_INTEGRATION = liveTenantDbEnv !== '' && liveTenantDbEnv.toLowerCase() !== 'false';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-at-least-32-characters-long';

if (!RUN_INTEGRATION) {
    // eslint-disable-next-line no-console
    console.log(
        '[fulfillmentFinalizeLive.test.js] SKIPPED — set LIVE_TENANT_DB=true (with MySQL admin credentials via '
        + 'BUSINESS_IT_DB_HOST/PORT/USER/PASSWORD, or the existing DB_HOST/PORT/USER/PASSWORD convention) '
        + 'to run this real MySQL-backed fulfillment stage-event finalize proof locally or in CI.'
    );
}

const describeIfIntegration = RUN_INTEGRATION ? describe : describe.skip;

const ADMIN_DB_CONFIG = {
    host: process.env.BUSINESS_IT_DB_HOST || process.env.DB_HOST || 'localhost',
    port: Number(process.env.BUSINESS_IT_DB_PORT || process.env.DB_PORT || 3306),
    user: process.env.BUSINESS_IT_DB_USER || process.env.DB_USER || 'root',
    password: process.env.BUSINESS_IT_DB_PASSWORD || process.env.DB_PASSWORD || ''
};

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

/** Always-succeeding commitReservation test double — see file header. */
const stubCommitReservation = async () => ({ isSuccess: true });

describeIfIntegration('Fulfillment finalize (real MySQL): D-05/D-06 stage-event auto-write', () => {
    const dbName = isolatedDbName();
    const provisionedTenantDbNames = [];
    let sequelize;
    let tenantConnector;
    let tenantDatabaseName;
    let tenantConnection;
    let businessRepository;
    let businessDatabaseRegistryRepository;
    let businessId;
    let ownerAccountId;
    let productId;
    let productUseCases;
    let inventoryUseCases;
    let shiftUseCases;
    let availmentUseCases;
    let StaffAccount;
    let TerminalIdentity;
    let Availment;
    let AvailmentStageEvent;
    let CourierAssignment;

    beforeAll(async () => {
        // ---- Landlord side: isolated dgfy_core_it_* database ------------
        await withAdminConnection(async (adminSequelize) => {
            await adminSequelize.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
        });

        sequelize = new Sequelize(dbName, ADMIN_DB_CONFIG.user, ADMIN_DB_CONFIG.password, {
            host: ADMIN_DB_CONFIG.host,
            port: ADMIN_DB_CONFIG.port,
            dialect: 'mysql',
            logging: false
        });

        const Account = defineAccountModel(sequelize);
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
            sendEmail: async () => ({ sent: true, reason: 'test_double' }),
            tenantConnector
        });
        businessRepository = businessesModule.repository;
        businessDatabaseRegistryRepository = businessesModule.businessDatabaseRegistryRepository;

        // ---- Composition root reuse (mirrors routes/index.js exactly, ---
        // including building buildFulfillmentModule() BEFORE
        // buildAvailmentsModule() so recordStageEvents can be injected) ---
        const { repository: productRepository, useCases: productUseCasesBuilt } = buildProductsModule({
            tenantConnector,
            businessDatabaseRegistryRepository,
            businessRepository
        });
        productUseCases = productUseCasesBuilt;

        const { useCases: inventoryUseCasesBuilt } = buildInventoryModule({
            tenantConnector,
            businessDatabaseRegistryRepository,
            businessRepository
        });
        inventoryUseCases = inventoryUseCasesBuilt;

        const { assertComplianceGate } = buildComplianceModule({
            tenantConnector,
            businessDatabaseRegistryRepository,
            businessRepository
        });

        const { useCases: shiftUseCasesBuilt, repository: shiftRepository } = buildShiftsModule({
            tenantConnector,
            businessDatabaseRegistryRepository,
            businessRepository,
            assertComplianceGate
        });
        shiftUseCases = shiftUseCasesBuilt;

        const fulfillmentModule = buildFulfillmentModule({
            tenantConnector,
            businessDatabaseRegistryRepository,
            businessRepository
        });

        const { useCases: availmentUseCasesBuilt } = buildAvailmentsModule({
            tenantConnector,
            businessDatabaseRegistryRepository,
            businessRepository,
            productRepository,
            assertComplianceGate,
            recordSaleEffect: inventoryUseCases.recordSale,
            shiftRepository,
            commitReservation: stubCommitReservation,
            recordStageEvents: fulfillmentModule.recordStageEvents
            // deviceBridgeClient intentionally omitted — D-22 fail-open,
            // same as finalizeLive.test.js.
        });
        availmentUseCases = availmentUseCasesBuilt;

        // ---- Seed one owner account + business + active membership ------
        const ownerAccount = await Account.create({
            email: `owner-${crypto.randomUUID()}@example.com`,
            password_hash: await bcrypt.hash('StrongPass123', 10),
            first_name: 'Owner',
            status: 'active'
        });
        ownerAccountId = ownerAccount.id;

        const business = await Business.create({
            business_handle: `acme-fulfil-${crypto.randomUUID().slice(0, 8)}`,
            legal_name: 'Acme Fulfillment Co.',
            display_name: 'Acme Fulfillment Store',
            status: 'active'
        });
        businessId = business.id;

        await businessRepository.createMembership({ accountId: ownerAccountId, businessId, role: 'owner' });

        // ---- Provision + activate the real tenant database. -------------
        // applyAndVerifyBusinessSchema() dynamically loads every
        // meta.targetKind==='business' migration (filename-sorted),
        // including the 11-01 fulfillment migration — no separate manual
        // migration-apply step needed here.
        await businessDatabaseRegistryRepository.findOrCreateForBusiness({
            businessId,
            businessHandle: business.business_handle
        });
        tenantDatabaseName = await provisionAndActivateTenantDatabase({
            businessDatabaseRegistryRepository,
            tenantConnector,
            withAdminConnection,
            businessId,
            provisionedTenantDbNames
        });

        tenantConnection = tenantConnector.getConnection(tenantDatabaseName);

        const tenantModels = tenantConnector.getModels(tenantDatabaseName);
        ({
            StaffAccount, TerminalIdentity, Availment, AvailmentStageEvent, CourierAssignment
        } = tenantModels);

        // ---- Seed a basic_inventory product + starting stock ------------
        const createProductResult = await productUseCases.createProduct({
            businessId,
            requestingAccountId: ownerAccountId,
            name: 'Fulfillment Test Widget',
            category: 'food',
            inventory_mode: 'basic_inventory',
            base_price: '112.0000'
        });
        expect(createProductResult.isSuccess).toBe(true);
        productId = createProductResult.data.product.id;

        const restockResult = await inventoryUseCases.recordRestock({
            businessId,
            requestingAccountId: ownerAccountId,
            productId,
            quantity: 100
        });
        expect(restockResult.isSuccess).toBe(true);
    }, 60000);

    afterAll(async () => {
        if (tenantConnector) await tenantConnector.closeAll();
        if (sequelize) await sequelize.close();
        await withAdminConnection(async (adminSequelize) => {
            await adminSequelize.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
            for (const tenantDbName of provisionedTenantDbNames) {
                // eslint-disable-next-line no-await-in-loop
                await adminSequelize.query(`DROP DATABASE IF EXISTS \`${tenantDbName}\``);
            }
        });
    }, 60000);

    /**
     * Seeds a fresh TerminalIdentity + StaffAccount pair (each POS test
     * gets its own, so shift open-state never bleeds between test cases).
     */
    async function seedTerminalAndStaff() {
        const terminal = await TerminalIdentity.create({
            terminal_code: `T-${crypto.randomUUID().slice(0, 12)}`,
            status: 'active'
        });
        const staff = await StaffAccount.create({
            display_name: 'Cashier One',
            email: `cashier-${crypto.randomUUID()}@example.com`,
            status: 'active'
        });
        return { terminalId: terminal.id, cashierAccountId: staff.id };
    }

    it('A1/D-05: a POS/dine-in finalize writes the full 5-row stage sequence and denormalizes the availment to completed', async () => {
        const { terminalId, cashierAccountId } = await seedTerminalAndStaff();

        const openShiftResult = await shiftUseCases.openShift({
            businessId,
            requestingAccountId: ownerAccountId,
            terminalId,
            cashierAccountId,
            cashierDgfyAccountId: ownerAccountId,
            openingFloatAmount: 1000
        });
        expect(openShiftResult.isSuccess).toBe(true);

        // ---- create -> addLine -> finalize (real usecases, real DB, ------
        // no controller-supplied fulfillmentMode override — A1's dine_in
        // default must apply) ------------------------------------------
        const createResult = await availmentUseCases.createAvailment({
            businessId,
            requestingAccountId: ownerAccountId
        });
        expect(createResult.isSuccess).toBe(true);
        const availmentId = createResult.data.id;

        const addLineResult = await availmentUseCases.addLine({
            businessId,
            requestingAccountId: ownerAccountId,
            availmentId,
            productId,
            quantity: 2
        });
        expect(addLineResult.isSuccess).toBe(true);

        const finalizeResult = await availmentUseCases.finalizeAvailment({
            businessId,
            requestingAccountId: ownerAccountId,
            availmentId,
            requestedDocumentContext: 'non_fiscal',
            paymentMethod: 'cash',
            cashReceived: '300.00',
            terminalId,
            cashierAccountId
        });

        expect(finalizeResult.isSuccess).toBe(true);
        expect(finalizeResult.data.availment.status).toBe('finalized');

        // ---- Re-query the real tenant DB: denormalized fulfillment ------
        // columns on the availment itself (D-05/D-06's read cache) --------
        const persistedAvailment = await Availment.findByPk(availmentId);
        expect(persistedAvailment.fulfillment_mode).toBe('dine_in');
        expect(persistedAvailment.fulfillment_status).toBe('completed');
        expect(persistedAvailment.fulfillment_stage).toBe('completed');

        // ---- Re-query the real tenant DB: the full 5-row append-only ----
        // stage-event sequence (D-05), in insertion order -----------------
        const stageEvents = await AvailmentStageEvent.findAll({
            where: { availment_id: availmentId },
            order: [['id', 'ASC']]
        });
        expect(stageEvents).toHaveLength(5);
        expect(stageEvents.map((row) => row.fulfillment_stage)).toEqual([
            'placed', 'confirmed', 'preparing', 'ready', 'completed'
        ]);
        expect(stageEvents.map((row) => row.fulfillment_status)).toEqual([
            'placed', 'confirmed', 'preparing', 'ready', 'completed'
        ]);
        for (const row of stageEvents) {
            expect(row.fulfillment_mode).toBe('dine_in');
            expect(row.availment_id).toBe(availmentId);
            expect(row.business_id).toBe(businessId);
            expect(row.actor_staff_account_id).toBe(cashierAccountId);
        }

        // ---- T-11-04-02: append-only enforcement — a raw UPDATE against -
        // a persisted stage-event row is rejected by the DB-level BEFORE
        // UPDATE SIGNAL '45000' trigger (not just the Sequelize model
        // hook) -------------------------------------------------------
        let stageEventUpdateError;
        try {
            await tenantConnection.query(
                'UPDATE availment_stage_events SET reason = :reason WHERE id = :id',
                { replacements: { reason: 'tampered', id: stageEvents[0].id } }
            );
        } catch (error) {
            stageEventUpdateError = error;
        }
        expect(stageEventUpdateError).toBeDefined();
        expect(String(stageEventUpdateError.message || stageEventUpdateError.original?.sqlMessage || ''))
            .toMatch(/append-only/i);
    }, 30000);

    it('D-06/L2: an online/storefront finalize persists fulfillment_mode and writes exactly one placed stage event', async () => {
        const sourceReference = `SFO-FUL-${crypto.randomUUID().slice(0, 12)}`;

        const finalizeResult = await availmentUseCases.finalizeStorefrontOrder({
            businessId,
            sourceReference,
            customerAccountId: crypto.randomUUID(),
            lines: [{ productId, productName: 'Fulfillment Test Widget', quantity: 1, unitPrice: '112.0000' }],
            paymentMethod: 'gcash',
            paymentReference: `pay_${crypto.randomUUID().slice(0, 10)}`,
            fulfillmentMode: 'delivery'
        });

        expect(finalizeResult.isSuccess).toBe(true);
        expect(finalizeResult.data.idempotent).toBe(false);
        const availmentId = finalizeResult.data.availment.id;

        // ---- Re-query the real tenant DB: fulfillmentMode is PERSISTED --
        // onto the Availment (previously-dropped Landmine 2, closed by
        // D-06/L2) — never auto-confirmed on payment (A2: enters at
        // 'placed') --------------------------------------------------
        const persistedAvailment = await Availment.findByPk(availmentId);
        expect(persistedAvailment.fulfillment_mode).toBe('delivery');
        expect(persistedAvailment.fulfillment_status).toBe('placed');
        expect(persistedAvailment.fulfillment_stage).toBe('placed');

        // ---- Re-query the real tenant DB: exactly ONE 'placed' ----------
        // stage-event row (D-06) ------------------------------------------
        const stageEvents = await AvailmentStageEvent.findAll({
            where: { availment_id: availmentId },
            order: [['id', 'ASC']]
        });
        expect(stageEvents).toHaveLength(1);
        expect(stageEvents[0].fulfillment_mode).toBe('delivery');
        expect(stageEvents[0].fulfillment_status).toBe('placed');
        expect(stageEvents[0].fulfillment_stage).toBe('placed');
        expect(stageEvents[0].business_id).toBe(businessId);

        // ---- Idempotent re-finalize (same source_reference) must NOT ----
        // write a second stage event -------------------------------------
        const idempotentResult = await availmentUseCases.finalizeStorefrontOrder({
            businessId,
            sourceReference,
            customerAccountId: crypto.randomUUID(),
            lines: [{ productId, productName: 'Fulfillment Test Widget', quantity: 1, unitPrice: '112.0000' }],
            paymentMethod: 'gcash',
            fulfillmentMode: 'delivery'
        });
        expect(idempotentResult.isSuccess).toBe(true);
        expect(idempotentResult.data.idempotent).toBe(true);

        const stageEventsAfterRepeat = await AvailmentStageEvent.findAll({
            where: { availment_id: availmentId }
        });
        expect(stageEventsAfterRepeat).toHaveLength(1);
    }, 30000);

    it('Landmine 3/T-11-04-02: courier_assignments payout stays mutable — no append-only trigger scoped to it', async () => {
        // A fresh availment to hang the courier assignment off of (FK requires
        // an existing availments.id).
        const createResult = await availmentUseCases.createAvailment({
            businessId,
            requestingAccountId: ownerAccountId
        });
        expect(createResult.isSuccess).toBe(true);
        const availmentId = createResult.data.id;

        const courierAssignment = await CourierAssignment.create({
            business_id: businessId,
            availment_id: availmentId,
            courier_name: 'Juan Dela Cruz',
            courier_contact: '+639171234567',
            payout_amount: '75.00',
            payout_status: 'owed'
        });

        // A raw UPDATE against courier_assignments.payout_status succeeds —
        // deliberately NOT scoped by the append-only trigger array (Landmine
        // 3/A5: payout owed -> paid must stay updatable).
        let payoutUpdateError;
        try {
            await tenantConnection.query(
                "UPDATE courier_assignments SET payout_status = 'paid', paid_at = NOW() WHERE id = :id",
                { replacements: { id: courierAssignment.id } }
            );
        } catch (error) {
            payoutUpdateError = error;
        }
        expect(payoutUpdateError).toBeUndefined();

        const persistedCourierAssignment = await CourierAssignment.findByPk(courierAssignment.id);
        expect(persistedCourierAssignment.payout_status).toBe('paid');
        expect(persistedCourierAssignment.paid_at).not.toBeNull();
    }, 30000);
});

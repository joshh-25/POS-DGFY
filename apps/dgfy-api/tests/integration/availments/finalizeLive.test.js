import crypto from 'crypto';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
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
import { TenantConnector } from '../../../src/infra/tenantConnector.js';
import { provisionAndActivateTenantDatabase } from '../../helpers/tenantSchemaProvisioning.js';

/**
 * finalizeLive.test.js — 09-08-PLAN.md Task 1's live-MySQL proof: a real
 * create -> addLine -> finalize checkout run against a real dgfy_business_*
 * tenant database (never a mocked port), mirroring
 * ../businesses/businessFlows.test.js's and ../tenancy/tenantSessionFlows.
 * test.js's gating/isolated-database convention (Phase 4/8 precedent) so
 * CI without MySQL stays green: SKIPPED unless LIVE_TENANT_DB is set.
 *
 * This is deliberately NOT the same thing as 09-08-PLAN.md's Task 2 (the
 * [BLOCKING] human-verify checkpoint that applies the Phase 9 migration to
 * an already-provisioned, real dgfy_business_* tenant and records that
 * apply/verify evidence). This test is self-contained: it provisions its
 * OWN throwaway landlord + tenant database pair (exactly like
 * businessFlows.test.js's isolatedDbName()/provisionAndActivateTenantDatabase
 * pattern), applies the Phase 8 foundation schema via
 * ../../helpers/tenantSchemaProvisioning.js, THEN additionally applies the
 * Phase 9 availment-checkout migration directly (idempotent — the migration
 * itself guards every createTable with a tableExists() check) since that
 * helper only knows about the Phase 8 migrations. Setting LIVE_TENANT_DB
 * simply opts this suite in; it does not need to name a pre-existing
 * database — an operator running Task 2's real activate-tenant apply
 * separately does not need this test to pass first, and this test does not
 * depend on Task 2 having run.
 *
 * Every use case below is exercised through the SAME composition wiring
 * apps/dgfy-api/src/routes/index.js uses in production (buildBusinessesModule
 * -> buildProductsModule/buildInventoryModule/buildComplianceModule/
 * buildShiftsModule -> buildAvailmentsModule, reusing one tenantConnector/
 * businessDatabaseRegistryRepository/businessRepository/productRepository/
 * assertComplianceGate/shiftRepository set) — never a second, divergent set,
 * and never a mocked assertComplianceGate/recordSaleEffect/shiftRepository:
 * a freshly provisioned tenant has no compliance_mode_state row, so the real
 * policy engine defaults to non_compliant_active and ALLOWs a non_fiscal
 * pos.checkout — no compliance-evidence seeding is required for this test's
 * scope (CHK-01, CHK-04, CHK-05, CHK-06).
 */

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationRunnerRoot = path.resolve(__dirname, '../../../../dgfy-migration-runner');

// The real migration-runner Phase 9 schema migration (CommonJS,
// sequelize-cli convention) — required (not imported) via createRequire so
// this ESM test can load it cross-package, mirroring
// ../../helpers/tenantSchemaProvisioning.js's own pattern for the Phase 8
// migrations it already applies via provisionAndActivateTenantDatabase().
const availmentCheckoutMigration = require(
    path.join(migrationRunnerRoot, 'src/migrations/schema/20260713120000-create-availment-checkout.cjs')
);

const liveTenantDbEnv = process.env.LIVE_TENANT_DB || '';
const RUN_INTEGRATION = liveTenantDbEnv !== '' && liveTenantDbEnv.toLowerCase() !== 'false';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-at-least-32-characters-long';

if (!RUN_INTEGRATION) {
    // eslint-disable-next-line no-console
    console.log(
        '[finalizeLive.test.js] SKIPPED — set LIVE_TENANT_DB=true (with MySQL admin credentials via '
        + 'BUSINESS_IT_DB_HOST/PORT/USER/PASSWORD, or the existing DB_HOST/PORT/USER/PASSWORD convention) '
        + 'to run this real MySQL-backed availment finalize proof locally or in CI.'
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

describeIfIntegration('Availment finalize (real MySQL): CHK-01/02/04/05/06 end-to-end checkout', () => {
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
    let Payment;
    let Receipt;
    let Product;

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

        // ---- Composition root reuse (mirrors routes/index.js exactly) ---
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

        const { useCases: availmentUseCasesBuilt } = buildAvailmentsModule({
            tenantConnector,
            businessDatabaseRegistryRepository,
            businessRepository,
            productRepository,
            assertComplianceGate,
            recordSaleEffect: inventoryUseCases.recordSale,
            shiftRepository
            // deviceBridgeClient intentionally omitted — D-22 fail-open:
            // finalize still succeeds with a 'device_bridge_unconfigured'
            // print_warning, exactly like a real deployment with no
            // DEVICE_BRIDGE_URL configured.
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
            business_handle: `acme-${crypto.randomUUID().slice(0, 8)}`,
            legal_name: 'Acme Inc.',
            display_name: 'Acme Store',
            status: 'active'
        });
        businessId = business.id;

        await businessRepository.createMembership({ accountId: ownerAccountId, businessId, role: 'owner' });

        // ---- Provision + activate the real tenant database (Phase 8 -----
        // foundation schema, via the accepted operator/migration-runner
        // handoff test double) ---------------------------------------------
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

        // ---- Apply the Phase 9 availment-checkout migration on top of ---
        // the Phase 8 foundation (idempotent: every createTable is guarded
        // by the migration's own tableExists() check) --------------------
        tenantConnection = tenantConnector.getConnection(tenantDatabaseName);
        await availmentCheckoutMigration.up(tenantConnection.getQueryInterface(), Sequelize);

        const tenantModels = tenantConnector.getModels(tenantDatabaseName);
        ({ StaffAccount, TerminalIdentity, Availment, Payment, Receipt, Product } = tenantModels);

        // ---- Seed a basic_inventory product + starting stock ------------
        const createProductResult = await productUseCases.createProduct({
            businessId,
            requestingAccountId: ownerAccountId,
            name: 'Espresso',
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
     * Seeds a fresh TerminalIdentity + StaffAccount pair (each test gets
     * its own, so shift open-state never bleeds between test cases).
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

    it('finalizes a real availment end-to-end: availment finalized, payment written, receipt persisted and append-only-immutable, stock decremented (CHK-01/02/04/05)', async () => {
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

        const productBefore = await Product.findByPk(productId);
        const stockBefore = Number(productBefore.stock_count);

        // ---- create -> addLine -> finalize (real usecases, real DB) -----
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
        expect(addLineResult.data.stock_effect_type).toBe('inventory_issue');

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
        const { availment, payment, receipt } = finalizeResult.data;

        // Quantity 2 x 112.0000 (VAT-inclusive) => 224.0000 subtotal/total,
        // no discounts. change = 300.00 - 224.00 = 76.0000.
        expect(availment.status).toBe('finalized');
        expect(availment.total_amount).toBe('224.0000');
        expect(payment.payment_method).toBe('cash');
        expect(payment.amount_received).toBe('300.0000');
        expect(payment.change_due).toBe('76.0000');
        expect(receipt.receipt_number).toMatch(new RegExp(`^RCPT-${availmentId}-`));
        expect(receipt.payload.lines).toHaveLength(1);

        // ---- Re-query the real tenant DB to prove real persistence ------
        const persistedAvailment = await Availment.findByPk(availmentId);
        expect(persistedAvailment.status).toBe('finalized');

        const persistedPayment = await Payment.findByPk(payment.id);
        expect(persistedPayment).not.toBeNull();
        expect(persistedPayment.availment_id).toBe(availmentId);

        const persistedReceipt = await Receipt.findByPk(receipt.id);
        expect(persistedReceipt).not.toBeNull();
        expect(persistedReceipt.availment_id).toBe(availmentId);

        // ---- Stock decremented for the inventory_issue line -------------
        const productAfter = await Product.findByPk(productId);
        expect(Number(productAfter.stock_count)).toBe(stockBefore - 2);

        // ---- Append-only enforcement: a second UPDATE against the -------
        // persisted receipt row is rejected by the DB-level BEFORE UPDATE
        // trigger (not just the Sequelize model hook) ---------------------
        let receiptUpdateError;
        try {
            await tenantConnection.query(
                'UPDATE receipts SET printed = 1 WHERE id = :id',
                { replacements: { id: receipt.id } }
            );
        } catch (error) {
            receiptUpdateError = error;
        }
        expect(receiptUpdateError).toBeDefined();
        expect(String(receiptUpdateError.message || receiptUpdateError.original?.sqlMessage || '')).toMatch(/append-only/i);

        // Same DB-level guarantee for payments (D-08/D-09/D-10 immutable
        // financial record).
        let paymentUpdateError;
        try {
            await tenantConnection.query(
                'UPDATE payments SET change_due = 0 WHERE id = :id',
                { replacements: { id: payment.id } }
            );
        } catch (error) {
            paymentUpdateError = error;
        }
        expect(paymentUpdateError).toBeDefined();
        expect(String(paymentUpdateError.message || paymentUpdateError.original?.sqlMessage || '')).toMatch(/append-only/i);
    }, 30000);

    it('CHK-06: rejects finalize with a conflict when no open shift exists for the cashier/terminal, and persists nothing', async () => {
        // A fresh terminal/staff pair with NO shift ever opened for it.
        const { terminalId, cashierAccountId } = await seedTerminalAndStaff();

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
            quantity: 1
        });
        expect(addLineResult.isSuccess).toBe(true);

        const finalizeResult = await availmentUseCases.finalizeAvailment({
            businessId,
            requestingAccountId: ownerAccountId,
            availmentId,
            requestedDocumentContext: 'non_fiscal',
            paymentMethod: 'cash',
            cashReceived: '500.00',
            terminalId,
            cashierAccountId
        });

        expect(finalizeResult.isSuccess).toBe(false);
        expect(finalizeResult.error.statusCode).toBe(409);
        expect(finalizeResult.error.details?.error_code).toBe('NO_OPEN_SHIFT');

        // Nothing persisted: the availment is still a draft, no payment/
        // receipt rows exist for it.
        const persistedAvailment = await Availment.findByPk(availmentId);
        expect(persistedAvailment.status).toBe('draft');

        const paymentsForAvailment = await Payment.findAll({ where: { availment_id: availmentId } });
        expect(paymentsForAvailment).toHaveLength(0);

        const receiptsForAvailment = await Receipt.findAll({ where: { availment_id: availmentId } });
        expect(receiptsForAvailment).toHaveLength(0);
    }, 30000);
});

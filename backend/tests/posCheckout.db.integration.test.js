import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { Sequelize } from 'sequelize';
import dbStore from '../src/utils/dbStore.js';
import { getTenantModels } from '../src/utils/tenantModelFactory.js';
import { checkoutPosUseCase } from '../src/modules/pos/index.js';
import { listPosCatalogUseCase } from '../src/modules/pos/index.js';
import { sequelize as landlordSequelize } from '../src/models/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.join(__dirname, '..');

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    port: Number(process.env.DB_PORT || 3306)
};

const createIsolatedDbName = () => (
    `test_pos_checkout_${Date.now()}_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`
);

const runMigrationsForDb = (dbName) => {
    const migrationResult = spawnSync(
        process.execPath,
        [
            'node_modules/sequelize-cli/lib/sequelize',
            'db:migrate',
            '--env',
            'development',
            '--config',
            'src/config/sequelize.config.cjs',
            '--migrations-path',
            'migrations'
        ],
        {
            cwd: backendRoot,
            encoding: 'utf8',
            env: {
                ...process.env,
                DB_NAME: dbName,
                DB_HOST: dbConfig.host,
                DB_USER: dbConfig.user,
                DB_PASSWORD: dbConfig.password,
                DB_PORT: String(dbConfig.port)
            }
        }
    );

    if (migrationResult.status !== 0) {
        throw new Error(
            `Migration failed for ${dbName}\n${migrationResult.stdout}\n${migrationResult.stderr}`
        );
    }
};

describe('POS checkout DB integration (migrations + transactional stock writes)', () => {
    const dbName = createIsolatedDbName();
    let tenantSequelize;
    let models;

    const runInTenantContext = (callback) => dbStore.run(
        {
            ...models,
            sequelize: tenantSequelize,
            tenantId: `tenant-${dbName}`,
            tenantName: 'POS Integration Tenant',
            dbName
        },
        callback
    );

    const createCashier = async () => {
        const suffix = crypto.randomUUID().slice(0, 8);
        const terminalId = `POS-TEST-${suffix}`.toUpperCase();
        const cashier = await models.User.create({
            username: `cashier_${suffix}`,
            email: `cashier_${suffix}@pos.test`,
            password_hash: 'test-hash',
            role: 'staff',
            is_active: true
        });
        const location = await models.TenantLocation.create({
            name: `POS Test ${suffix}`,
            address_line: 'Rizal Street, Lapaz, Iloilo City',
            latitude: 10.7202,
            longitude: 122.5621,
            is_open: true,
            is_active: true,
            allow_out_of_stock_sales: false,
            supports_delivery: true,
            supports_pickup: true,
            supports_dine_in: true
        });
        await models.UserLocationGrant.create({
            user_id: cashier.user_id,
            location_id: location.location_id,
            created_by: cashier.user_id
        });
        await setSetting('pos_terminal_registry', JSON.stringify([{
            terminal_id: terminalId,
            label: terminalId,
            is_active: true,
            is_default: true,
            location_id: location.location_id
        }]), 'json');
        await models.PosTerminalShift.create({
            business_date: new Date().toISOString().slice(0, 10),
            terminal_id: terminalId,
            location_id: location.location_id,
            cashier_id: cashier.user_id,
            opening_float_amount: 0,
            status: 'open'
        });
        cashier.posTestTerminalId = terminalId;
        cashier.posTestLocationId = location.location_id;
        return cashier;
    };

    const createFinishedGood = async (overrides = {}) => {
        const suffix = crypto.randomUUID().slice(0, 8);
        return models.Item.create({
            sku_code: `POS-${suffix}`,
            name: `POS Item ${suffix}`,
            category: 'product',
            product_type: 'finished_goods',
            current_stock: 10,
            max_capacity: 500,
            min_threshold: 1,
            purchase_allowance: 100,
            unit_of_measure: 'pc',
            cost_per_unit: 55,
            default_sale_price: 95,
            fifo_enabled: false,
            status: 'active',
            ...overrides
        });
    };

    const createRawMaterial = async (overrides = {}) => {
        const suffix = crypto.randomUUID().slice(0, 8);
        return models.Item.create({
            sku_code: `RM-${suffix}`,
            name: `RM Item ${suffix}`,
            category: 'raw_material',
            product_type: null,
            current_stock: 10,
            max_capacity: 500,
            min_threshold: 1,
            purchase_allowance: 100,
            unit_of_measure: 'kg',
            cost_per_unit: 55,
            default_sale_price: 95,
            fifo_enabled: false,
            status: 'active',
            ...overrides
        });
    };

    const createFifoBatch = async (itemId, overrides = {}) => (
        models.FIFOBatch.create({
            item_id: itemId,
            quantity: 0.2,
            quantity_consumed: 0,
            cost_per_unit: 55,
            received_date: new Date(),
            po_number: `BATCH-${crypto.randomUUID().slice(0, 8)}`,
            ...overrides
        })
    );

    const setSetting = async (settingKey, settingValue, dataType = null) => {
        const row = await models.SystemSetting.findOne({ where: { setting_key: settingKey } });
        if (!row) {
            await models.SystemSetting.create({
                setting_key: settingKey,
                setting_value: settingValue,
                data_type: dataType || 'string',
                description: `Test-created setting for ${settingKey}`
            });
            return;
        }

        const updatePayload = { setting_value: settingValue };
        if (dataType) updatePayload.data_type = dataType;
        await row.update(updatePayload);
    };

    const checkoutAsCashier = async (cashier, payload) => {
        const itemIds = [...new Set((payload.lines || []).map((line) => Number(line.item_id)))];
        for (const itemId of itemIds) {
            const item = await models.Item.findByPk(itemId);
            if (!item) continue;
            await models.ItemLocationStock.upsert({
                item_id: itemId,
                location_id: cashier.posTestLocationId,
                quantity_on_hand: Number(item.current_stock || 0),
                updated_by: null
            });
        }
        return runInTenantContext(() => checkoutPosUseCase({
            userId: cashier.user_id,
            user: cashier,
            payload: {
                ...payload,
                terminal_id: cashier.posTestTerminalId,
                location_id: cashier.posTestLocationId
            }
        }));
    };

    beforeAll(async () => {
        await landlordSequelize.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
        runMigrationsForDb(dbName);

        tenantSequelize = new Sequelize(
            dbName,
            dbConfig.user,
            dbConfig.password,
            {
                host: dbConfig.host,
                port: dbConfig.port,
                dialect: 'mysql',
                logging: false
            }
        );

        await tenantSequelize.authenticate();
        models = getTenantModels(tenantSequelize);
    }, 180000);

    afterAll(async () => {
        if (tenantSequelize) {
            await tenantSequelize.close();
        }
        await landlordSequelize.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
    }, 60000);

    it('runs against migrated POS schema and persists checkout stock movements', async () => {
        const [posMigrationRows] = await tenantSequelize.query(
            "SELECT name FROM SequelizeMeta WHERE name IN ('20260325000002-create-pos-transactions.cjs','20260325000003-add-pos-reference-type-and-settings.cjs')"
        );
        expect(posMigrationRows.length).toBe(2);

        const invoiceCounter = await models.PosInvoiceCounter.findByPk('POS_OR');
        expect(invoiceCounter).not.toBeNull();

        const cashier = await createCashier();
        const product = await createFinishedGood({ current_stock: 10 });
        const idempotencyKey = `idem-success-${crypto.randomUUID()}`;

        const checkoutResult = await checkoutAsCashier(cashier, {
                idempotency_key: idempotencyKey,
                payment_type: 'cash',
                order_method: 'dine_in',
                lines: [
                    {
                        item_id: product.item_id,
                        quantity: 2,
                        sale_price: null
                    }
                ]
        });

        expect(checkoutResult.success).toBe(true);
        expect(checkoutResult.data.idempotent_replay).toBe(false);

        const persistedTx = await models.PosTransaction.findOne({
            where: { idempotency_key: idempotencyKey },
            include: [{ model: models.PosTransactionLine, as: 'lines' }]
        });
        expect(persistedTx).not.toBeNull();
        expect(persistedTx.lines.length).toBe(1);

        const posMovements = await models.StockMovement.findAll({
            where: {
                reference_type: 'POS',
                reference_id: String(persistedTx.pos_transaction_id)
            }
        });
        expect(posMovements.length).toBe(1);
        expect(Number(posMovements[0].quantity)).toBe(-2);
        expect(posMovements[0].movement_type).toBe('goods_issue');

        const refreshedItem = await models.Item.findByPk(product.item_id);
        expect(Number(refreshedItem.current_stock)).toBe(8);
    });

    it('requires explicit opt-in for non-finished categories and blocks when pos_visible=false', async () => {
        const cashier = await createCashier();
        const rawMaterial = await createRawMaterial({ current_stock: 10, default_sale_price: 80 });

        const catalogBeforeEnable = await runInTenantContext(() => listPosCatalogUseCase({
            query: { search: rawMaterial.sku_code, limit: 50 },
            user: { user_id: cashier.user_id }
        }));
        expect(catalogBeforeEnable.success).toBe(true);
        expect(catalogBeforeEnable.data.some((row) => Number(row.item_id) === Number(rawMaterial.item_id))).toBe(false);

        const checkoutBeforeEnable = await checkoutAsCashier(cashier, {
                idempotency_key: `idem-rm-default-hidden-${crypto.randomUUID()}`,
                payment_type: 'cash',
                order_method: 'dine_in',
                lines: [{ item_id: rawMaterial.item_id, quantity: 1, sale_price: null }]
        });
        expect(checkoutBeforeEnable.success).toBe(false);

        await models.PosCatalogOverride.create({
            item_id: rawMaterial.item_id,
            pos_visible: true
        });

        const catalogAfterEnable = await runInTenantContext(() => listPosCatalogUseCase({
            query: { search: rawMaterial.sku_code, limit: 50 },
            user: { user_id: cashier.user_id }
        }));
        expect(catalogAfterEnable.success).toBe(true);
        expect(catalogAfterEnable.data.some((row) => Number(row.item_id) === Number(rawMaterial.item_id))).toBe(true);

        const checkoutAfterEnable = await checkoutAsCashier(cashier, {
                idempotency_key: `idem-rm-enabled-${crypto.randomUUID()}`,
                payment_type: 'cash',
                order_method: 'dine_in',
                lines: [{ item_id: rawMaterial.item_id, quantity: 1, sale_price: null }]
        });
        expect(checkoutAfterEnable.success).toBe(true);

        await models.PosCatalogOverride.update({
            pos_visible: false
        }, {
            where: { item_id: rawMaterial.item_id }
        });

        const catalogAfterHide = await runInTenantContext(() => listPosCatalogUseCase({
            query: { search: rawMaterial.sku_code, limit: 50 },
            user: { user_id: cashier.user_id }
        }));
        expect(catalogAfterHide.success).toBe(true);
        expect(catalogAfterHide.data.some((row) => Number(row.item_id) === Number(rawMaterial.item_id))).toBe(false);

        const checkoutAfterHide = await checkoutAsCashier(cashier, {
                idempotency_key: `idem-rm-hidden-${crypto.randomUUID()}`,
                payment_type: 'cash',
                order_method: 'dine_in',
                lines: [{ item_id: rawMaterial.item_id, quantity: 1, sale_price: null }]
        });
        expect(checkoutAfterHide.success).toBe(false);
        expect(checkoutAfterHide.error.message).toContain('POS-visible active items');
    });

    it('rolls back transaction when stock movement fails mid-checkout', async () => {
        const cashier = await createCashier();
        const product = await createFinishedGood({ current_stock: 10 });
        const idempotencyKey = `idem-rollback-${crypto.randomUUID()}`;

        const posCountBefore = await models.PosTransaction.count();
        const movementCountBefore = await models.StockMovement.count({
            where: { reference_type: 'POS' }
        });

        const checkoutResult = await checkoutAsCashier(cashier, {
                idempotency_key: idempotencyKey,
                payment_type: 'cash',
                order_method: 'dine_in',
                lines: [
                    { item_id: product.item_id, quantity: 6, sale_price: null },
                    { item_id: product.item_id, quantity: 6, sale_price: null }
                ]
        });

        expect(checkoutResult.success).toBe(false);
        expect(checkoutResult.error.code).toBe('VALIDATION_FAILED');
        expect(checkoutResult.error.message).toContain('Insufficient stock');

        const persistedTx = await models.PosTransaction.findOne({
            where: { idempotency_key: idempotencyKey }
        });
        expect(persistedTx).toBeNull();

        const posCountAfter = await models.PosTransaction.count();
        const movementCountAfter = await models.StockMovement.count({
            where: { reference_type: 'POS' }
        });
        expect(posCountAfter).toBe(posCountBefore);
        expect(movementCountAfter).toBe(movementCountBefore);

        const refreshedItem = await models.Item.findByPk(product.item_id);
        expect(Number(refreshedItem.current_stock)).toBe(10);
    });

    it('auto-reconciles FIFO batch drift when current_stock is higher than open batch quantities', async () => {
        const cashier = await createCashier();
        const product = await createFinishedGood({
            fifo_enabled: true,
            current_stock: 1,
            unit_of_measure: 'L'
        });

        await createFifoBatch(product.item_id, {
            quantity: 0.2,
            quantity_consumed: 0.0
        });

        const idempotencyKey = `idem-fifo-drift-${crypto.randomUUID()}`;
        const checkoutResult = await checkoutAsCashier(cashier, {
                idempotency_key: idempotencyKey,
                payment_type: 'cash',
                order_method: 'dine_in',
                lines: [
                    {
                        item_id: product.item_id,
                        quantity: 1,
                        sale_price: null
                    }
                ]
        });

        expect(checkoutResult.success).toBe(true);

        const driftBatch = await models.FIFOBatch.findOne({
            where: {
                item_id: product.item_id,
                po_number: 'LEGACY-STOCK-DRIFT'
            }
        });
        expect(driftBatch).not.toBeNull();
        expect(Number(driftBatch.quantity)).toBeCloseTo(0.8, 6);
        expect(Number(driftBatch.quantity_consumed)).toBeCloseTo(0.8, 6);

        const refreshedItem = await models.Item.findByPk(product.item_id);
        expect(Number(refreshedItem.current_stock)).toBeCloseTo(0, 6);
    });

    it('applies fixed DGFY convenience fee correctly and ignores caller override snapshot', async () => {
        const cashier = await createCashier();
        const vatableItem = await createFinishedGood({
            vat_type: 'vatable',
            current_stock: 10,
            default_sale_price: 112
        });

        const idempotencyKey = `idem-method-fee-${crypto.randomUUID()}`;
        const checkoutResult = await checkoutAsCashier(cashier, {
                idempotency_key: idempotencyKey,
                payment_type: 'cash',
                order_method: 'delivery',
                service_fee_amount: 60,
                lines: [
                    {
                        item_id: vatableItem.item_id,
                        quantity: 1,
                        sale_price: 112
                    }
                ]
        });

        expect(checkoutResult.success).toBe(true);
        const persistedTx = await models.PosTransaction.findOne({
            where: { idempotency_key: idempotencyKey },
            include: [{ model: models.PosTransactionLine, as: 'lines' }]
        });
        expect(Number(persistedTx.subtotal_amount)).toBeCloseTo(112, 4);
        expect(Number(persistedTx.service_fee_amount)).toBeCloseTo(1.12, 4);
        expect(persistedTx.service_fee_label_snapshot).toBe('DGFY convenience fee');
        expect(persistedTx.service_fee_method_snapshot).toBe('delivery');
        expect(Boolean(persistedTx.service_fee_overridden)).toBe(false);
        expect(Number(persistedTx.total_amount)).toBeCloseTo(113.12, 4);

        // Fee is non-VAT, so VAT buckets remain item-only.
        expect(Number(persistedTx.vatable_sales)).toBeCloseTo(100, 4);
        expect(Number(persistedTx.vat_amount)).toBeCloseTo(12, 4);
    });
});

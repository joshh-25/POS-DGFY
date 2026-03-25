import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { Sequelize } from 'sequelize';
import dbStore from '../src/utils/dbStore.js';
import { getTenantModels } from '../src/utils/tenantModelFactory.js';
import { checkoutPosUseCase } from '../src/modules/pos/index.js';
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
        return models.User.create({
            username: `cashier_${suffix}`,
            email: `cashier_${suffix}@pos.test`,
            password_hash: 'test-hash',
            role: 'staff',
            is_active: true
        });
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

        const checkoutResult = await runInTenantContext(() => checkoutPosUseCase({
            userId: cashier.user_id,
            payload: {
                idempotency_key: idempotencyKey,
                payment_type: 'cash',
                order_method: 'dine_in',
                lines: [
                    {
                        item_id: product.item_id,
                        quantity: 2,
                        sale_price: 120
                    }
                ]
            }
        }));

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

    it('rolls back transaction when stock movement fails mid-checkout', async () => {
        const cashier = await createCashier();
        const product = await createFinishedGood({ current_stock: 10 });
        const idempotencyKey = `idem-rollback-${crypto.randomUUID()}`;

        const posCountBefore = await models.PosTransaction.count();
        const movementCountBefore = await models.StockMovement.count({
            where: { reference_type: 'POS' }
        });

        const checkoutResult = await runInTenantContext(() => checkoutPosUseCase({
            userId: cashier.user_id,
            payload: {
                idempotency_key: idempotencyKey,
                payment_type: 'cash',
                order_method: 'dine_in',
                lines: [
                    { item_id: product.item_id, quantity: 6, sale_price: 110 },
                    { item_id: product.item_id, quantity: 6, sale_price: 110 }
                ]
            }
        }));

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
});

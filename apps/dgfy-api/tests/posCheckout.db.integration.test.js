import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { Sequelize } from 'sequelize';
import bcrypt from 'bcryptjs';
import dbStore from '../src/utils/dbStore.js';
import { getTenantModels } from '../src/utils/tenantModelFactory.js';
import { listPosCatalogUseCase } from '../src/modules/pos/index.js';
import { buildCheckoutPosUseCase } from '../src/modules/pos/usecases/posUseCases.js';
import { posRepository } from '../src/modules/pos/repositories/posRepository.js';
import { inventoryStockCommandService } from '../src/modules/inventory/index.js';
import { reconcileFifoLedgerOpeningBalance } from '../src/services/stockMovementService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.join(__dirname, '..');
const migrationRunnerRoot = path.join(backendRoot, '..', 'dgfy-migration-runner');
const sequelizeCliPath = path.join(migrationRunnerRoot, 'node_modules', 'sequelize-cli', 'lib', 'sequelize');

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    port: Number(process.env.DB_PORT || 3306)
};
const adminSequelize = new Sequelize('mysql', dbConfig.user, dbConfig.password, {
    host: dbConfig.host,
    port: dbConfig.port,
    dialect: 'mysql',
    logging: false
});
const checkoutPosUseCase = buildCheckoutPosUseCase({
    posRepository,
    inventoryCommandService: inventoryStockCommandService,
    resolveIdentityStatus: async () => ({
        identity_mode: 'dgfy_membership',
        membership_id: 1
    })
});

const createIsolatedDbName = () => (
    `test_pos_checkout_${Date.now()}_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`
);

const runMigrationsForDb = (dbName) => {
    if (!fs.existsSync(sequelizeCliPath)) {
        throw new Error(`Sequelize CLI entrypoint not found at: ${sequelizeCliPath}`);
    }

    const migrationResult = spawnSync(
        process.execPath,
        [
            sequelizeCliPath,
            'db:migrate',
            '--env',
            'development',
            '--config',
            'src/config/sequelize.config.cjs',
            '--migrations-path',
            'migrations'
        ],
        {
            cwd: migrationRunnerRoot,
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

    const createCashier = async (userOverrides = {}) => {
        const suffix = crypto.randomUUID().slice(0, 8);
        const terminalId = `POS-TEST-${suffix}`.toUpperCase();
        const cashier = await models.User.create({
            username: `cashier_${suffix}`,
            email: `cashier_${suffix}@pos.test`,
            password_hash: 'test-hash',
            role: 'staff',
            is_active: true,
            ...userOverrides
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

    const checkoutAsCashier = async (
        cashier,
        payload,
        { operatorSessionId = null, quoteOnly = false, validateInventoryAvailability = false } = {}
    ) => {
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
            operatorSessionId,
            quoteOnly,
            validateInventoryAvailability,
            payload: {
                ...payload,
                terminal_id: cashier.posTestTerminalId,
                location_id: cashier.posTestLocationId
            }
        }));
    };

    beforeAll(async () => {
        await adminSequelize.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
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
        await adminSequelize.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
        await adminSequelize.close();
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

        expect(checkoutResult).toEqual(expect.objectContaining({ success: true }));
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

    it('persists A, B, A, B operator attribution under one register shift', async () => {
        const cashierA = await createCashier();
        const suffix = crypto.randomUUID().slice(0, 8);
        const cashierB = await models.User.create({
            username: `relief_${suffix}`,
            email: `relief_${suffix}@pos.test`,
            password_hash: 'test-hash',
            role: 'staff',
            is_active: true
        });
        await models.UserLocationGrant.create({
            user_id: cashierB.user_id,
            location_id: cashierA.posTestLocationId,
            created_by: cashierA.user_id
        });
        cashierB.posTestTerminalId = cashierA.posTestTerminalId;
        cashierB.posTestLocationId = cashierA.posTestLocationId;

        const [attendanceA, attendanceB] = await Promise.all([
            models.EmployeeAttendanceSession.create({
                user_id: cashierA.user_id,
                location_id: cashierA.posTestLocationId,
                duty_type: 'regular',
                status: 'open',
                started_at: new Date(),
                start_idempotency_key: `attendance-a-${suffix}`
            }),
            models.EmployeeAttendanceSession.create({
                user_id: cashierB.user_id,
                location_id: cashierA.posTestLocationId,
                duty_type: 'relief',
                status: 'open',
                started_at: new Date(),
                start_idempotency_key: `attendance-b-${suffix}`
            })
        ]);
        const shift = await models.PosTerminalShift.findOne({
            where: { terminal_id: cashierA.posTestTerminalId, status: 'open' }
        });
        const product = await createFinishedGood({ current_stock: 10 });
        const actors = [cashierA, cashierB, cashierA, cashierB];
        const attendanceByUserId = new Map([
            [cashierA.user_id, attendanceA],
            [cashierB.user_id, attendanceB]
        ]);
        const createdSessionIds = [];

        for (let index = 0; index < actors.length; index += 1) {
            await models.PosTerminalOperatorSession.update(
                {
                    status: 'ended',
                    ended_at: new Date(),
                    ended_reason: 'test_handoff',
                    revoked_at: new Date(),
                    revoked_reason: 'test_handoff'
                },
                { where: { pos_terminal_shift_id: shift.pos_terminal_shift_id, status: 'active' } }
            );
            const actor = actors[index];
            const operatorSession = await models.PosTerminalOperatorSession.create({
                pos_terminal_shift_id: shift.pos_terminal_shift_id,
                terminal_id: cashierA.posTestTerminalId,
                location_id: cashierA.posTestLocationId,
                user_id: actor.user_id,
                employee_attendance_session_id: attendanceByUserId.get(actor.user_id).employee_attendance_session_id,
                status: 'active',
                started_at: new Date(),
                authority_expires_at: new Date(Date.now() + 60 * 60 * 1000),
                idempotency_key: `operator-${suffix}-${index}`
            });
            createdSessionIds.push(operatorSession.pos_terminal_operator_session_id);
            const result = await checkoutAsCashier(actor, {
                idempotency_key: `operator-checkout-${suffix}-${index}`,
                shift_id: shift.pos_terminal_shift_id,
                payment_type: 'cash',
                order_method: 'dine_in',
                lines: [{ item_id: product.item_id, quantity: 1 }]
            }, { operatorSessionId: operatorSession.pos_terminal_operator_session_id });
            expect(result.success).toBe(true);
        }

        const transactions = await models.PosTransaction.findAll({
            where: { idempotency_key: actors.map((_, index) => `operator-checkout-${suffix}-${index}`) },
            order: [['pos_transaction_id', 'ASC']]
        });
        expect(transactions.map((row) => Number(row.cashier_id))).toEqual([
            cashierA.user_id,
            cashierB.user_id,
            cashierA.user_id,
            cashierB.user_id
        ]);
        expect(transactions.map((row) => Number(row.operator_session_id))).toEqual(createdSessionIds);
        expect(new Set(transactions.map((row) => Number(row.shift_id)))).toEqual(new Set([shift.pos_terminal_shift_id]));
        expect(Number(shift.cashier_id)).toBe(cashierA.user_id);
    });

    it('persists governed discount allocations against the real transaction line primary key', async () => {
        const cashier = await createCashier();
        const approver = await models.User.create({
            username: `senior_approver_${crypto.randomUUID().slice(0, 8)}`,
            email: `senior_approver_${crypto.randomUUID().slice(0, 8)}@pos.test`,
            password_hash: 'test-hash',
            pos_approval_pin_hash: await bcrypt.hash('2468', 4),
            role: 'manager',
            is_active: true
        });
        const product = await createFinishedGood({
            current_stock: 10,
            senior_pwd_discount_eligible: true
        });

        const checkoutResult = await checkoutAsCashier(cashier, {
                idempotency_key: `idem-governed-${crypto.randomUUID()}`,
                payment_type: 'cash',
                order_method: 'dine_in',
                discount_beneficiary: {
                    category: 'senior',
                    name: 'Integration Customer',
                    id_number: 'SC-INTEGRATION'
                },
                governed_discount: {
                    type: 'senior',
                    label: 'Senior Citizen',
                    method: 'percentage',
                    rate: 20,
                    customer_name: 'Integration Customer',
                    id_number: 'SC-INTEGRATION',
                    eligible_item_ids: [product.item_id],
                    approver_user_id: approver.user_id,
                    manager_pin: '2468'
                },
                lines: [{ item_id: product.item_id, quantity: 1, sale_price: null }]
        });

        expect(checkoutResult).toEqual(expect.objectContaining({ success: true }));

        const transaction = await models.PosTransaction.findOne({
            where: { pos_transaction_id: checkoutResult.data.transaction.pos_transaction_id },
            include: [{ model: models.PosTransactionLine, as: 'lines' }]
        });
        const discount = await models.PosTransactionDiscount.findOne({
            where: { transaction_id: transaction.pos_transaction_id }
        });
        const allocation = await models.PosTransactionDiscountLine.findOne({
            where: { transaction_discount_id: discount.id }
        });

        expect(transaction.lines).toHaveLength(1);
        expect(allocation.transaction_line_id).toBe(transaction.lines[0].line_id);
        expect(allocation.item_id).toBe(product.item_id);
        expect(Number(allocation.gross_eligible_amount)).toBeGreaterThan(0);
    });

    it('persists multiple statutory beneficiaries and their line allocations', async () => {
        const cashier = await createCashier();
        const product = await createFinishedGood({ current_stock: 10, senior_pwd_discount_eligible: true });
        const checkoutResult = await checkoutAsCashier(cashier, {
            idempotency_key: `idem-multi-beneficiary-${crypto.randomUUID()}`,
            payment_type: 'cash',
            order_method: 'dine_in',
            governed_discount: {
                type: 'senior',
                beneficiaries: [
                    { category: 'senior', name: 'Senior One', id_number: 'SC-INTEGRATION-1', eligible_items: [{ item_id: product.item_id, eligible_quantity: 1 }] },
                    { category: 'senior', name: 'Senior Two', id_number: 'SC-INTEGRATION-2', eligible_items: [{ item_id: product.item_id, eligible_quantity: 1 }] }
                ]
            },
            lines: [{ item_id: product.item_id, quantity: 2, sale_price: null }]
        });

        expect(checkoutResult).toEqual(expect.objectContaining({ success: true }));
        const discount = await models.PosTransactionDiscount.findOne({ where: { transaction_id: checkoutResult.data.transaction.pos_transaction_id } });
        const beneficiaries = await models.PosTransactionDiscountBeneficiary.findAll({ where: { transaction_discount_id: discount.id } });
        const allocations = await models.PosTransactionDiscountLine.findAll({ where: { transaction_discount_id: discount.id } });
        expect(beneficiaries).toHaveLength(2);
        const beneficiaryAllocations = allocations.filter((allocation) => allocation.beneficiary_id != null);
        expect(beneficiaryAllocations).toHaveLength(2);
        expect(beneficiaryAllocations.reduce((sum, allocation) => sum + Number(allocation.eligible_quantity), 0)).toBe(2);
        expect(beneficiaryAllocations.reduce((sum, allocation) => sum + Number(allocation.discount_amount), 0)).toBeCloseTo(Number(discount.discount_amount), 4);
        expect(discount.calculation_version).toBe('pos-discount.v3');
    });

    it('persists the verified manager identity for an employee discount', async () => {
        const cashier = await createCashier();
        const employee = await models.Employee.create({
            employee_code: `EMP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
            full_name: cashier.username,
            email: cashier.email,
            location_id: cashier.posTestLocationId,
            is_active: true,
            created_by: cashier.user_id
        });
        const approver = await models.User.create({
            username: `manager_${crypto.randomUUID().slice(0, 8)}`,
            email: `manager_${crypto.randomUUID().slice(0, 8)}@pos.test`,
            password_hash: 'test-hash',
            pos_approval_pin_hash: await bcrypt.hash('2468', 4),
            role: 'manager',
            is_active: true
        });
        const product = await createFinishedGood({ current_stock: 10 });

        const checkoutResult = await checkoutAsCashier(cashier, {
            idempotency_key: `idem-employee-${crypto.randomUUID()}`,
            payment_type: 'cash',
            order_method: 'dine_in',
            governed_discount: {
                type: 'employee',
                method: 'percentage',
                rate: 10,
                customer_name: 'Employee Buyer',
                employee_name: 'Untrusted Name',
                employee_id: 'SPOOFED-CODE',
                employee_directory_id: employee.employee_id,
                approver_user_id: approver.user_id,
                manager_pin: '2468',
                reason: 'Staff meal'
            },
            lines: [{ item_id: product.item_id, quantity: 1, sale_price: null }]
        });

        expect(checkoutResult.success).toBe(true);
        const discount = await models.PosTransactionDiscount.findOne({
            where: { transaction_id: checkoutResult.data.transaction.pos_transaction_id }
        });
        const transaction = await models.PosTransaction.findByPk(checkoutResult.data.transaction.pos_transaction_id);
        const audit = await models.AuditLog.findOne({
            where: {
                entity_type: 'pos_discount',
                entity_id: checkoutResult.data.transaction.pos_transaction_id
            }
        });
        expect(discount.manager_approval_id).toBe(approver.user_id);
        expect(discount.manager_approved_at).toBeInstanceOf(Date);
        expect(discount.employee_id).toBe(employee.employee_code);
        expect(discount.employee_name).toBe(cashier.username);
        expect(discount.self_approved).toBe(false);
        expect(Number(discount.discount_amount)).toBe(9.5);
        expect(Number(transaction.discount_amount)).toBe(9.5);
        expect(Number(transaction.total_amount)).toBe(85.5);
        expect(audit.user_id).toBe(cashier.user_id);
        expect(typeof audit.changes === 'string' ? JSON.parse(audit.changes) : audit.changes).toEqual(expect.objectContaining({
            selected_employee_id: employee.employee_code,
            selected_employee_name: cashier.username,
            applied_by_user_id: cashier.user_id,
            approved_by_user_id: approver.user_id,
            authorized_by_name: approver.username,
            cashier_name: cashier.username,
            discount_amount: expect.any(Number),
            self_approved: false
        }));
        expect(JSON.stringify(audit.changes)).not.toContain('2468');
    });

    it('requires an authorized employee PIN even when the cashier is an admin', async () => {
        const adminOperator = await createCashier({ role: 'admin' });
        const employee = await models.Employee.create({
            employee_code: `EMP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
            full_name: adminOperator.username,
            email: adminOperator.email,
            location_id: adminOperator.posTestLocationId,
            is_active: true,
            created_by: adminOperator.user_id
        });
        const product = await createFinishedGood({ current_stock: 10 });

        const checkoutResult = await checkoutAsCashier(adminOperator, {
            idempotency_key: `idem-employee-admin-${crypto.randomUUID()}`,
            payment_type: 'cash',
            order_method: 'dine_in',
            governed_discount: {
                type: 'employee',
                method: 'percentage',
                rate: 10,
                customer_name: 'Employee Buyer',
                employee_name: 'Admin employee',
                employee_directory_id: employee.employee_id
            },
            lines: [{ item_id: product.item_id, quantity: 1, sale_price: null }]
        });

        expect(checkoutResult.success).toBe(false);
        expect(checkoutResult.error.code).toBe('VALIDATION_FAILED');
        expect(checkoutResult.error.details).toEqual(expect.objectContaining({ reason_code: 'DISCOUNT_APPROVER_REQUIRED' }));
    });

    it('sells an always-available POS item at zero stock without creating a stock movement', async () => {
        const cashier = await createCashier();
        const product = await createFinishedGood({ current_stock: 0 });
        await models.PosCatalogOverride.create({
            item_id: product.item_id,
            pos_visible: true,
            pos_always_available: true
        });

        const catalogResult = await runInTenantContext(() => listPosCatalogUseCase({
            query: { search: product.sku_code, limit: 50 },
            user: { user_id: cashier.user_id }
        }));
        expect(catalogResult.success).toBe(true);
        const catalogItem = catalogResult.data.find((item) => Number(item.item_id) === Number(product.item_id));
        expect(catalogItem).toEqual(expect.objectContaining({
            item_id: product.item_id,
            pos_always_available: true
        }));
        expect(Number(catalogItem.current_stock)).toBe(0);

        const idempotencyKey = `idem-always-available-${crypto.randomUUID()}`;
        const checkoutResult = await checkoutAsCashier(cashier, {
                idempotency_key: idempotencyKey,
                payment_type: 'cash',
                order_method: 'dine_in',
                lines: [{ item_id: product.item_id, quantity: 2, sale_price: null }]
        });

        expect(checkoutResult.success).toBe(true);
        const persistedTx = await models.PosTransaction.findOne({
            where: { idempotency_key: idempotencyKey }
        });
        const movementCount = await models.StockMovement.count({
            where: {
                reference_type: 'POS',
                reference_id: String(persistedTx.pos_transaction_id),
                item_id: product.item_id
            }
        });
        expect(movementCount).toBe(0);

        const refreshedItem = await models.Item.findByPk(product.item_id);
        expect(Number(refreshedItem.current_stock)).toBe(0);
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

    it('blocks checkout when current_stock is higher than open FIFO batch quantities', async () => {
        const cashier = await createCashier();
        const product = await createFinishedGood({
            fifo_enabled: true,
            current_stock: 1,
            unit_of_measure: 'L'
        });

        await createFifoBatch(product.item_id, {
            location_id: cashier.posTestLocationId,
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

        expect(checkoutResult.success).toBe(false);
        expect(checkoutResult.error.code).toBe('INVENTORY_LEDGER_RECONCILIATION_REQUIRED');
        expect(checkoutResult.error.message).toContain('No stock was issued');

        const driftBatch = await models.FIFOBatch.findOne({
            where: {
                item_id: product.item_id,
                po_number: 'LEGACY-STOCK-DRIFT'
            }
        });
        expect(driftBatch).toBeNull();

        const refreshedItem = await models.Item.findByPk(product.item_id);
        expect(Number(refreshedItem.current_stock)).toBeCloseTo(1, 6);
    });

    it('blocks a split-payment quote before payment when FIFO ledger quantities are insufficient', async () => {
        const cashier = await createCashier();
        const product = await createFinishedGood({
            fifo_enabled: true,
            current_stock: 1,
            unit_of_measure: 'L'
        });

        await createFifoBatch(product.item_id, {
            location_id: cashier.posTestLocationId,
            quantity: 0.2,
            quantity_consumed: 0
        });

        const transactionCountBefore = await models.PosTransaction.count();
        const movementCountBefore = await models.StockMovement.count();
        const quoteResult = await checkoutAsCashier(cashier, {
            idempotency_key: `idem-fifo-preflight-${crypto.randomUUID()}`,
            payment_type: 'cash',
            order_method: 'dine_in',
            lines: [{ item_id: product.item_id, quantity: 1, sale_price: null }]
        }, {
            quoteOnly: true,
            validateInventoryAvailability: true
        });

        expect(quoteResult.success).toBe(false);
        expect(quoteResult.error.code).toBe('INVENTORY_LEDGER_RECONCILIATION_REQUIRED');
        expect(quoteResult.error.message).toContain('No payment was accepted');
        expect(await models.PosTransaction.count()).toBe(transactionCountBefore);
        expect(await models.StockMovement.count()).toBe(movementCountBefore);

        const refreshedItem = await models.Item.findByPk(product.item_id);
        expect(Number(refreshedItem.current_stock)).toBeCloseTo(1, 6);
    });

    it('records a reviewed FIFO opening balance without changing item or location stock', async () => {
        const cashier = await createCashier();
        const product = await createFinishedGood({
            fifo_enabled: true,
            current_stock: 1,
            unit_of_measure: 'L'
        });
        await models.ItemLocationStock.create({
            item_id: product.item_id,
            location_id: cashier.posTestLocationId,
            quantity_on_hand: 1,
            updated_by: cashier.user_id
        });
        await createFifoBatch(product.item_id, {
            location_id: cashier.posTestLocationId,
            quantity: 0.2,
            quantity_consumed: 0
        });

        const movement = await runInTenantContext(() => reconcileFifoLedgerOpeningBalance({
            itemId: product.item_id,
            locationId: cashier.posTestLocationId,
            quantity: 0.8,
            expectedItemStock: 1,
            expectedLocationStock: 1,
            expectedBatchAvailable: 0.2,
            notes: 'Test-reviewed opening balance reconciliation'
        }, cashier.user_id));

        expect(movement.movement_type).toBe('adjustment');
        expect(Number(movement.quantity)).toBeCloseTo(0.8, 6);
        const refreshedItem = await models.Item.findByPk(product.item_id);
        const refreshedLocationStock = await models.ItemLocationStock.findOne({
            where: { item_id: product.item_id, location_id: cashier.posTestLocationId }
        });
        const availableBatches = await models.FIFOBatch.findAll({ where: { item_id: product.item_id } });
        const available = availableBatches.reduce((total, batch) => (
            total + Number(batch.quantity) - Number(batch.quantity_consumed)
        ), 0);

        expect(Number(refreshedItem.current_stock)).toBeCloseTo(1, 6);
        expect(Number(refreshedLocationStock.quantity_on_hand)).toBeCloseTo(1, 6);
        expect(available).toBeCloseTo(1, 6);
    });

    it('does not charge a DGFY convenience fee for an in-store POS checkout', async () => {
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
        expect(Number(persistedTx.service_fee_amount)).toBe(0);
        expect(persistedTx.service_fee_label_snapshot).toBeNull();
        expect(persistedTx.service_fee_method_snapshot).toBeNull();
        expect(Boolean(persistedTx.service_fee_overridden)).toBe(false);
        expect(Number(persistedTx.total_amount)).toBeCloseTo(112, 4);

        // Fee is non-VAT, so VAT buckets remain item-only.
        expect(Number(persistedTx.vatable_sales)).toBeCloseTo(100, 4);
        expect(Number(persistedTx.vat_amount)).toBeCloseTo(12, 4);
    });
});

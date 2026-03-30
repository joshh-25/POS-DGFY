import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { Op, Sequelize } from 'sequelize';
import dbStore from '../src/utils/dbStore.js';
import { getTenantModels } from '../src/utils/tenantModelFactory.js';
import {
  checkoutPosUseCase,
  getDailyZReadingUseCase
} from '../src/modules/pos/index.js';
import { listSalesTransactionsUseCase } from '../src/modules/sales/index.js';
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
  `test_pos_recon_${Date.now()}_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`
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

const money4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;

describe('POS reconciliation integration (checkout vs Z-reading vs unified sales)', () => {
  const dbName = createIsolatedDbName();
  let tenantSequelize;
  let models;

  const runInTenantContext = (callback) => dbStore.run(
    {
      ...models,
      sequelize: tenantSequelize,
      tenantId: `tenant-${dbName}`,
      tenantName: 'POS Reconciliation Tenant',
      dbName
    },
    callback
  );

  const createCashier = async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    return models.User.create({
      username: `cashier_${suffix}`,
      email: `cashier_${suffix}@pos.recon.test`,
      password_hash: 'test-hash',
      role: 'staff',
      is_active: true
    });
  };

  const createFinishedGood = async (overrides = {}) => {
    const suffix = crypto.randomUUID().slice(0, 8);
    return models.Item.create({
      sku_code: `RECON-${suffix}`,
      name: `Recon Item ${suffix}`,
      category: 'product',
      product_type: 'finished_goods',
      vat_type: 'vatable',
      current_stock: 20,
      max_capacity: 500,
      min_threshold: 1,
      purchase_allowance: 100,
      unit_of_measure: 'pc',
      cost_per_unit: 10,
      default_sale_price: 20,
      fifo_enabled: false,
      status: 'active',
      ...overrides
    });
  };

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

  const todayInManila = () => {
    const now = new Date();
    const tz = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
    return `${tz.getFullYear()}-${String(tz.getMonth() + 1).padStart(2, '0')}-${String(tz.getDate()).padStart(2, '0')}`;
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

  it('keeps totals consistent across POS checkout, Z-reading, and unified sales summary', async () => {
    const cashier = await createCashier();
    const vatableItem = await createFinishedGood({
      vat_type: 'vatable',
      cost_per_unit: 5,
      default_sale_price: 12
    });
    const exemptItem = await createFinishedGood({
      vat_type: 'vat_exempt',
      cost_per_unit: 4,
      default_sale_price: 10
    });
    const zeroRatedItem = await createFinishedGood({
      vat_type: 'zero_rated',
      cost_per_unit: 3,
      default_sale_price: 9
    });

    await setSetting('pos_strict_compliance_enabled', 'false', 'boolean');
    await setSetting(
      'pos_discount_profiles',
      JSON.stringify([
        { name: 'Employee Discount', percentage: 6.9767, active: true }
      ]),
      'json'
    );

    const checkoutResult = await runInTenantContext(() => checkoutPosUseCase({
      userId: cashier.user_id,
      payload: {
        idempotency_key: `recon-${crypto.randomUUID()}`,
        payment_type: 'cash',
        order_method: 'dine_in',
        discount_profile_name: 'Employee Discount',
        discount_rate: 6.9767,
        lines: [
          { item_id: vatableItem.item_id, quantity: 2, sale_price: 12 },
          { item_id: exemptItem.item_id, quantity: 1, sale_price: 10 },
          { item_id: zeroRatedItem.item_id, quantity: 1, sale_price: 9 }
        ]
      }
    }));

    expect(checkoutResult.success).toBe(true);
    const tx = checkoutResult.data.transaction;
    const txTotal = money4(tx.total_amount);
    const txVatable = money4(tx.vatable_sales);
    const txVatAmount = money4(tx.vat_amount);
    const txVatExempt = money4(tx.vat_exempt_sales);
    const txZeroRated = money4(tx.zero_rated_sales);

    const businessDate = todayInManila();

    const zResult = await runInTenantContext(() => getDailyZReadingUseCase({
      businessDateInput: businessDate
    }));
    expect(zResult.success).toBe(true);
    expect(money4(zResult.data.summary.total_amount)).toBe(txTotal);
    expect(money4(zResult.data.summary.vatable_sales)).toBe(txVatable);
    expect(money4(zResult.data.summary.vat_amount)).toBe(txVatAmount);
    expect(money4(zResult.data.summary.vat_exempt_sales)).toBe(txVatExempt);
    expect(money4(zResult.data.summary.zero_rated_sales)).toBe(txZeroRated);

    const salesResult = await runInTenantContext(() => listSalesTransactionsUseCase({
      query: {
        source: 'POS',
        date_from: '2000-01-01',
        date_to: '2100-01-01',
        limit: 200
      },
      userPermissions: ['reports:view']
    }));
    expect(salesResult.success).toBe(true);

    const matched = salesResult.data.transactions.find((row) => row.reference_no === tx.invoice_number);
    expect(matched).toBeTruthy();
    expect(money4(matched.gross_sales)).toBe(txTotal);
    expect(money4(matched.vatable_sales)).toBe(txVatable);
    expect(money4(matched.vat_amount)).toBe(txVatAmount);
    expect(money4(matched.vat_exempt_sales)).toBe(txVatExempt);
    expect(money4(matched.zero_rated_sales)).toBe(txZeroRated);

    const txCogs = money4((2 * 5) + (1 * 4) + (1 * 3));
    expect(money4(matched.cogs)).toBe(txCogs);
    expect(money4(matched.gross_profit)).toBe(money4(txTotal - txCogs));
  });

  it('enforces strict compliance mode by blocking checkout when required POS setup fields are missing', async () => {
    const cashier = await createCashier();
    const product = await createFinishedGood({ vat_type: 'vatable' });

    await setSetting('pos_strict_compliance_enabled', 'true', 'boolean');
    await setSetting('pos_ptu_number', '');

    const blocked = await runInTenantContext(() => checkoutPosUseCase({
      userId: cashier.user_id,
      payload: {
        idempotency_key: `strict-block-${crypto.randomUUID()}`,
        payment_type: 'cash',
        order_method: 'dine_in',
        lines: [{ item_id: product.item_id, quantity: 1, sale_price: null }]
      }
    }));

    expect(blocked.success).toBe(false);
    expect(blocked.error.code).toBe('VALIDATION_FAILED');
    expect(blocked.error.statusCode).toBe(422);
    expect(blocked.error.details?.missing_fields).toContain('pos_ptu_number');

    await setSetting('pos_ptu_number', 'PTU-12345');
    await setSetting('pos_business_name', 'Recon Store');
    await setSetting('pos_tin_branch', '123-456-789-000');
    await setSetting('pos_address', 'Sample Address');
    await setSetting('pos_min_number', 'MIN-12345');
    await setSetting('pos_accreditation_number', 'ACC-12345');

    const allowed = await runInTenantContext(() => checkoutPosUseCase({
      userId: cashier.user_id,
      payload: {
        idempotency_key: `strict-pass-${crypto.randomUUID()}`,
        payment_type: 'cash',
        order_method: 'dine_in',
        lines: [{ item_id: product.item_id, quantity: 1, sale_price: null }]
      }
    }));

    expect(allowed.success).toBe(true);
  });

  it('treats legacy string "false" strict setting as disabled (no false-positive block)', async () => {
    const cashier = await createCashier();
    const product = await createFinishedGood({ vat_type: 'vatable' });

    await setSetting('pos_strict_compliance_enabled', 'false', 'string');
    await setSetting('pos_ptu_number', '');

    const result = await runInTenantContext(() => checkoutPosUseCase({
      userId: cashier.user_id,
      payload: {
        idempotency_key: `legacy-false-${crypto.randomUUID()}`,
        payment_type: 'cash',
        order_method: 'dine_in',
        lines: [{ item_id: product.item_id, quantity: 1, sale_price: null }]
      }
    }));

    expect(result.success).toBe(true);
  });

  it('accepts legacy string-encoded discount profiles for checkout discount resolution', async () => {
    const cashier = await createCashier();
    const product = await createFinishedGood({ vat_type: 'vatable', default_sale_price: 100 });

    await setSetting('pos_strict_compliance_enabled', 'false', 'boolean');
    await setSetting(
      'pos_discount_profiles',
      JSON.stringify([{ name: 'Legacy Employee', percentage: 20, active: true }]),
      'string'
    );

    const checkout = await runInTenantContext(() => checkoutPosUseCase({
      userId: cashier.user_id,
      payload: {
        idempotency_key: `legacy-discount-${crypto.randomUUID()}`,
        payment_type: 'cash',
        order_method: 'dine_in',
        discount_profile_name: 'Legacy Employee',
        discount_rate: 20,
        lines: [{ item_id: product.item_id, quantity: 1, sale_price: 100 }]
      }
    }));

    expect(checkout.success).toBe(true);
    expect(money4(checkout.data.transaction.discount_amount)).toBe(20);
    expect(checkout.data.transaction.discount_label_snapshot).toBe('Legacy Employee');
    expect(money4(checkout.data.transaction.discount_rate_snapshot)).toBe(20);
  });

  it('auto-repairs double-encoded POS JSON settings on read path and still computes discounts/fees correctly', async () => {
    const cashier = await createCashier();
    const product = await createFinishedGood({ vat_type: 'vatable', default_sale_price: 100 });

    await setSetting('pos_strict_compliance_enabled', 'false', 'boolean');
    await setSetting(
      'pos_discount_profiles',
      JSON.stringify(JSON.stringify([{ name: 'Double Encoded', percentage: 10, active: true }])),
      'string'
    );
    await setSetting(
      'pos_order_method_fees',
      JSON.stringify(JSON.stringify({
        dine_in: { enabled: false, amount: 0, label: 'Dine In Fee' },
        takeout: { enabled: false, amount: 0, label: 'Takeout Fee' },
        delivery: { enabled: true, amount: 25, label: 'Delivery Fee' },
        online: { enabled: false, amount: 0, label: 'Online Fee' }
      })),
      'string'
    );

    const checkout = await runInTenantContext(() => checkoutPosUseCase({
      userId: cashier.user_id,
      payload: {
        idempotency_key: `double-encoded-${crypto.randomUUID()}`,
        payment_type: 'cash',
        order_method: 'delivery',
        discount_profile_name: 'Double Encoded',
        discount_rate: 10,
        lines: [{ item_id: product.item_id, quantity: 1, sale_price: 100 }]
      }
    }));

    expect(checkout.success).toBe(true);
    expect(money4(checkout.data.transaction.discount_amount)).toBe(10);
    expect(money4(checkout.data.transaction.service_fee_amount)).toBe(25);

    const repairedDiscountSetting = await models.SystemSetting.findOne({ where: { setting_key: 'pos_discount_profiles' } });
    const repairedFeeSetting = await models.SystemSetting.findOne({ where: { setting_key: 'pos_order_method_fees' } });

    expect(repairedDiscountSetting.data_type).toBe('json');
    expect(repairedFeeSetting.data_type).toBe('json');

    const repairedDiscountValue = JSON.parse(repairedDiscountSetting.setting_value);
    const repairedFeeValue = JSON.parse(repairedFeeSetting.setting_value);
    expect(Array.isArray(repairedDiscountValue)).toBe(true);
    expect(repairedDiscountValue[0].name).toBe('Double Encoded');
    expect(repairedFeeValue.delivery.enabled).toBe(true);
    expect(Number(repairedFeeValue.delivery.amount)).toBe(25);
  });

  it('includes same-day records when date_from and date_to are equal (end-of-day inclusive)', async () => {
    const cashier = await createCashier();
    const product = await createFinishedGood({ vat_type: 'vatable' });

    await setSetting('pos_strict_compliance_enabled', 'false', 'boolean');

    const checkout = await runInTenantContext(() => checkoutPosUseCase({
      userId: cashier.user_id,
      payload: {
        idempotency_key: `same-day-${crypto.randomUUID()}`,
        payment_type: 'cash',
        order_method: 'dine_in',
        lines: [{ item_id: product.item_id, quantity: 1, sale_price: null }]
      }
    }));
    expect(checkout.success).toBe(true);

    const today = todayInManila();

    const posRows = await runInTenantContext(async () => {
      const rows = await models.PosTransaction.findAll({
        where: {
          created_at: {
            [Op.gte]: new Date(`${today}T00:00:00.000Z`),
            [Op.lte]: new Date(`${today}T23:59:59.999Z`)
          }
        }
      });
      return rows;
    });
    expect(posRows.length).toBeGreaterThan(0);

    const salesResult = await runInTenantContext(() => listSalesTransactionsUseCase({
      query: {
        source: 'POS',
        date_from: today,
        date_to: today,
        limit: 200
      },
      userPermissions: ['reports:view']
    }));
    expect(salesResult.success).toBe(true);
    expect(salesResult.data.transactions.some((row) => row.reference_no === checkout.data.transaction.invoice_number)).toBe(true);
  });

  it('aggregates POS service fees in z-reading and unified sales summary', async () => {
    const cashier = await createCashier();
    const product = await createFinishedGood({ vat_type: 'vatable', default_sale_price: 56, cost_per_unit: 20 });

    await setSetting('pos_strict_compliance_enabled', 'false', 'boolean');
    await setSetting(
      'pos_order_method_fees',
      JSON.stringify({
        dine_in: { enabled: false, amount: 0, label: 'Dine In Fee' },
        takeout: { enabled: false, amount: 0, label: 'Takeout Fee' },
        delivery: { enabled: true, amount: 40, label: 'Delivery Fee' },
        online: { enabled: false, amount: 0, label: 'Online Fee' }
      }),
      'json'
    );

    const checkout = await runInTenantContext(() => checkoutPosUseCase({
      userId: cashier.user_id,
      payload: {
        idempotency_key: `fee-agg-${crypto.randomUUID()}`,
        payment_type: 'cash',
        order_method: 'delivery',
        lines: [{ item_id: product.item_id, quantity: 1, sale_price: 56 }]
      }
    }));
    expect(checkout.success).toBe(true);
    expect(money4(checkout.data.transaction.service_fee_amount)).toBe(40);

    const businessDate = todayInManila();
    const zResult = await runInTenantContext(() => getDailyZReadingUseCase({
      businessDateInput: businessDate
    }));
    expect(zResult.success).toBe(true);
    expect(money4(zResult.data.summary.service_fee_total)).toBeGreaterThanOrEqual(40);

    const salesResult = await runInTenantContext(() => listSalesTransactionsUseCase({
      query: {
        source: 'POS',
        date_from: '2000-01-01',
        date_to: '2100-01-01',
        limit: 200
      },
      userPermissions: ['reports:view']
    }));
    expect(salesResult.success).toBe(true);
    expect(money4(salesResult.data.summary.service_fee_total)).toBeGreaterThanOrEqual(40);
  });
});

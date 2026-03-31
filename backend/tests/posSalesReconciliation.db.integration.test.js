import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { Op, Sequelize } from 'sequelize';
import dbStore from '../src/utils/dbStore.js';
import { getTenantModels } from '../src/utils/tenantModelFactory.js';
import {
  checkoutPosUseCase,
  getDailyZReadingUseCase,
  updateOnlineOrderStatusUseCase
} from '../src/modules/pos/index.js';
import { listSalesTransactionsUseCase } from '../src/modules/sales/index.js';
import {
  cancelStoreOrderUseCase,
  storeCheckoutUseCase,
  trackStoreOrderUseCase
} from '../src/modules/store/index.js';
import { generateStoreCancelProof } from '../src/modules/store/utils/storeJwtToken.js';
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
const STORE_TENANT_ID = '11111111-1111-4111-8111-111111111111';
const createPublicTrackingPin = () => `SK-${crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()}`;

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

  const runInStoreTenantContext = (callback) => dbStore.run(
    {
      ...models,
      sequelize: tenantSequelize,
      tenantId: STORE_TENANT_ID,
      tenantName: 'POS Reconciliation Store Tenant',
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

  const createTenantLocation = async (overrides = {}) => (
    models.TenantLocation.create({
      name: `Main ${crypto.randomUUID().slice(0, 6)}`,
      address_line: 'Rizal Street, Lapaz, Iloilo City',
      latitude: 10.7202,
      longitude: 122.5621,
      delivery_radius_km: 6,
      is_open: true,
      is_active: true,
      current_wait_time_minutes: 15,
      allow_out_of_stock_sales: false,
      supports_delivery: true,
      supports_pickup: true,
      supports_dine_in: true,
      ...overrides
    })
  );

  const createOnlineOrderTransaction = async ({
    item,
    cashierId,
    fulfillmentStatus = 'placed',
    orderMethod = 'delivery',
    paymentType = 'cash',
    totalAmount = 120
  }) => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const subtotal = Number(totalAmount) - 20;
    const transaction = await models.PosTransaction.create({
      invoice_number: `ONL-${suffix}`,
      idempotency_key: `onl-idem-${suffix}`,
      request_hash: crypto.createHash('sha256').update(`onl-${suffix}`).digest('hex'),
      cashier_id: cashierId,
      shift_id: null,
      terminal_id: 'ONLINE_STORE',
      order_source: 'online_store',
      order_method: orderMethod,
      fulfillment_status: fulfillmentStatus,
      payment_type: paymentType,
      subtotal_amount: subtotal,
      vatable_sales: money4(subtotal / 1.12),
      vat_amount: money4(subtotal - (subtotal / 1.12)),
      vat_exempt_sales: 0,
      zero_rated_sales: 0,
      discount_amount: 0,
      service_fee_amount: 0,
      total_amount: money4(totalAmount),
      status: 'completed',
      tracking_pin: `SK-${suffix.toUpperCase()}`,
      customer_name: 'Online Buyer',
      customer_phone: '09170000000',
      delivery_address: 'Online Address'
    });

    await models.PosTransactionLine.create({
      pos_transaction_id: transaction.pos_transaction_id,
      item_id: item.item_id,
      quantity: 1,
      unit_of_measure: item.unit_of_measure,
      cost_snapshot: item.cost_per_unit,
      sale_price: money4(totalAmount),
      line_subtotal: money4(totalAmount),
      vat_type_snapshot: 'vatable',
      vat_rate_snapshot: 0.12
    });

    return transaction;
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
            [Op.gte]: new Date(`${today}T00:00:00.000+08:00`),
            [Op.lte]: new Date(`${today}T23:59:59.999+08:00`)
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

  it('counts only financially recognized online orders in z-reading and unified sales', async () => {
    const cashier = await createCashier();
    const item = await createFinishedGood({
      vat_type: 'vatable',
      default_sale_price: 100,
      cost_per_unit: 35
    });

    await setSetting('pos_strict_compliance_enabled', 'false', 'boolean');

    const businessDate = todayInManila();
    const baselineZ = await runInTenantContext(() => getDailyZReadingUseCase({
      businessDateInput: businessDate
    }));
    expect(baselineZ.success).toBe(true);

    const baselineSales = await runInTenantContext(() => listSalesTransactionsUseCase({
      query: {
        source: 'POS',
        date_from: '2000-01-01',
        date_to: '2100-01-01',
        limit: 200
      },
      userPermissions: ['reports:view']
    }));
    expect(baselineSales.success).toBe(true);

    const inStoreCheckout = await runInTenantContext(() => checkoutPosUseCase({
      userId: cashier.user_id,
      payload: {
        idempotency_key: `financial-recognition-${crypto.randomUUID()}`,
        payment_type: 'cash',
        order_method: 'dine_in',
        lines: [{ item_id: item.item_id, quantity: 1, sale_price: 100 }]
      }
    }));
    expect(inStoreCheckout.success).toBe(true);

    const onlinePlaced = await runInTenantContext(() => createOnlineOrderTransaction({
      item,
      cashierId: cashier.user_id,
      fulfillmentStatus: 'placed',
      totalAmount: 110
    }));
    const onlineRejected = await runInTenantContext(() => createOnlineOrderTransaction({
      item,
      cashierId: cashier.user_id,
      fulfillmentStatus: 'rejected',
      totalAmount: 130
    }));
    const onlineCompleted = await runInTenantContext(() => createOnlineOrderTransaction({
      item,
      cashierId: cashier.user_id,
      fulfillmentStatus: 'completed',
      totalAmount: 150
    }));

    const expectedRecognizedGross = money4(100 + 150);

    const zResult = await runInTenantContext(() => getDailyZReadingUseCase({
      businessDateInput: businessDate
    }));
    expect(zResult.success).toBe(true);
    expect(
      money4(zResult.data.summary.total_amount - baselineZ.data.summary.total_amount)
    ).toBe(expectedRecognizedGross);
    expect(
      zResult.data.summary.transaction_count - baselineZ.data.summary.transaction_count
    ).toBe(2);

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
    expect(
      money4(salesResult.data.summary.gross_sales - baselineSales.data.summary.gross_sales)
    ).toBe(expectedRecognizedGross);

    const references = salesResult.data.transactions.map((row) => row.reference_no);
    expect(references).toContain(inStoreCheckout.data.transaction.invoice_number);
    expect(references).toContain(onlineCompleted.invoice_number);
    expect(references).not.toContain(onlinePlaced.invoice_number);
    expect(references).not.toContain(onlineRejected.invoice_number);
  });

  it('deducts inventory exactly once when online orders transition to completed', async () => {
    const cashier = await createCashier();
    const item = await createFinishedGood({
      vat_type: 'vatable',
      current_stock: 15,
      cost_per_unit: 12,
      default_sale_price: 40
    });

    await setSetting('pos_strict_compliance_enabled', 'false', 'boolean');

    const onlineOrder = await runInTenantContext(() => createOnlineOrderTransaction({
      item,
      cashierId: cashier.user_id,
      fulfillmentStatus: 'ready_for_pickup',
      totalAmount: 80
    }));
    await runInTenantContext(() => models.PosTransactionLine.update(
      { quantity: 2, line_subtotal: 80, sale_price: 40 },
      { where: { pos_transaction_id: onlineOrder.pos_transaction_id } }
    ));

    const beforeItem = await runInTenantContext(() => models.Item.findByPk(item.item_id));
    expect(Number(beforeItem.current_stock)).toBe(15);

    const firstCompletion = await runInTenantContext(() => updateOnlineOrderStatusUseCase({
      posTransactionId: onlineOrder.pos_transaction_id,
      payload: { fulfillment_status: 'completed' },
      user: { user_id: cashier.user_id }
    }));
    expect(firstCompletion.success).toBe(true);

    const afterFirstCompletionItem = await runInTenantContext(() => models.Item.findByPk(item.item_id));
    expect(Number(afterFirstCompletionItem.current_stock)).toBe(13);

    const movementsAfterFirstCompletion = await runInTenantContext(() => models.StockMovement.findAll({
      where: {
        reference_type: 'POS',
        reference_id: { [Op.like]: `ONLINE:${onlineOrder.pos_transaction_id}:%` }
      }
    }));
    expect(movementsAfterFirstCompletion).toHaveLength(1);
    expect(Number(movementsAfterFirstCompletion[0].quantity)).toBe(-2);

    const secondCompletion = await runInTenantContext(() => updateOnlineOrderStatusUseCase({
      posTransactionId: onlineOrder.pos_transaction_id,
      payload: { fulfillment_status: 'completed' },
      user: { user_id: cashier.user_id }
    }));
    expect(secondCompletion.success).toBe(true);

    const afterSecondCompletionItem = await runInTenantContext(() => models.Item.findByPk(item.item_id));
    expect(Number(afterSecondCompletionItem.current_stock)).toBe(13);

    const movementsAfterSecondCompletion = await runInTenantContext(() => models.StockMovement.findAll({
      where: {
        reference_type: 'POS',
        reference_id: { [Op.like]: `ONLINE:${onlineOrder.pos_transaction_id}:%` }
      }
    }));
    expect(movementsAfterSecondCompletion).toHaveLength(1);
  });

  it('does not deduct inventory for cancelled placed orders and blocks cancelled lifecycle updates', async () => {
    const cashier = await createCashier();
    const item = await createFinishedGood({
      vat_type: 'vatable',
      current_stock: 12,
      cost_per_unit: 11,
      default_sale_price: 50
    });

    const order = await runInStoreTenantContext(() => createOnlineOrderTransaction({
      item,
      cashierId: cashier.user_id,
      fulfillmentStatus: 'placed',
      orderMethod: 'pickup',
      totalAmount: 100
    }));
    const trackingPin = createPublicTrackingPin();
    await runInStoreTenantContext(() => models.PosTransaction.update(
      { tracking_pin: trackingPin },
      { where: { pos_transaction_id: order.pos_transaction_id } }
    ));
    order.tracking_pin = trackingPin;
    await runInStoreTenantContext(() => models.PosTransactionLine.update(
      { quantity: 2, line_subtotal: 100, sale_price: 50 },
      { where: { pos_transaction_id: order.pos_transaction_id } }
    ));

    const cancelProof = generateStoreCancelProof({
      trackingPin: order.tracking_pin,
      tenantId: STORE_TENANT_ID,
      orderId: order.pos_transaction_id
    });

    const cancelled = await runInStoreTenantContext(() => cancelStoreOrderUseCase({
      trackingPin: order.tracking_pin,
      tenantId: STORE_TENANT_ID,
      payload: { cancel_proof: cancelProof }
    }));
    expect(cancelled.success).toBe(true);
    expect(cancelled.data.status).toBe('cancelled');

    const itemAfterCancel = await runInStoreTenantContext(() => models.Item.findByPk(item.item_id));
    expect(Number(itemAfterCancel.current_stock)).toBe(12);

    const cancelMovements = await runInStoreTenantContext(() => models.StockMovement.findAll({
      where: {
        reference_type: 'POS',
        reference_id: { [Op.like]: `ONLINE:${order.pos_transaction_id}:%` }
      }
    }));
    expect(cancelMovements).toHaveLength(0);

    const forcedCompletion = await runInStoreTenantContext(() => updateOnlineOrderStatusUseCase({
      posTransactionId: order.pos_transaction_id,
      payload: { fulfillment_status: 'completed' },
      user: { user_id: cashier.user_id }
    }));
    expect(forcedCompletion.success).toBe(false);
    expect(forcedCompletion.error.statusCode).toBe(409);
  });

  it('covers online order tracking -> POS lifecycle -> reporting -> inventory end-to-end', async () => {
    const cashier = await createCashier();
    const item = await createFinishedGood({
      vat_type: 'vatable',
      current_stock: 9,
      cost_per_unit: 18,
      default_sale_price: 120
    });

    const businessDate = todayInManila();
    const baselineZ = await runInStoreTenantContext(() => getDailyZReadingUseCase({
      businessDateInput: businessDate
    }));
    expect(baselineZ.success).toBe(true);

    const baselineSales = await runInStoreTenantContext(() => listSalesTransactionsUseCase({
      query: {
        source: 'POS',
        date_from: '2000-01-01',
        date_to: '2100-01-01',
        limit: 200
      },
      userPermissions: ['reports:view']
    }));
    expect(baselineSales.success).toBe(true);

    const onlineOrder = await runInStoreTenantContext(() => createOnlineOrderTransaction({
      item,
      cashierId: cashier.user_id,
      fulfillmentStatus: 'placed',
      orderMethod: 'pickup',
      totalAmount: 240
    }));
    const trackingPin = createPublicTrackingPin();
    await runInStoreTenantContext(() => models.PosTransaction.update(
      { tracking_pin: trackingPin },
      { where: { pos_transaction_id: onlineOrder.pos_transaction_id } }
    ));
    onlineOrder.tracking_pin = trackingPin;
    await runInStoreTenantContext(() => models.PosTransactionLine.update(
      { quantity: 2, line_subtotal: 240, sale_price: 120 },
      { where: { pos_transaction_id: onlineOrder.pos_transaction_id } }
    ));

    const orderId = onlineOrder.pos_transaction_id;
    const invoiceNumber = onlineOrder.invoice_number;
    const expectedTotal = money4(240);

    const trackedPlaced = await runInStoreTenantContext(() => trackStoreOrderUseCase({
      trackingPin,
      tenantId: STORE_TENANT_ID
    }));
    expect(trackedPlaced.success).toBe(true);
    expect(trackedPlaced.data.status).toBe('placed');
    expect(trackedPlaced.data.order.customer_phone).toBeUndefined();

    const firstHop = await runInStoreTenantContext(() => updateOnlineOrderStatusUseCase({
      posTransactionId: orderId,
      payload: { fulfillment_status: 'confirmed' },
      user: { user_id: cashier.user_id }
    }));
    expect(firstHop.success).toBe(true);
    const secondHop = await runInStoreTenantContext(() => updateOnlineOrderStatusUseCase({
      posTransactionId: orderId,
      payload: { fulfillment_status: 'preparing' },
      user: { user_id: cashier.user_id }
    }));
    expect(secondHop.success).toBe(true);
    const thirdHop = await runInStoreTenantContext(() => updateOnlineOrderStatusUseCase({
      posTransactionId: orderId,
      payload: { fulfillment_status: 'ready_for_pickup' },
      user: { user_id: cashier.user_id }
    }));
    expect(thirdHop.success).toBe(true);
    const completion = await runInStoreTenantContext(() => updateOnlineOrderStatusUseCase({
      posTransactionId: orderId,
      payload: { fulfillment_status: 'completed' },
      user: { user_id: cashier.user_id }
    }));
    expect(completion.success).toBe(true);

    const trackedCompleted = await runInStoreTenantContext(() => trackStoreOrderUseCase({
      trackingPin,
      tenantId: STORE_TENANT_ID
    }));
    expect(trackedCompleted.success).toBe(true);
    expect(trackedCompleted.data.status).toBe('completed');

    const itemAfterCompletion = await runInStoreTenantContext(() => models.Item.findByPk(item.item_id));
    expect(Number(itemAfterCompletion.current_stock)).toBe(7);

    const movements = await runInStoreTenantContext(() => models.StockMovement.findAll({
      where: {
        reference_type: 'POS',
        reference_id: { [Op.like]: `ONLINE:${orderId}:%` }
      }
    }));
    expect(movements).toHaveLength(1);
    expect(Number(movements[0].quantity)).toBe(-2);

    const zAfter = await runInStoreTenantContext(() => getDailyZReadingUseCase({
      businessDateInput: businessDate
    }));
    expect(zAfter.success).toBe(true);
    expect(
      money4(zAfter.data.summary.total_amount - baselineZ.data.summary.total_amount)
    ).toBe(expectedTotal);
    expect(
      zAfter.data.summary.transaction_count - baselineZ.data.summary.transaction_count
    ).toBe(1);

    const salesAfter = await runInStoreTenantContext(() => listSalesTransactionsUseCase({
      query: {
        source: 'POS',
        date_from: '2000-01-01',
        date_to: '2100-01-01',
        limit: 200
      },
      userPermissions: ['reports:view']
    }));
    expect(salesAfter.success).toBe(true);
    expect(
      money4(salesAfter.data.summary.gross_sales - baselineSales.data.summary.gross_sales)
    ).toBe(expectedTotal);
    expect(salesAfter.data.transactions.some((row) => row.reference_no === invoiceNumber)).toBe(true);
  });

  it('covers storefront checkout -> tracking -> POS lifecycle -> reporting -> inventory end-to-end', async () => {
    const cashier = await createCashier();
    const item = await createFinishedGood({
      vat_type: 'vatable',
      current_stock: 11,
      cost_per_unit: 20,
      default_sale_price: 140
    });
    const location = await createTenantLocation({
      supports_delivery: false,
      supports_pickup: true,
      supports_dine_in: false
    });

    await setSetting('pos_open_status', 'true', 'boolean');
    await setSetting('pos_wait_time_minutes', '15', 'number');
    await setSetting('store_delivery_fee', '30', 'number');

    const businessDate = todayInManila();
    const baselineZ = await runInStoreTenantContext(() => getDailyZReadingUseCase({
      businessDateInput: businessDate
    }));
    expect(baselineZ.success).toBe(true);

    const baselineSales = await runInStoreTenantContext(() => listSalesTransactionsUseCase({
      query: {
        source: 'POS',
        date_from: '2000-01-01',
        date_to: '2100-01-01',
        limit: 200
      },
      userPermissions: ['reports:view']
    }));
    expect(baselineSales.success).toBe(true);

    const checkout = await runInStoreTenantContext(() => storeCheckoutUseCase({
      tenantId: STORE_TENANT_ID,
      payload: {
        idempotency_key: `checkout-flow-${crypto.randomUUID()}`,
        location_id: location.location_id,
        order_method: 'pickup',
        payment_type: 'cash',
        customer_name: 'Checkout Buyer',
        customer_phone: '09171112222',
        lines: [{ item_id: item.item_id, quantity: 2 }]
      }
    }));
    expect(checkout.success).toBe(true);
    expect(checkout.data.order.order_source).toBe('online_store');
    expect(checkout.data.order.fulfillment_status).toBe('placed');

    const trackingPin = checkout.data.tracking_pin;
    const orderId = checkout.data.order.pos_transaction_id;
    const invoiceNumber = checkout.data.order.invoice_number;
    const expectedTotal = money4(checkout.data.order.total_amount);

    const trackedPlaced = await runInStoreTenantContext(() => trackStoreOrderUseCase({
      trackingPin,
      tenantId: STORE_TENANT_ID
    }));
    expect(trackedPlaced.success).toBe(true);
    expect(trackedPlaced.data.status).toBe('placed');
    expect(trackedPlaced.data.order.customer_phone).toBeUndefined();

    const confirm = await runInStoreTenantContext(() => updateOnlineOrderStatusUseCase({
      posTransactionId: orderId,
      payload: { fulfillment_status: 'confirmed' },
      user: { user_id: cashier.user_id }
    }));
    expect(confirm.success).toBe(true);

    const prepare = await runInStoreTenantContext(() => updateOnlineOrderStatusUseCase({
      posTransactionId: orderId,
      payload: { fulfillment_status: 'preparing' },
      user: { user_id: cashier.user_id }
    }));
    expect(prepare.success).toBe(true);

    const ready = await runInStoreTenantContext(() => updateOnlineOrderStatusUseCase({
      posTransactionId: orderId,
      payload: { fulfillment_status: 'ready_for_pickup' },
      user: { user_id: cashier.user_id }
    }));
    expect(ready.success).toBe(true);

    const complete = await runInStoreTenantContext(() => updateOnlineOrderStatusUseCase({
      posTransactionId: orderId,
      payload: { fulfillment_status: 'completed' },
      user: { user_id: cashier.user_id }
    }));
    expect(complete.success).toBe(true);

    const trackedCompleted = await runInStoreTenantContext(() => trackStoreOrderUseCase({
      trackingPin,
      tenantId: STORE_TENANT_ID
    }));
    expect(trackedCompleted.success).toBe(true);
    expect(trackedCompleted.data.status).toBe('completed');

    const itemAfterCompletion = await runInStoreTenantContext(() => models.Item.findByPk(item.item_id));
    expect(Number(itemAfterCompletion.current_stock)).toBe(9);

    const movements = await runInStoreTenantContext(() => models.StockMovement.findAll({
      where: {
        reference_type: 'POS',
        reference_id: { [Op.like]: `ONLINE:${orderId}:%` }
      }
    }));
    expect(movements).toHaveLength(1);
    expect(Number(movements[0].quantity)).toBe(-2);

    const zAfter = await runInStoreTenantContext(() => getDailyZReadingUseCase({
      businessDateInput: businessDate
    }));
    expect(zAfter.success).toBe(true);
    expect(
      money4(zAfter.data.summary.total_amount - baselineZ.data.summary.total_amount)
    ).toBe(expectedTotal);
    expect(
      zAfter.data.summary.transaction_count - baselineZ.data.summary.transaction_count
    ).toBe(1);

    const salesAfter = await runInStoreTenantContext(() => listSalesTransactionsUseCase({
      query: {
        source: 'POS',
        date_from: '2000-01-01',
        date_to: '2100-01-01',
        limit: 200
      },
      userPermissions: ['reports:view']
    }));
    expect(salesAfter.success).toBe(true);
    expect(
      money4(salesAfter.data.summary.gross_sales - baselineSales.data.summary.gross_sales)
    ).toBe(expectedTotal);
    expect(salesAfter.data.transactions.some((row) => row.reference_no === invoiceNumber)).toBe(true);
  });
});

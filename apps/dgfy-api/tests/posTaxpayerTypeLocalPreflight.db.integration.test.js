import crypto from 'crypto';
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { QueryTypes, Sequelize } from 'sequelize';
import { createMigratedTestDatabase } from './helpers/migratedTestDatabase.js';
import dbStore from '../src/utils/dbStore.js';
import { getTenantModels } from '../src/utils/tenantModelFactory.js';
import { sequelize as landlordSequelize } from '../src/models/index.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

const mockAssertComplianceOperationAllowed = jest.fn(async ({ context }) => {
    const isFiscal = String(context?.requested_document_context || '').trim().toLowerCase() === 'fiscal';
    return {
        success: true,
        data: {
            decision: {
                allowed: true,
                receipt_contract: isFiscal
                    ? {
                        document_type: 'fiscal_invoice',
                        label: 'FISCAL INVOICE',
                        document_context: 'fiscal'
                    }
                    : {
                        document_type: 'non_fiscal_slip',
                        label: 'NON-FISCAL SLIP',
                        document_context: 'non_fiscal'
                    }
            }
        }
    };
});

jest.unstable_mockModule('../src/modules/compliance/index.js', () => ({
    assertComplianceOperationAllowed: mockAssertComplianceOperationAllowed,
    COMPLIANCE_OPERATION: {
        POS_CHECKOUT: 'pos.checkout',
        POS_TERMINAL_OPERATION: 'pos.terminal.operation'
    }
}));

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    port: Number(process.env.DB_PORT || 3306)
};

const suffix = `${Date.now()}_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
const dbName = `test_pos_taxpayer_preflight_${suffix}`;

let tenantSequelize;
let models;
let buildCheckoutPosUseCase;
let checkoutPosUseCase;
let posRepository;
let inventoryStockCommandService;
let getAllSettingsUseCase;

const runInTenantContext = (callback) => dbStore.run({
    ...models,
    sequelize: tenantSequelize,
    tenantId: `tenant-${suffix}`,
    tenantName: 'Phase 560 POS Taxpayer Preflight Tenant',
    tenantComplianceModeChoiceRequired: false,
    tenantComplianceModeState: 'non_compliant_active',
    dbName
}, callback);

const todayInManila = () => {
    const now = new Date();
    const manila = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
    return `${manila.getFullYear()}-${String(manila.getMonth() + 1).padStart(2, '0')}-${String(manila.getDate()).padStart(2, '0')}`;
};

const encodeSettingValue = (value, dataType) => {
    if (dataType === 'json') return JSON.stringify(value);
    if (dataType === 'boolean') return value === true ? 'true' : 'false';
    return String(value ?? '');
};

const setSetting = async (settingKey, value, dataType = 'string') => {
    const [setting] = await models.SystemSetting.findOrCreate({
        where: { setting_key: settingKey },
        defaults: {
            setting_key: settingKey,
            setting_value: encodeSettingValue(value, dataType),
            data_type: dataType,
            description: `Phase 560 disposable fixture setting: ${settingKey}`
        }
    });
    await setting.update({
        setting_value: encodeSettingValue(value, dataType),
        data_type: dataType
    });
};

const createCashier = () => models.User.create({
    username: `phase560_cashier_${suffix}`.slice(0, 50),
    email: `phase560_cashier_${suffix}@test.invalid`,
    password_hash: 'phase560-test-hash',
    role: 'staff',
    is_active: true,
    permissions: []
});

const createFinishedGood = () => models.Item.create({
    sku_code: `PHASE560-${suffix}`.slice(0, 50),
    name: `Phase 560 Fixture Item ${suffix}`.slice(0, 255),
    category: 'product',
    product_type: 'finished_goods',
    vat_type: 'vatable',
    current_stock: 5,
    max_capacity: 100,
    min_threshold: 1,
    purchase_allowance: 100,
    unit_of_measure: 'pc',
    cost_per_unit: 10,
    default_sale_price: 20,
    fifo_enabled: false,
    status: 'active'
});

const createLocation = () => models.TenantLocation.create({
    name: `Phase 560 Main ${suffix}`.slice(0, 120),
    address_line: 'Local fixture address',
    latitude: 10.7202,
    longitude: 122.5621,
    delivery_radius_km: 6,
    is_open: true,
    is_active: true,
    current_wait_time_minutes: 15,
    allow_out_of_stock_sales: false,
    supports_delivery: true,
    supports_pickup: true,
    supports_dine_in: true
});

const createOpenShift = ({ cashierId, terminalId, locationId }) => models.PosTerminalShift.create({
    business_date: todayInManila(),
    terminal_id: terminalId,
    location_id: locationId,
    cashier_id: cashierId,
    opening_float_amount: 0,
    opening_note: 'Phase 560 disposable local preflight',
    opened_at: new Date(),
    status: 'open'
});

const seedLocationStock = async ({ itemId, locationId, quantityOnHand }) => {
    await tenantSequelize.query(
        `INSERT INTO item_location_stocks
            (item_id, location_id, quantity_on_hand, updated_by, created_at, updated_at)
         VALUES (:itemId, :locationId, :quantityOnHand, NULL, NOW(), NOW())
         ON DUPLICATE KEY UPDATE
            quantity_on_hand = VALUES(quantity_on_hand),
            updated_by = NULL,
            updated_at = NOW()`,
        { replacements: { itemId, locationId, quantityOnHand } }
    );
};

const buildCheckoutPayload = ({ itemId, terminalId, shiftId, locationId, documentContext, idempotencyKey }) => ({
    idempotency_key: idempotencyKey,
    terminal_id: terminalId,
    shift_id: shiftId,
    location_id: locationId,
    document_context: documentContext,
    payment_type: 'cash',
    order_method: 'dine_in',
    lines: [{ item_id: itemId, quantity: 1 }]
});

describe('Phase 560 disposable local POS taxpayer preflight', () => {
    let cashier;
    let item;
    let location;
    let shift;
    const terminalId = `PHASE560-${suffix}`.slice(0, 30).toUpperCase();

    beforeAll(async () => {
        await landlordSequelize.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
        await createMigratedTestDatabase(dbName, landlordSequelize);
        tenantSequelize = new Sequelize(dbName, dbConfig.user, dbConfig.password, {
            host: dbConfig.host,
            port: dbConfig.port,
            dialect: 'mysql',
            logging: false,
            pool: { max: 8, min: 0 }
        });
        await tenantSequelize.authenticate();
        models = getTenantModels(tenantSequelize);

        ({ buildCheckoutPosUseCase } = await import('../src/modules/pos/usecases/posUseCases.js'));
        ({ posRepository } = await import('../src/modules/pos/repositories/posRepository.js'));
        ({ inventoryStockCommandService } = await import('../src/modules/inventory/index.js'));
        ({ getAllSettingsUseCase } = await import('../src/modules/settings/index.js'));

        checkoutPosUseCase = buildCheckoutPosUseCase({
            posRepository,
            inventoryCommandService: inventoryStockCommandService,
            resolveIdentityStatus: async () => ({ identity_mode: 'phase560_fixture' })
        });

        cashier = await createCashier();
        item = await createFinishedGood();
        location = await createLocation();
        await models.UserLocationGrant.create({
            user_id: cashier.user_id,
            location_id: location.location_id,
            created_by: cashier.user_id
        });
        await setSetting('pos_taxpayer_type', '');
        await setSetting('pos_strict_compliance_enabled', 'false', 'boolean');
        await setSetting('pos_terminal_registry', [{
            terminal_id: terminalId,
            label: terminalId,
            is_active: true,
            is_default: true,
            location_id: location.location_id
        }], 'json');
        await seedLocationStock({
            itemId: item.item_id,
            locationId: location.location_id,
            quantityOnHand: 5
        });
        shift = await createOpenShift({
            cashierId: cashier.user_id,
            terminalId,
            locationId: location.location_id
        });
    }, 180000);

    afterAll(async () => {
        if (tenantSequelize) await tenantSequelize.close();
        await landlordSequelize.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
    }, 60000);

    it('blocks blank taxpayer fiscal issuance before any financial, fiscal-event, or stock mutation', async () => {
        const before = {
            transactions: await models.PosTransaction.count(),
            lines: await models.PosTransactionLine.count(),
            fiscalEvents: await models.PosFiscalEvent.count(),
            stockMovements: await models.StockMovement.count(),
            itemStock: Number((await models.Item.findByPk(item.item_id)).current_stock),
            locationStock: Number((await tenantSequelize.query(
                'SELECT quantity_on_hand FROM item_location_stocks WHERE item_id = :itemId AND location_id = :locationId',
                { replacements: { itemId: item.item_id, locationId: location.location_id }, type: QueryTypes.SELECT }
            ))[0].quantity_on_hand)
        };

        const result = await runInTenantContext(() => checkoutPosUseCase({
            userId: cashier.user_id,
            user: cashier,
            payload: buildCheckoutPayload({
                itemId: item.item_id,
                terminalId,
                shiftId: shift.pos_terminal_shift_id,
                locationId: location.location_id,
                documentContext: 'fiscal',
                idempotencyKey: `phase560-fiscal-${suffix}`
            })
        }));

        const afterItem = await models.Item.findByPk(item.item_id);
        const afterLocationStock = (await tenantSequelize.query(
            'SELECT quantity_on_hand FROM item_location_stocks WHERE item_id = :itemId AND location_id = :locationId',
            { replacements: { itemId: item.item_id, locationId: location.location_id }, type: QueryTypes.SELECT }
        ))[0];
        const after = {
            transactions: await models.PosTransaction.count(),
            lines: await models.PosTransactionLine.count(),
            fiscalEvents: await models.PosFiscalEvent.count(),
            stockMovements: await models.StockMovement.count(),
            itemStock: Number(afterItem.current_stock),
            locationStock: Number(afterLocationStock.quantity_on_hand)
        };

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
        expect(result.error.details).toEqual(expect.objectContaining({
            reason_code: 'FISCAL_SETUP_INCOMPLETE'
        }));
        expect(after).toEqual(before);

        await setSetting('pos_taxpayer_type', 'legacy_unknown');
        const unknownResult = await runInTenantContext(() => checkoutPosUseCase({
            userId: cashier.user_id,
            user: cashier,
            payload: buildCheckoutPayload({
                itemId: item.item_id,
                terminalId,
                shiftId: shift.pos_terminal_shift_id,
                locationId: location.location_id,
                documentContext: 'fiscal',
                idempotencyKey: `phase560-unknown-${suffix}`
            })
        }));

        const unknownAfterItem = await models.Item.findByPk(item.item_id);
        const unknownAfterLocationStock = (await tenantSequelize.query(
            'SELECT quantity_on_hand FROM item_location_stocks WHERE item_id = :itemId AND location_id = :locationId',
            { replacements: { itemId: item.item_id, locationId: location.location_id }, type: QueryTypes.SELECT }
        ))[0];
        const unknownAfter = {
            transactions: await models.PosTransaction.count(),
            lines: await models.PosTransactionLine.count(),
            fiscalEvents: await models.PosFiscalEvent.count(),
            stockMovements: await models.StockMovement.count(),
            itemStock: Number(unknownAfterItem.current_stock),
            locationStock: Number(unknownAfterLocationStock.quantity_on_hand)
        };

        expect(unknownResult.success).toBe(false);
        expect(unknownResult.error.details).toEqual(expect.objectContaining({
            reason_code: 'FISCAL_SETUP_INCOMPLETE'
        }));
        expect(unknownAfter).toEqual(before);
    });

    it('keeps non-fiscal checkout available and explicitly records the non-fiscal contract', async () => {
        await setSetting('pos_taxpayer_type', '');
        const before = {
            transactions: await models.PosTransaction.count(),
            lines: await models.PosTransactionLine.count(),
            fiscalEvents: await models.PosFiscalEvent.count(),
            stockMovements: await models.StockMovement.count(),
            itemStock: Number((await models.Item.findByPk(item.item_id)).current_stock),
            locationStock: Number((await tenantSequelize.query(
                'SELECT quantity_on_hand FROM item_location_stocks WHERE item_id = :itemId AND location_id = :locationId',
                { replacements: { itemId: item.item_id, locationId: location.location_id }, type: QueryTypes.SELECT }
            ))[0].quantity_on_hand)
        };

        const result = await runInTenantContext(() => checkoutPosUseCase({
            userId: cashier.user_id,
            user: cashier,
            payload: buildCheckoutPayload({
                itemId: item.item_id,
                terminalId,
                shiftId: shift.pos_terminal_shift_id,
                locationId: location.location_id,
                documentContext: 'non_fiscal',
                idempotencyKey: `phase560-non-fiscal-${suffix}`
            })
        }));

        const transaction = result.data?.transaction;
        const afterItem = await models.Item.findByPk(item.item_id);
        const afterLocationStock = (await tenantSequelize.query(
            'SELECT quantity_on_hand FROM item_location_stocks WHERE item_id = :itemId AND location_id = :locationId',
            { replacements: { itemId: item.item_id, locationId: location.location_id }, type: QueryTypes.SELECT }
        ))[0];
        const after = {
            transactions: await models.PosTransaction.count(),
            lines: await models.PosTransactionLine.count(),
            fiscalEvents: await models.PosFiscalEvent.count(),
            stockMovements: await models.StockMovement.count(),
            itemStock: Number(afterItem.current_stock),
            locationStock: Number(afterLocationStock.quantity_on_hand)
        };

        if (!result.success) {
            throw new Error(`Non-fiscal fixture checkout failed: ${result.error?.message || 'unknown error'} ${JSON.stringify(result.error?.details || {})}`);
        }
        expect(result.success).toBe(true);
        expect(transaction).toEqual(expect.objectContaining({
            document_type: 'non_fiscal_slip',
            document_context: 'non_fiscal'
        }));
        expect(after.transactions).toBe(before.transactions + 1);
        expect(after.lines).toBe(before.lines + 1);
        expect(after.fiscalEvents).toBe(before.fiscalEvents);
        expect(after.stockMovements).toBeGreaterThan(before.stockMovements);
        expect(after.itemStock).toBe(before.itemStock - 1);
        expect(after.locationStock).toBe(before.locationStock - 1);
    });

    it('projects blank, legacy, and unknown taxpayer values consistently through the local API settings use case', async () => {
        const readReadiness = async (value) => {
            await setSetting('pos_taxpayer_type', value);
            const result = await runInTenantContext(() => getAllSettingsUseCase());
            return result.data.pos_fiscal_setup_readiness.value;
        };

        await expect(readReadiness('')).resolves.toEqual({
            status: 'not_configured',
            taxpayer_type: null,
            reason_code: 'POS_TAXPAYER_TYPE_NOT_CONFIGURED'
        });
        await expect(readReadiness('VAT_REGISTERED')).resolves.toEqual({
            status: 'configured',
            taxpayer_type: 'vat_registered',
            reason_code: null
        });
        await expect(readReadiness('legacy_unknown')).resolves.toEqual({
            status: 'needs_review',
            taxpayer_type: null,
            reason_code: 'POS_TAXPAYER_TYPE_UNRECOGNIZED'
        });
    });
});

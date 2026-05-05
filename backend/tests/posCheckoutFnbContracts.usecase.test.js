import { jest } from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';

const mockGetAllSettingsUseCase = jest.fn(async () => ({
    success: true,
    data: {
        fnb_restaurant_service_charge: {
            value: JSON.stringify({
                enabled: true,
                label: 'Restaurant service charge',
                rate: 10,
                taxable: true
            })
        }
    }
}));

const mockAssertComplianceOperationAllowed = jest.fn(async () => ({
    success: true,
    data: {
        decision: { allowed: true },
        receipt_contract: {
            document_type: 'non_fiscal_slip',
            label: 'NON-FISCAL SLIP',
            document_context: 'non_fiscal'
        }
    }
}));

const mockResolveMovementLocation = jest.fn(async ({ requestedLocationId }) => ({
    location_id: requestedLocationId || 3,
    name: 'Main'
}));

jest.unstable_mockModule('../src/modules/settings/index.js', () => ({
    getAllSettingsUseCase: mockGetAllSettingsUseCase
}));

jest.unstable_mockModule('../src/modules/compliance/index.js', () => ({
    assertComplianceOperationAllowed: mockAssertComplianceOperationAllowed,
    COMPLIANCE_OPERATION: {
        POS_CHECKOUT: 'pos.checkout',
        POS_TERMINAL_OPERATION: 'pos.terminal.operation'
    }
}));

jest.unstable_mockModule('../src/services/locationInventoryService.js', () => ({
    resolveMovementLocation: mockResolveMovementLocation
}));

let buildCheckoutPosUseCase;

beforeAll(async () => {
    ({ buildCheckoutPosUseCase } = await import('../src/modules/pos/usecases/posUseCases.js'));
});

const createTransaction = () => {
    const transaction = {
        finished: false,
        LOCK: { UPDATE: 'UPDATE' },
        commit: jest.fn(async () => {
            transaction.finished = true;
        }),
        rollback: jest.fn(async () => {
            transaction.finished = true;
        })
    };
    return transaction;
};

const runInTenantContext = async (callback) => {
    const transaction = createTransaction();
    const sequelize = {
        transaction: jest.fn().mockResolvedValue(transaction)
    };
    return dbStore.run({
        tenantId: 'tenant-fnb-checkout-contract',
        tenantComplianceModeState: 'non_compliant_active',
        tenantComplianceModeChoiceRequired: false,
        tenantComplianceProfile: {},
        sequelize
    }, async () => callback({ sequelize, transaction }));
};

describe('POS checkout F&B contracts', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('validates modifiers from configured groups, taxes taxable restaurant service charge, and deducts recipe ingredients', async () => {
        let createdTransaction = null;
        const posRepository = {
            getTerminalIdentityPolicySettings: jest.fn().mockResolvedValue({ mode: 'warn', active_registry: [] }),
            findTransactionByIdempotencyKey: jest.fn().mockResolvedValue(null),
            findSellableItemsByIds: jest.fn().mockResolvedValue([{
                item_id: 1,
                name: 'Burger',
                category: 'product',
                unit_of_measure: 'pc',
                current_stock: 0,
                cost_per_unit: 50,
                default_sale_price: 100,
                vat_type: 'vatable',
                fnbModifierGroups: [{
                    modifier_group_id: 7,
                    name: 'Cheese',
                    display_name: 'Cheese',
                    min_select: 1,
                    max_select: 1,
                    required: true,
                    FnbItemModifierGroup: { is_required_override: null },
                    options: [{
                        modifier_option_id: 9,
                        name: 'Cheddar',
                        price_delta: 20,
                        is_active: true,
                        allergen_notes: ['milk']
                    }]
                }]
            }]),
            listProductCompositionsForItems: jest.fn().mockResolvedValue([{
                product_id: 1,
                ingredient_id: 5,
                quantity_required: 0.2,
                ingredient: {
                    item_id: 5,
                    name: 'Ground beef',
                    current_stock: 10,
                    category: 'raw_material'
                }
            }]),
            getTerminalShiftById: jest.fn(),
            nextInvoiceNumber: jest.fn().mockResolvedValue('NFS-000001'),
            getFnbTableById: jest.fn(),
            createTransactionWithLines: jest.fn(async ({ header, lines }) => {
                createdTransaction = {
                    pos_transaction_id: 77,
                    ...header,
                    lines
                };
                return 77;
            }),
            createFnbServiceChargeSnapshot: jest.fn().mockResolvedValue({}),
            settleFnbCheck: jest.fn(),
            incrementPersistentCounter: jest.fn().mockResolvedValue(1),
            getTransactionById: jest.fn(async () => createdTransaction)
        };
        const stockMovementService = {
            createStockMovement: jest.fn().mockResolvedValue({ movement_id: 1 })
        };
        const useCase = buildCheckoutPosUseCase({ posRepository, stockMovementService });

        const result = await runInTenantContext(() => useCase({
            userId: 12,
            user: { user_id: 12, permissions: [] },
            payload: {
                idempotency_key: 'fnb-checkout-contract-1',
                location_id: 3,
                document_context: 'non_fiscal',
                payment_type: 'cash',
                order_method: 'dine_in',
                fnb_guest_count: 2,
                lines: [{
                    item_id: 1,
                    quantity: 2,
                    course: 'main',
                    line_modifiers: [{
                        modifier_group_id: 7,
                        modifier_option_id: 9
                    }]
                }]
            }
        }));

        expect(result.success).toBe(true);
        expect(createdTransaction.subtotal_amount).toBe(240);
        expect(createdTransaction.service_fee_amount).toBe(2.4);
        expect(createdTransaction.restaurant_service_charge_amount).toBe(24);
        expect(createdTransaction.restaurant_service_charge_taxable).toBe(true);
        expect(createdTransaction.total_amount).toBe(266.4);
        expect(createdTransaction.vatable_sales).toBe(235.7143);
        expect(createdTransaction.vat_amount).toBe(28.2857);
        expect(createdTransaction.lines[0]).toEqual(expect.objectContaining({
            sale_price: 120,
            line_subtotal: 240,
            fnb_modifiers_snapshot: [{
                modifier_group_id: 7,
                modifier_option_id: 9,
                group_name: 'Cheese',
                option_name: 'Cheddar',
                price_delta: 20,
                allergen_notes: ['milk']
            }]
        }));
        expect(stockMovementService.createStockMovement).toHaveBeenCalledTimes(1);
        expect(stockMovementService.createStockMovement).toHaveBeenCalledWith(expect.objectContaining({
            item_id: 5,
            quantity: 0.4,
            movement_type: 'goods_issue',
            reference_type: 'POS',
            reference_id: '77'
        }), 12, expect.any(Object));
    });
});

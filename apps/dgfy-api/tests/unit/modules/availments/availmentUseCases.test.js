import { jest } from '@jest/globals';
import {
    buildCreateAvailmentUseCase,
    buildAddLineUseCase,
    buildUpdateLineUseCase,
    buildRemoveLineUseCase,
    buildRestoreLineUseCase,
    buildApplyDiscountUseCase
} from '../../../../src/modules/availments/usecases/availmentUseCases.js';

const makeAvailment = (overrides = {}) => ({
    id: 'avl-1',
    business_id: 'biz-1',
    status: 'draft',
    customer_account_id: null,
    cashier_account_id: null,
    cashier_dgfy_account_id: 'acct-1',
    terminal_id: null,
    shift_id: null,
    sc_pwd_id_number: null,
    sc_pwd_customer_name: null,
    total_amount: 0,
    subtotal_amount: 0,
    discount_amount: 0,
    tax_amount: 0,
    finalized_at: null,
    created_at: new Date(),
    ...overrides
});

const makeAvailmentLine = (overrides = {}) => ({
    id: 1,
    availment_id: 'avl-1',
    product_id: 101,
    product_name: 'Coffee',
    quantity: '1.0',
    unit_price: '150.00',
    line_total: '150.00',
    stock_effect_type: 'inventory_issue',
    tax_treatment: 'vatable',
    tax_rate: '0.12',
    cancelled_at: null,
    created_at: new Date(),
    ...overrides
});

const makeProduct = (overrides = {}) => ({
    id: 101,
    business_id: 'biz-1',
    name: 'Coffee',
    category: 'beverage',
    inventory_mode: 'basic_inventory',
    base_price: '150.00',
    is_active: true,
    ...overrides
});

const makeMembership = (overrides = {}) => ({
    id: 1,
    account_id: 'acct-1',
    business_id: 'biz-1',
    role: 'owner',
    status: 'active',
    ...overrides
});

const makeBusiness = (overrides = {}) => ({
    id: 'biz-1',
    display_name: 'Test Business',
    status: 'active',
    ...overrides
});

const baseRepository = (overrides = {}) => ({
    createAvailment: jest.fn().mockResolvedValue(makeAvailment()),
    findById: jest.fn().mockResolvedValue(makeAvailment()),
    addLine: jest.fn().mockResolvedValue(makeAvailmentLine()),
    updateLine: jest.fn().mockResolvedValue(makeAvailmentLine({ quantity: '2.0' })),
    cancelLine: jest.fn().mockResolvedValue(makeAvailmentLine({ cancelled_at: new Date() })),
    restoreLine: jest.fn().mockResolvedValue(makeAvailmentLine({ cancelled_at: null })),
    recordDiscount: jest.fn().mockResolvedValue({
        id: 1,
        availment_id: 'avl-1',
        discount_type: 'manual',
        code: null,
        amount: '50.00',
        percent: null,
        applied_by_staff_account_id: 'acct-1',
        reason: 'Loyalty',
        sc_pwd_id_number: null,
        sc_pwd_customer_name: null
    }),
    ...overrides
});

const baseBusinessRepository = (overrides = {}) => ({
    findById: jest.fn().mockResolvedValue(makeBusiness()),
    getMembership: jest.fn().mockResolvedValue(makeMembership()),
    ...overrides
});

const baseProductRepository = (overrides = {}) => ({
    findById: jest.fn().mockResolvedValue(makeProduct()),
    ...overrides
});

describe('buildCreateAvailmentUseCase', () => {
    it('creates a draft availment for an active member', async () => {
        const repository = baseRepository();
        const businessRepository = baseBusinessRepository();
        const useCase = buildCreateAvailmentUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            branchId: 1
        });

        expect(result.isSuccess).toBe(true);
        expect(repository.createAvailment).toHaveBeenCalledWith('biz-1', expect.objectContaining({
            branchId: 1,
            cashierDgfyAccountId: 'acct-1'
        }));
    });

    it('rejects non-active members (403)', async () => {
        const repository = baseRepository();
        const businessRepository = baseBusinessRepository({
            getMembership: jest.fn().mockResolvedValue(makeMembership({ status: 'inactive' }))
        });
        const useCase = buildCreateAvailmentUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1'
        });

        expect(result.isSuccess).toBe(false);
        expect(result.statusCode).toBe(403);
    });

    it('rejects missing businessId (400)', async () => {
        const repository = baseRepository();
        const businessRepository = baseBusinessRepository();
        const useCase = buildCreateAvailmentUseCase({ repository, businessRepository });

        const result = await useCase({ requestingAccountId: 'acct-1' });

        expect(result.isSuccess).toBe(false);
        expect(result.statusCode).toBe(400);
    });
});

describe('buildAddLineUseCase', () => {
    it('adds a line with product snapshot and default stock_effect_type', async () => {
        const repository = baseRepository();
        const businessRepository = baseBusinessRepository();
        const productRepository = baseProductRepository();
        const useCase = buildAddLineUseCase({ repository, businessRepository, productRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            availmentId: 'avl-1',
            productId: 101,
            quantity: 2
        });

        expect(result.isSuccess).toBe(true);
        expect(repository.addLine).toHaveBeenCalledWith('biz-1', 'avl-1', expect.objectContaining({
            productId: 101,
            productName: 'Coffee',
            quantity: 2,
            unitPrice: '150.00',
            stockEffectType: 'inventory_issue' // Derived from basic_inventory
        }));
    });

    it('derives stock_exempt for non-stock products', async () => {
        const repository = baseRepository();
        const businessRepository = baseBusinessRepository();
        const productRepository = baseProductRepository({
            findById: jest.fn().mockResolvedValue(makeProduct({ inventory_mode: 'non_stock' }))
        });
        const useCase = buildAddLineUseCase({ repository, businessRepository, productRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            availmentId: 'avl-1',
            productId: 102,
            quantity: 1
        });

        expect(result.isSuccess).toBe(true);
        expect(repository.addLine).toHaveBeenCalledWith('biz-1', 'avl-1', expect.objectContaining({
            stockEffectType: 'stock_exempt' // Derived from non_stock
        }));
    });

    it('allows staff to override stock_effect_type', async () => {
        const repository = baseRepository();
        const businessRepository = baseBusinessRepository();
        const productRepository = baseProductRepository();
        const useCase = buildAddLineUseCase({ repository, businessRepository, productRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            availmentId: 'avl-1',
            productId: 101,
            quantity: 1,
            stockEffectType: 'stock_exempt' // Override the default
        });

        expect(result.isSuccess).toBe(true);
        expect(repository.addLine).toHaveBeenCalledWith('biz-1', 'avl-1', expect.objectContaining({
            stockEffectType: 'stock_exempt'
        }));
    });

    it('rejects missing product (404)', async () => {
        const repository = baseRepository();
        const businessRepository = baseBusinessRepository();
        const productRepository = baseProductRepository({
            findById: jest.fn().mockResolvedValue(null)
        });
        const useCase = buildAddLineUseCase({ repository, businessRepository, productRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            availmentId: 'avl-1',
            productId: 999,
            quantity: 1
        });

        expect(result.isSuccess).toBe(false);
        expect(result.statusCode).toBe(404);
    });

    it('rejects finalized availment (409)', async () => {
        const repository = baseRepository({
            addLine: jest.fn().mockRejectedValue(new Error('AvailmentFinalizedError'))
        });
        // Manually set the error name for duck typing
        repository.addLine.mockRejectedValue(
            Object.assign(new Error('Availment is finalized'), { name: 'AvailmentFinalizedError' })
        );
        const businessRepository = baseBusinessRepository();
        const productRepository = baseProductRepository();
        const useCase = buildAddLineUseCase({ repository, businessRepository, productRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            availmentId: 'avl-1',
            productId: 101,
            quantity: 1
        });

        expect(result.isSuccess).toBe(false);
        expect(result.statusCode).toBe(409);
    });

    it('rejects invalid quantity (400)', async () => {
        const repository = baseRepository();
        const businessRepository = baseBusinessRepository();
        const productRepository = baseProductRepository();
        const useCase = buildAddLineUseCase({ repository, businessRepository, productRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            availmentId: 'avl-1',
            productId: 101,
            quantity: 0
        });

        expect(result.isSuccess).toBe(false);
        expect(result.statusCode).toBe(400);
    });
});

describe('buildUpdateLineUseCase', () => {
    it('updates line quantity and/or stock_effect_type', async () => {
        const repository = baseRepository();
        const businessRepository = baseBusinessRepository();
        const useCase = buildUpdateLineUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            availmentId: 'avl-1',
            lineId: 1,
            quantity: 3,
            stockEffectType: 'stock_exempt'
        });

        expect(result.isSuccess).toBe(true);
        expect(repository.updateLine).toHaveBeenCalledWith('biz-1', 'avl-1', 1, {
            quantity: 3,
            stockEffectType: 'stock_exempt'
        });
    });

    it('rejects when neither quantity nor stockEffectType is provided (400)', async () => {
        const repository = baseRepository();
        const businessRepository = baseBusinessRepository();
        const useCase = buildUpdateLineUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            availmentId: 'avl-1',
            lineId: 1
        });

        expect(result.isSuccess).toBe(false);
        expect(result.statusCode).toBe(400);
    });

    it('rejects invalid quantity (400)', async () => {
        const repository = baseRepository();
        const businessRepository = baseBusinessRepository();
        const useCase = buildUpdateLineUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            availmentId: 'avl-1',
            lineId: 1,
            quantity: -5
        });

        expect(result.isSuccess).toBe(false);
        expect(result.statusCode).toBe(400);
    });
});

describe('buildRemoveLineUseCase', () => {
    it('soft-deletes a line by calling repository.cancelLine', async () => {
        const repository = baseRepository();
        const businessRepository = baseBusinessRepository();
        const useCase = buildRemoveLineUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            availmentId: 'avl-1',
            lineId: 1
        });

        expect(result.isSuccess).toBe(true);
        expect(repository.cancelLine).toHaveBeenCalledWith('biz-1', 'avl-1', 1);
    });

    it('rejects finalized availment (409)', async () => {
        const repository = baseRepository({
            cancelLine: jest.fn().mockRejectedValue(
                Object.assign(new Error('Availment is finalized'), { name: 'AvailmentFinalizedError' })
            )
        });
        const businessRepository = baseBusinessRepository();
        const useCase = buildRemoveLineUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            availmentId: 'avl-1',
            lineId: 1
        });

        expect(result.isSuccess).toBe(false);
        expect(result.statusCode).toBe(409);
    });

    it('rejects missing line (404)', async () => {
        const repository = baseRepository({
            cancelLine: jest.fn().mockRejectedValue(
                Object.assign(new Error('Line not found'), { name: 'AvailmentLineNotFoundError' })
            )
        });
        const businessRepository = baseBusinessRepository();
        const useCase = buildRemoveLineUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            availmentId: 'avl-1',
            lineId: 999
        });

        expect(result.isSuccess).toBe(false);
        expect(result.statusCode).toBe(404);
    });
});

describe('buildRestoreLineUseCase', () => {
    it('restores a soft-deleted line by calling repository.restoreLine', async () => {
        const repository = baseRepository();
        const businessRepository = baseBusinessRepository();
        const useCase = buildRestoreLineUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            availmentId: 'avl-1',
            lineId: 1
        });

        expect(result.isSuccess).toBe(true);
        expect(repository.restoreLine).toHaveBeenCalledWith('biz-1', 'avl-1', 1);
    });

    it('rejects finalized availment (409)', async () => {
        const repository = baseRepository({
            restoreLine: jest.fn().mockRejectedValue(
                Object.assign(new Error('Availment is finalized'), { name: 'AvailmentFinalizedError' })
            )
        });
        const businessRepository = baseBusinessRepository();
        const useCase = buildRestoreLineUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            availmentId: 'avl-1',
            lineId: 1
        });

        expect(result.isSuccess).toBe(false);
        expect(result.statusCode).toBe(409);
    });
});

describe('buildApplyDiscountUseCase', () => {
    it('applies a promo code discount without permission check', async () => {
        const repository = baseRepository();
        const businessRepository = baseBusinessRepository({
            getMembership: jest.fn().mockResolvedValue(makeMembership({ role: 'member' }))
        });
        const useCase = buildApplyDiscountUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            availmentId: 'avl-1',
            discountType: 'promo_code',
            code: 'PROMO10'
        });

        expect(result.isSuccess).toBe(true);
        expect(repository.recordDiscount).toHaveBeenCalledWith('biz-1', 'avl-1', expect.objectContaining({
            discountType: 'promo_code',
            code: 'PROMO10'
        }));
    });

    it('applies a manual discount with staff id and reason (CHK-03)', async () => {
        const repository = baseRepository();
        const businessRepository = baseBusinessRepository();
        const useCase = buildApplyDiscountUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            availmentId: 'avl-1',
            discountType: 'manual',
            amount: '50.00',
            reason: 'Loyalty discount'
        });

        expect(result.isSuccess).toBe(true);
        expect(repository.recordDiscount).toHaveBeenCalledWith('biz-1', 'avl-1', expect.objectContaining({
            discountType: 'manual',
            amount: '50.00',
            appliedByStaffAccountId: 'acct-1',
            reason: 'Loyalty discount'
        }));
    });

    it('rejects manual discount without reason (400)', async () => {
        const repository = baseRepository();
        const businessRepository = baseBusinessRepository();
        const useCase = buildApplyDiscountUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            availmentId: 'avl-1',
            discountType: 'manual',
            amount: '50.00'
            // reason is missing
        });

        expect(result.isSuccess).toBe(false);
        expect(result.statusCode).toBe(400);
    });

    it('rejects manual discount from unauthorized member (403)', async () => {
        const repository = baseRepository();
        const businessRepository = baseBusinessRepository({
            getMembership: jest.fn().mockResolvedValue(makeMembership({ role: 'member' }))
        });
        const useCase = buildApplyDiscountUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            availmentId: 'avl-1',
            discountType: 'manual',
            amount: '50.00',
            reason: 'Loyalty discount'
        });

        expect(result.isSuccess).toBe(false);
        expect(result.statusCode).toBe(403);
    });

    it('applies SC/PWD discount with ID number', async () => {
        const repository = baseRepository();
        const businessRepository = baseBusinessRepository();
        const useCase = buildApplyDiscountUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            availmentId: 'avl-1',
            discountType: 'sc_pwd',
            percent: 0.20,
            scPwdIdNumber: '12345678',
            scPwdCustomerName: 'Juan Dela Cruz'
        });

        expect(result.isSuccess).toBe(true);
        expect(repository.recordDiscount).toHaveBeenCalledWith('biz-1', 'avl-1', expect.objectContaining({
            discountType: 'sc_pwd',
            scPwdIdNumber: '12345678',
            scPwdCustomerName: 'Juan Dela Cruz'
        }));
    });

    it('rejects missing discountType (400)', async () => {
        const repository = baseRepository();
        const businessRepository = baseBusinessRepository();
        const useCase = buildApplyDiscountUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            availmentId: 'avl-1'
            // discountType is missing
        });

        expect(result.isSuccess).toBe(false);
        expect(result.statusCode).toBe(400);
    });

    it('rejects finalized availment (409)', async () => {
        const repository = baseRepository({
            recordDiscount: jest.fn().mockRejectedValue(
                Object.assign(new Error('Availment is finalized'), { name: 'AvailmentFinalizedError' })
            )
        });
        const businessRepository = baseBusinessRepository();
        const useCase = buildApplyDiscountUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            availmentId: 'avl-1',
            discountType: 'promo_code',
            code: 'PROMO10'
        });

        expect(result.isSuccess).toBe(false);
        expect(result.statusCode).toBe(409);
    });
});

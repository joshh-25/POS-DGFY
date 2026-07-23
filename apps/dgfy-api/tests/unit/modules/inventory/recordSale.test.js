import { jest } from '@jest/globals';
import { buildRecordSaleUseCase } from '../../../../src/modules/inventory/usecases/inventoryMovementUseCases.js';

describe('recordSale usecase', () => {
    let mockRepository;
    let mockBusinessRepository;
    let recordSaleUseCase;

    beforeEach(() => {
        mockRepository = {
            recordMovementWithStockSync: jest.fn()
        };

        mockBusinessRepository = {
            getMembership: jest.fn(),
            findById: jest.fn()
        };

        recordSaleUseCase = buildRecordSaleUseCase({
            repository: mockRepository,
            businessRepository: mockBusinessRepository
        });
    });

    it('should record a sale with negative signed quantity', async () => {
        mockBusinessRepository.findById.mockResolvedValue({ id: 'biz-1' });
        mockBusinessRepository.getMembership.mockResolvedValue({ status: 'active' });

        mockRepository.recordMovementWithStockSync.mockResolvedValue({
            movement: {
                id: 1,
                movement_type: 'sale',
                quantity: -10,
                product_id: 100
            },
            product: {
                id: 100,
                inventory_mode: 'basic_inventory',
                stock_count: 90
            }
        });

        const result = await recordSaleUseCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            productId: 100,
            quantity: 10,
            referenceType: 'availment',
            referenceId: 'avail-1'
        });

        expect(result.isSuccess).toBe(true);
        expect(mockRepository.recordMovementWithStockSync).toHaveBeenCalledWith(
            'biz-1',
            expect.objectContaining({
                movementType: 'sale',
                quantity: -10,
                productId: 100,
                referenceType: 'availment',
                referenceId: 'avail-1'
            }),
            {}
        );
    });

    it('should forward an injected transaction to the repository', async () => {
        mockBusinessRepository.findById.mockResolvedValue({ id: 'biz-1' });
        mockBusinessRepository.getMembership.mockResolvedValue({ status: 'active' });

        mockRepository.recordMovementWithStockSync.mockResolvedValue({
            movement: { id: 1, movement_type: 'sale', quantity: -10, product_id: 100 },
            product: { id: 100, inventory_mode: 'basic_inventory', stock_count: 90 }
        });

        const mockTransaction = { id: 'txn-1' };

        const result = await recordSaleUseCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            productId: 100,
            quantity: 10,
            transaction: mockTransaction
        });

        expect(result.isSuccess).toBe(true);
        expect(mockRepository.recordMovementWithStockSync).toHaveBeenCalledWith(
            'biz-1',
            expect.any(Object),
            { transaction: mockTransaction }
        );
    });

    it('should reject with 409 on insufficient stock', async () => {
        mockBusinessRepository.findById.mockResolvedValue({ id: 'biz-1' });
        mockBusinessRepository.getMembership.mockResolvedValue({ status: 'active' });

        const insufficientError = new Error('Insufficient stock');
        insufficientError.name = 'InsufficientStockError';
        mockRepository.recordMovementWithStockSync.mockRejectedValue(insufficientError);

        const result = await recordSaleUseCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            productId: 100,
            quantity: 10
        });

        expect(result.isSuccess).toBe(false);
        expect(result.statusCode).toBe(409);
    });

    it('should require a positive quantity', async () => {
        mockBusinessRepository.findById.mockResolvedValue({ id: 'biz-1' });
        mockBusinessRepository.getMembership.mockResolvedValue({ status: 'active' });

        const result = await recordSaleUseCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            productId: 100,
            quantity: -5
        });

        expect(result.isSuccess).toBe(false);
        expect(result.statusCode).toBe(400);
    });

    it('should reject without businessId', async () => {
        const result = await recordSaleUseCase({
            requestingAccountId: 'acct-1',
            productId: 100,
            quantity: 10
        });

        expect(result.isSuccess).toBe(false);
        expect(result.statusCode).toBe(400);
    });
});

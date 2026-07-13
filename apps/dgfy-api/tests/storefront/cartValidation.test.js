import { jest } from '@jest/globals';
import { buildValidateCartUseCase } from '../../src/modules/storefront/usecases/cartValidation.js';

// 10-03-PLAN.md Task 2 (TDD): validateCart({businessId, lines}) is the
// SINGLE server-side cart validator both cash and PayMongo checkout paths
// (10-06) reuse. Every amount is recomputed server-side in integer
// centavos from the catalog snapshot — a client-supplied total/price is
// NEVER trusted (T-10-03-01).

const makeProduct = (overrides = {}) => ({
    id: 1,
    name: 'Coffee',
    category: 'food',
    inventory_mode: 'non_stock',
    folder_id: null,
    base_price: '120.0000', // DECIMAL(14,4)-as-string, per Product model
    is_active: true,
    ...overrides
});

const makeProductRepository = (overrides = {}) => ({
    findById: jest.fn(async (businessId, id) => (id === 1 ? makeProduct() : null)),
    ...overrides
});

describe('buildValidateCartUseCase', () => {
    it('rejects an empty cart', async () => {
        const productRepository = makeProductRepository();
        const useCase = buildValidateCartUseCase({ productRepository });

        const result = await useCase({ businessId: 'biz-1', lines: [] });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('VALIDATION_FAILED');
        expect(productRepository.findById).not.toHaveBeenCalled();
    });

    it('rejects a missing businessId', async () => {
        const productRepository = makeProductRepository();
        const useCase = buildValidateCartUseCase({ productRepository });

        const result = await useCase({ lines: [{ productId: 1, quantity: 1 }] });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('VALIDATION_FAILED');
    });

    it('rejects a non-positive quantity', async () => {
        const productRepository = makeProductRepository();
        const useCase = buildValidateCartUseCase({ productRepository });

        const zero = await useCase({ businessId: 'biz-1', lines: [{ productId: 1, quantity: 0 }] });
        expect(zero.isSuccess).toBe(false);
        expect(zero.error.code).toBe('VALIDATION_FAILED');

        const negative = await useCase({ businessId: 'biz-1', lines: [{ productId: 1, quantity: -2 }] });
        expect(negative.isSuccess).toBe(false);
    });

    it('rejects an unknown productId', async () => {
        const productRepository = makeProductRepository();
        const useCase = buildValidateCartUseCase({ productRepository });

        const result = await useCase({ businessId: 'biz-1', lines: [{ productId: 999, quantity: 1 }] });

        expect(result.isSuccess).toBe(false);
        expect(result.statusCode).toBe(404);
    });

    it('rejects an inactive/unavailable product', async () => {
        const productRepository = makeProductRepository({
            findById: jest.fn(async () => makeProduct({ is_active: false }))
        });
        const useCase = buildValidateCartUseCase({ productRepository });

        const result = await useCase({ businessId: 'biz-1', lines: [{ productId: 1, quantity: 1 }] });

        expect(result.isSuccess).toBe(false);
        expect(result.statusCode).toBe(409);
    });

    it('snapshots name + unit price from the catalog and IGNORES any client-supplied price/total', async () => {
        const productRepository = makeProductRepository();
        const useCase = buildValidateCartUseCase({ productRepository });

        const result = await useCase({
            businessId: 'biz-1',
            lines: [
                // Client tries to tamper: claims a lower unit_price and a
                // pre-computed lower total. Neither should be trusted.
                { productId: 1, quantity: 2, unit_price: '0.01', clientTotalCentavos: 1 }
            ]
        });

        expect(result.isSuccess).toBe(true);
        expect(result.data.normalizedLines).toHaveLength(1);
        expect(result.data.normalizedLines[0]).toMatchObject({
            product_id: 1,
            name: 'Coffee',
            quantity: 2,
            unit_price_centavos: 12000,
            line_total_centavos: 24000
        });
        expect(result.data.totalCentavos).toBe(24000);
    });

    it('computes cart totals in integer centavos across multiple lines', async () => {
        const productRepository = makeProductRepository({
            findById: jest.fn(async (businessId, id) => {
                if (id === 1) return makeProduct({ id: 1, base_price: '99.9900' });
                if (id === 2) return makeProduct({ id: 2, name: 'Sandwich', base_price: '150.5000' });
                return null;
            })
        });
        const useCase = buildValidateCartUseCase({ productRepository });

        const result = await useCase({
            businessId: 'biz-1',
            lines: [
                { productId: 1, quantity: 3 },
                { productId: 2, quantity: 1 }
            ]
        });

        expect(result.isSuccess).toBe(true);
        // 99.99 -> 9999 centavos * 3 = 29997; 150.50 -> 15050 centavos * 1
        expect(result.data.totalCentavos).toBe(29997 + 15050);
    });

    it('propagates tenant database unavailability as a 503, not a silent pass', async () => {
        class TenantDatabaseUnavailableError extends Error {
            constructor(reason) {
                super(`unavailable: ${reason}`);
                this.name = 'TenantDatabaseUnavailableError';
                this.reason = reason;
            }
        }
        const productRepository = makeProductRepository({
            findById: jest.fn(async () => { throw new TenantDatabaseUnavailableError('unreachable'); })
        });
        const useCase = buildValidateCartUseCase({ productRepository });

        const result = await useCase({ businessId: 'biz-1', lines: [{ productId: 1, quantity: 1 }] });

        expect(result.isSuccess).toBe(false);
        expect(result.statusCode).toBe(503);
    });
});

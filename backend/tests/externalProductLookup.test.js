import { describe, expect, it, jest } from '@jest/globals';
import { buildOpenFoodFactsProductRegistry } from '../src/modules/inventory/integrations/openFoodFactsProductRegistry.js';
import { buildLookupExternalProductUseCase } from '../src/modules/inventory/usecases/lookupExternalProductUseCase.js';

describe('external product lookup', () => {
    it('normalizes provider results and caches successful lookups', async () => {
        const productRegistry = {
            name: 'test_registry',
            lookupByGtin: jest.fn().mockResolvedValue({
                found: true,
                provider: 'test_registry',
                product: { name: 'Test Product' }
            })
        };
        const cache = {
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue(undefined)
        };
        const lookup = buildLookupExternalProductUseCase({ productRegistry, cache });

        const result = await lookup({ code: '4006381333931' });

        expect(result).toEqual(expect.objectContaining({
            found: true,
            code: '4006381333931'
        }));
        expect(productRegistry.lookupByGtin).toHaveBeenCalledWith('4006381333931');
        expect(cache.set).toHaveBeenCalledWith(
            'external-product:test_registry:4006381333931',
            expect.any(String),
            86400
        );
    });

    it('rejects invalid GTINs before calling the provider', async () => {
        const productRegistry = {
            name: 'test_registry',
            lookupByGtin: jest.fn()
        };
        const lookup = buildLookupExternalProductUseCase({ productRegistry });

        await expect(lookup({ code: '4006381333932' })).rejects.toMatchObject({
            statusCode: 422
        });
        expect(productRegistry.lookupByGtin).not.toHaveBeenCalled();
    });

    it('maps provider timeouts to a safe service error', async () => {
        const timeoutError = new Error('timed out');
        timeoutError.name = 'AbortError';
        const lookup = buildLookupExternalProductUseCase({
            productRegistry: {
                name: 'test_registry',
                lookupByGtin: jest.fn().mockRejectedValue(timeoutError)
            }
        });

        await expect(lookup({ code: '4006381333931' })).rejects.toMatchObject({
            details: { reason_code: 'PRODUCT_REGISTRY_TIMEOUT' }
        });
    });

    it('maps Open Food Facts fields without importing product images', async () => {
        const fetchImpl = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
                status: 'success',
                product: {
                    code: '3017620422003',
                    product_name: 'Hazelnut Spread',
                    brands: 'Example Brand',
                    categories: 'Spreads, Breakfasts',
                    image_front_url: 'https://images.example.test/product.jpg',
                    quantity: '350 g'
                }
            })
        });
        const registry = buildOpenFoodFactsProductRegistry({
            fetchImpl,
            baseUrl: 'https://world.openfoodfacts.org',
            userAgent: 'DGFY-Test/1.0',
            timeoutMs: 100
        });

        const result = await registry.lookupByGtin('3017620422003');

        expect(result).toEqual(expect.objectContaining({
            found: true,
            provider: 'open_food_facts',
            product: expect.objectContaining({
                name: 'Hazelnut Spread',
                category_suggestion: 'Spreads',
                image_url: 'https://images.example.test/product.jpg'
            })
        }));
        expect(fetchImpl).toHaveBeenCalledWith(
            expect.stringContaining('/api/v3/product/3017620422003.json'),
            expect.objectContaining({
                headers: expect.objectContaining({ 'User-Agent': 'DGFY-Test/1.0' })
            })
        );
    });
});

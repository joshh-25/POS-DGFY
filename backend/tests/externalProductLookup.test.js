import { describe, expect, it, jest } from '@jest/globals';
import { buildOpenFoodFactsProductRegistry } from '../src/modules/inventory/integrations/openFoodFactsProductRegistry.js';
import { buildOpenPricesProductPriceRegistry } from '../src/modules/inventory/integrations/openPricesProductPriceRegistry.js';
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
            'external-product:v2:test_registry:4006381333931',
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
            statusCode: 422,
            message: 'Invalid GTIN check digit. Scan a real package barcode or enter item details manually.'
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

    it('maps the newest recent Philippine observed price as an advisory suggestion', async () => {
        const fetchImpl = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
                items: [
                    {
                        price: 80,
                        currency: 'PHP',
                        date: '2026-07-20',
                        location: { osm_address_country_code: 'US', osm_name: 'Wrong country' }
                    },
                    {
                        price: 75,
                        price_is_discounted: true,
                        price_without_discount: 90,
                        currency: 'PHP',
                        date: '2026-07-19',
                        location: {
                            osm_address_country_code: 'PH',
                            osm_display_name: 'Example Market, Iloilo City, Philippines'
                        }
                    }
                ]
            })
        });
        const registry = buildOpenPricesProductPriceRegistry({
            fetchImpl,
            baseUrl: 'https://prices.openfoodfacts.org',
            userAgent: 'DGFY-Test/1.0',
            timeoutMs: 100,
            maxAgeDays: 365,
            now: () => new Date('2026-07-27T00:00:00.000Z')
        });

        const result = await registry.lookupSuggestedPriceByGtin('4806506315008');

        expect(result).toEqual(expect.objectContaining({
            amount: 90,
            observed_amount: 75,
            currency: 'PHP',
            observed_at: '2026-07-19',
            discounted: true,
            provider: 'open_prices'
        }));
        expect(fetchImpl).toHaveBeenCalledWith(
            expect.stringContaining('product_code=4806506315008'),
            expect.any(Object)
        );
        expect(fetchImpl.mock.calls[0][0]).toContain('currency=PHP');
        expect(fetchImpl.mock.calls[0][0]).toContain('date__gte=2025-07-27');
    });

    it('keeps product lookup successful when optional price enrichment fails', async () => {
        const lookup = buildLookupExternalProductUseCase({
            productRegistry: {
                name: 'test_registry',
                lookupByGtin: jest.fn().mockResolvedValue({
                    found: true,
                    provider: 'test_registry',
                    product: { name: 'Test Product' }
                })
            },
            priceRegistry: {
                name: 'test_prices',
                lookupSuggestedPriceByGtin: jest.fn().mockRejectedValue(new Error('price provider unavailable'))
            }
        });

        await expect(lookup({ code: '4006381333931' })).resolves.toEqual(expect.objectContaining({
            found: true,
            code: '4006381333931',
            product: { name: 'Test Product' }
        }));
    });
});

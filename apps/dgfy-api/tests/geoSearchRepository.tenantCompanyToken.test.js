import { jest } from '@jest/globals';

// Regression test for #334: /storefront/geo-search is public and unauthenticated,
// so it must never surface `tenant_company_token` (the value resolved via the
// `x-company-token` header in tenantHandler.js) for any store in its results.

const sequelizeQueryMock = jest.fn();
const isRedisConnectedMock = jest.fn(() => false);
const getRedisClientMock = jest.fn();

jest.unstable_mockModule('../src/config/database.js', () => ({
    default: { query: sequelizeQueryMock }
}));

jest.unstable_mockModule('../src/config/redis.js', () => ({
    getRedisClient: getRedisClientMock,
    isRedisConnected: isRedisConnectedMock
}));

jest.unstable_mockModule('../src/config/logger.js', () => ({
    default: { warn: jest.fn(), info: jest.fn(), error: jest.fn() }
}));

jest.unstable_mockModule('../src/models/index.js', () => ({
    GeoItemAlias: { findOne: jest.fn(), create: jest.fn() }
}));

let geoSearchRepository;

const loadRepository = async () => {
    jest.resetModules();
    ({ geoSearchRepository } = await import('../src/modules/geoSearch/repositories/geoSearchRepository.js'));
    return geoSearchRepository;
};

describe('geoSearchRepository — tenant_company_token exposure', () => {
    beforeEach(() => {
        sequelizeQueryMock.mockReset();
        isRedisConnectedMock.mockReset().mockReturnValue(false);
    });

    it('does not surface tenant_company_token even if the underlying row carries it', async () => {
        const repository = await loadRepository();

        // Simulate the FULLTEXT item-id lookup, then the main geo query returning a
        // row that (deliberately, as a regression guard) still includes the leaked
        // column — proving the repository strips it rather than relying on the SQL
        // text never regressing.
        sequelizeQueryMock
            .mockResolvedValueOnce([{ id: 'item-1' }]) // findMatchingItemIds
            .mockResolvedValueOnce([
                {
                    tenant_id: 'tenant-1',
                    slug: 'carlos-store',
                    tenant_name: "Carlo's Store",
                    tenant_company_token: 'CARLO',
                    latitude: '10.3156',
                    longitude: '123.8854',
                    location_id: 3,
                    location_name: 'Downtown',
                    address_line: 'Cebu City',
                    storefront_open: 1,
                    workflow_mode: 'retail',
                    delivery_radius_km: '5',
                    estimated_wait_minutes: 30,
                    supports_delivery: 1,
                    supports_pickup: 1,
                    supports_dine_in: 0,
                    store_delivery_fee: '0',
                    catalog_count: 12,
                    storefront_profile_image_url: null,
                    storefront_cover_image_url: null,
                    storefront_review_summary: null,
                    active_location_snapshot: null,
                    distance_km: '1.2',
                    matched_item_count: 1,
                    in_stock_match_count: 1,
                    matched_item_names: 'Milk'
                }
            ]) // main runGeoQuery rows
            .mockResolvedValueOnce([{ total: 1 }]); // count query

        const result = await repository.searchNearbyStores({
            query: 'milk',
            latitude: 10.3,
            longitude: 123.9,
            radius: 5,
            stockFilter: 'all',
            page: 1,
            limit: 20
        });

        expect(result.stores).toHaveLength(1);
        result.stores.forEach((store) => {
            expect(store).not.toHaveProperty('tenant_company_token');
        });
    });
});

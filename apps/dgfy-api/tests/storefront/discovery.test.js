import { jest } from '@jest/globals';
import { StorefrontDiscoveryRepository } from '../../src/modules/storefront/repositories/storefrontDiscoveryRepository.js';
import { buildSearchDiscoveryUseCase } from '../../src/modules/storefront/usecases/searchDiscoveryUseCases.js';
import { buildGetStorePageUseCase } from '../../src/modules/storefront/usecases/getStorePageUseCases.js';

// 10-03-PLAN.md Task 1: StorefrontDiscoveryRepository over the LANDLORD
// dgfy_core `storefront_discovery_index` projection (10-01-PLAN.md). No
// live MySQL/Redis — `sequelize`/`getRedisClient` are constructor-injected
// (Dependency Inversion) so query-building and cache fallback behavior can
// be asserted against mocks (mirrors tests/unit/modules/shifts/
// shiftRepository.test.js's mocked-tenantConnector convention).

const makeSequelize = (queryImpl) => ({
    query: jest.fn(queryImpl || (async () => []))
});

const makeRedisClient = (overrides = {}) => ({
    get: jest.fn(async () => null),
    setEx: jest.fn(async () => 'OK'),
    ...overrides
});

describe('StorefrontDiscoveryRepository', () => {
    it('throws when constructed without a sequelize instance', () => {
        expect(() => new StorefrontDiscoveryRepository({})).toThrow(/requires a sequelize instance/);
    });

    describe('searchNearby', () => {
        it('runs a parameterized geo query with is_visible=1 and distance filter, ordered by distance', async () => {
            const rows = [
                { handle: 'near-store', display_name: 'Near Store', business_id: 'biz-1', is_visible: 1, latitude: 14.6, longitude: 121.0, distance_km: 0.5 }
            ];
            const sequelize = makeSequelize(async () => rows);
            const repository = new StorefrontDiscoveryRepository({ sequelize, cacheEnabled: false });

            const result = await repository.searchNearby({ lat: 14.6, lng: 121.0, radiusKm: 5, limit: 20, offset: 0 });

            expect(result).toEqual(rows);
            expect(sequelize.query).toHaveBeenCalledTimes(1);
            const [sql, options] = sequelize.query.mock.calls[0];
            expect(sql).toMatch(/is_visible = 1/);
            expect(sql).toMatch(/ST_Distance_Sphere/);
            expect(sql).toMatch(/ORDER BY distance_km ASC/);
            expect(options.replacements).toMatchObject({ lat: 14.6, lng: 121.0, radiusKm: 5, limit: 20, offset: 0 });
            // No string interpolation of user input (V5): query/category
            // absent means no MATCH()/JSON_EXTRACT clause and no stray
            // replacement keys for them.
            expect(options.replacements.q).toBeUndefined();
            expect(options.replacements.category).toBeUndefined();
        });

        it('adds a sanitized MATCH()...AGAINST(BOOLEAN MODE) clause when query text is present', async () => {
            const sequelize = makeSequelize(async () => []);
            const repository = new StorefrontDiscoveryRepository({ sequelize, cacheEnabled: false });

            await repository.searchNearby({ lat: 14.6, lng: 121.0, radiusKm: 5, query: '+evil"()<>~*@ coffee' });

            const [sql, options] = sequelize.query.mock.calls[0];
            expect(sql).toMatch(/MATCH\(search_text\) AGAINST\(:q IN BOOLEAN MODE\)/);
            // Boolean-mode operator characters are stripped before binding.
            expect(options.replacements.q).toBe('evil coffee');
        });

        it('adds category/openNow filters over the JSON snapshot columns only when provided', async () => {
            const sequelize = makeSequelize(async () => []);
            const repository = new StorefrontDiscoveryRepository({ sequelize, cacheEnabled: false });

            await repository.searchNearby({ lat: 14.6, lng: 121.0, radiusKm: 5, category: 'food', openNow: true });

            const [sql, options] = sequelize.query.mock.calls[0];
            expect(sql).toMatch(/JSON_EXTRACT\(search_snapshot, '\$\.category'\)/);
            expect(sql).toMatch(/JSON_EXTRACT\(location_snapshot, '\$\.open_now'\)/);
            expect(options.replacements.category).toBe('food');
        });

        it('reads from Redis cache on hit and skips the DB query', async () => {
            const cachedRows = [{ handle: 'cached-store' }];
            const redisClient = makeRedisClient({ get: jest.fn(async () => JSON.stringify(cachedRows)) });
            const sequelize = makeSequelize(async () => {
                throw new Error('DB should not be queried on cache hit');
            });
            const repository = new StorefrontDiscoveryRepository({
                sequelize,
                getRedisClient: () => redisClient,
                cacheEnabled: true
            });

            const result = await repository.searchNearby({ lat: 14.6, lng: 121.0, radiusKm: 5 });

            expect(result).toEqual(cachedRows);
            expect(sequelize.query).not.toHaveBeenCalled();
        });

        it('falls back to the DB query when Redis read throws (never fails the request)', async () => {
            const rows = [{ handle: 'db-store' }];
            const redisClient = makeRedisClient({ get: jest.fn(async () => { throw new Error('redis down'); }) });
            const sequelize = makeSequelize(async () => rows);
            const repository = new StorefrontDiscoveryRepository({
                sequelize,
                getRedisClient: () => redisClient,
                cacheEnabled: true
            });

            const result = await repository.searchNearby({ lat: 14.6, lng: 121.0, radiusKm: 5 });

            expect(result).toEqual(rows);
            expect(sequelize.query).toHaveBeenCalledTimes(1);
        });

        it('falls back to the DB query (and does not throw) when Redis write throws', async () => {
            const rows = [{ handle: 'db-store-2' }];
            const redisClient = makeRedisClient({ setEx: jest.fn(async () => { throw new Error('redis down'); }) });
            const sequelize = makeSequelize(async () => rows);
            const repository = new StorefrontDiscoveryRepository({
                sequelize,
                getRedisClient: () => redisClient,
                cacheEnabled: true
            });

            await expect(repository.searchNearby({ lat: 14.6, lng: 121.0, radiusKm: 5 })).resolves.toEqual(rows);
        });

        it('does not touch Redis at all when caching is disabled', async () => {
            const redisClient = makeRedisClient();
            const sequelize = makeSequelize(async () => []);
            const repository = new StorefrontDiscoveryRepository({
                sequelize,
                getRedisClient: () => redisClient,
                cacheEnabled: false
            });

            await repository.searchNearby({ lat: 14.6, lng: 121.0, radiusKm: 5 });

            expect(redisClient.get).not.toHaveBeenCalled();
            expect(redisClient.setEx).not.toHaveBeenCalled();
        });
    });

    describe('getStoreByHandle', () => {
        it('returns the visible discovery row for a known handle', async () => {
            const row = { id: 1, business_id: 'biz-1', handle: 'acme-store', display_name: 'Acme Store', is_visible: 1 };
            const sequelize = makeSequelize(async () => [row]);
            const repository = new StorefrontDiscoveryRepository({ sequelize, cacheEnabled: false });

            const result = await repository.getStoreByHandle('acme-store');

            expect(result).toEqual(row);
            const [sql, options] = sequelize.query.mock.calls[0];
            expect(sql).toMatch(/WHERE handle = :handle AND is_visible = 1/);
            expect(options.replacements).toEqual({ handle: 'acme-store' });
        });

        it('returns null for an unknown handle', async () => {
            const sequelize = makeSequelize(async () => []);
            const repository = new StorefrontDiscoveryRepository({ sequelize, cacheEnabled: false });

            const result = await repository.getStoreByHandle('does-not-exist');

            expect(result).toBeNull();
        });

        it('returns null without querying when handle is empty', async () => {
            const sequelize = makeSequelize(async () => []);
            const repository = new StorefrontDiscoveryRepository({ sequelize, cacheEnabled: false });

            const result = await repository.getStoreByHandle('');

            expect(result).toBeNull();
            expect(sequelize.query).not.toHaveBeenCalled();
        });
    });
});

// 10-03-PLAN.md Task 2 (TDD): buildSearchDiscoveryUseCase — validates
// lat/lng/radius/limit/offset, delegates to the repository, and returns
// ONLY opaque store references (handle/display_name/distance_km) — never
// the raw storefront_discovery_index.id or business_id (T-10-03-02, IDOR
// guard).
describe('buildSearchDiscoveryUseCase', () => {
    const makeRepository = (overrides = {}) => ({
        searchNearby: jest.fn(async () => [
            { id: 42, business_id: 'biz-secret', handle: 'acme-store', display_name: 'Acme Store', distance_km: 1.234 }
        ]),
        ...overrides
    });

    it('rejects a missing/out-of-range lat or lng', async () => {
        const repository = makeRepository();
        const useCase = buildSearchDiscoveryUseCase({ repository });

        const missingLat = await useCase({ lng: 121.0 });
        expect(missingLat.isSuccess).toBe(false);
        expect(missingLat.error.code).toBe('VALIDATION_FAILED');

        const outOfRangeLat = await useCase({ lat: 999, lng: 121.0 });
        expect(outOfRangeLat.isSuccess).toBe(false);

        expect(repository.searchNearby).not.toHaveBeenCalled();
    });

    it('clamps radius/limit to sane bounds and delegates to the repository', async () => {
        const repository = makeRepository();
        const useCase = buildSearchDiscoveryUseCase({ repository });

        const result = await useCase({ lat: 14.6, lng: 121.0, radiusKm: 99999, limit: 99999, offset: -5 });

        expect(result.isSuccess).toBe(true);
        const call = repository.searchNearby.mock.calls[0][0];
        expect(call.radiusKm).toBeLessThanOrEqual(50);
        expect(call.limit).toBeLessThanOrEqual(100);
        expect(call.offset).toBe(0);
    });

    it('returns opaque store references only — never a raw id or business_id', async () => {
        const repository = makeRepository();
        const useCase = buildSearchDiscoveryUseCase({ repository });

        const result = await useCase({ lat: 14.6, lng: 121.0 });

        expect(result.isSuccess).toBe(true);
        expect(result.data.stores).toEqual([
            { handle: 'acme-store', display_name: 'Acme Store', distance_km: 1.23 }
        ]);
        expect(JSON.stringify(result.data)).not.toMatch(/business_id|"id":42/);
    });
});

// 10-03-PLAN.md Task 2 (TDD): buildGetStorePageUseCase — 404s for an
// unknown/invisible handle, otherwise returns the store's discovery info
// plus its ACTIVE product listing pulled from the tenant catalog via the
// injected productRepository (resolved by the discovery row's business_id).
describe('buildGetStorePageUseCase', () => {
    const makeStoreRow = (overrides = {}) => ({
        id: 7,
        business_id: 'biz-1',
        handle: 'acme-store',
        display_name: 'Acme Store',
        is_visible: 1,
        latitude: 14.6,
        longitude: 121.0,
        ...overrides
    });

    const makeRepository = (overrides = {}) => ({
        getStoreByHandle: jest.fn(async () => makeStoreRow()),
        ...overrides
    });

    const makeProductRepository = (overrides = {}) => ({
        findAll: jest.fn(async () => [
            { id: 1, name: 'Coffee', category: 'food', base_price: '120.0000', folder_id: null, is_active: true },
            { id: 2, name: 'Discontinued Item', category: 'food', base_price: '50.0000', folder_id: null, is_active: false }
        ]),
        ...overrides
    });

    it('returns 404 for an unknown handle', async () => {
        const repository = makeRepository({ getStoreByHandle: jest.fn(async () => null) });
        const productRepository = makeProductRepository();
        const useCase = buildGetStorePageUseCase({ repository, productRepository });

        const result = await useCase({ handle: 'does-not-exist' });

        expect(result.isSuccess).toBe(false);
        expect(result.statusCode).toBe(404);
        expect(productRepository.findAll).not.toHaveBeenCalled();
    });

    it('returns the store info and only ACTIVE products for a known handle', async () => {
        const repository = makeRepository();
        const productRepository = makeProductRepository();
        const useCase = buildGetStorePageUseCase({ repository, productRepository });

        const result = await useCase({ handle: 'acme-store' });

        expect(result.isSuccess).toBe(true);
        expect(result.data.store.handle).toBe('acme-store');
        expect(result.data.products).toHaveLength(1);
        expect(result.data.products[0]).toMatchObject({ id: 1, name: 'Coffee' });
        expect(productRepository.findAll).toHaveBeenCalledWith('biz-1');
    });

    it('rejects a blank handle without querying the repository', async () => {
        const repository = makeRepository();
        const productRepository = makeProductRepository();
        const useCase = buildGetStorePageUseCase({ repository, productRepository });

        const result = await useCase({ handle: '  ' });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('VALIDATION_FAILED');
        expect(repository.getStoreByHandle).not.toHaveBeenCalled();
    });
});

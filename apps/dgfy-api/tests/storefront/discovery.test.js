import { jest } from '@jest/globals';
import { StorefrontDiscoveryRepository } from '../../src/modules/storefront/repositories/storefrontDiscoveryRepository.js';

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

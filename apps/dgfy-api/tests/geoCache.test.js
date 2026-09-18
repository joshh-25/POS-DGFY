import { jest } from '@jest/globals';

const mockRedisClient = { get: jest.fn(), setEx: jest.fn() };
const mockGetRedisClient = jest.fn(() => mockRedisClient);
const mockIsRedisConnected = jest.fn(() => true);
const mockLogger = { warn: jest.fn(), error: jest.fn(), info: jest.fn() };
const mockGeocodeConfig = { enabled: true, cacheTtlSeconds: 3600 };
const mockQuadruperGeocodeProvider = { getStatus: jest.fn() };

jest.unstable_mockModule('../src/config/redis.js', () => ({
    getRedisClient: mockGetRedisClient,
    isRedisConnected: mockIsRedisConnected
}));

jest.unstable_mockModule('../src/config/logger.js', () => ({
    default: mockLogger
}));

jest.unstable_mockModule('../src/config/geocodeConfig.js', () => ({
    geocodeConfig: mockGeocodeConfig
}));

jest.unstable_mockModule('../src/modules/geoSearch/providers/quadruperGeocodeProvider.js', () => ({
    quadruperGeocodeProvider: mockQuadruperGeocodeProvider
}));

const { readCache, writeCache, resolveImportDate, __testing: { resetImportDateCache } } =
    await import('../src/modules/geoSearch/providers/geocodeCache.js');

describe('readCache', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockRedisClient.get.mockReset();
        mockRedisClient.setEx.mockReset();
        mockGetRedisClient.mockReturnValue(mockRedisClient);
        mockIsRedisConnected.mockReturnValue(true);
        mockLogger.warn.mockClear();
    });

    it('returns null when Redis is not connected', async () => {
        mockIsRedisConnected.mockReturnValue(false);

        const result = await readCache('test-key');

        expect(result).toBeNull();
        expect(mockGetRedisClient).not.toHaveBeenCalled();
    });

    it('returns the parsed JSON value on cache hit', async () => {
        const value = { lat: 10.72, lng: 122.56 };
        mockRedisClient.get.mockResolvedValue(JSON.stringify(value));

        const result = await readCache('test-key');

        expect(result).toEqual(value);
    });

    it('returns null when the cache key does not exist', async () => {
        mockRedisClient.get.mockResolvedValue(null);

        const result = await readCache('missing-key');

        expect(result).toBeNull();
    });

    it('returns null and logs when Redis.get() rejects, never throws', async () => {
        const error = new Error('Connection refused');
        mockRedisClient.get.mockRejectedValue(error);

        const result = await readCache('test-key');

        expect(result).toBeNull();
        expect(mockLogger.warn).toHaveBeenCalledWith('[Geocode] Redis cache read failed', { err: 'Connection refused' });
    });
});

describe('writeCache', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockRedisClient.get.mockReset();
        mockRedisClient.setEx.mockReset();
        mockGetRedisClient.mockReturnValue(mockRedisClient);
        mockIsRedisConnected.mockReturnValue(true);
        mockLogger.warn.mockClear();
    });

    it('does nothing when Redis is not connected', async () => {
        mockIsRedisConnected.mockReturnValue(false);

        await writeCache('test-key', { lat: 10.72 });

        expect(mockGetRedisClient).not.toHaveBeenCalled();
    });

    it('resolves without throwing when Redis.setEx() rejects, and logs the error', async () => {
        const error = new Error('Redis timeout');
        mockRedisClient.setEx.mockRejectedValue(error);

        await expect(writeCache('test-key', { lat: 10.72 })).resolves.toBeUndefined();

        expect(mockLogger.warn).toHaveBeenCalledWith('[Geocode] Redis cache write failed', { err: 'Redis timeout' });
    });
});

describe('resolveImportDate', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockQuadruperGeocodeProvider.getStatus.mockReset();
        mockLogger.warn.mockClear();
        resetImportDateCache();
    });

    it('returns the import_date from provider on first call', async () => {
        mockQuadruperGeocodeProvider.getStatus.mockResolvedValue({ import_date: '2026-09-12T23:03:36Z' });

        const result = await resolveImportDate();

        expect(result).toBe('2026-09-12T23:03:36Z');
    });

    it('caches the result for 5 minutes', async () => {
        mockQuadruperGeocodeProvider.getStatus.mockResolvedValue({ import_date: '2026-09-12T23:03:36Z' });

        const first = await resolveImportDate();
        const second = await resolveImportDate();

        expect(first).toBe(second);
        expect(mockQuadruperGeocodeProvider.getStatus).toHaveBeenCalledTimes(1);
    });

    it('returns "unknown" when the provider returns a falsy import_date', async () => {
        mockQuadruperGeocodeProvider.getStatus.mockResolvedValue({ import_date: null });

        const result = await resolveImportDate();

        expect(result).toBe('unknown');
    });

    it('returns "unknown" when the provider returns no status object', async () => {
        mockQuadruperGeocodeProvider.getStatus.mockResolvedValue(null);

        const result = await resolveImportDate();

        expect(result).toBe('unknown');
    });

    it('resolves to "unknown" and logs when getStatus() rejects', async () => {
        const error = new Error('Provider connection failed');
        mockQuadruperGeocodeProvider.getStatus.mockRejectedValue(error);

        const result = await resolveImportDate();

        expect(result).toBe('unknown');
        expect(mockLogger.warn).toHaveBeenCalledWith('[Geocode] Failed to resolve import date', { err: 'Provider connection failed' });
    });

    it('falls back to "unknown" when a refresh fails with no prior cache', async () => {
        const error = new Error('Temporary failure');
        mockQuadruperGeocodeProvider.getStatus.mockRejectedValue(error);

        const result = await resolveImportDate();

        expect(result).toBe('unknown');
        expect(mockLogger.warn).toHaveBeenCalled();
    });
});

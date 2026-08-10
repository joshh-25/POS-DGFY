
import { jest } from '@jest/globals';

// Define mocks
const mockGetStore = jest.fn();
const mockRedisGet = jest.fn();
const mockRedisSetEx = jest.fn();

// Use unstable_mockModule for ESM
jest.unstable_mockModule('../src/utils/dbStore.js', () => ({
    default: {
        getStore: mockGetStore,
        get: jest.fn().mockReturnValue({ findAll: jest.fn().mockResolvedValue([]) })
    }
}));

jest.unstable_mockModule('../src/config/redis.js', () => ({
    getRedisClient: () => ({
        get: mockRedisGet,
        setEx: mockRedisSetEx
    }),
    isRedisConnected: () => true
}));

// Dynamic import AFTER mocking
const { buildDependencyGraph } = await import('../src/services/compositionValidationService.js');

describe('Nested Tenancy Isolation', () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should use tenant-specific redis key when tenant context is present', async () => {
        // Arrange
        mockGetStore.mockReturnValue({ tenantId: 'tenant_A' });
        mockRedisGet.mockResolvedValue(null);

        // Act
        await buildDependencyGraph();

        // Assert
        expect(mockRedisGet).toHaveBeenCalledWith(expect.stringContaining('tenant_A'));
        // Specifically:
        expect(mockRedisGet).toHaveBeenCalledWith('composition:dependency_graph:tenant_A');
    });

    test('should use different key for different tenant', async () => {
        // Arrange
        mockGetStore.mockReturnValue({ tenantId: 'tenant_B' });
        mockRedisGet.mockResolvedValue(null);

        // Act
        await buildDependencyGraph();

        // Assert
        expect(mockRedisGet).toHaveBeenCalledWith('composition:dependency_graph:tenant_B');
    });

    test('should fall back to global key if no tenant context', async () => {
        // Arrange
        mockGetStore.mockReturnValue(undefined);
        mockRedisGet.mockResolvedValue(null);

        // Act
        await buildDependencyGraph();

        // Assert
        expect(mockRedisGet).toHaveBeenCalledWith('composition:dependency_graph:global');
    });
});

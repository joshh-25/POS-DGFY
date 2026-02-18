import { jest } from '@jest/globals';

// Mock Redis to prevent connection errors during tests
// This preserves the production "Fail-Closed" logic while allowing tests to pass
jest.unstable_mockModule('../src/config/redis.js', () => ({
    initializeRedis: jest.fn().mockResolvedValue(true),
    getRedisClient: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue('OK'),
        del: jest.fn().mockResolvedValue(1),
        setEx: jest.fn().mockResolvedValue('OK'),
        keys: jest.fn().mockResolvedValue([]),
        mGet: jest.fn().mockImplementation((keys) => Promise.resolve(keys.map(() => null))),
        multi: jest.fn().mockReturnValue({
            set: jest.fn().mockReturnThis(),
            setEx: jest.fn().mockReturnThis(),
            exec: jest.fn().mockResolvedValue([]),
        }),
        quit: jest.fn().mockResolvedValue('OK'),
        disconnect: jest.fn().mockResolvedValue(true),
    }),
    isRedisConnected: jest.fn().mockReturnValue(true),
    closeRedis: jest.fn().mockResolvedValue(true),
    default: {
        initializeRedis: jest.fn().mockResolvedValue(true),
        getRedisClient: jest.fn().mockReturnThis(),
        isRedisConnected: jest.fn().mockReturnValue(true),
        closeRedis: jest.fn().mockResolvedValue(true),
    }
}));

// Set NODE_ENV to test explicitly if not already set
process.env.NODE_ENV = 'test';

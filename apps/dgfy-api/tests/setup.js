import { jest } from '@jest/globals';

const redisStore = new Map();

const purgeExpired = () => {
    const now = Date.now();
    for (const [key, entry] of redisStore.entries()) {
        if (entry.expiresAt && entry.expiresAt <= now) {
            redisStore.delete(key);
        }
    }
};

const getValue = (key) => {
    purgeExpired();
    const entry = redisStore.get(key);
    return entry ? entry.value : null;
};

const setValue = (key, value, ttlSeconds = null, options = {}) => {
    purgeExpired();

    if (options.NX && redisStore.has(key)) {
        return null;
    }

    const expiresAt = typeof ttlSeconds === 'number' && ttlSeconds > 0
        ? Date.now() + (ttlSeconds * 1000)
        : null;

    redisStore.set(key, { value, expiresAt });
    return 'OK';
};

const deleteKeys = (keys) => {
    purgeExpired();
    let deleted = 0;
    for (const key of keys) {
        if (redisStore.delete(key)) {
            deleted += 1;
        }
    }
    return deleted;
};

const toPatternRegex = (pattern) => {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${escaped.replace(/\*/g, '.*')}$`);
};

const mockRedisClient = {
    get: jest.fn(async (key) => getValue(key)),
    set: jest.fn(async (key, value, options = undefined) => {
        const opts = options && typeof options === 'object' ? options : {};
        const ttl = typeof opts.EX === 'number' ? opts.EX : null;
        return setValue(key, value, ttl, { NX: opts.NX === true });
    }),
    del: jest.fn(async (...args) => {
        const flatKeys = args.flatMap((arg) => (Array.isArray(arg) ? arg : [arg]));
        return deleteKeys(flatKeys);
    }),
    setEx: jest.fn(async (key, ttl, value) => setValue(key, value, ttl)),
    keys: jest.fn(async (pattern) => {
        purgeExpired();
        const regex = toPatternRegex(pattern);
        return [...redisStore.keys()].filter((k) => regex.test(k));
    }),
    mGet: jest.fn(async (keys) => keys.map((k) => getValue(k))),
    multi: jest.fn(() => {
        const operations = [];
        const chain = {
            set: jest.fn((key, value, options = undefined) => {
                operations.push(() => mockRedisClient.set(key, value, options));
                return chain;
            }),
            setEx: jest.fn((key, ttl, value) => {
                operations.push(() => mockRedisClient.setEx(key, ttl, value));
                return chain;
            }),
            del: jest.fn((key) => {
                operations.push(() => mockRedisClient.del(key));
                return chain;
            }),
            exec: jest.fn(async () => Promise.all(operations.map((op) => op())))
        };
        return chain;
    }),
    quit: jest.fn(async () => 'OK'),
    disconnect: jest.fn(async () => true),
    __reset: () => {
        redisStore.clear();
    }
};

// Mock Redis with deterministic in-memory semantics.
jest.unstable_mockModule('../src/config/redis.js', () => ({
    initializeRedis: jest.fn().mockImplementation(async () => true),
    getRedisClient: jest.fn().mockReturnValue(mockRedisClient),
    isRedisConnected: jest.fn().mockReturnValue(true),
    closeRedis: jest.fn().mockImplementation(async () => {
        redisStore.clear();
        return true;
    }),
    default: {
        initializeRedis: jest.fn().mockImplementation(async () => true),
        getRedisClient: jest.fn().mockReturnValue(mockRedisClient),
        isRedisConnected: jest.fn().mockReturnValue(true),
        closeRedis: jest.fn().mockImplementation(async () => {
            redisStore.clear();
            return true;
        })
    }
}));

// Set NODE_ENV to test explicitly if not already set
if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = 'test';
}

// Local development may enable OTP in .env. Keep the shared Jest baseline
// deterministic; OTP-focused tests opt in explicitly when exercising it.
process.env.EMAIL_OTP_ENFORCEMENT_ENABLED = 'false';

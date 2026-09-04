import { initializeRedis, closeRedis, getRedisClient } from '../src/config/redis.js';

// Extracted from tests/supertest_security.test.js's 'Finding 8.2: Distributed Locking' describe
// (#1452, Phase 255, PR-D). This case only calls getRedisClient()/client.del/client.set/client.get
// -- it issues zero DB queries and imports nothing that reaches src/models/index.js or
// src/config/database.js, so it belongs in the fast tier rather than the db-dependent manifest.
// Deliberately NOT listed in scripts/backend-db-dependent-tests.js -- absence from that manifest
// is what makes this a fast-tier file (see run-backend-test-matrix.js).
describe('Finding 8.2: Distributed Locking', () => {
    beforeAll(async () => {
        await initializeRedis();
    });

    afterAll(async () => {
        await closeRedis();
    });

    it('should correctly acquire and release locks in Redis', async () => {
        const client = getRedisClient();
        const lockKey = 'test:distributed:lock';
        const ttl = 5;

        await client.del(lockKey);

        const acquired = await client.set(lockKey, 'LOCKED', { NX: true, EX: ttl });
        expect(acquired).toBe('OK');

        const val = await client.get(lockKey);
        expect(val).toBe('LOCKED');

        const duplicate = await client.set(lockKey, 'LOCKED', { NX: true, EX: ttl });
        expect(duplicate).toBeNull();

        await client.del(lockKey);

        const reAcquire = await client.set(lockKey, 'LOCKED', { NX: true, EX: ttl });
        expect(reAcquire).toBe('OK');
    });
});

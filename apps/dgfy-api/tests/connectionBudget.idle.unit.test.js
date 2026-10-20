import { afterEach, describe, expect, it } from '@jest/globals';
import { getTenantPoolIdleMs } from '../src/config/connectionBudget.js';

const originalIdle = process.env.TENANT_DB_POOL_IDLE_MS;
afterEach(() => {
    if (originalIdle === undefined) delete process.env.TENANT_DB_POOL_IDLE_MS;
    else process.env.TENANT_DB_POOL_IDLE_MS = originalIdle;
});

describe('tenant pool idle window', () => {
    it('defaults to 60 seconds and accepts a positive override', () => {
        delete process.env.TENANT_DB_POOL_IDLE_MS;
        expect(getTenantPoolIdleMs()).toBe(60000);
        process.env.TENANT_DB_POOL_IDLE_MS = '90000';
        expect(getTenantPoolIdleMs()).toBe(90000);
    });

    it.each(['0', '-1', 'invalid'])('falls back for %s', (value) => {
        process.env.TENANT_DB_POOL_IDLE_MS = value;
        expect(getTenantPoolIdleMs()).toBe(60000);
    });
});

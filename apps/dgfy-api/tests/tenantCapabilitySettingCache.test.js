import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
    clearTenantCapabilityCache,
    getCachedCapabilityEnabled,
    invalidateTenantCapabilityCache
} from '../src/modules/shared/utils/tenantCapabilitySettingCache.js';

describe('tenant capability setting cache', () => {
    beforeEach(() => clearTenantCapabilityCache());
    afterEach(() => jest.restoreAllMocks());

    it('reuses a parsed value within the 15-second TTL and reloads after expiry', async () => {
        const now = jest.spyOn(Date, 'now').mockReturnValue(1_000);
        const loader = jest.fn().mockResolvedValue(true);

        await expect(getCachedCapabilityEnabled('tenant-a', 'tenant_pos_enabled', loader)).resolves.toBe(true);
        now.mockReturnValue(15_999);
        await expect(getCachedCapabilityEnabled('tenant-a', 'tenant_pos_enabled', loader)).resolves.toBe(true);
        expect(loader).toHaveBeenCalledTimes(1);

        now.mockReturnValue(16_000);
        loader.mockResolvedValue(false);
        await expect(getCachedCapabilityEnabled('tenant-a', 'tenant_pos_enabled', loader)).resolves.toBe(false);
        expect(loader).toHaveBeenCalledTimes(2);
    });

    it('isolates entries by tenant and setting key', async () => {
        const loader = jest.fn()
            .mockResolvedValueOnce(true)
            .mockResolvedValueOnce(false)
            .mockResolvedValueOnce(false);

        await expect(getCachedCapabilityEnabled('tenant-a', 'tenant_pos_enabled', loader)).resolves.toBe(true);
        await expect(getCachedCapabilityEnabled('tenant-b', 'tenant_pos_enabled', loader)).resolves.toBe(false);
        await expect(getCachedCapabilityEnabled('tenant-a', 'tenant_ims_enabled', loader)).resolves.toBe(false);
        expect(loader).toHaveBeenCalledTimes(3);
    });

    it('shares a concurrent miss across callers', async () => {
        let resolveLoader;
        const loader = jest.fn(() => new Promise((resolve) => {
            resolveLoader = resolve;
        }));

        const first = getCachedCapabilityEnabled('tenant-a', 'tenant_pos_enabled', loader);
        const second = getCachedCapabilityEnabled('tenant-a', 'tenant_pos_enabled', loader);
        await Promise.resolve();
        expect(loader).toHaveBeenCalledTimes(1);

        resolveLoader(true);
        await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    });

    it('propagates loader failures without caching them and clears the in-flight entry', async () => {
        const failure = new Error('settings lookup failed');
        const loader = jest.fn()
            .mockRejectedValueOnce(failure)
            .mockResolvedValueOnce(false);

        await expect(getCachedCapabilityEnabled('tenant-a', 'tenant_pos_enabled', loader)).rejects.toBe(failure);
        await expect(getCachedCapabilityEnabled('tenant-a', 'tenant_pos_enabled', loader)).resolves.toBe(false);
        expect(loader).toHaveBeenCalledTimes(2);
    });

    it('invalidates one tenant or all tenants, including outstanding loads', async () => {
        const tenantALoader = jest.fn().mockResolvedValue(true);
        const tenantBLoader = jest.fn().mockResolvedValue(false);

        await getCachedCapabilityEnabled('tenant-a', 'tenant_pos_enabled', tenantALoader);
        await getCachedCapabilityEnabled('tenant-b', 'tenant_pos_enabled', tenantBLoader);
        invalidateTenantCapabilityCache('tenant-a');

        await getCachedCapabilityEnabled('tenant-a', 'tenant_pos_enabled', tenantALoader);
        await getCachedCapabilityEnabled('tenant-b', 'tenant_pos_enabled', tenantBLoader);
        expect(tenantALoader).toHaveBeenCalledTimes(2);
        expect(tenantBLoader).toHaveBeenCalledTimes(1);

        clearTenantCapabilityCache();
        await getCachedCapabilityEnabled('tenant-b', 'tenant_pos_enabled', tenantBLoader);
        expect(tenantBLoader).toHaveBeenCalledTimes(2);

        let resolveOldLoad;
        const oldLoad = getCachedCapabilityEnabled('tenant-c', 'tenant_pos_enabled', () => new Promise((resolve) => {
            resolveOldLoad = resolve;
        }));
        await Promise.resolve();
        invalidateTenantCapabilityCache('tenant-c');
        const freshLoader = jest.fn().mockResolvedValue(false);
        await expect(getCachedCapabilityEnabled('tenant-c', 'tenant_pos_enabled', freshLoader)).resolves.toBe(false);
        resolveOldLoad(true);
        await oldLoad;
        await expect(getCachedCapabilityEnabled('tenant-c', 'tenant_pos_enabled', freshLoader)).resolves.toBe(false);
        expect(freshLoader).toHaveBeenCalledTimes(1);
    });
});

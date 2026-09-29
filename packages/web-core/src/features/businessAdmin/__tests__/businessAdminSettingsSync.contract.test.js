// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    BUSINESS_ADMIN_SETTINGS_STORAGE_KEY,
    BUSINESS_ADMIN_SETTINGS_SYNC_EVENT,
    publishBusinessAdminSettingsUpdated,
    shouldRefreshBusinessAdminSettingsUpdate,
    subscribeToBusinessAdminSettingsUpdates
} from '../../pos/utils/businessAdminSettingsSync.js';

afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.removeItem(BUSINESS_ADMIN_SETTINGS_STORAGE_KEY);
});

describe('Business Admin settings cross-window refresh contract', () => {
    it('publishes only tenant/branch metadata and a versioned event', () => {
        const eventSpy = vi.fn();
        window.addEventListener(BUSINESS_ADMIN_SETTINGS_SYNC_EVENT, eventSpy);

        const payload = publishBusinessAdminSettingsUpdated({
            tenantId: 'tenant-7',
            branchId: '12',
            section: 'storefront'
        });

        expect(payload).toMatchObject({
            version: 1,
            tenantId: 'tenant-7',
            branchId: '12',
            section: 'storefront',
            source: 'business-admin'
        });
        expect(payload).not.toHaveProperty('settings');
        expect(eventSpy).toHaveBeenCalledTimes(1);
        expect(JSON.parse(window.localStorage.getItem(BUSINESS_ADMIN_SETTINGS_STORAGE_KEY))).toMatchObject(payload);

        window.removeEventListener(BUSINESS_ADMIN_SETTINGS_SYNC_EVENT, eventSpy);
    });

    it('deduplicates local and storage delivery for one update', () => {
        vi.stubGlobal('BroadcastChannel', undefined);
        const handler = vi.fn();
        const unsubscribe = subscribeToBusinessAdminSettingsUpdates(handler);
        const payload = publishBusinessAdminSettingsUpdated({ tenantId: 'tenant-7', branchId: '12', section: 'pos' });

        window.dispatchEvent(new StorageEvent('storage', {
            key: BUSINESS_ADMIN_SETTINGS_STORAGE_KEY,
            newValue: JSON.stringify(payload)
        }));

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant-7', branchId: '12', section: 'pos' }));
        unsubscribe();
    });

    it('refreshes only the matching tenant and branch for branch-scoped updates', () => {
        const payload = { tenantId: 'tenant-7', branchId: '12', section: 'storefront' };

        expect(shouldRefreshBusinessAdminSettingsUpdate({
            payload,
            activeTenantId: 'tenant-7',
            activeBranchId: 12
        })).toBe(true);
        expect(shouldRefreshBusinessAdminSettingsUpdate({
            payload,
            activeTenantId: 'tenant-7',
            activeBranchId: 11
        })).toBe(false);
        expect(shouldRefreshBusinessAdminSettingsUpdate({
            payload,
            activeTenantId: 'tenant-8',
            activeBranchId: 12
        })).toBe(false);
        expect(shouldRefreshBusinessAdminSettingsUpdate({
            payload,
            activeTenantId: 'tenant-7',
            activeBranchId: null
        })).toBe(false);
    });

    it('allows tenant-wide updates but rejects malformed branch metadata', () => {
        expect(shouldRefreshBusinessAdminSettingsUpdate({
            payload: { tenantId: 'tenant-7', branchId: '' },
            activeTenantId: 'tenant-7',
            activeBranchId: 12
        })).toBe(true);
        expect(shouldRefreshBusinessAdminSettingsUpdate({
            payload: { tenantId: 'tenant-7', branchId: 'not-a-branch' },
            activeTenantId: 'tenant-7',
            activeBranchId: 12
        })).toBe(false);
    });
});

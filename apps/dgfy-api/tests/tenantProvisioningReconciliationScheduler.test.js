/**
 * PR #1830 review, RF-7 — regression coverage for the boot/periodic reconciliation scheduler
 * (issue #1825).
 *
 * reconcileStaleTenantProvisioning is the "mark it failed so an admin can see and retry it" half
 * of crash recovery: it finds every stale in_progress application and calls the existing
 * CAS-guarded markProvisioningOutcome on each. This suite is a pure unit test against mocked
 * companyRegistrationRepository methods — no DB needed, since the whole point of the CAS design
 * is that this scheduler never needs to reason about concurrency itself; it only needs to call
 * the guarded method and respect what it reports back.
 */

import { jest } from '@jest/globals';

const mockFindStaleInProgressApplications = jest.fn();
const mockMarkProvisioningOutcome = jest.fn();

jest.unstable_mockModule('../src/modules/tenants/repositories/companyRegistrationRepository.js', () => ({
    companyRegistrationRepository: {
        findStaleInProgressApplications: mockFindStaleInProgressApplications,
        markProvisioningOutcome: mockMarkProvisioningOutcome
    }
}));

const { reconcileStaleTenantProvisioning } = await import('../src/schedulers/tenantProvisioningReconciliationScheduler.js');

describe('tenantProvisioningReconciliationScheduler — reconcileStaleTenantProvisioning', () => {
    beforeEach(() => {
        mockFindStaleInProgressApplications.mockReset();
        mockMarkProvisioningOutcome.mockReset();
    });

    test('marks every stale in_progress application failed via the existing CAS-guarded method', async () => {
        mockFindStaleInProgressApplications.mockResolvedValue([
            { id: 'app-1', tenant_id: 'tenant-1' },
            { id: 'app-2', tenant_id: 'tenant-2' }
        ]);
        mockMarkProvisioningOutcome.mockResolvedValue({ id: 'app-1', provisioning_status: 'failed' });

        const result = await reconcileStaleTenantProvisioning();

        expect(mockFindStaleInProgressApplications).toHaveBeenCalledWith({ olderThanMs: 10 * 60 * 1000 });
        expect(mockMarkProvisioningOutcome).toHaveBeenCalledTimes(2);
        expect(mockMarkProvisioningOutcome).toHaveBeenCalledWith(expect.objectContaining({
            tenantId: 'tenant-1',
            succeeded: false
        }));
        expect(mockMarkProvisioningOutcome).toHaveBeenCalledWith(expect.objectContaining({
            tenantId: 'tenant-2',
            succeeded: false
        }));
        expect(result).toEqual({ checked: 2, reconciled: 2 });
    });

    test('never marks a row succeeded, and never touches provisioning itself', async () => {
        mockFindStaleInProgressApplications.mockResolvedValue([{ id: 'app-1', tenant_id: 'tenant-1' }]);
        mockMarkProvisioningOutcome.mockResolvedValue({ id: 'app-1', provisioning_status: 'failed' });

        await reconcileStaleTenantProvisioning();

        const [call] = mockMarkProvisioningOutcome.mock.calls;
        expect(call[0].succeeded).toBe(false);
    });

    test('a lost CAS race (markProvisioningOutcome returns null) is not counted as reconciled, and is not an error', async () => {
        mockFindStaleInProgressApplications.mockResolvedValue([
            { id: 'app-1', tenant_id: 'tenant-1' },
            { id: 'app-2', tenant_id: 'tenant-2' }
        ]);
        // app-1 lost the race (another process already resolved it between find and update);
        // app-2 is genuinely reconciled by this call.
        mockMarkProvisioningOutcome
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ id: 'app-2', provisioning_status: 'failed' });

        const result = await reconcileStaleTenantProvisioning();

        expect(result).toEqual({ checked: 2, reconciled: 1 });
    });

    test('respects a custom olderThanMs threshold', async () => {
        mockFindStaleInProgressApplications.mockResolvedValue([]);

        await reconcileStaleTenantProvisioning({ olderThanMs: 60_000 });

        expect(mockFindStaleInProgressApplications).toHaveBeenCalledWith({ olderThanMs: 60_000 });
    });

    test('zero stale applications is a no-op, not an error', async () => {
        mockFindStaleInProgressApplications.mockResolvedValue([]);

        const result = await reconcileStaleTenantProvisioning();

        expect(mockMarkProvisioningOutcome).not.toHaveBeenCalled();
        expect(result).toEqual({ checked: 0, reconciled: 0 });
    });
});

/**
 * PR #1830 review, RF-7 — regression coverage for issue #1825's core behavior change:
 * approveTenantUseCase now returns 202 as soon as the durable claim succeeds, runs the rest
 * detached, and widens the retry gate for the crash-window case (tenant.status already 'active'
 * with provisioning stuck in_progress).
 */

import { jest } from '@jest/globals';
import { buildApproveTenantUseCase } from '../src/modules/tenants/usecases/approveTenantUseCase.js';
import { resolveRegisteredTenantPlan } from '../src/modules/tenants/usecases/tenantPlanPolicy.js';

const buildTenant = (overrides = {}) => ({
    id: 'tenant-1',
    name: 'Micro Eatery Co',
    status: 'pending',
    db_name: 'sku_tenant_microeatery_abcd1234',
    company_token: 'token-microeatery-abcd1234',
    admin_email: 'owner@microeatery.test',
    admin_phone: '+639123456789',
    admin_password_hash: 'hash',
    owner_dgfy_account_id: 'dgfy-account-1',
    plan: resolveRegisteredTenantPlan(),
    settings: { workflow_mode: 'fnb' },
    ...overrides
});

// A deferred provisionTenant lets the test control exactly when the detached background work
// resolves, so it can assert the request already returned 202 *before* that happens.
const createDeferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
};

const createDeps = ({ tenant }) => {
    const provisioningDeferred = createDeferred();
    const deps = {
        tenantAdminRepository: {
            findTenantById: jest.fn().mockResolvedValue(tenant),
            updateTenant: jest.fn().mockResolvedValue(tenant)
        },
        companyRegistrationRepository: {
            markProvisioningStarted: jest.fn().mockResolvedValue({ id: 'application-1' }),
            markProvisioningOutcome: jest.fn().mockResolvedValue({})
        },
        dgfyAccountRepository: { upsertFounderMembership: jest.fn().mockResolvedValue({}) },
        provisionTenant: jest.fn().mockReturnValue(provisioningDeferred.promise),
        shouldAutoCreatePayMongoChildAccounts: jest.fn().mockReturnValue(false),
        emailService: { isEmailConfigured: jest.fn().mockReturnValue(false) },
        logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() }
    };
    return { deps, provisioningDeferred };
};

// Lets pending microtasks (the detached runProvisioningInBackground chain) actually run.
const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve));

describe('approveTenantUseCase — async 202 + detached provisioning (issue #1825)', () => {
    test('returns 202 with in_progress before the detached provisioning work resolves', async () => {
        const tenant = buildTenant();
        const { deps, provisioningDeferred } = createDeps({ tenant });
        const useCase = buildApproveTenantUseCase(deps);

        const result = await useCase({ id: 'tenant-1', actor: { id: 'admin-1', username: 'root' } });

        expect(result.success).toBe(true);
        expect(result.data.statusCode).toBe(202);
        expect(result.data.payload.data).toEqual(expect.objectContaining({
            tenant_id: 'tenant-1',
            application_id: 'application-1',
            provisioning_status: 'in_progress'
        }));
        // provisionTenant was invoked synchronously (before the await point), but has not yet
        // resolved -- the request already returned without waiting for it.
        expect(deps.provisionTenant).toHaveBeenCalledTimes(1);
        expect(deps.companyRegistrationRepository.markProvisioningOutcome).not.toHaveBeenCalled();

        provisioningDeferred.resolve({ admin_user_id: 'user-1' });
        await flushMicrotasks();
    });

    test('on success, founder membership and markProvisioningOutcome(succeeded:true) are eventually called', async () => {
        const tenant = buildTenant();
        const { deps, provisioningDeferred } = createDeps({ tenant });
        const useCase = buildApproveTenantUseCase(deps);

        await useCase({ id: 'tenant-1', actor: { id: 'admin-1', username: 'root' } });
        provisioningDeferred.resolve({ admin_user_id: 'user-1' });
        await flushMicrotasks();
        await flushMicrotasks();

        expect(deps.dgfyAccountRepository.upsertFounderMembership).toHaveBeenCalledWith(
            expect.objectContaining({ tenantId: 'tenant-1', tenantUserId: 'user-1' })
        );
        expect(deps.companyRegistrationRepository.markProvisioningOutcome).toHaveBeenCalledWith(
            expect.objectContaining({ tenantId: 'tenant-1', succeeded: true })
        );
    });

    test('on failure, markProvisioningOutcome(succeeded:false) is called and the rejection never escapes', async () => {
        const tenant = buildTenant();
        const { deps, provisioningDeferred } = createDeps({ tenant });
        const useCase = buildApproveTenantUseCase(deps);

        await useCase({ id: 'tenant-1', actor: { id: 'admin-1', username: 'root' } });
        provisioningDeferred.reject(new Error('sync failed'));
        await flushMicrotasks();
        await flushMicrotasks();

        expect(deps.companyRegistrationRepository.markProvisioningOutcome).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: 'tenant-1',
                succeeded: false,
                details: expect.objectContaining({ error: 'sync failed' })
            })
        );
        // Founder membership must never be assigned on a failed provisioning run.
        expect(deps.dgfyAccountRepository.upsertFounderMembership).not.toHaveBeenCalled();
    });

    test('an initial (non-retry) approve is still blocked when tenant.status is not pending', async () => {
        const tenant = buildTenant({ status: 'active' });
        const { deps } = createDeps({ tenant });
        const useCase = buildApproveTenantUseCase(deps);

        const result = await useCase({ id: 'tenant-1', actor: { id: 'admin-1', username: 'root' } });

        expect(result.success).toBe(false);
        expect(deps.companyRegistrationRepository.markProvisioningStarted).not.toHaveBeenCalled();
    });

    test('an explicit retry is allowed through the gate when tenant.status is already active (crash window)', async () => {
        // The crash window this widened gate closes: provisionTenant's own status='active'
        // update already ran and returned successfully, but the process died before founder
        // membership/markProvisioningOutcome recorded the terminal outcome -- leaving
        // provisioning_status stuck in_progress with tenant.status already 'active'.
        const tenant = buildTenant({ status: 'active' });
        const { deps, provisioningDeferred } = createDeps({ tenant });
        const useCase = buildApproveTenantUseCase(deps);

        const result = await useCase({ id: 'tenant-1', actor: { id: 'admin-1', username: 'root' }, retry: true });

        expect(result.success).toBe(true);
        expect(result.data.statusCode).toBe(202);
        expect(deps.companyRegistrationRepository.markProvisioningStarted).toHaveBeenCalledWith(
            expect.objectContaining({ tenantId: 'tenant-1', retry: true })
        );

        provisioningDeferred.resolve({ admin_user_id: 'user-1' });
        await flushMicrotasks();
    });

    test('the gate is only a shape check -- markProvisioningStarted\'s own CAS can still refuse the retry', async () => {
        const tenant = buildTenant({ status: 'active' });
        const { deps } = createDeps({ tenant });
        deps.companyRegistrationRepository.markProvisioningStarted.mockResolvedValue(null);
        const useCase = buildApproveTenantUseCase(deps);

        const result = await useCase({ id: 'tenant-1', actor: { id: 'admin-1', username: 'root' }, retry: true });

        expect(result.success).toBe(false);
        expect(deps.provisionTenant).not.toHaveBeenCalled();
    });
});

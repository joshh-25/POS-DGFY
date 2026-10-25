import { jest } from '@jest/globals';
import { buildListTenantsUseCase } from '../src/modules/tenants/usecases/listTenantsUseCase.js';
import { buildTenantRegistrationAction, PROVISIONING_RETRY_AFTER_MS } from '../src/modules/tenants/usecases/tenantRegistrationActionPolicy.js';

describe('listTenants usecase eligibility enrichment', () => {
    it('adds force non-compliant eligibility fields per tenant lifecycle state', async () => {
        const tenantAdminRepository = {
            listTenants: jest.fn().mockResolvedValue([
                {
                    id: 't-null',
                    name: 'Null Mode',
                    compliance_mode_state: null
                },
                {
                    id: 't-non',
                    name: 'Already Non-compliant',
                    compliance_mode_state: 'non_compliant_active'
                },
                {
                    id: 't-pending',
                    name: 'Pending',
                    status: 'pending',
                    plan: 'standard',
                    compliance_mode_state: 'compliant_pending'
                },
                {
                    id: 't-active',
                    name: 'Active',
                    status: 'active',
                    plan: 'standard',
                    compliance_mode_state: 'compliant_active'
                }
            ])
        };

        const useCase = buildListTenantsUseCase({
            tenantAdminRepository,
            logger: { error: jest.fn() }
        });

        const result = await useCase({ status: 'all' });

        expect(result.success).toBe(true);
        const tenants = result.data.payload.data;
        expect(tenants).toHaveLength(4);

        expect(tenants[0]).toEqual(expect.objectContaining({
            id: 't-null',
            can_force_non_compliant: false,
            force_non_compliant_block_reason: 'Compliance mode has not been selected yet.'
        }));
        expect(tenants[1]).toEqual(expect.objectContaining({
            id: 't-non',
            can_force_non_compliant: false,
            force_non_compliant_block_reason: 'Tenant is already in non_compliant_active mode.'
        }));
        expect(tenants[2]).toEqual(expect.objectContaining({
            id: 't-pending',
            effective_plan: 'premium',
            plan_policy: 'registered_tenant_premium_capable',
            can_force_non_compliant: true,
            force_non_compliant_block_reason: null
        }));
        expect(tenants[3]).toEqual(expect.objectContaining({
            id: 't-active',
            effective_plan: 'premium',
            plan_policy: 'registered_tenant_premium_capable',
            can_force_non_compliant: true,
            force_non_compliant_block_reason: null
        }));
    });

    it('returns only actions accepted by the public registration lifecycle', () => {
        const now = Date.now();
        const tenant = (registrationApplication) => ({ status: 'pending', registrationApplication });

        expect(buildTenantRegistrationAction(tenant(null), now)).toEqual(expect.objectContaining({
            action: 'reconcile',
            allowed: false
        }));
        expect(buildTenantRegistrationAction(tenant({ review_status: 'pending', provisioning_status: 'not_started' }), now)).toEqual(expect.objectContaining({
            action: 'approve',
            allowed: true
        }));
        expect(buildTenantRegistrationAction(tenant({ review_status: 'approved', provisioning_status: 'failed' }), now)).toEqual(expect.objectContaining({
            action: 'retry',
            allowed: true
        }));
        expect(buildTenantRegistrationAction(tenant({ review_status: 'approved', provisioning_status: 'in_progress', updatedAt: new Date(now - PROVISIONING_RETRY_AFTER_MS + 1000).toISOString() }), now)).toEqual(expect.objectContaining({
            action: 'setting_up',
            allowed: false
        }));
        expect(buildTenantRegistrationAction(tenant({ review_status: 'approved', provisioning_status: 'in_progress', updatedAt: new Date(now - PROVISIONING_RETRY_AFTER_MS - 1000).toISOString() }), now)).toEqual(expect.objectContaining({
            action: 'retry',
            allowed: true
        }));
        expect(buildTenantRegistrationAction(tenant({ review_status: 'rejected', provisioning_status: 'not_started' }), now)).toEqual(expect.objectContaining({
            action: 'reconcile',
            allowed: false
        }));
    });

    it('adds the registration action descriptor to each pending tenant', async () => {
        const tenantAdminRepository = {
            listTenants: jest.fn().mockResolvedValue([
                {
                    id: 'pending-public',
                    status: 'pending',
                    registrationApplication: {
                        review_status: 'pending',
                        provisioning_status: 'not_started'
                    }
                },
                {
                    id: 'pending-unmatched',
                    status: 'pending'
                }
            ])
        };

        const useCase = buildListTenantsUseCase({
            tenantAdminRepository,
            logger: { error: jest.fn() }
        });

        const result = await useCase({ status: 'pending' });
        const tenants = result.data.payload.data;

        expect(tenants).toEqual(expect.arrayContaining([
            expect.objectContaining({
                id: 'pending-public',
                registration_action: expect.objectContaining({ action: 'approve', allowed: true })
            }),
            expect.objectContaining({
                id: 'pending-unmatched',
                registration_action: expect.objectContaining({ action: 'reconcile', allowed: false })
            })
        ]));
    });

    it('uses the tenant database for capability reads without exposing it in the admin payload', async () => {
        const tenantAdminRepository = {
            listTenants: jest.fn().mockResolvedValue([{
                id: 'active-tenant',
                name: 'Active Tenant',
                status: 'active',
                db_name: 'sku_tenant_active'
            }])
        };
        const readTenantCapabilities = jest.fn().mockResolvedValue({
            ims_enabled: true,
            pos_enabled: false,
            storefront_visible: false
        });

        const useCase = buildListTenantsUseCase({
            tenantAdminRepository,
            tenantConnector: {},
            readTenantCapabilities,
            logger: { error: jest.fn() }
        });

        const result = await useCase({ status: 'active' });
        const tenant = result.data.payload.data[0];

        expect(readTenantCapabilities).toHaveBeenCalledWith({
            tenant: expect.objectContaining({
                id: 'active-tenant',
                db_name: 'sku_tenant_active'
            }),
            tenantConnector: {}
        });
        expect(tenant).not.toHaveProperty('db_name');
        expect(tenant.capabilities).toEqual(expect.objectContaining({ pos_enabled: false }));
    });

    it('skips every tenant capability read for an explicitly lightweight list while preserving safe item fields', async () => {
        const tenantAdminRepository = {
            listTenants: jest.fn().mockResolvedValue([{
                id: 'active-lightweight',
                name: 'Lightweight Tenant',
                status: 'active',
                db_name: 'sku_private_db',
                company_token: 'private-token',
                password_hash: 'private-password-hash'
            }])
        };
        const readTenantCapabilities = jest.fn();
        const useCase = buildListTenantsUseCase({
            tenantAdminRepository,
            tenantConnector: { connect: jest.fn() },
            readTenantCapabilities,
            logger: { error: jest.fn() }
        });

        const result = await useCase({ status: 'all', includeCapabilities: false });
        const payload = result.data.payload;

        expect(tenantAdminRepository.listTenants).toHaveBeenCalledWith({});
        expect(readTenantCapabilities).not.toHaveBeenCalled();
        expect(payload).toEqual({ success: true, data: [expect.objectContaining({
            id: 'active-lightweight',
            capabilities: null
        })] });
        expect(payload.data[0]).not.toHaveProperty('db_name');
        expect(payload.data[0]).not.toHaveProperty('company_token');
        expect(payload.data[0]).not.toHaveProperty('password_hash');
    });
});

import { jest } from '@jest/globals';
import { buildListTenantsUseCase } from '../src/modules/tenants/usecases/listTenantsUseCase.js';

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
});

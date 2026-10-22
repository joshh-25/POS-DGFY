import { jest } from '@jest/globals';
import { PERMISSIONS } from '../src/config/permissions.js';
import {
    buildBusinessAdminSettingsCapabilities,
    resolveBusinessAdminAccess
} from '../src/modules/businessAdmin/domain/businessAdminAccessPolicy.js';
import { buildDecideBusinessAdminApprovalUseCase } from '../src/modules/businessAdmin/usecases/businessAdminApprovalUseCase.js';
import { buildGetBusinessAdminCommerceMonitoringUseCase } from '../src/modules/businessAdmin/usecases/businessAdminCommerceMonitoringUseCase.js';
import { buildGetBusinessAdminBootstrapUseCase } from '../src/modules/businessAdmin/usecases/businessAdminBootstrapUseCase.js';

const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';
const ADMIN = {
    user_id: 7,
    role: 'manager',
    permissions: [
        PERMISSIONS.BUSINESS_ADMIN.actions.ACCESS,
        PERMISSIONS.BUSINESS_ADMIN.actions.VIEW_ALL_BRANCHES,
        PERMISSIONS.BUSINESS_ADMIN.actions.APPROVE_HIGH_RISK
    ]
};

describe('Business Admin contracts', () => {
    it('denies cashier access and limits a scoped manager to assigned branches', () => {
        expect(resolveBusinessAdminAccess({ role: 'cashier', permissions: [] })).toMatchObject({
            allowed: false,
            scope: 'none'
        });
        expect(resolveBusinessAdminAccess({
            role: 'manager',
            permissions: [PERMISSIONS.BUSINESS_ADMIN.actions.ACCESS]
        })).toMatchObject({
            allowed: true,
            scope: 'assigned'
        });
    });

    it('projects settings sections from owner permissions without granting assigned users branch authoring', () => {
        const capabilities = buildBusinessAdminSettingsCapabilities({
            role: 'manager',
            permissions: [
                PERMISSIONS.SYSTEM.actions.VIEW_SETTINGS,
                PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS,
                PERMISSIONS.SYSTEM.actions.VIEW_USERS,
                PERMISSIONS.SYSTEM.actions.MANAGE_USERS,
                PERMISSIONS.DOWNPAYMENT.actions.VIEW_DOWNPAYMENT_SETTINGS
            ]
        }, 'assigned');

        expect(capabilities).toMatchObject({
            profile: { view: true, edit: true, scope: 'tenant' },
            pos: { view: true, edit: true, scope: 'tenant' },
            team: { view: true, edit: true, scope: 'branch' },
            payments: { view: true, edit: false, scope: 'tenant' },
            branches: { view: true, edit: false, scope: 'branch' },
            registers: { view: true, edit: false, scope: 'branch' }
        });

        expect(capabilities.team).toMatchObject({
            user_view: true,
            user_edit: true,
            employee_edit: false,
            employee_credit_edit: false
        });
    });

    it('lets tenant-wide admin settings capabilities pass through the existing admin bypass', () => {
        const capabilities = buildBusinessAdminSettingsCapabilities({ role: 'admin', permissions: [] }, 'all');

        expect(Object.values(capabilities).every((section) => section.view && section.edit)).toBe(true);
        expect(capabilities.storefront.branding).toBe(true);
    });

    it('projects employee-owned Team editors without granting user-management access', () => {
        const capabilities = buildBusinessAdminSettingsCapabilities({
            role: 'manager',
            permissions: [
                PERMISSIONS.POS.actions.VIEW_POS,
                PERMISSIONS.POS.actions.SHIFT_ACCESS,
                PERMISSIONS.POS.actions.MANAGE_EMPLOYEES,
                PERMISSIONS.POS.actions.MANAGE_EMPLOYEE_CREDIT
            ]
        }, 'assigned');

        expect(capabilities.team).toMatchObject({
            view: true,
            edit: true,
            user_view: false,
            user_edit: false,
            employee_edit: true,
            employee_credit_edit: true
        });
    });

    it('includes the server settings projection and branch scope in the bootstrap contract', async () => {
        const useCase = buildGetBusinessAdminBootstrapUseCase({
            businessAdminOverviewRepository: {
                listUserLocationGrantIds: jest.fn().mockResolvedValue([12]),
                listActiveLocations: jest.fn().mockResolvedValue([{ location_id: 12, name: 'Mall' }])
            }
        });

        const result = await useCase({
            user: {
                user_id: 8,
                username: 'manager',
                role: 'manager',
                permissions: [
                    PERMISSIONS.BUSINESS_ADMIN.actions.ACCESS,
                    PERMISSIONS.SYSTEM.actions.VIEW_SETTINGS
                ]
            },
            tenant: { id: TENANT_ID, name: 'Demo Business' }
        });

        expect(result.success).toBe(true);
        expect(result.data.access.location_ids).toEqual([12]);
        expect(result.data.access.settings_sections).toMatchObject({
            profile: { view: true, edit: false },
            branches: { view: true, edit: false }
        });
    });

    it('projects restricted tenant capabilities without removing catalog bootstrap access', async () => {
        const tenantCapabilityResolver = jest.fn().mockResolvedValue({
            pos_enabled: false,
            storefront_visible: false
        });
        const useCase = buildGetBusinessAdminBootstrapUseCase({
            businessAdminOverviewRepository: {
                listUserLocationGrantIds: jest.fn().mockResolvedValue([]),
                listActiveLocations: jest.fn().mockResolvedValue([])
            },
            tenantCapabilityResolver
        });

        const result = await useCase({
            user: {
                user_id: 8,
                username: 'owner',
                role: 'admin',
                permissions: [PERMISSIONS.BUSINESS_ADMIN.actions.ACCESS]
            },
            tenant: { id: TENANT_ID, name: 'Catalog-only Business' }
        });

        expect(result.success).toBe(true);
        expect(tenantCapabilityResolver).toHaveBeenCalledWith({
            tenant: { id: TENANT_ID, name: 'Catalog-only Business' }
        });
        expect(result.data.access.tenant_capabilities).toEqual({
            pos_enabled: false,
            storefront_visible: false
        });
    });

    it('projects stored payment sessions and refund summaries into reconciliation data', async () => {
        const commercePaymentRepository = {
            findTenantPaymentAccount: jest.fn().mockResolvedValue({
                provider: 'paymongo',
                wallet_status: 'enabled',
                onboarding_status: 'active',
                qrph_enabled: true,
                split_enabled: true,
                charges_enabled: true
            }),
            listSessions: jest.fn().mockResolvedValue([{
                session_id: 21,
                public_reference: 'CPS-TEST-21',
                target_type: 'store_checkout',
                status: 'finalized',
                total_amount_centavos: 10000,
                platform_fee_centavos: 300,
                paid_at: '2026-09-14T00:00:00.000Z',
                created_at: '2026-09-14T00:00:00.000Z'
            }]),
            countSessions: jest.fn().mockResolvedValue(1),
            listSessionSummary: jest.fn().mockResolvedValue([{
                status: 'finalized',
                session_count: 1,
                total_amount_centavos: 10000,
                platform_fee_centavos: 300
            }]),
            listRefundSummary: jest.fn().mockResolvedValue([{
                status: 'succeeded',
                refund_count: 1,
                amount_centavos: 1000
            }]),
            listRefundsBySession: jest.fn().mockResolvedValue([])
        };
        const useCase = buildGetBusinessAdminCommerceMonitoringUseCase({ commercePaymentRepository });

        const result = await useCase({
            user: ADMIN,
            tenant: { id: TENANT_ID },
            query: { date_from: '2026-09-14', date_to: '2026-09-14' }
        });

        expect(result.success).toBe(true);
        expect(result.data.reconciliation).toMatchObject({
            session_count: 1,
            collected_amount_centavos: 10000,
            platform_fee_centavos: 300,
            succeeded_refund_centavos: 1000,
            merchant_net_before_provider_fees_centavos: 8700
        });
        expect(commercePaymentRepository.listSessions).toHaveBeenCalledWith(
            expect.objectContaining({ tenantId: TENANT_ID, provider: 'paymongo' }),
            { limit: 50, offset: 0 }
        );
    });

    it('fails closed when an approval mutation has no canonical POS owner', async () => {
        const useCase = buildDecideBusinessAdminApprovalUseCase({ decidePosExceptionApprovalUseCase: null });
        const result = await useCase({
            approvalRequestId: 12,
            decision: 'approve',
            user: ADMIN
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('CONFLICT');
        expect(result.error.details).toEqual({ reason_code: 'BUSINESS_ADMIN_APPROVAL_OWNER_UNAVAILABLE' });
    });

    it('delegates approval decisions to the canonical POS owner', async () => {
        const decidePosExceptionApprovalUseCase = jest.fn().mockResolvedValue({
            success: true,
            data: { approval_request: { approval_request_id: 12, status: 'executed' } }
        });
        const useCase = buildDecideBusinessAdminApprovalUseCase({ decidePosExceptionApprovalUseCase });

        const result = await useCase({
            approvalRequestId: 12,
            decision: 'approve',
            note: 'Reviewed in OPIS',
            user: ADMIN
        });

        expect(result).toEqual({
            success: true,
            data: { approval_request: { approval_request_id: 12, status: 'executed' } }
        });
        expect(decidePosExceptionApprovalUseCase).toHaveBeenCalledWith({
            approvalRequestId: 12,
            decision: 'approve',
            note: 'Reviewed in OPIS',
            user: ADMIN
        });
    });
});

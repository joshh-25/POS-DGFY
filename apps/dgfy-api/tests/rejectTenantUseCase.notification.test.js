import { jest } from '@jest/globals';
import { buildRejectTenantUseCase } from '../src/modules/tenants/usecases/rejectTenantUseCase.js';

describe('rejectTenantUseCase company notification', () => {
    it('creates an applicant-scoped in-app rejection notification after the rejection commits', async () => {
        const tenant = {
            id: 'tenant-rejected',
            name: 'Rejected Foods',
            status: 'pending',
            admin_email: 'owner@example.test',
            settings: {}
        };
        const application = {
            id: 'application-rejected',
            dgfy_account_id: 'account-owner'
        };
        const notifyCompanyRegistrationRejected = jest.fn().mockResolvedValue({
            notification: { notification_id: 7 },
            created: true
        });
        const companyRegistrationRepository = {
            markRejected: jest.fn().mockResolvedValue(application)
        };
        const tenantAdminRepository = {
            findTenantById: jest.fn().mockResolvedValue(tenant),
            transaction: jest.fn(async (callback) => callback({ id: 'transaction-1' })),
            updateTenant: jest.fn().mockResolvedValue(tenant)
        };

        const useCase = buildRejectTenantUseCase({
            tenantAdminRepository,
            companyRegistrationRepository,
            emailService: { isEmailConfigured: () => false },
            notifyCompanyRegistrationRejected,
            logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() }
        });

        const result = await useCase({
            id: tenant.id,
            reason: 'Missing business documents',
            actor: { id: 'admin-1', role: 'platform_admin' }
        });

        expect(result.success).toBe(true);
        expect(notifyCompanyRegistrationRejected).toHaveBeenCalledWith({
            dgfyAccountId: application.dgfy_account_id,
            tenantId: tenant.id,
            applicationId: application.id,
            companyName: tenant.name,
            rejectionReason: 'Missing business documents'
        });
        expect(result.data.payload.data).toEqual(expect.objectContaining({
            status: 'rejected',
            notification_created: true
        }));
    });
});

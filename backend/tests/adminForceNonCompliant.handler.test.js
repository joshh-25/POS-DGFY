import { jest } from '@jest/globals';

const mockForceNonCompliantModeUseCase = jest.fn();
const mockInvalidateTenantLookupCache = jest.fn();
const mockSendUseCaseResult = jest.fn();
const mockTrackProductUsageFromResult = jest.fn();

const noopUseCase = jest.fn();

jest.unstable_mockModule('../src/modules/tenants/index.js', () => ({
    registerCompanyRequestUseCase: noopUseCase,
    listTenantsUseCase: noopUseCase,
    approveTenantUseCase: noopUseCase,
    rejectTenantUseCase: noopUseCase,
    provisionNewTenantUseCase: noopUseCase,
    getPricingSettingsUseCase: noopUseCase,
    updatePricingSettingsUseCase: noopUseCase,
    updateTenantUseCase: noopUseCase,
    deleteTenantUseCase: noopUseCase,
    resubmitRegistrationUseCase: noopUseCase,
    tenantAdminRepository: {}
}));

jest.unstable_mockModule('../src/modules/payments/index.js', () => ({
    setupPayPalRecurringUseCase: noopUseCase,
    changePlanUseCase: noopUseCase
}));

jest.unstable_mockModule('../src/modules/compliance/index.js', () => ({
    listComplianceArtifactsUseCase: noopUseCase,
    listCompliancePeripheralsUseCase: noopUseCase,
    getComplianceChecklistUseCase: noopUseCase,
    listComplianceAuditLogsUseCase: noopUseCase,
    listComplianceSecurityIncidentsUseCase: noopUseCase,
    updateComplianceArtifactVerificationUseCase: noopUseCase,
    updateCompliancePeripheralVerificationUseCase: noopUseCase,
    forceNonCompliantModeUseCase: mockForceNonCompliantModeUseCase,
    reviewFinalReviewDocumentUseCase: noopUseCase,
    updateComplianceSecurityIncidentStatusUseCase: noopUseCase
}));

jest.unstable_mockModule('../src/services/emailService.js', () => ({
    isEmailConfigured: jest.fn().mockReturnValue(false),
    sendReactivationApprovedEmail: jest.fn()
}));

jest.unstable_mockModule('../src/services/productUsageTelemetryService.js', () => ({
    trackProductUsageFromResult: mockTrackProductUsageFromResult
}));

jest.unstable_mockModule('../src/config/paymentsFeature.js', () => ({
    paymentsEnabled: true,
    paymentsDisabledMessage: 'Payments disabled'
}));

jest.unstable_mockModule('../src/middleware/tenantHandler.js', () => ({
    invalidateTenantLookupCache: mockInvalidateTenantLookupCache
}));

jest.unstable_mockModule('../src/modules/shared/controllers/useCaseResponder.js', () => ({
    sendUseCaseResult: mockSendUseCaseResult
}));

let adminForceNonCompliant;

beforeAll(async () => {
    const mod = await import('../src/modules/tenants/controllers/adminTenantHandlers.js');
    adminForceNonCompliant = mod.adminForceNonCompliant;
});

describe('adminForceNonCompliant handler', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockSendUseCaseResult.mockImplementation((res, result) => {
            res._result = result;
            return res;
        });
    });

    it('invalidates tenant lookup cache when force operation succeeds', async () => {
        mockForceNonCompliantModeUseCase.mockResolvedValue({
            success: true,
            data: { mode_state: 'non_compliant_active' }
        });

        const req = {
            params: { id: 'tenant-1' },
            validatedData: { reason: 'Emergency rollback', context: {} },
            admin: { id: 5, username: 'platform_admin' }
        };
        const res = {};

        await adminForceNonCompliant(req, res);

        expect(mockInvalidateTenantLookupCache).toHaveBeenCalledWith({ tenantId: 'tenant-1' });
        expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
            eventType: 'admin_force_non_compliant_attempted',
            surface: 'admin_tenants',
            action: 'force_non_compliant'
        }));
        expect(mockSendUseCaseResult).toHaveBeenCalled();
    });

    it('does not invalidate tenant lookup cache when force operation fails', async () => {
        mockForceNonCompliantModeUseCase.mockResolvedValue({
            success: false,
            error: { statusCode: 409, message: 'already non-compliant' }
        });

        const req = {
            params: { id: 'tenant-1' },
            validatedData: { reason: 'No-op', context: {} },
            admin: { id: 5, username: 'platform_admin' }
        };
        const res = {};

        await adminForceNonCompliant(req, res);

        expect(mockInvalidateTenantLookupCache).not.toHaveBeenCalled();
        expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
            eventType: 'admin_force_non_compliant_attempted',
            surface: 'admin_tenants',
            action: 'force_non_compliant'
        }));
        expect(mockSendUseCaseResult).toHaveBeenCalled();
    });
});

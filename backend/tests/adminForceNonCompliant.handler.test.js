import { jest } from '@jest/globals';

const mockForceNonCompliantModeUseCase = jest.fn();
const mockSelectComplianceModeUseCase = jest.fn();
const mockUpgradeToCompliantUseCase = jest.fn();
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
    createAdminProvisionedAccountAndTenantUseCase: noopUseCase,
    createAdminProvisionedTenantUseCase: noopUseCase,
    assignTenantOwnerByAdminUseCase: noopUseCase,
    getPricingSettingsUseCase: noopUseCase,
    updatePricingSettingsUseCase: noopUseCase,
    updateTenantUseCase: noopUseCase,
    updateTenantCapabilitiesUseCase: noopUseCase,
    applyTemplateToTenantUseCase: noopUseCase,
    listTenantCapabilityAuditLogsUseCase: noopUseCase,
    getTenantPosMetadataUseCase: noopUseCase,
    listTenantPosMetadataAuditLogsUseCase: noopUseCase,
    updateTenantPosMetadataUseCase: noopUseCase,
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
    selectComplianceModeUseCase: mockSelectComplianceModeUseCase,
    upgradeToCompliantUseCase: mockUpgradeToCompliantUseCase,
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
let adminSelectComplianceMode;
let adminUpgradeComplianceMode;

beforeAll(async () => {
    const mod = await import('../src/modules/tenants/controllers/adminTenantHandlers.js');
    adminForceNonCompliant = mod.adminForceNonCompliant;
    adminSelectComplianceMode = mod.adminSelectComplianceMode;
    adminUpgradeComplianceMode = mod.adminUpgradeComplianceMode;
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

    it('selects tenant compliance mode and invalidates tenant lookup cache on success', async () => {
        mockSelectComplianceModeUseCase.mockResolvedValue({
            success: true,
            data: { mode_state: 'non_compliant_active' }
        });

        const req = {
            params: { id: 'tenant-1' },
            validatedData: {
                mode_choice: 'non_compliant',
                reason: 'Give tenant POS access',
                context: {}
            },
            admin: { id: 5, username: 'platform_admin' }
        };
        const res = {};

        await adminSelectComplianceMode(req, res);

        expect(mockSelectComplianceModeUseCase).toHaveBeenCalledWith(expect.objectContaining({
            tenantId: 'tenant-1',
            modeChoice: 'non_compliant',
            reason: 'Give tenant POS access',
            actorUser: expect.objectContaining({ is_platform_admin: true }),
            requirePrimaryAudit: true
        }));
        expect(mockInvalidateTenantLookupCache).toHaveBeenCalledWith({ tenantId: 'tenant-1' });
        expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
            eventType: 'admin_compliance_mode_select_attempted',
            surface: 'admin_tenants',
            action: 'select_compliance_mode'
        }));
        expect(mockSendUseCaseResult).toHaveBeenCalled();
    });

    it('upgrades tenant compliance mode and invalidates tenant lookup cache on success', async () => {
        mockUpgradeToCompliantUseCase.mockResolvedValue({
            success: true,
            data: { mode_state: 'compliant_pending' }
        });

        const req = {
            params: { id: 'tenant-1' },
            validatedData: {
                reason: 'Tenant is preparing compliance documents',
                context: {}
            },
            admin: { id: 5, username: 'platform_admin' }
        };
        const res = {};

        await adminUpgradeComplianceMode(req, res);

        expect(mockUpgradeToCompliantUseCase).toHaveBeenCalledWith(expect.objectContaining({
            tenantId: 'tenant-1',
            reason: 'Tenant is preparing compliance documents',
            actorUser: expect.objectContaining({ is_platform_admin: true }),
            requirePrimaryAudit: true
        }));
        expect(mockInvalidateTenantLookupCache).toHaveBeenCalledWith({ tenantId: 'tenant-1' });
        expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
            eventType: 'admin_compliance_mode_upgrade_attempted',
            surface: 'admin_tenants',
            action: 'upgrade_compliance_mode'
        }));
        expect(mockSendUseCaseResult).toHaveBeenCalled();
    });
});

import { jest } from '@jest/globals';

const mockAssertComplianceOperationAllowed = jest.fn();
const mockGetStore = jest.fn();

jest.unstable_mockModule('../src/modules/compliance/index.js', () => ({
    COMPLIANCE_OPERATION: {
        SETTINGS_UPDATE: 'settings.update'
    },
    assertComplianceOperationAllowed: mockAssertComplianceOperationAllowed
}));

jest.unstable_mockModule('../src/utils/dbStore.js', () => ({
    default: {
        getStore: mockGetStore
    }
}));

const { buildUpdateSettingsUseCase } = await import('../src/modules/settings/usecases/updateSettingsUseCase.js');

describe('settings compliance changed-key integration', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockGetStore.mockReturnValue({
            tenantId: 'tenant-non-compliant',
            tenantComplianceModeState: 'non_compliant_active',
            tenantComplianceModeChoiceRequired: false,
            tenantComplianceProfile: {},
            tenantCompliancePolicyVersion: '2026.04.07'
        });
        mockAssertComplianceOperationAllowed.mockResolvedValue({ success: true });
    });

    it('allows unrelated settings saves when fiscal settings are unchanged blanks', async () => {
        const updateSettings = jest.fn().mockResolvedValue({ updated: 3 });
        const useCase = buildUpdateSettingsUseCase({
            settingsRepository: {
                getSettingsByKeys: jest.fn().mockResolvedValue({
                    pos_tin_branch: { value: '' },
                    pos_ptu_number: { value: '' },
                    storefront_tagline: { value: 'Old tagline' }
                }),
                updateSettings
            }
        });

        const result = await useCase({
            settingsData: {
                pos_tin_branch: '',
                pos_ptu_number: '',
                storefront_tagline: 'New tagline'
            },
            actorUser: { user_id: 3 }
        });

        expect(result.success).toBe(true);
        expect(mockAssertComplianceOperationAllowed).toHaveBeenCalledWith(expect.objectContaining({
            tenantId: 'tenant-non-compliant',
            operation: 'settings.update',
            context: expect.objectContaining({
                setting_keys: ['storefront_tagline']
            })
        }));
        expect(updateSettings).toHaveBeenCalled();
    });

    it('still sends changed fiscal settings to the compliance policy gate', async () => {
        const updateSettings = jest.fn().mockResolvedValue({ updated: 1 });
        const useCase = buildUpdateSettingsUseCase({
            settingsRepository: {
                getSettingsByKeys: jest.fn().mockResolvedValue({
                    pos_tin_branch: { value: '' }
                }),
                updateSettings
            }
        });

        mockAssertComplianceOperationAllowed.mockResolvedValueOnce({
            success: false,
            error: {
                code: 'COMPLIANCE_POLICY_BLOCKED',
                message: 'Compliance policy blocked operation. Reason: NON_COMPLIANT_FISCAL_FIELDS_BLOCKED',
                statusCode: 422
            }
        });

        const result = await useCase({
            settingsData: {
                pos_tin_branch: '123-456'
            },
            actorUser: { user_id: 3 }
        });

        expect(result.success).toBe(false);
        expect(mockAssertComplianceOperationAllowed).toHaveBeenCalledWith(expect.objectContaining({
            context: expect.objectContaining({
                setting_keys: ['pos_receipt_metadata_pending_changes'],
                setting_updates: expect.objectContaining({
                    pos_receipt_metadata_pending_changes: expect.objectContaining({
                        changes: expect.objectContaining({
                            pos_tin_branch: '123-456'
                        })
                    })
                })
            })
        }));
        expect(updateSettings).not.toHaveBeenCalled();
    });
});

import { jest } from '@jest/globals';
import { buildGetAllSettingsUseCase } from '../src/modules/settings/usecases/getAllSettingsUseCase.js';
import { buildGetSettingByKeyUseCase } from '../src/modules/settings/usecases/getSettingByKeyUseCase.js';
import { buildUpdateSettingsUseCase } from '../src/modules/settings/usecases/updateSettingsUseCase.js';
import { buildUpdateSettingByKeyUseCase } from '../src/modules/settings/usecases/updateSettingByKeyUseCase.js';
import { buildResetSettingsToDefaultUseCase } from '../src/modules/settings/usecases/resetSettingsToDefaultUseCase.js';
import { resolveChangedSettingKeys } from '../src/modules/settings/usecases/settingsChangeSet.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

describe('settings use-cases application result contract', () => {
  it('getAllSettings returns success envelope', async () => {
    const useCase = buildGetAllSettingsUseCase({
      settingsRepository: {
        getAllSettings: jest.fn().mockResolvedValue({ timezone: { value: 'UTC' } })
      },
      customerAccessModesEnabledProvider: jest.fn().mockReturnValue(true)
    });

    const result = await useCase();
    expect(result).toEqual({
      success: true,
      data: {
        timezone: { value: 'UTC' },
        customer_access_modes_enabled: expect.objectContaining({
          value: true,
          data_type: 'boolean',
          source: 'runtime'
        })
      },
      error: null,
      message: null
    });
  });

  it('getAllSettings exposes rollback runtime state with tenant context', async () => {
    const customerAccessModesEnabledProvider = jest.fn().mockReturnValue(false);
    const useCase = buildGetAllSettingsUseCase({
      settingsRepository: {
        getAllSettings: jest.fn().mockResolvedValue({ timezone: { value: 'UTC' } })
      },
      customerAccessModesEnabledProvider
    });

    const result = await useCase({ context: { tenantId: 'tenant-1', companyToken: 'TOKEN-123' } });

    expect(customerAccessModesEnabledProvider).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      companyToken: 'TOKEN-123'
    });
    expect(result.success).toBe(true);
    expect(result.data.customer_access_modes_enabled).toEqual(expect.objectContaining({
      value: false,
      data_type: 'boolean',
      source: 'runtime'
    }));
  });

  it('getSettingByKey maps not-found errors to RESOURCE_NOT_FOUND', async () => {
    const useCase = buildGetSettingByKeyUseCase({
      settingsRepository: {
        getSettingByKey: jest.fn().mockRejectedValue(new Error("Setting 'timezone' not found"))
      }
    });

    const result = await useCase({ key: 'timezone' });
    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.RESOURCE_NOT_FOUND);
    expect(result.error.statusCode).toBe(404);
  });

  it('updateSettings validates input shape', async () => {
    const useCase = buildUpdateSettingsUseCase({
      settingsRepository: {
        updateSettings: jest.fn()
      }
    });

    const result = await useCase({ settingsData: null });
    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
    expect(result.error.message).toBe('settingsData must be an object');
  });

  it('resolveChangedSettingKeys ignores unchanged fiscal keys in bulk settings payloads', async () => {
    const changedKeys = await resolveChangedSettingKeys({
      settingsRepository: {
        getSettingsByKeys: jest.fn().mockResolvedValue({
          pos_tin_branch: { value: '' },
          pos_ptu_number: { value: '' },
          storefront_tagline: { value: 'Old tagline' }
        })
      },
      settingsData: {
        pos_tin_branch: '',
        pos_ptu_number: '',
        storefront_tagline: 'New tagline'
      }
    });

    expect(changedKeys).toEqual(['storefront_tagline']);
  });

  it('resolveChangedSettingKeys treats a changed fiscal setting as changed', async () => {
    const changedKeys = await resolveChangedSettingKeys({
      settingsRepository: {
        getSettingsByKeys: jest.fn().mockResolvedValue({
          pos_tin_branch: { value: '' }
        })
      },
      settingsData: {
        pos_tin_branch: '123-456'
      }
    });

    expect(changedKeys).toEqual(['pos_tin_branch']);
  });

  it('updateSettingByKey returns success envelope', async () => {
    const useCase = buildUpdateSettingByKeyUseCase({
      settingsRepository: {
        updateSettingByKey: jest.fn().mockResolvedValue({ setting_key: 'timezone', value: 'UTC' })
      }
    });

    const result = await useCase({ key: 'timezone', value: 'UTC' });
    expect(result).toEqual({
      success: true,
      data: { setting_key: 'timezone', value: 'UTC' },
      error: null,
      message: null
    });
  });

  it('updateSettingByKey blocks strict POS location binding when readiness is not complete', async () => {
    const updateSettingByKey = jest.fn();
    const useCase = buildUpdateSettingByKeyUseCase({
      settingsRepository: {
        updateSettingByKey,
        getPosLocationBindingReadinessSummary: jest.fn().mockResolvedValue({
          ready_for_strict_mode: false,
          unresolved_count: 1,
          low_confidence_count: 0
        })
      }
    });

    const result = await useCase({
      key: 'pos_terminal_location_binding_enforced',
      value: true,
      actorUser: { is_master_admin: true }
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
    expect(updateSettingByKey).not.toHaveBeenCalled();
  });

  it('resetSettingsToDefault maps repository failures', async () => {
    const useCase = buildResetSettingsToDefaultUseCase({
      settingsRepository: {
        resetSettingsToDefault: jest.fn().mockRejectedValue(new Error('Reset failed'))
      }
    });

    const result = await useCase();
    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.INTERNAL_ERROR);
    expect(result.error.message).toBe('Reset failed');
  });

  it('updateSettings blocks strict POS location binding when readiness is not complete', async () => {
    const updateSettings = jest.fn();
    const useCase = buildUpdateSettingsUseCase({
      settingsRepository: {
        updateSettings,
        getPosLocationBindingReadinessSummary: jest.fn().mockResolvedValue({
          ready_for_strict_mode: false,
          unresolved_count: 2,
          low_confidence_count: 1
        })
      }
    });

    const result = await useCase({
      settingsData: {
        pos_terminal_location_binding_enforced: true
      },
      actorUser: { is_master_admin: true }
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
    expect(result.error.statusCode).toBe(422);
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('updateSettings auto-assigns missing active terminal locations from primary location on strict-enable transition', async () => {
    const updateSettings = jest.fn().mockResolvedValue({ updated: 2 });
    const useCase = buildUpdateSettingsUseCase({
      settingsRepository: {
        updateSettings,
        getSettingsByKeys: jest.fn().mockResolvedValue({
          pos_terminal_location_binding_enforced: { value: false }
        }),
        getActivePrimaryTenantLocation: jest.fn().mockResolvedValue({ location_id: 11 }),
        getPosLocationBindingReadinessSummary: jest.fn().mockResolvedValue({
          ready_for_strict_mode: true,
          unresolved_count: 0,
          low_confidence_count: 0
        })
      }
    });

    const result = await useCase({
      settingsData: {
        pos_terminal_location_binding_enforced: true,
        pos_terminal_registry: [
          { terminal_id: 'COUNTER-01', label: 'Counter', is_active: true, is_default: true, location_id: null },
          { terminal_id: 'COUNTER-02', label: 'Counter 2', is_active: false, is_default: false, location_id: null }
        ]
      },
      actorUser: { is_master_admin: true }
    });

    expect(result.success).toBe(true);
    expect(updateSettings).toHaveBeenCalledWith(expect.objectContaining({
      pos_terminal_registry: expect.arrayContaining([
        expect.objectContaining({ terminal_id: 'COUNTER-01', location_id: 11 }),
        expect.objectContaining({ terminal_id: 'COUNTER-02', location_id: null })
      ])
    }));
  });

  it('updateSettings rejects strict-enable auto-assignment when no primary location exists', async () => {
    const updateSettings = jest.fn();
    const useCase = buildUpdateSettingsUseCase({
      settingsRepository: {
        updateSettings,
        getSettingsByKeys: jest.fn().mockResolvedValue({
          pos_terminal_location_binding_enforced: { value: false },
          pos_terminal_registry: { value: [{ terminal_id: 'COUNTER-01', is_active: true, location_id: null }] }
        }),
        getActivePrimaryTenantLocation: jest.fn().mockResolvedValue(null),
        getPosLocationBindingReadinessSummary: jest.fn().mockResolvedValue({
          ready_for_strict_mode: true,
          unresolved_count: 0,
          low_confidence_count: 0
        })
      }
    });

    const result = await useCase({
      settingsData: { pos_terminal_location_binding_enforced: true },
      actorUser: { is_master_admin: true }
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
    expect(result.error.statusCode).toBe(422);
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('updateSettingByKey auto-assigns terminal registry once when strict binding transitions on', async () => {
    const updateSettingByKey = jest.fn();
    const updateSettings = jest.fn().mockResolvedValue({ updated: 2 });
    const useCase = buildUpdateSettingByKeyUseCase({
      settingsRepository: {
        updateSettings,
        updateSettingByKey,
        getSettingsByKeys: jest.fn().mockResolvedValue({
          pos_terminal_location_binding_enforced: { value: false },
          pos_terminal_registry: {
            value: [{ terminal_id: 'COUNTER-01', label: 'Counter', is_active: true, is_default: true, location_id: null }]
          }
        }),
        getActivePrimaryTenantLocation: jest.fn().mockResolvedValue({ location_id: 5 }),
        getPosLocationBindingReadinessSummary: jest.fn().mockResolvedValue({
          ready_for_strict_mode: true,
          unresolved_count: 0,
          low_confidence_count: 0
        })
      }
    });

    const result = await useCase({
      key: 'pos_terminal_location_binding_enforced',
      value: true,
      actorUser: { is_master_admin: true }
    });

    expect(result.success).toBe(true);
    expect(updateSettings).toHaveBeenCalledWith(expect.objectContaining({
      pos_terminal_location_binding_enforced: true,
      pos_terminal_registry: expect.arrayContaining([
        expect.objectContaining({ terminal_id: 'COUNTER-01', location_id: 5 })
      ])
    }));
    expect(updateSettingByKey).not.toHaveBeenCalled();
  });

  it('updateSettingByKey leaves registry unchanged when strict binding is already enabled', async () => {
    const updateSettingByKey = jest.fn().mockResolvedValue({ setting_key: 'pos_terminal_location_binding_enforced', value: true });
    const useCase = buildUpdateSettingByKeyUseCase({
      settingsRepository: {
        updateSettingByKey,
        getSettingsByKeys: jest.fn().mockResolvedValue({
          pos_terminal_location_binding_enforced: { value: true },
          pos_terminal_registry: {
            value: [{ terminal_id: 'COUNTER-01', is_active: true, is_default: true, location_id: null }]
          }
        }),
        getPosLocationBindingReadinessSummary: jest.fn().mockResolvedValue({
          ready_for_strict_mode: true,
          unresolved_count: 0,
          low_confidence_count: 0
        })
      }
    });

    const result = await useCase({
      key: 'pos_terminal_location_binding_enforced',
      value: true,
      actorUser: { is_master_admin: true }
    });

    expect(result.success).toBe(true);
    expect(updateSettingByKey).toHaveBeenCalledTimes(1);
    expect(updateSettingByKey).toHaveBeenCalledWith('pos_terminal_location_binding_enforced', true);
  });
});

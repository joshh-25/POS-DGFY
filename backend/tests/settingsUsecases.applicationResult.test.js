import { jest } from '@jest/globals';
import { buildGetAllSettingsUseCase } from '../src/modules/settings/usecases/getAllSettingsUseCase.js';
import { buildGetSettingByKeyUseCase } from '../src/modules/settings/usecases/getSettingByKeyUseCase.js';
import { buildUpdateSettingsUseCase } from '../src/modules/settings/usecases/updateSettingsUseCase.js';
import { buildUpdateSettingByKeyUseCase } from '../src/modules/settings/usecases/updateSettingByKeyUseCase.js';
import { buildResetSettingsToDefaultUseCase } from '../src/modules/settings/usecases/resetSettingsToDefaultUseCase.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

describe('settings use-cases application result contract', () => {
  it('getAllSettings returns success envelope', async () => {
    const useCase = buildGetAllSettingsUseCase({
      settingsRepository: {
        getAllSettings: jest.fn().mockResolvedValue({ timezone: { value: 'UTC' } })
      }
    });

    const result = await useCase();
    expect(result).toEqual({
      success: true,
      data: { timezone: { value: 'UTC' } },
      error: null,
      message: null
    });
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
});

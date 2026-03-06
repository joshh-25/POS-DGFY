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
});

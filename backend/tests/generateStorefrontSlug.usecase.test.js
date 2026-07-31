import { jest } from '@jest/globals';
import { buildGenerateStorefrontSlugUseCase } from '../src/modules/settings/usecases/generateStorefrontSlugUseCase.js';

describe('generateStorefrontSlugUseCase', () => {
  it('returns an existing valid Storefront ID without changing it', async () => {
    const updateSettingByKeyUseCase = jest.fn();
    const useCase = buildGenerateStorefrontSlugUseCase({
      settingsRepository: {
        getSettingsByKeys: jest.fn().mockResolvedValue({
          store_tenant_slug: { value: 'masu-cafe-ed841f' }
        })
      },
      updateSettingByKeyUseCase
    });

    const result = await useCase({
      context: { tenantId: 'ed841fc8', tenantName: 'Masu Cafe' }
    });

    expect(result).toEqual(expect.objectContaining({
      success: true,
      data: {
        store_tenant_slug: 'masu-cafe-ed841f',
        storefront_path: '/tenant-store/masu-cafe-ed841f',
        generated: false
      }
    }));
    expect(updateSettingByKeyUseCase).not.toHaveBeenCalled();
  });

  it('generates and persists a stable tenant-scoped Storefront ID', async () => {
    const updateSettingByKeyUseCase = jest.fn().mockResolvedValue({
      success: true,
      data: { setting_key: 'store_tenant_slug', value: 'masu-cafe-ed841f' },
      error: null,
      message: null
    });
    const useCase = buildGenerateStorefrontSlugUseCase({
      settingsRepository: {
        getSettingsByKeys: jest.fn().mockResolvedValue({})
      },
      updateSettingByKeyUseCase
    });

    const actorUser = { user_id: 7, is_master_admin: true };
    const result = await useCase({
      context: { tenantId: 'ed841fc8-3eba-4728', tenantName: 'Masu Cafe' },
      actorUser
    });

    expect(updateSettingByKeyUseCase).toHaveBeenCalledWith({
      key: 'store_tenant_slug',
      value: 'masu-cafe-ed841f',
      actorUser
    });
    expect(result).toEqual(expect.objectContaining({
      success: true,
      data: {
        store_tenant_slug: 'masu-cafe-ed841f',
        storefront_path: '/tenant-store/masu-cafe-ed841f',
        generated: true
      }
    }));
  });

  it('requires an authenticated tenant context', async () => {
    const useCase = buildGenerateStorefrontSlugUseCase({
      settingsRepository: {
        getSettingsByKeys: jest.fn().mockResolvedValue({})
      },
      updateSettingByKeyUseCase: jest.fn()
    });

    const result = await useCase({
      context: { tenantId: null, tenantName: 'Masu Cafe' }
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('TENANT_CONTEXT_MISSING');
  });

  it('retries with a longer tenant suffix when the first handle is reserved', async () => {
    const updateSettingByKeyUseCase = jest.fn()
      .mockResolvedValueOnce({
        success: false,
        data: null,
        error: {
          code: 'CONFLICT',
          details: { reason_code: 'STOREFRONT_HANDLE_NOT_UNIQUE' }
        },
        message: null
      })
      .mockResolvedValueOnce({
        success: true,
        data: { setting_key: 'store_tenant_slug', value: 'masu-cafe-ed841fc83e' },
        error: null,
        message: null
      });
    const useCase = buildGenerateStorefrontSlugUseCase({
      settingsRepository: {
        getSettingsByKeys: jest.fn().mockResolvedValue({})
      },
      updateSettingByKeyUseCase
    });

    const result = await useCase({
      context: { tenantId: 'ed841fc8-3eba-4728', tenantName: 'Masu Cafe' }
    });

    expect(updateSettingByKeyUseCase).toHaveBeenNthCalledWith(1, expect.objectContaining({
      value: 'masu-cafe-ed841f'
    }));
    expect(updateSettingByKeyUseCase).toHaveBeenNthCalledWith(2, expect.objectContaining({
      value: 'masu-cafe-ed841fc83e'
    }));
    expect(result.data.store_tenant_slug).toBe('masu-cafe-ed841fc83e');
  });
});


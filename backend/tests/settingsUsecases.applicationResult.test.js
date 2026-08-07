import { jest } from '@jest/globals';
import { buildGetAllSettingsUseCase } from '../src/modules/settings/usecases/getAllSettingsUseCase.js';
import { buildGetSettingByKeyUseCase } from '../src/modules/settings/usecases/getSettingByKeyUseCase.js';
import { buildUpdateSettingsUseCase } from '../src/modules/settings/usecases/updateSettingsUseCase.js';
import { buildUpdateSettingByKeyUseCase } from '../src/modules/settings/usecases/updateSettingByKeyUseCase.js';
import { buildResetSettingsToDefaultUseCase } from '../src/modules/settings/usecases/resetSettingsToDefaultUseCase.js';
import { resolveChangedSettingKeys } from '../src/modules/settings/usecases/settingsChangeSet.js';
import { assertPublicStorefrontHandleAvailable } from '../src/modules/settings/usecases/publicStorefrontHandlePolicy.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';
import dbStore from '../src/utils/dbStore.js';

describe('settings use-cases application result contract', () => {
  it('getAllSettings returns success envelope', async () => {
    const useCase = buildGetAllSettingsUseCase({
      settingsRepository: {
        getAllSettings: jest.fn().mockResolvedValue({ timezone: { value: 'UTC' } })
      },
      customerAccessModesEnabledProvider: jest.fn().mockReturnValue(true)
    });

    const result = await useCase();
        expect(result).toEqual(expect.objectContaining({
            success: true,
            data: expect.objectContaining({
                timezone: { value: 'UTC' },
                requested_customer_access_mode: expect.objectContaining({
                    value: 'catalog',
                    source: 'runtime'
                }),
                effective_customer_access_mode: expect.objectContaining({
                    value: 'catalog',
                    source: 'runtime'
                }),
                max_customer_access_mode: expect.objectContaining({
                    value: 'catalog',
                    source: 'runtime'
                }),
                platform_max_customer_access_mode: expect.objectContaining({
                    value: 'transaction',
                    source: 'runtime_default'
                }),
                customer_access_modes_enabled: expect.objectContaining({
                    value: true,
                    data_type: 'boolean',
                    source: 'runtime'
                })
            }),
            error: null,
            message: null
        }));
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

  it('getAllSettings exposes backend-computed customer access policy metadata', async () => {
    const useCase = buildGetAllSettingsUseCase({
      settingsRepository: {
        getAllSettings: jest.fn().mockResolvedValue({
          customer_access_mode: { value: 'transaction' },
          platform_max_customer_access_mode: { value: 'catalog', updated_at: '2026-06-15T00:00:00.000Z' },
          tenant_onboarding_progress: {
            value: {
              step_payloads: {
                business_classification: {
                  legitimacy: { registration_status: 'registered' }
                }
              }
            }
          }
        })
      },
      customerAccessModesEnabledProvider: jest.fn().mockReturnValue(true)
    });

    const result = await useCase();

    expect(result.success).toBe(true);
    expect(result.data.requested_customer_access_mode.value).toBe('transaction');
    expect(result.data.effective_customer_access_mode.value).toBe('catalog');
    expect(result.data.max_customer_access_mode.value).toBe('catalog');
    expect(result.data.platform_max_customer_access_mode).toEqual(expect.objectContaining({
      value: 'catalog',
      source: 'tenant'
    }));
    expect(result.data.customer_access_limitation_reason.value).toBe('Platform maximum allows up to catalog mode.');
    expect(result.data.customer_access_capabilities.value.checkout).toBe(false);
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

  it('updateSettings removes omitted tenant-owned storefront gallery assets after a successful save', async () => {
    const getSettingsByKeys = jest.fn().mockResolvedValue({
      storefront_gallery_images: {
        value: [
          { path: 'storefront-assets/tenant-a/old.png', caption: 'Old' },
          { url: '/uploads/storefront-assets/tenant-a/keep.png', caption: 'Keep' },
          { path: 'storefront-assets/tenant-b/other.png', caption: 'Other tenant' },
          { url: 'https://cdn.example.com/external.png', caption: 'External' }
        ]
      }
    });
    const updateSettings = jest.fn().mockResolvedValue({ updated: 1 });
    const storefrontAssetStorage = {
      remove: jest.fn().mockResolvedValue(undefined)
    };
    const useCase = buildUpdateSettingsUseCase({
      settingsRepository: {
        getSettingsByKeys,
        updateSettings
      },
      storefrontAssetStorage
    });

    const result = await dbStore.run({ tenantId: 'tenant-a' }, () => useCase({
      settingsData: {
        storefront_gallery_images: [
          { path: 'storefront-assets/tenant-a/keep.png', caption: 'Keep' },
          { url: 'https://cdn.example.com/external.png', caption: 'External' }
        ]
      },
      actorUser: { username: 'admin' }
    }));

    expect(result.success).toBe(true);
    expect(updateSettings).toHaveBeenCalledWith(expect.objectContaining({
      storefront_gallery_images: expect.any(Array)
    }));
    expect(storefrontAssetStorage.remove).toHaveBeenCalledTimes(1);
    expect(storefrontAssetStorage.remove).toHaveBeenCalledWith({
      path: 'storefront-assets/tenant-a/old.png'
    });
  });

  it('updateSettings does not remove omitted gallery assets when the settings save fails', async () => {
    const getSettingsByKeys = jest.fn().mockResolvedValue({
      storefront_gallery_images: {
        value: [{ path: 'storefront-assets/tenant-a/old.png', caption: 'Old' }]
      }
    });
    const updateSettings = jest.fn().mockRejectedValue(new Error('database unavailable'));
    const storefrontAssetStorage = {
      remove: jest.fn().mockResolvedValue(undefined)
    };
    const useCase = buildUpdateSettingsUseCase({
      settingsRepository: {
        getSettingsByKeys,
        updateSettings
      },
      storefrontAssetStorage
    });

    const result = await dbStore.run({ tenantId: 'tenant-a' }, () => useCase({
      settingsData: {
        storefront_gallery_images: []
      },
      actorUser: { username: 'admin' }
    }));

    expect(result.success).toBe(false);
    expect(storefrontAssetStorage.remove).not.toHaveBeenCalled();
  });

  it('updateSettings rejects tenant attempts to configure platform customer access ceiling', async () => {
    const updateSettings = jest.fn();
    const useCase = buildUpdateSettingsUseCase({
      settingsRepository: { updateSettings }
    });

    const result = await useCase({
      settingsData: {
        platform_max_customer_access_mode: 'transaction'
      },
      actorUser: { username: 'tenant_admin' }
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.AUTHORIZATION_FAILED);
    expect(result.error.statusCode).toBe(403);
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('updateSettings rejects a non-master-admin actor setting ops_enabled_capabilities', async () => {
    const updateSettings = jest.fn();
    const useCase = buildUpdateSettingsUseCase({
      settingsRepository: { updateSettings }
    });

    const result = await useCase({
      settingsData: { ops_enabled_capabilities: ['services'] },
      actorUser: { username: 'tenant_admin' }
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.AUTHORIZATION_FAILED);
    expect(result.error.statusCode).toBe(403);
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('updateSettings rejects an unknown capability string in ops_enabled_capabilities even for a master admin', async () => {
    const updateSettings = jest.fn();
    const useCase = buildUpdateSettingsUseCase({
      settingsRepository: { updateSettings }
    });

    const result = await useCase({
      settingsData: { ops_enabled_capabilities: ['not-a-real-capability'] },
      actorUser: { is_master_admin: true }
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('updateSettings lets a master admin set ops_enabled_capabilities, deduped and normalized', async () => {
    const updateSettings = jest.fn().mockResolvedValue({ ops_enabled_capabilities: ['services'] });
    const useCase = buildUpdateSettingsUseCase({
      settingsRepository: { updateSettings }
    });

    const result = await useCase({
      settingsData: { ops_enabled_capabilities: ['services', 'services', ' fnbDining '] },
      actorUser: { is_master_admin: true }
    });

    expect(result.success).toBe(true);
    expect(updateSettings).toHaveBeenCalledWith(expect.objectContaining({
      ops_enabled_capabilities: ['services', 'fnbDining']
    }));
  });

  it('updateSettings rejects a non-master-admin actor setting inventory_authority', async () => {
    const updateSettings = jest.fn();
    const useCase = buildUpdateSettingsUseCase({
      settingsRepository: { updateSettings }
    });

    const result = await useCase({
      settingsData: { inventory_authority: 'external_ims' },
      actorUser: { username: 'tenant_admin' }
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.AUTHORIZATION_FAILED);
    expect(result.error.statusCode).toBe(403);
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('updateSettings rejects an unknown inventory_authority value even for a master admin', async () => {
    const updateSettings = jest.fn();
    const useCase = buildUpdateSettingsUseCase({
      settingsRepository: { updateSettings }
    });

    const result = await useCase({
      settingsData: { inventory_authority: 'not-a-real-authority' },
      actorUser: { is_master_admin: true }
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('updateSettings lets a master admin delegate inventory_authority to an external system', async () => {
    const updateSettings = jest.fn().mockResolvedValue({ inventory_authority: 'external_ims' });
    const useCase = buildUpdateSettingsUseCase({
      settingsRepository: { updateSettings }
    });

    const result = await useCase({
      settingsData: { inventory_authority: ' External_IMS ' },
      actorUser: { is_master_admin: true }
    });

    expect(result.success).toBe(true);
    expect(updateSettings).toHaveBeenCalledWith(expect.objectContaining({
      inventory_authority: 'external_ims'
    }));
  });

  it('updateSettings rejects reserved public storefront handles', async () => {
    const updateSettings = jest.fn();
    const useCase = buildUpdateSettingsUseCase({
      settingsRepository: {
        updateSettings
      }
    });

    const result = await useCase({
      settingsData: { store_tenant_slug: 'map-dgfy' },
      actorUser: { is_master_admin: true }
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
    expect(result.error.details).toEqual(expect.objectContaining({
      reason_code: 'STOREFRONT_HANDLE_RESERVED',
      handle: 'map-dgfy'
    }));
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('updateSettings reserves clean storefront handles before tenant settings write', async () => {
    const updateSettings = jest.fn().mockResolvedValue({ store_tenant_slug: 'space-bar' });
    const reservePublicStorefrontHandle = jest.fn().mockRejectedValue(Object.assign(
      new Error('Store tenant slug is already used by another company.'),
      {
        statusCode: 409,
        details: {
          reason_code: 'STOREFRONT_HANDLE_NOT_UNIQUE',
          handle: 'space-bar'
        }
      }
    ));
    const useCase = buildUpdateSettingsUseCase({
      settingsRepository: {
        updateSettings,
        reservePublicStorefrontHandle
      }
    });

    const result = await useCase({
      settingsData: { store_tenant_slug: 'space-bar' },
      actorUser: { is_master_admin: true }
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.CONFLICT);
    expect(result.error.details).toEqual(expect.objectContaining({
      reason_code: 'STOREFRONT_HANDLE_NOT_UNIQUE',
      handle: 'space-bar'
    }));
    expect(reservePublicStorefrontHandle).toHaveBeenCalledWith('space-bar');
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('public storefront handle policy rejects handles owned by another tenant', async () => {
    const findPublicStorefrontHandleOwner = jest.fn().mockResolvedValue({
      tenant_id: 'tenant-a',
      slug: 'space-bar'
    });

    await dbStore.run({ tenantId: 'tenant-b' }, async () => {
      await expect(assertPublicStorefrontHandleAvailable({
        handleValue: 'space-bar',
        settingsRepository: { findPublicStorefrontHandleOwner }
      })).rejects.toMatchObject({
        code: DomainErrorCode.CONFLICT,
        details: expect.objectContaining({
          reason_code: 'STOREFRONT_HANDLE_NOT_UNIQUE',
          handle: 'space-bar'
        })
      });
    });

    expect(findPublicStorefrontHandleOwner).toHaveBeenCalledWith('space-bar');
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

  it('updateSettingByKey rejects tenant attempts to configure platform customer access ceiling', async () => {
    const updateSettingByKey = jest.fn();
    const useCase = buildUpdateSettingByKeyUseCase({
      settingsRepository: { updateSettingByKey }
    });

    const result = await useCase({
      key: 'platform_max_customer_access_mode',
      value: 'transaction',
      actorUser: { username: 'tenant_admin' }
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.AUTHORIZATION_FAILED);
    expect(result.error.statusCode).toBe(403);
    expect(updateSettingByKey).not.toHaveBeenCalled();
  });

  it('updateSettingByKey rejects a non-master-admin actor setting ops_enabled_capabilities', async () => {
    const updateSettingByKey = jest.fn();
    const useCase = buildUpdateSettingByKeyUseCase({
      settingsRepository: { updateSettingByKey }
    });

    const result = await useCase({
      key: 'ops_enabled_capabilities',
      value: ['services'],
      actorUser: { username: 'tenant_admin' }
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.AUTHORIZATION_FAILED);
    expect(result.error.statusCode).toBe(403);
    expect(updateSettingByKey).not.toHaveBeenCalled();
  });

  it('updateSettingByKey rejects a non-array or unknown-capability value for ops_enabled_capabilities', async () => {
    const updateSettingByKey = jest.fn();
    const useCase = buildUpdateSettingByKeyUseCase({
      settingsRepository: { updateSettingByKey }
    });

    const result = await useCase({
      key: 'ops_enabled_capabilities',
      value: ['not-a-real-capability'],
      actorUser: { is_master_admin: true }
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
    expect(updateSettingByKey).not.toHaveBeenCalled();
  });

  it('updateSettingByKey lets a master admin set ops_enabled_capabilities, deduped and normalized', async () => {
    const updateSettingByKey = jest.fn().mockResolvedValue({
      setting_key: 'ops_enabled_capabilities',
      setting_value: ['services', 'fnbDining']
    });
    const useCase = buildUpdateSettingByKeyUseCase({
      settingsRepository: { updateSettingByKey }
    });

    const result = await useCase({
      key: 'ops_enabled_capabilities',
      value: ['services', 'services', ' fnbDining '],
      actorUser: { is_master_admin: true }
    });

    expect(result.success).toBe(true);
    expect(updateSettingByKey).toHaveBeenCalledWith('ops_enabled_capabilities', ['services', 'fnbDining']);
  });

  it('updateSettingByKey rejects a non-master-admin actor setting inventory_authority', async () => {
    const updateSettingByKey = jest.fn();
    const useCase = buildUpdateSettingByKeyUseCase({
      settingsRepository: { updateSettingByKey }
    });

    const result = await useCase({
      key: 'inventory_authority',
      value: 'external_ims',
      actorUser: { username: 'tenant_admin' }
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.AUTHORIZATION_FAILED);
    expect(result.error.statusCode).toBe(403);
    expect(updateSettingByKey).not.toHaveBeenCalled();
  });

  it('updateSettingByKey rejects an unknown inventory_authority value even for a master admin', async () => {
    const updateSettingByKey = jest.fn();
    const useCase = buildUpdateSettingByKeyUseCase({
      settingsRepository: { updateSettingByKey }
    });

    const result = await useCase({
      key: 'inventory_authority',
      value: 'not-a-real-authority',
      actorUser: { is_master_admin: true }
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
    expect(updateSettingByKey).not.toHaveBeenCalled();
  });

  it('updateSettingByKey lets a master admin delegate inventory_authority to an external system', async () => {
    const updateSettingByKey = jest.fn().mockResolvedValue({
      setting_key: 'inventory_authority',
      setting_value: 'external_ims'
    });
    const useCase = buildUpdateSettingByKeyUseCase({
      settingsRepository: { updateSettingByKey }
    });

    const result = await useCase({
      key: 'inventory_authority',
      value: ' External_IMS ',
      actorUser: { is_master_admin: true }
    });

    expect(result.success).toBe(true);
    expect(updateSettingByKey).toHaveBeenCalledWith('inventory_authority', 'external_ims');
  });

  it('updateSettingByKey does not create a POS metadata pending review when the receipt value is unchanged', async () => {
    const updateSettingByKey = jest.fn();
    const useCase = buildUpdateSettingByKeyUseCase({
      settingsRepository: {
        updateSettingByKey,
        getSettingsByKeys: jest.fn().mockResolvedValue({
          pos_registered_name: { value: 'Same Name' }
        })
      }
    });

    const result = await useCase({
      key: 'pos_registered_name',
      value: 'Same Name',
      actorUser: { username: 'tenant_admin' }
    });

    expect(result.success).toBe(true);
    expect(result.data.pending_review_keys).toEqual([]);
    expect(updateSettingByKey).not.toHaveBeenCalled();
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

  it('updateSettings submits tenant receipt metadata changes for platform admin approval', async () => {
    const updateSettings = jest.fn().mockResolvedValue({ updated: 2 });
    const useCase = buildUpdateSettingsUseCase({
      settingsRepository: {
        updateSettings,
        getSettingByKey: jest.fn().mockResolvedValue({
          value: {
            status: 'pending_review',
            changes: { pos_registered_name: 'Old Name' }
          }
        })
      }
    });

    const result = await useCase({
      settingsData: {
        pos_registered_name: 'New Name',
        pos_receipt_footer_message: 'Thank you',
        pos_petty_cash_amount: 100
      },
      actorUser: { username: 'tenant_admin' }
    });

    expect(result.success).toBe(true);
    expect(result.data.pending_review_keys).toEqual(['pos_registered_name', 'pos_receipt_footer_message']);
    expect(updateSettings).toHaveBeenCalledWith(expect.objectContaining({
      pos_petty_cash_amount: 100,
      pos_receipt_metadata_pending_changes: expect.objectContaining({
        status: 'pending_review',
        changes: {
          pos_registered_name: 'New Name',
          pos_receipt_footer_message: 'Thank you'
        }
      })
    }));
    expect(updateSettings.mock.calls[0][0]).not.toHaveProperty('pos_registered_name');
  });

  it('updateSettings saves unrelated settings without creating a POS metadata pending review when submitted receipt metadata is unchanged', async () => {
    const updateSettings = jest.fn().mockResolvedValue({ updated: 1 });
    const getSettingByKey = jest.fn();
    const useCase = buildUpdateSettingsUseCase({
      settingsRepository: {
        updateSettings,
        getSettingByKey,
        getSettingsByKeys: jest.fn().mockResolvedValue({
          pos_registered_name: { value: 'Same Name' },
          pos_tin_branch: { value: '' },
          pos_petty_cash_amount: { value: 50 }
        })
      }
    });

    const result = await useCase({
      settingsData: {
        pos_registered_name: 'Same Name',
        pos_tin_branch: '',
        pos_petty_cash_amount: 100
      },
      actorUser: { username: 'tenant_admin' }
    });

    expect(result.success).toBe(true);
    expect(result.data.pending_review_keys).toEqual([]);
    expect(getSettingByKey).not.toHaveBeenCalled();
    expect(updateSettings).toHaveBeenCalledWith({ pos_petty_cash_amount: 100 });
  });

  it('updateSettings treats missing false buyer-details receipt flag as the default while saving Storefront settings', async () => {
    const updateSettings = jest.fn().mockResolvedValue({ updated: 1 });
    const getSettingByKey = jest.fn();
    const useCase = buildUpdateSettingsUseCase({
      settingsRepository: {
        updateSettings,
        getSettingByKey,
        getSettingsByKeys: jest.fn().mockResolvedValue({
          storefront_tagline: { value: 'Old tagline' }
        })
      }
    });

    const result = await useCase({
      settingsData: {
        pos_fiscal_buyer_details_required: false,
        storefront_tagline: 'New tagline'
      },
      actorUser: { username: 'tenant_admin' }
    });

    expect(result.success).toBe(true);
    expect(result.data.pending_review_keys).toEqual([]);
    expect(getSettingByKey).not.toHaveBeenCalled();
    expect(updateSettings).toHaveBeenCalledWith({ storefront_tagline: 'New tagline' });
    expect(updateSettings.mock.calls[0][0]).not.toHaveProperty('pos_receipt_metadata_pending_changes');
  });

  it('updateSettings puts only changed tenant receipt metadata fields into pending review', async () => {
    const updateSettings = jest.fn().mockResolvedValue({ updated: 1 });
    const useCase = buildUpdateSettingsUseCase({
      settingsRepository: {
        updateSettings,
        getSettingByKey: jest.fn().mockResolvedValue(null),
        getSettingsByKeys: jest.fn().mockResolvedValue({
          pos_registered_name: { value: 'Same Name' },
          pos_receipt_footer_message: { value: 'Old footer' }
        })
      }
    });

    const result = await useCase({
      settingsData: {
        pos_registered_name: 'Same Name',
        pos_receipt_footer_message: 'New footer'
      },
      actorUser: { username: 'tenant_admin' }
    });

    expect(result.success).toBe(true);
    expect(result.data.pending_review_keys).toEqual(['pos_receipt_footer_message']);
    expect(updateSettings).toHaveBeenCalledWith({
      pos_receipt_metadata_pending_changes: expect.objectContaining({
        status: 'pending_review',
        changes: {
          pos_receipt_footer_message: 'New footer'
        }
      })
    });
  });

  it('updateSettings starts a fresh pending review after a rejected POS metadata payload', async () => {
    const updateSettings = jest.fn().mockResolvedValue({ updated: 1 });
    const useCase = buildUpdateSettingsUseCase({
      settingsRepository: {
        updateSettings,
        getSettingByKey: jest.fn().mockResolvedValue({
          value: {
            status: 'rejected',
            changes: {
              pos_registered_name: 'Rejected Name'
            }
          }
        }),
        getSettingsByKeys: jest.fn().mockResolvedValue({
          pos_receipt_footer_message: { value: 'Old footer' }
        })
      }
    });

    const result = await useCase({
      settingsData: {
        pos_receipt_footer_message: 'Fresh footer'
      },
      actorUser: { username: 'tenant_admin' }
    });

    expect(result.success).toBe(true);
    expect(updateSettings).toHaveBeenCalledWith({
      pos_receipt_metadata_pending_changes: expect.objectContaining({
        status: 'pending_review',
        changes: {
          pos_receipt_footer_message: 'Fresh footer'
        }
      })
    });
    expect(updateSettings.mock.calls[0][0].pos_receipt_metadata_pending_changes.changes).not.toHaveProperty('pos_registered_name');
  });

  it('updateSettings rejects tenant attempts to configure DGFY POS software identity', async () => {
    const updateSettings = jest.fn();
    const useCase = buildUpdateSettingsUseCase({
      settingsRepository: { updateSettings }
    });

    const result = await useCase({
      settingsData: {
        pos_software_name: 'Custom POS'
      },
      actorUser: { username: 'tenant_admin' }
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.AUTHORIZATION_FAILED);
    expect(result.error.statusCode).toBe(403);
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

  it('updateSettings does not persist terminal passwords in the pairing-only registry', async () => {
    const updateSettings = jest.fn().mockResolvedValue({ updated: 1 });
    const useCase = buildUpdateSettingsUseCase({
      settingsRepository: {
        updateSettings,
        getSettingsByKeys: jest.fn().mockResolvedValue({
          pos_terminal_registry: {
            value: [{ terminal_id: 'COUNTER-01', terminal_password_hash: '' }]
          }
        })
      }
    });

    const result = await useCase({
      settingsData: {
        pos_terminal_registry: [
          {
            terminal_id: 'COUNTER-01',
            is_active: true,
            is_default: true,
            location_id: 1,
            terminal_password: '4321'
          }
        ]
      },
      actorUser: { is_master_admin: true }
    });

    expect(result.success).toBe(true);
    const savedRegistry = updateSettings.mock.calls[0][0].pos_terminal_registry;
    expect(savedRegistry[0].terminal_password_hash).toBe('');
    expect(savedRegistry[0]).not.toHaveProperty('terminal_password');
  });

  it('updateSettings clears legacy terminal password hashes when the password field is left blank', async () => {
    const existingHash = '$2a$10$legacy-hash-placeholder';
    const updateSettings = jest.fn().mockResolvedValue({ updated: 1 });
    const useCase = buildUpdateSettingsUseCase({
      settingsRepository: {
        updateSettings,
        getSettingsByKeys: jest.fn().mockResolvedValue({
          pos_terminal_registry: {
            value: [{ terminal_id: 'COUNTER-01', terminal_password_hash: existingHash }]
          }
        })
      }
    });

    const result = await useCase({
      settingsData: {
        pos_terminal_registry: [
          {
            terminal_id: 'COUNTER-01',
            is_active: true,
            is_default: true,
            location_id: 1,
            terminal_password: ''
          }
        ]
      },
      actorUser: { is_master_admin: true }
    });

    expect(result.success).toBe(true);
    const savedRegistry = updateSettings.mock.calls[0][0].pos_terminal_registry;
    expect(savedRegistry[0].terminal_password_hash).toBe('');
  });

  it('updateSettings keeps the terminal password hash cleared when explicitly requested', async () => {
    const existingHash = '$2a$10$legacy-hash-placeholder';
    const updateSettings = jest.fn().mockResolvedValue({ updated: 1 });
    const useCase = buildUpdateSettingsUseCase({
      settingsRepository: {
        updateSettings,
        getSettingsByKeys: jest.fn().mockResolvedValue({
          pos_terminal_registry: {
            value: [{ terminal_id: 'COUNTER-01', terminal_password_hash: existingHash }]
          }
        })
      }
    });

    const result = await useCase({
      settingsData: {
        pos_terminal_registry: [
          {
            terminal_id: 'COUNTER-01',
            is_active: true,
            is_default: true,
            location_id: 1,
            clear_terminal_password: true
          }
        ]
      },
      actorUser: { is_master_admin: true }
    });

    expect(result.success).toBe(true);
    const savedRegistry = updateSettings.mock.calls[0][0].pos_terminal_registry;
    expect(savedRegistry[0].terminal_password_hash).toBe('');
  });
});

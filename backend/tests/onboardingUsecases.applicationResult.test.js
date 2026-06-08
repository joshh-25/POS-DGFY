import { jest } from '@jest/globals';
import {
  buildGetOnboardingStatusUseCase,
  buildSaveOnboardingStepUseCase,
  buildCompleteOnboardingUseCase
} from '../src/modules/onboarding/usecases/onboardingUseCases.js';
import { buildBulkCreateOnboardingItemsUseCase } from '../src/modules/onboarding/usecases/bulkCreateOnboardingItemsUseCase.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

describe('onboarding use-cases application result contract', () => {
  it('getOnboardingStatus returns success envelope', async () => {
    const useCase = buildGetOnboardingStatusUseCase({
      onboardingRepository: {
        getStatus: jest.fn().mockResolvedValue({ tenant_onboarding_state: 'not_started' })
      }
    });

    const result = await useCase();
    expect(result.success).toBe(true);
    expect(result.data.tenant_onboarding_state).toBe('not_started');
  });

  it('saveOnboardingStep validates step key', async () => {
    const useCase = buildSaveOnboardingStepUseCase({
      onboardingRepository: {
        saveStep: jest.fn()
      }
    });

    const result = await useCase({ stepKey: '' });
    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
    expect(result.error.statusCode).toBe(422);
  });

  it('saveOnboardingStep refreshes storefront discovery when onboarding setup data changes', async () => {
    const syncStorefrontDiscoveryWithReliability = jest.fn().mockResolvedValue({ ok: true, attempts: 1 });
    const useCase = buildSaveOnboardingStepUseCase({
      onboardingRepository: {
        saveStep: jest.fn().mockResolvedValue({ step_key: 'bulk_items' })
      },
      syncStorefrontDiscoveryWithReliability
    });

    const result = await useCase({
      tenantId: 'tenant-1',
      stepKey: 'bulk_items',
      payload: {
        created_item_ids: [1]
      }
    });

    expect(result.success).toBe(true);
    expect(syncStorefrontDiscoveryWithReliability).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      source: 'tenant_onboarding_bulk_items'
    });
    expect(result.data.storefront_sync.ok).toBe(true);
  });

  it('saveOnboardingStep refreshes storefront discovery when public storefront visibility is saved', async () => {
    const syncStorefrontDiscoveryWithReliability = jest.fn().mockResolvedValue({ ok: true, attempts: 1 });
    const useCase = buildSaveOnboardingStepUseCase({
      onboardingRepository: {
        saveStep: jest.fn().mockResolvedValue({
          step_key: 'primary_location',
          step_payloads: {
            primary_location: {
              public_storefront_visible: false
            }
          }
        })
      },
      syncStorefrontDiscoveryWithReliability
    });

    const result = await useCase({
      tenantId: 'tenant-1',
      stepKey: 'primary_location',
      payload: {
        public_storefront_visible: false
      }
    });

    expect(result.success).toBe(true);
    expect(syncStorefrontDiscoveryWithReliability).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      source: 'tenant_onboarding_primary_location'
    });
    expect(result.data.storefront_sync.ok).toBe(true);
  });

  it('completeOnboarding maps readiness failures', async () => {
    const useCase = buildCompleteOnboardingUseCase({
      onboardingRepository: {
        complete: jest.fn().mockRejectedValue(Object.assign(new Error('Onboarding requirements are incomplete'), {
          statusCode: 422,
          details: { missing_requirements: ['has_priced_starter_item'] }
        }))
      },
      syncStorefrontDiscoveryWithReliability: jest.fn()
    });

    const result = await useCase({ tenantId: 'tenant-1' });
    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
    expect(result.error.statusCode).toBe(422);
  });

  it('completeOnboarding returns storefront sync payload on success', async () => {
    const useCase = buildCompleteOnboardingUseCase({
      onboardingRepository: {
        complete: jest.fn().mockResolvedValue({ tenant_onboarding_state: 'completed' })
      },
      syncStorefrontDiscoveryWithReliability: jest.fn().mockResolvedValue({ ok: true, attempts: 1 })
    });

    const result = await useCase({ tenantId: 'tenant-1' });
    expect(result.success).toBe(true);
    expect(result.data.tenant_onboarding_state).toBe('completed');
    expect(result.data.storefront_sync.ok).toBe(true);
  });

  it('bulkCreateOnboardingItems preserves partial success and row-level failures', async () => {
    const createItemUseCase = jest.fn().mockResolvedValueOnce({ item_id: 10, name: 'Bread' });
    const getAllSettingsUseCase = jest.fn().mockResolvedValue({
      success: true,
      data: {
        ops_workflow_mode: { value: 'food_manufacturing' }
      }
    });
    const useCase = buildBulkCreateOnboardingItemsUseCase({
      createItemUseCase,
      getAllSettingsUseCase
    });

    const result = await useCase({
      rows: [
        { client_row_id: 'row-1', mode_item_preset: 'finished_product', name: 'Bread', default_sale_price: 25, location_id: 5 },
        { client_row_id: 'row-2', mode_item_preset: 'finished_product', name: '', default_sale_price: 10 }
      ],
      userId: 1
    });

    expect(result.success).toBe(true);
    expect(result.data.summary).toEqual({ total: 2, created: 1, failed: 1 });
    expect(result.data.results[0].status).toBe('created');
    expect(result.data.results[1].status).toBe('failed');
    expect(result.data.results[1].errors.join(' ')).toMatch(/item name is required/i);
    expect(createItemUseCase).toHaveBeenCalledTimes(1);
    expect(createItemUseCase.mock.calls[0][0].itemData).toEqual(expect.objectContaining({
      category: 'product',
      product_type: 'finished_goods',
      mode_item_preset: 'finished_product',
      default_sale_price: 25,
      current_stock: 0,
      location_id: 5
    }));
  });

  it('bulkCreateOnboardingItems rejects duplicate client row ids in one request', async () => {
    const createItemUseCase = jest.fn().mockResolvedValueOnce({ item_id: 10, name: 'Bread' });
    const useCase = buildBulkCreateOnboardingItemsUseCase({
      createItemUseCase,
      getAllSettingsUseCase: jest.fn().mockResolvedValue({
        success: true,
        data: {
          ops_workflow_mode: { value: 'food_manufacturing' }
        }
      })
    });

    const result = await useCase({
      rows: [
        { client_row_id: 'row-1', mode_item_preset: 'finished_product', name: 'Bread', default_sale_price: 25 },
        { client_row_id: 'row-1', mode_item_preset: 'finished_product', name: 'Bread Duplicate', default_sale_price: 25 }
      ]
    });

    expect(result.success).toBe(true);
    expect(result.data.summary).toEqual({ total: 2, created: 1, failed: 1 });
    expect(createItemUseCase).toHaveBeenCalledTimes(1);
    expect(result.data.results[1].errors.join(' ')).toMatch(/duplicate onboarding row key/i);
  });

  it('bulkCreateOnboardingItems fails SKU conflicts instead of creating duplicate retry rows', async () => {
    const error = new Error('Item with this SKU code already exists');
    error.statusCode = 409;
    const createItemUseCase = jest.fn().mockRejectedValue(error);
    const useCase = buildBulkCreateOnboardingItemsUseCase({
      createItemUseCase,
      getAllSettingsUseCase: jest.fn().mockResolvedValue({
        success: true,
        data: {
          ops_workflow_mode: { value: 'food_manufacturing' }
        }
      })
    });

    const result = await useCase({
      rows: [
        { client_row_id: 'row-1', mode_item_preset: 'finished_product', name: 'Bread', default_sale_price: 25 }
      ]
    });

    expect(result.success).toBe(true);
    expect(result.data.summary).toEqual({ total: 1, created: 0, failed: 1 });
    expect(createItemUseCase).toHaveBeenCalledTimes(1);
    expect(result.data.results[0].errors.join(' ')).toMatch(/already exists|already in use/i);
  });

  it('bulkCreateOnboardingItems treats exact SKU conflict replays as already created rows', async () => {
    const error = new Error('Item with this SKU code already exists');
    error.statusCode = 409;
    const createItemUseCase = jest.fn().mockRejectedValue(error);
    const findItemsBySkuCodes = jest.fn().mockResolvedValue([{
      item_id: 10,
      sku_code: 'ONB-BREAD-1',
      name: 'Bread',
      mode_item_preset: 'finished_product',
      default_sale_price: 25,
      status: 'active'
    }]);
    const useCase = buildBulkCreateOnboardingItemsUseCase({
      createItemUseCase,
      findItemsBySkuCodes,
      getAllSettingsUseCase: jest.fn().mockResolvedValue({
        success: true,
        data: {
          ops_workflow_mode: { value: 'food_manufacturing' }
        }
      })
    });

    const result = await useCase({
      rows: [
        { client_row_id: 'row-1', mode_item_preset: 'finished_product', name: 'Bread', default_sale_price: 25 }
      ]
    });

    expect(result.success).toBe(true);
    expect(result.data.summary).toEqual({ total: 1, created: 1, failed: 0 });
    expect(result.data.results[0]).toEqual(expect.objectContaining({
      status: 'created',
      idempotent_replay: true,
      item: expect.objectContaining({ item_id: 10 })
    }));
    expect(findItemsBySkuCodes).toHaveBeenCalledWith(['ONB-BREAD-1']);
  });

  it('bulkCreateOnboardingItems rejects item presets outside the active mode', async () => {
    const useCase = buildBulkCreateOnboardingItemsUseCase({
      createItemUseCase: jest.fn(),
      getAllSettingsUseCase: jest.fn().mockResolvedValue({
        success: true,
        data: {
          ops_workflow_mode: { value: 'services' }
        }
      })
    });

    const result = await useCase({
      rows: [
        { client_row_id: 'row-1', mode_item_preset: 'menu_item', name: 'Combo Meal', default_sale_price: 99 }
      ]
    });

    expect(result.success).toBe(true);
    expect(result.data.summary.failed).toBe(1);
    expect(result.data.results[0].errors.join(' ')).toMatch(/not valid for services mode/i);
  });
});

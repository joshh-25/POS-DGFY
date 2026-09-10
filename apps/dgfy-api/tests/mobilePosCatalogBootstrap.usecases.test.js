import { describe, expect, it, jest } from '@jest/globals';
import { buildGetMobilePosCatalogBootstrapUseCase } from '../src/modules/pos/usecases/mobilePosUseCases.js';

describe('mobile POS catalog bootstrap option contracts', () => {
  it('embeds active service options and the existing F&B modifier snapshot in one catalog request', async () => {
    const listPosCatalogUseCase = jest.fn().mockResolvedValue({
      success: true,
      data: [
        {
          item_id: 11,
          item_name: 'Haircut',
          serviceDetail: { addons_enabled: true },
          fnbModifierGroups: [{ modifier_group_id: 91, name: 'Size' }]
        },
        {
          item_id: 12,
          item_name: 'Consultation',
          serviceDetail: { addons_enabled: false }
        }
      ]
    });
    const serviceOptionRepository = {
      getItemOptionGroupsByItemIds: jest.fn().mockResolvedValue(new Map([
        [11, [
          {
            group_id: 21,
            name: 'Stylist',
            group_type: 'variation',
            selection_type: 'single',
            min_selections: 1,
            max_selections: 1,
            is_required: true,
            options: [{ option_id: 31, name: 'Senior', price_adjustment_centavos: 5000 }]
          },
          {
            group_id: 22,
            name: 'Treatment',
            group_type: 'addon',
            selection_type: 'multi',
            options: [{ option_id: 32, name: 'Conditioner', duration_adjustment_minutes: 10 }]
          }
        ]],
        [12, [{
          group_id: 23,
          name: 'Extra',
          group_type: 'addon',
          options: [{ option_id: 33, name: 'Follow-up' }]
        }]]
      ]))
    };

    const useCase = buildGetMobilePosCatalogBootstrapUseCase({
      listPosCatalogUseCase,
      serviceOptionRepository
    });
    const result = await useCase({ query: { location_id: 7 }, user: { user_id: 5 } });

    expect(result.success).toBe(true);
    expect(serviceOptionRepository.getItemOptionGroupsByItemIds).toHaveBeenCalledWith(
      [11, 12],
      null,
      { activeOnly: true }
    );
    expect(result.data.catalog[0].fnb_modifier_groups).toEqual([
      { modifier_group_id: 91, name: 'Size' }
    ]);
    expect(result.data.catalog[0].service_option_groups).toEqual([
      expect.objectContaining({ group_id: 21, is_required: true }),
      expect.objectContaining({ group_id: 22, selection_type: 'multi' })
    ]);
    expect(result.data.catalog[0].service_option_groups[0].options[0]).toEqual(
      expect.objectContaining({ option_id: 31, price_adjustment_centavos: 5000 })
    );
    expect(result.data.catalog[1].service_option_groups).toEqual([]);
  });

  it('keeps the bootstrap backward compatible when option storage is unavailable', async () => {
    const useCase = buildGetMobilePosCatalogBootstrapUseCase({
      listPosCatalogUseCase: jest.fn().mockResolvedValue({
        success: true,
        data: [{ item_id: 1 }]
      })
    });

    const result = await useCase({ query: {}, user: null });

    expect(result.success).toBe(true);
    expect(result.data.catalog[0]).toEqual(expect.objectContaining({
      item_id: 1,
      fnb_modifier_groups: [],
      service_option_groups: []
    }));
  });
});

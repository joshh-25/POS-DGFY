import { jest } from '@jest/globals';
import { buildCalculateServiceQuoteUseCase } from '../src/modules/services/usecases/calculateServiceQuoteUseCase.js';
import { buildManageServiceOptionGroupsUseCase } from '../src/modules/services/usecases/manageServiceOptionGroupsUseCase.js';

describe('Service Options & Quote Calculation Use Cases', () => {
  let mockServiceRepository;
  let mockServiceOptionRepository;

  beforeEach(() => {
    mockServiceRepository = {
      findServiceItemById: jest.fn()
    };
    mockServiceOptionRepository = {
      findOptionGroups: jest.fn(),
      findOptionGroupById: jest.fn(),
      createOptionGroup: jest.fn(),
      updateOptionGroup: jest.fn(),
      createOption: jest.fn(),
      updateOption: jest.fn(),
      findOptionById: jest.fn(),
      findOptionsByIds: jest.fn(),
      assignItemOptionGroups: jest.fn(),
      getItemOptionGroups: jest.fn(),
      isOptionReferencedByBookings: jest.fn()
    };
  });

  describe('calculateServiceQuoteUseCase', () => {
    it('calculates authoritative quote with base price, variations, add-ons, and duration adjustments', async () => {
      mockServiceRepository.findServiceItemById.mockResolvedValue({
        item_id: 10,
        name: 'Haircut & Styling',
        default_sale_price: '500.00',
        serviceDetail: {
          duration_minutes: 45,
          buffer_before_minutes: 5,
          buffer_after_minutes: 10,
          addons_enabled: true
        }
      });

      mockServiceOptionRepository.getItemOptionGroups.mockResolvedValue([
        {
          group_id: 1,
          name: 'Hair Length Variation',
          group_type: 'variation',
          selection_type: 'single',
          is_required: true,
          min_selections: 1,
          max_selections: 1
        },
        {
          group_id: 2,
          name: 'Scalp Treatment Add-on',
          group_type: 'addon',
          selection_type: 'single',
          is_required: false,
          min_selections: 0,
          max_selections: 1
        }
      ]);

      mockServiceOptionRepository.findOptionsByIds.mockResolvedValue([
        {
          option_id: 101,
          group_id: 1,
          name: 'Long Hair (+15 min)',
          price_adjustment_centavos: 15000,
          duration_adjustment_minutes: 15,
          status: 'active',
          group: { name: 'Hair Length Variation', group_type: 'variation' }
        },
        {
          option_id: 201,
          group_id: 2,
          name: 'Organic Scalp Serum',
          price_adjustment_centavos: 25000,
          duration_adjustment_minutes: 10,
          status: 'active',
          group: { name: 'Scalp Treatment Add-on', group_type: 'addon' }
        }
      ]);

      const useCase = buildCalculateServiceQuoteUseCase({
        serviceRepository: mockServiceRepository,
        serviceOptionRepository: mockServiceOptionRepository
      });

      const result = await useCase.calculateQuote({
        serviceItemId: 10,
        selectedOptionIds: [101, 201],
        quantity: 2
      });

      expect(result.success).toBe(true);
      expect(result.data.quote).toEqual({
        service_item_id: 10,
        service_name: 'Haircut & Styling',
        quantity: 2,
        base_price_centavos: 50000,
        options_price_adjustment_centavos: 40000,
        unit_price_centavos: 90000,
        total_price_centavos: 180000,
        unit_price_pesos: '900.00',
        total_price_pesos: '1800.00',
        base_duration_minutes: 45,
        options_duration_adjustment_minutes: 25,
        final_duration_minutes: 70,
        total_slot_minutes: 85,
        selected_options: [
          {
            option_id: 101,
            group_id: 1,
            group_name: 'Hair Length Variation',
            group_type: 'variation',
            name: 'Long Hair (+15 min)',
            price_adjustment_centavos: 15000,
            duration_adjustment_minutes: 15,
            linked_physical_item_id: null
          },
          {
            option_id: 201,
            group_id: 2,
            group_name: 'Scalp Treatment Add-on',
            group_type: 'addon',
            name: 'Organic Scalp Serum',
            price_adjustment_centavos: 25000,
            duration_adjustment_minutes: 10,
            linked_physical_item_id: null
          }
        ],
        physical_addons: []
      });
    });

    it('rejects quote when required option group is missing', async () => {
      mockServiceRepository.findServiceItemById.mockResolvedValue({
        item_id: 10,
        name: 'Haircut',
        default_sale_price: '300.00',
        serviceDetail: { duration_minutes: 30 }
      });

      mockServiceOptionRepository.getItemOptionGroups.mockResolvedValue([
        {
          group_id: 1,
          name: 'Hair Length',
          is_required: true,
          min_selections: 1,
          max_selections: 1
        }
      ]);

      mockServiceOptionRepository.findOptionsByIds.mockResolvedValue([]);

      const useCase = buildCalculateServiceQuoteUseCase({
        serviceRepository: mockServiceRepository,
        serviceOptionRepository: mockServiceOptionRepository
      });

      const result = await useCase.calculateQuote({
        serviceItemId: 10,
        selectedOptionIds: []
      });

      expect(result.success).toBe(false);
      expect(result.error.message).toContain('Required option group "Hair Length" requires at least 1 selection(s)');
    });

    it('rejects an add-on selection when add-ons are disabled for the service', async () => {
      mockServiceRepository.findServiceItemById.mockResolvedValue({
        item_id: 10,
        name: 'Haircut',
        default_sale_price: '300.00',
        serviceDetail: { duration_minutes: 30, addons_enabled: false }
      });
      mockServiceOptionRepository.getItemOptionGroups.mockResolvedValue([{
        group_id: 2,
        name: 'Treatments',
        group_type: 'addon',
        is_required: false,
        min_selections: 0,
        max_selections: 2
      }]);
      mockServiceOptionRepository.findOptionsByIds.mockResolvedValue([{
        option_id: 21,
        group_id: 2,
        name: 'Conditioning',
        status: 'active'
      }]);

      const useCase = buildCalculateServiceQuoteUseCase({
        serviceRepository: mockServiceRepository,
        serviceOptionRepository: mockServiceOptionRepository
      });
      const result = await useCase.calculateQuote({ serviceItemId: 10, selectedOptionIds: [21] });

      expect(result.success).toBe(false);
      expect(result.error.message).toBe('Add-ons are disabled for this service');
    });

    it('does not require add-on group selections when add-ons are disabled', async () => {
      mockServiceRepository.findServiceItemById.mockResolvedValue({
        item_id: 10,
        name: 'Haircut',
        default_sale_price: '300.00',
        serviceDetail: { duration_minutes: 30, addons_enabled: false }
      });
      mockServiceOptionRepository.getItemOptionGroups.mockResolvedValue([{
        group_id: 2,
        name: 'Required Treatment',
        group_type: 'addon',
        is_required: true,
        min_selections: 1,
        max_selections: 1
      }]);
      mockServiceOptionRepository.findOptionsByIds.mockResolvedValue([]);

      const useCase = buildCalculateServiceQuoteUseCase({
        serviceRepository: mockServiceRepository,
        serviceOptionRepository: mockServiceOptionRepository
      });
      const result = await useCase.calculateQuote({ serviceItemId: 10, selectedOptionIds: [] });

      expect(result.success).toBe(true);
      expect(result.data.quote.total_price_centavos).toBe(30000);
    });
  });

  describe('manageServiceOptionGroupsUseCase', () => {
    it('creates an option group with valid options', async () => {
      mockServiceOptionRepository.createOptionGroup.mockResolvedValue({ group_id: 5 });
      mockServiceOptionRepository.findOptionGroupById.mockResolvedValue({
        group_id: 5,
        name: 'Add-ons',
        options: [{ option_id: 1, name: 'Extra Shampoo' }]
      });

      const useCase = buildManageServiceOptionGroupsUseCase({
        serviceOptionRepository: mockServiceOptionRepository
      });

      const result = await useCase.createOptionGroup({
        name: 'Add-ons',
        group_type: 'addon',
        selection_type: 'multi',
        options: [{ name: 'Extra Shampoo', price_adjustment_centavos: 5000 }]
      });

      expect(result.success).toBe(true);
      expect(mockServiceOptionRepository.createOptionGroup).toHaveBeenCalled();
      expect(mockServiceOptionRepository.createOption).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Extra Shampoo', price_adjustment_centavos: 5000 })
      );
    });
  });
});

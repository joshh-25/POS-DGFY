import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

const fail = (error) => ({ success: false, error });
const ok = (data) => ({ success: true, data });

export const buildCalculateServiceQuoteUseCase = ({ serviceRepository, serviceOptionRepository }) => ({
  async calculateQuote({ serviceItemId, selectedOptionIds = [], quantity = 1, tenantId, transaction = null }) {
    const itemId = Number(serviceItemId);
    const normalizedQuantity = Number.isInteger(Number(quantity)) && Number(quantity) >= 1 ? Number(quantity) : 1;
    if (!itemId) {
      return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Valid serviceItemId is required'));
    }

    try {
      const serviceItem = await serviceRepository.findServiceItemById(itemId, {
        transaction,
        lock: Boolean(transaction)
      });
      if (!serviceItem) {
        return fail(new DomainError(DomainErrorCode.NOT_FOUND, 'Service item not found'));
      }

      const serviceDetail = serviceItem.serviceDetail || serviceItem.service_detail || {};
      const addonsEnabled = serviceDetail.addons_enabled === true;
      const assignedGroups = await serviceOptionRepository.getItemOptionGroups(itemId, tenantId, {
        activeOnly: true,
        transaction
      });
      const selectableGroups = (assignedGroups || []).filter(
        (group) => group.group_type !== 'addon' || addonsEnabled
      );
      const normalizedOptionIds = [...new Set((Array.isArray(selectedOptionIds) ? selectedOptionIds : [])
        .map(Number)
        .filter(Boolean))];

      const selectedOptions = normalizedOptionIds.length > 0
        ? await serviceOptionRepository.findOptionsByIds(normalizedOptionIds, tenantId, { transaction })
        : [];

      // Validate selected options belong to active assigned groups
      const allAssignedGroupMap = new Map((assignedGroups || []).map((group) => [group.group_id, group]));
      const assignedGroupMap = new Map(selectableGroups.map((group) => [group.group_id, group]));
      const selectedByGroup = new Map();

      for (const option of selectedOptions) {
        if (option.status !== 'active') {
          return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, `Selected option "${option.name}" is inactive`));
        }
        const assignedGroup = allAssignedGroupMap.get(option.group_id);
        if (assignedGroup?.group_type === 'addon' && !addonsEnabled) {
          return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Add-ons are disabled for this service'));
        }
        if (!assignedGroupMap.has(option.group_id)) {
          return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, `Option "${option.name}" is not eligible for this service`));
        }
        const existing = selectedByGroup.get(option.group_id) || [];
        existing.push(option);
        selectedByGroup.set(option.group_id, existing);
      }

      // Check min/max selection limits for assigned groups
      for (const group of selectableGroups) {
        const selections = selectedByGroup.get(group.group_id) || [];
        const count = selections.length;

        if (group.is_required && count < Math.max(1, group.min_selections)) {
          return fail(new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            `Required option group "${group.name}" requires at least ${Math.max(1, group.min_selections)} selection(s)`
          ));
        }
        if (group.min_selections > 0 && count < group.min_selections) {
          return fail(new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            `Option group "${group.name}" requires at least ${group.min_selections} selection(s)`
          ));
        }
        if (count > group.max_selections) {
          return fail(new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            `Option group "${group.name}" allows at most ${group.max_selections} selection(s)`
          ));
        }
      }

      const basePricePesos = Number(serviceItem.default_sale_price) || 0;
      const basePriceCentavos = Math.round(basePricePesos * 100);
      const optionsPriceAdjustmentCentavos = selectedOptions.reduce(
        (sum, opt) => sum + (Number(opt.price_adjustment_centavos) || 0),
        0
      );

      const unitPriceCentavos = basePriceCentavos + optionsPriceAdjustmentCentavos;
      const totalPriceCentavos = unitPriceCentavos * normalizedQuantity;

      const baseDurationMinutes = Number(serviceDetail.duration_minutes) || 60;
      const optionsDurationAdjustmentMinutes = selectedOptions.reduce(
        (sum, opt) => sum + (Number(opt.duration_adjustment_minutes) || 0),
        0
      );

      const finalDurationMinutes = Math.max(1, baseDurationMinutes + optionsDurationAdjustmentMinutes);
      const bufferBeforeMinutes = Number(serviceDetail.buffer_before_minutes) || 0;
      const bufferAfterMinutes = Number(serviceDetail.buffer_after_minutes) || 0;

      const physicalAddons = selectedOptions
        .filter((opt) => opt.linked_physical_item_id)
        .map((opt) => ({
          option_id: opt.option_id,
          name: opt.name,
          linked_physical_item_id: opt.linked_physical_item_id,
          quantity: normalizedQuantity
        }));

      return ok({
        quote: {
          service_item_id: itemId,
          service_name: serviceItem.name,
          quantity: normalizedQuantity,
          base_price_centavos: basePriceCentavos,
          options_price_adjustment_centavos: optionsPriceAdjustmentCentavos,
          unit_price_centavos: unitPriceCentavos,
          total_price_centavos: totalPriceCentavos,
          unit_price_pesos: (unitPriceCentavos / 100).toFixed(2),
          total_price_pesos: (totalPriceCentavos / 100).toFixed(2),
          base_duration_minutes: baseDurationMinutes,
          options_duration_adjustment_minutes: optionsDurationAdjustmentMinutes,
          final_duration_minutes: finalDurationMinutes,
          total_slot_minutes: finalDurationMinutes + bufferBeforeMinutes + bufferAfterMinutes,
          selected_options: selectedOptions.map((opt) => ({
            option_id: opt.option_id,
            group_id: opt.group_id,
            group_name: opt.group?.name || '',
            group_type: opt.group?.group_type || 'addon',
            name: opt.name,
            price_adjustment_centavos: Number(opt.price_adjustment_centavos) || 0,
            duration_adjustment_minutes: Number(opt.duration_adjustment_minutes) || 0,
            linked_physical_item_id: opt.linked_physical_item_id || null
          })),
          physical_addons: physicalAddons
        }
      });
    } catch (error) {
      return fail(new DomainError(DomainErrorCode.INTERNAL_ERROR, 'Failed to calculate service quote', error));
    }
  }
});

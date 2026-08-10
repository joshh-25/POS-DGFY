import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

const fail = (error) => ({ success: false, error });
const ok = (data) => ({ success: true, data });

export const buildManageServiceOptionGroupsUseCase = ({ serviceOptionRepository }) => ({
  async listOptionGroups({ tenantId, status }) {
    try {
      const groups = await serviceOptionRepository.findOptionGroups(tenantId, { status });
      return ok({ groups });
    } catch (error) {
      return fail(new DomainError(DomainErrorCode.INTERNAL_ERROR, 'Failed to list service option groups', error));
    }
  },

  async getOptionGroupById({ groupId, tenantId }) {
    try {
      const group = await serviceOptionRepository.findOptionGroupById(groupId, tenantId);
      if (!group) {
        return fail(new DomainError(DomainErrorCode.NOT_FOUND, 'Service option group not found'));
      }
      return ok({ group });
    } catch (error) {
      return fail(new DomainError(DomainErrorCode.INTERNAL_ERROR, 'Failed to get service option group', error));
    }
  },

  async createOptionGroup({ tenantId, name, description, group_type, selection_type, min_selections, max_selections, is_required, display_order, options = [] }) {
    if (!name || typeof name !== 'string' || !name.trim()) {
      return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Group name is required'));
    }

    try {
      const groupPayload = {
        tenant_id: tenantId || null,
        name: name.trim(),
        description: description ? String(description).trim() : null,
        group_type: group_type === 'variation' ? 'variation' : 'addon',
        selection_type: selection_type === 'multi' ? 'multi' : 'single',
        min_selections: Number.isInteger(min_selections) && min_selections >= 0 ? min_selections : 0,
        max_selections: Number.isInteger(max_selections) && max_selections >= 1 ? max_selections : 1,
        is_required: Boolean(is_required),
        display_order: Number.isInteger(display_order) ? display_order : 0,
        status: 'active'
      };

      const group = await serviceOptionRepository.createOptionGroup(groupPayload);

      if (Array.isArray(options) && options.length > 0) {
        for (let i = 0; i < options.length; i += 1) {
          const opt = options[i];
          if (opt && opt.name) {
            await serviceOptionRepository.createOption({
              group_id: group.group_id,
              tenant_id: tenantId || null,
              name: String(opt.name).trim(),
              description: opt.description ? String(opt.description).trim() : null,
              price_adjustment_centavos: Number(opt.price_adjustment_centavos) || 0,
              duration_adjustment_minutes: Number(opt.duration_adjustment_minutes) || 0,
              linked_physical_item_id: opt.linked_physical_item_id ? Number(opt.linked_physical_item_id) : null,
              display_order: Number.isInteger(opt.display_order) ? opt.display_order : i,
              status: opt.status === 'inactive' ? 'inactive' : 'active'
            });
          }
        }
      }

      const fullGroup = await serviceOptionRepository.findOptionGroupById(group.group_id, tenantId);
      return ok({ group: fullGroup });
    } catch (error) {
      return fail(new DomainError(DomainErrorCode.INTERNAL_ERROR, 'Failed to create service option group', error));
    }
  },

  async updateOptionGroup({ groupId, tenantId, name, description, group_type, selection_type, min_selections, max_selections, is_required, display_order, status }) {
    try {
      const existing = await serviceOptionRepository.findOptionGroupById(groupId, tenantId);
      if (!existing) {
        return fail(new DomainError(DomainErrorCode.NOT_FOUND, 'Service option group not found'));
      }

      const patch = {};
      if (name !== undefined) patch.name = String(name).trim();
      if (description !== undefined) patch.description = description ? String(description).trim() : null;
      if (group_type !== undefined) patch.group_type = group_type === 'variation' ? 'variation' : 'addon';
      if (selection_type !== undefined) patch.selection_type = selection_type === 'multi' ? 'multi' : 'single';
      if (min_selections !== undefined) patch.min_selections = Number(min_selections) || 0;
      if (max_selections !== undefined) patch.max_selections = Number(max_selections) || 1;
      if (is_required !== undefined) patch.is_required = Boolean(is_required);
      if (display_order !== undefined) patch.display_order = Number(display_order) || 0;
      if (status !== undefined) patch.status = status === 'inactive' ? 'inactive' : 'active';

      const updated = await serviceOptionRepository.updateOptionGroup(groupId, patch, tenantId);
      return ok({ group: updated });
    } catch (error) {
      return fail(new DomainError(DomainErrorCode.INTERNAL_ERROR, 'Failed to update service option group', error));
    }
  },

  async deactivateOption({ optionId, tenantId }) {
    try {
      const option = await serviceOptionRepository.findOptionById(optionId, tenantId);
      if (!option) {
        return fail(new DomainError(DomainErrorCode.NOT_FOUND, 'Service option not found'));
      }

      const updated = await serviceOptionRepository.updateOption(optionId, { status: 'inactive' }, tenantId);
      return ok({ option: updated });
    } catch (error) {
      return fail(new DomainError(DomainErrorCode.INTERNAL_ERROR, 'Failed to deactivate service option', error));
    }
  },

  async assignItemOptionGroups({ itemId, groupIds, tenantId }) {
    try {
      const groups = await serviceOptionRepository.assignItemOptionGroups(itemId, groupIds, tenantId);
      return ok({ groups });
    } catch (error) {
      return fail(new DomainError(DomainErrorCode.INTERNAL_ERROR, 'Failed to assign item option groups', error));
    }
  },

  async getItemOptionGroups({ itemId, tenantId, activeOnly = true }) {
    try {
      const groups = await serviceOptionRepository.getItemOptionGroups(itemId, tenantId, { activeOnly });
      return ok({ groups });
    } catch (error) {
      return fail(new DomainError(DomainErrorCode.INTERNAL_ERROR, 'Failed to get item option groups', error));
    }
  }
});

import { validateItemAgainstModeTaxonomy } from '../../shared/constants/modeItemTaxonomy.js';

export const buildUpdateItemUseCase = ({ itemRepository, resolveWorkflowMode, resolveEnabledCapabilities = async () => [] }) => {
    return async ({ itemId, itemData, userId, canManageCategories = false }) => {
        const [workflowMode, enabledCapabilities, existingItem] = await Promise.all([
            resolveWorkflowMode(),
            resolveEnabledCapabilities(),
            itemRepository.getItemById(itemId)
        ]);
        const validation = validateItemAgainstModeTaxonomy({
            workflowMode,
            enabledCapabilities,
            itemData,
            existingItem,
            operation: 'update'
        });
        const dataToUpdate = validation.preset && !itemData.mode_item_preset
            ? { ...itemData, mode_item_preset: validation.preset.key }
            : itemData;
        return itemRepository.updateItem(itemId, dataToUpdate, userId, { canManageCategories });
    };
};

import { validateItemAgainstModeTaxonomy } from '../../shared/constants/modeItemTaxonomy.js';

export const buildUpdateItemUseCase = ({ itemRepository, resolveWorkflowMode }) => {
    return async ({ itemId, itemData, userId, canManageCategories = false }) => {
        const workflowMode = await resolveWorkflowMode();
        const existingItem = await itemRepository.getItemById(itemId);
        const validation = validateItemAgainstModeTaxonomy({
            workflowMode,
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

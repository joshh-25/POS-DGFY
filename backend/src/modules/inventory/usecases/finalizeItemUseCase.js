import { validateItemAgainstModeTaxonomy } from '../../shared/constants/modeItemTaxonomy.js';

export const buildFinalizeItemUseCase = ({ itemRepository, resolveWorkflowMode, resolveEnabledCapabilities = async () => [] }) => {
    return async ({ itemId, itemData, userId }) => {
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
            operation: 'finalize'
        });
        const dataToFinalize = validation.preset && !itemData.mode_item_preset
            ? { ...itemData, mode_item_preset: validation.preset.key }
            : itemData;
        return itemRepository.finalizeItem(itemId, dataToFinalize, userId);
    };
};

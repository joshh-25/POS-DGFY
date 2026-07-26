import { validateItemAgainstModeTaxonomy } from '../../shared/constants/modeItemTaxonomy.js';

export const buildCreateItemUseCase = ({ itemRepository, resolveWorkflowMode, resolveEnabledCapabilities = async () => [] }) => {
    return async ({ itemData, userId, canManageCategories = false }) => {
        const [workflowMode, enabledCapabilities] = await Promise.all([
            resolveWorkflowMode(),
            resolveEnabledCapabilities()
        ]);
        const validation = validateItemAgainstModeTaxonomy({
            workflowMode,
            enabledCapabilities,
            itemData,
            operation: 'create'
        });
        const dataToCreate = validation.preset && !itemData.mode_item_preset
            ? { ...itemData, mode_item_preset: validation.preset.key }
            : itemData;
        return itemRepository.createItem(dataToCreate, userId, { canManageCategories });
    };
};

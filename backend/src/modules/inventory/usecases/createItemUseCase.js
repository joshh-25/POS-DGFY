import { validateItemAgainstModeTaxonomy } from '../../shared/constants/modeItemTaxonomy.js';

export const buildCreateItemUseCase = ({ itemRepository, resolveWorkflowMode }) => {
    return async ({ itemData, userId }) => {
        const workflowMode = await resolveWorkflowMode();
        const validation = validateItemAgainstModeTaxonomy({
            workflowMode,
            itemData,
            operation: 'create'
        });
        const dataToCreate = validation.preset && !itemData.mode_item_preset
            ? { ...itemData, mode_item_preset: validation.preset.key }
            : itemData;
        return itemRepository.createItem(dataToCreate, userId);
    };
};

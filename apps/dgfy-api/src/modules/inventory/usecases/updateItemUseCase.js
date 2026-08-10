import { validateItemAgainstModeTaxonomy } from '../../shared/constants/modeItemTaxonomy.js';
import { assertTrackingModeAuthorizedForInventoryAuthority } from './inventoryAuthorityTrackingModeGate.js';
import { DEFAULT_INVENTORY_AUTHORITY } from '@sieitzz/shared-constants/workflowModes';

export const buildUpdateItemUseCase = ({
    itemRepository,
    resolveWorkflowMode,
    resolveEnabledCapabilities = async () => [],
    resolveDisabledCapabilities = async () => [],
    resolveInventoryAuthority = async () => DEFAULT_INVENTORY_AUTHORITY
}) => {
    return async ({ itemId, itemData, userId, canManageCategories = false }) => {
        const [workflowMode, enabledCapabilities, disabledCapabilities, inventoryAuthority, existingItem] = await Promise.all([
            resolveWorkflowMode(),
            resolveEnabledCapabilities(),
            resolveDisabledCapabilities(),
            resolveInventoryAuthority(),
            itemRepository.getItemById(itemId)
        ]);
        assertTrackingModeAuthorizedForInventoryAuthority({ itemData, inventoryAuthority });
        const validation = validateItemAgainstModeTaxonomy({
            workflowMode,
            enabledCapabilities,
            disabledCapabilities,
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

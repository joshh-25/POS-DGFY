import {
    normalizePosCatalogItemData,
    validateItemAgainstModeTaxonomy
} from '../../shared/constants/modeItemTaxonomy.js';
import { assertTrackingModeAuthorizedForInventoryAuthority } from './inventoryAuthorityTrackingModeGate.js';
import { DEFAULT_INVENTORY_AUTHORITY } from '@sieitzz/shared-constants/workflowModes';

export const buildUpdateItemUseCase = ({
    itemRepository,
    resolveWorkflowMode,
    resolveEnabledCapabilities = async () => [],
    resolveDisabledCapabilities = async () => [],
    resolveInventoryAuthority = async () => DEFAULT_INVENTORY_AUTHORITY
}) => {
    return async ({ itemId, itemData, userId, canManageCategories = false, source = 'inventory' }) => {
        const [workflowMode, enabledCapabilities, disabledCapabilities, inventoryAuthority, existingItem] = await Promise.all([
            resolveWorkflowMode(),
            resolveEnabledCapabilities(),
            resolveDisabledCapabilities(),
            resolveInventoryAuthority(),
            itemRepository.getItemById(itemId)
        ]);
        assertTrackingModeAuthorizedForInventoryAuthority({ itemData, inventoryAuthority });
        const taxonomyItemData = source === 'pos'
            ? normalizePosCatalogItemData({
                workflowMode,
                enabledCapabilities,
                disabledCapabilities,
                itemData,
                existingItem
            })
            : itemData;
        const validation = validateItemAgainstModeTaxonomy({
            workflowMode,
            enabledCapabilities,
            disabledCapabilities,
            itemData: taxonomyItemData,
            existingItem,
            operation: 'update'
        });
        const dataToUpdate = validation.preset && !taxonomyItemData.mode_item_preset
            ? { ...taxonomyItemData, mode_item_preset: validation.preset.key }
            : taxonomyItemData;
        return itemRepository.updateItem(itemId, dataToUpdate, userId, { canManageCategories });
    };
};

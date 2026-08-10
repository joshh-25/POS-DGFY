import { validateItemAgainstModeTaxonomy } from '../../shared/constants/modeItemTaxonomy.js';
import { assertTrackingModeAuthorizedForInventoryAuthority } from './inventoryAuthorityTrackingModeGate.js';
import { DEFAULT_INVENTORY_AUTHORITY } from '@sieitzz/shared-constants/workflowModes';

export const buildFinalizeItemUseCase = ({
    itemRepository,
    resolveWorkflowMode,
    resolveEnabledCapabilities = async () => [],
    resolveDisabledCapabilities = async () => [],
    resolveInventoryAuthority = async () => DEFAULT_INVENTORY_AUTHORITY
}) => {
    return async ({ itemId, itemData, userId }) => {
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
            operation: 'finalize'
        });
        const dataToFinalize = validation.preset && !itemData.mode_item_preset
            ? { ...itemData, mode_item_preset: validation.preset.key }
            : itemData;
        return itemRepository.finalizeItem(itemId, dataToFinalize, userId);
    };
};

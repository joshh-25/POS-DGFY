import { validateItemAgainstModeTaxonomy } from '../../shared/constants/modeItemTaxonomy.js';
import { assertTrackingModeAuthorizedForInventoryAuthority } from './inventoryAuthorityTrackingModeGate.js';
import { DEFAULT_INVENTORY_AUTHORITY } from '@sieitzz/shared-constants/workflowModes';

export const buildCreateItemUseCase = ({
    itemRepository,
    resolveWorkflowMode,
    resolveEnabledCapabilities = async () => [],
    resolveDisabledCapabilities = async () => [],
    resolveInventoryAuthority = async () => DEFAULT_INVENTORY_AUTHORITY
}) => {
    return async ({ itemData, userId, canManageCategories = false }) => {
        const [workflowMode, enabledCapabilities, disabledCapabilities, inventoryAuthority] = await Promise.all([
            resolveWorkflowMode(),
            resolveEnabledCapabilities(),
            resolveDisabledCapabilities(),
            resolveInventoryAuthority()
        ]);
        assertTrackingModeAuthorizedForInventoryAuthority({ itemData, inventoryAuthority });
        const validation = validateItemAgainstModeTaxonomy({
            workflowMode,
            enabledCapabilities,
            disabledCapabilities,
            itemData,
            operation: 'create'
        });
        const dataToCreate = validation.preset && !itemData.mode_item_preset
            ? { ...itemData, mode_item_preset: validation.preset.key }
            : itemData;
        return itemRepository.createItem(dataToCreate, userId, { canManageCategories });
    };
};

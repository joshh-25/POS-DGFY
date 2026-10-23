import {
    normalizePosCatalogItemData,
    validateItemAgainstModeTaxonomy
} from '../../shared/constants/modeItemTaxonomy.js';
import { assertTrackingModeAuthorizedForInventoryAuthority } from './inventoryAuthorityTrackingModeGate.js';
import { DEFAULT_INVENTORY_AUTHORITY } from '@sieitzz/shared-constants/workflowModes';

export const buildCreateItemUseCase = ({
    itemRepository,
    resolveWorkflowMode,
    resolveEnabledCapabilities = async () => [],
    resolveDisabledCapabilities = async () => [],
    resolveInventoryAuthority = async () => DEFAULT_INVENTORY_AUTHORITY
}) => {
    return async ({ itemData, userId, canManageCategories = false, source = 'inventory' }) => {
        const [workflowMode, enabledCapabilities, disabledCapabilities, inventoryAuthority] = await Promise.all([
            resolveWorkflowMode(),
            resolveEnabledCapabilities(),
            resolveDisabledCapabilities(),
            resolveInventoryAuthority()
        ]);
        assertTrackingModeAuthorizedForInventoryAuthority({ itemData, inventoryAuthority });
        const taxonomyItemData = source === 'pos'
            ? normalizePosCatalogItemData({
                workflowMode,
                enabledCapabilities,
                disabledCapabilities,
                itemData
            })
            : itemData;
        const validation = validateItemAgainstModeTaxonomy({
            workflowMode,
            enabledCapabilities,
            disabledCapabilities,
            itemData: taxonomyItemData,
            operation: 'create'
        });
        const dataToCreate = validation.preset && !taxonomyItemData.mode_item_preset
            ? { ...taxonomyItemData, mode_item_preset: validation.preset.key }
            : taxonomyItemData;
        return itemRepository.createItem(dataToCreate, userId, { canManageCategories });
    };
};

import { PERMISSIONS } from '../../../config/permissions.js';
import { hasEffectivePermission } from '../../../utils/userPermissions.js';

export const buildGetItemByIdUseCase = ({ itemRepository }) => {
    return async ({ itemId, query = {}, user = null }) => {
        // #1495 Part A: same include_inactive permission gate as getItemsUseCase -- needed so
        // "view details" on an item surfaced by the inactive-inclusive list doesn't 404/degrade.
        const includeInactiveRequested = query?.include_inactive === true || query?.include_inactive === 'true';
        const canViewInactive = includeInactiveRequested && hasEffectivePermission(user, PERMISSIONS.INVENTORY.actions.DELETE_ITEMS);

        return itemRepository.getItemById(itemId, { ...query, include_inactive: canViewInactive });
    };
};

import { PERMISSIONS } from '../../../config/permissions.js';
import { hasEffectivePermission } from '../../../utils/userPermissions.js';

export const buildGetItemsUseCase = ({ itemRepository, resolveLocationScope = null }) => {
    return async ({ query = {}, user = null }) => {
        // #682: only resolve+grant-check a location when one is actually requested. Calling
        // resolveLocationScope unconditionally would reject the (correct, default) omitted case
        // with a 422 once multi-location inventory is enabled with more than one active location
        // -- that's the right behavior for a stock-mutating command, but wrong for this read
        // default, where omitted must mean "tenant-wide aggregate", not an error.
        if (query?.location_id && typeof resolveLocationScope === 'function') {
            await resolveLocationScope({
                requestedLocationId: query.location_id,
                userId: user?.user_id,
                operationLabel: 'Items list read'
            });
        }

        // #1495 Part A: include_inactive is permission-gated here (same permission as restore/
        // delete) rather than 403ing an unauthorized request -- a staff-role user manually
        // appending ?include_inactive=true should just silently not see deleted items, matching
        // how location_id scoping already fails soft above rather than hard.
        const includeInactiveRequested = query?.include_inactive === true || query?.include_inactive === 'true';
        const canViewInactive = includeInactiveRequested && hasEffectivePermission(user, PERMISSIONS.INVENTORY.actions.DELETE_ITEMS);

        return itemRepository.getItems({ ...query, include_inactive: canViewInactive });
    };
};

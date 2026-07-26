import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { TRACKING_MODE } from '../../shared/utils/stockBearingPolicy.js';

// Tracking modes that require the tenant to have delegated inventory-ledger
// authority to an external system (inventory_authority setting) before they
// become settable on an item. itemValidator.js's SETTABLE_TRACKING_MODES
// already structurally allows 'external_ims' through Joi (Joi has no tenant
// context to gate on), so this is the one place that actually enforces the
// tenant-conditional rule - mirroring how validateItemAgainstModeTaxonomy
// does tenant-conditional item validation at the use-case layer rather than
// in a validator. recipe_derived is not listed here because it stays out of
// SETTABLE_TRACKING_MODES entirely (frozen, never reaches this check).
const DELEGATION_GATED_TRACKING_MODES = Object.freeze([TRACKING_MODE.EXTERNAL_IMS]);

/**
 * Throws when itemData explicitly sets tracking_mode to a delegation-gated
 * value the tenant's inventory_authority setting does not authorize.
 * A no-op when tracking_mode is absent from itemData (nothing being set) or
 * set to a mode that isn't delegation-gated - existing items keep whatever
 * tracking_mode they already have without re-triggering this check on
 * unrelated edits.
 */
export const assertTrackingModeAuthorizedForInventoryAuthority = ({ itemData = {}, inventoryAuthority }) => {
    if (!Object.prototype.hasOwnProperty.call(itemData, 'tracking_mode')) return;

    const requestedMode = String(itemData.tracking_mode || '').trim().toLowerCase();
    if (!DELEGATION_GATED_TRACKING_MODES.includes(requestedMode)) return;

    if (inventoryAuthority === requestedMode) return;

    throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        `tracking_mode "${requestedMode}" requires the tenant's inventory_authority setting to be delegated to an external system first.`,
        {
            statusCode: 422,
            details: {
                reason_code: 'TRACKING_MODE_REQUIRES_DELEGATED_INVENTORY_AUTHORITY',
                tracking_mode: requestedMode,
                inventory_authority: inventoryAuthority
            }
        }
    );
};

export default assertTrackingModeAuthorizedForInventoryAuthority;

import { isDelegatedInventoryAuthority } from '@sieitzz/shared-constants/workflowModes';
import { resolveInventoryAuthority } from '../modules/shared/utils/inventoryAuthoritySettingsCache.js';

/**
 * Sibling to requireWorkflowCapability (middleware/workflowModeCapability.js)
 * for Phase 9's Axis 4 delegation switch. Deliberately NOT built on top of
 * requireWorkflowCapability - that gate is capability-set-driven (does this
 * workflow mode grant the 'inventory' capability at all), which would 403
 * every item write for MSME tenants (msme's capability set has no
 * 'inventory' entry). This gate is tenant-setting-driven instead: it stays a
 * no-op for the overwhelming majority of tenants (inventory_authority
 * defaults to 'platform') and only fails closed for a tenant that has
 * explicitly delegated its inventory ledger to an external system, and only
 * for the specific write this platform's own inventory module no longer
 * owns once that delegation is in effect.
 *
 * `shouldBlock(req)` lets a call site scope the block to a subset of
 * requests on a shared route (e.g. only when the payload actually declares
 * a stock quantity) rather than blocking the whole endpoint. Defaults to
 * "always block when delegated" for routes that are entirely about writing
 * this platform's own stock ledger (e.g. PO receiving).
 */
export const requireLocalInventoryLedgerOwnership = (operationLabel, { shouldBlock = () => true } = {}) => async (req, res, next) => {
    try {
        const inventoryAuthority = await resolveInventoryAuthority();
        if (!isDelegatedInventoryAuthority(inventoryAuthority) || !shouldBlock(req)) {
            return next();
        }

        return res.status(403).json({
            success: false,
            data: null,
            message: `${operationLabel} is not available: this tenant has delegated inventory ledger ownership to an external system.`,
            error_code: 'INVENTORY_AUTHORITY_DELEGATED_DENIED',
            errors: {
                operation: operationLabel,
                inventory_authority: inventoryAuthority
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        next(error);
    }
};

// Scopes the gate to requests whose body explicitly declares a stock
// quantity (current_stock) - item catalog metadata edits (name, price,
// barcodes, category) stay allowed for a delegated tenant; only a write
// that would directly overwrite the local mirror's quantity outside of the
// normal sale/receipt ledger flow is blocked.
export const bodyDeclaresCurrentStock = (req) => (
    Object.prototype.hasOwnProperty.call(req?.body || {}, 'current_stock')
    && req.body.current_stock !== undefined
    && req.body.current_stock !== null
    && req.body.current_stock !== ''
);

export default requireLocalInventoryLedgerOwnership;

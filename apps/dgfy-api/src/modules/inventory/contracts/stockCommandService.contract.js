/**
 * Stock command service contract (ADR 0029: "POS and Storefront may request
 * stock effects. Only Inventory records stock effects.").
 *
 * This formalizes the port that commands/stockCommandService.js already
 * implements and that other modules already consume via DI at their own
 * composition root (pos/index.js, purchaseOrders/index.js) - see
 * docs/features/INVENTORY_TRACKING_MODES.md's external_ims section, which
 * calls this file out by name as "already a duck-typed, DI-injected port".
 * Phase 9 adds the explicit contract (mirroring itemRepository.contract.js's
 * shape) so a mis-wired container can be asserted against and fails loudly
 * instead of a caller silently falling back to a different implementation
 * (see the removed `inventoryCommandService || stockMovementService`
 * pattern in posUseCases.js and the removed default-import fallback in
 * receivePurchaseOrderUseCase.js).
 *
 * Only createStockMovement is unconditionally required: it is the shared
 * primitive every named command wraps (see withMovementDefaults in
 * commands/stockCommandService.js), and it is what
 * executeInventoryStockCommand's dispatch helper in posUseCases.js falls
 * back to when a more specific named command is absent. The named commands
 * are listed separately so a caller can assert only the subset it actually
 * calls without requiring adapters to implement commands nothing calls yet
 * (transferStock/adjustStock/recordLoss have zero production callers today).
 */
export const StockCommandServiceCoreContract = Object.freeze([
    'createStockMovement'
]);

export const StockCommandServiceNamedCommands = Object.freeze([
    'validateStockIssueAvailability',
    'issueStockForPosSale',
    'issueStockForOnlineFulfillment',
    'issueStockForDispatch',
    'returnStockForVoidedSale',
    'receivePurchasedStock',
    'transferStock',
    'adjustStock',
    'consumeStockForProduction',
    'receiveProducedStock',
    'recordLoss'
]);

/**
 * Asserts the core contract (createStockMovement) plus whichever named
 * commands the caller actually depends on. `requiredCommands` defaults to
 * empty - most callers only need one or two named commands (e.g.
 * receivePurchaseOrderUseCase only needs receivePurchasedStock) and
 * shouldn't be forced to stub commands they never call.
 */
export const assertStockCommandServiceContract = (service, { requiredCommands = [] } = {}) => {
    StockCommandServiceCoreContract.forEach((method) => {
        if (typeof service?.[method] !== 'function') {
            throw new Error(`StockCommandService missing required method: ${method}`);
        }
    });

    requiredCommands.forEach((method) => {
        if (!StockCommandServiceNamedCommands.includes(method)) {
            throw new Error(`StockCommandService contract has no such named command: ${method}`);
        }
        if (typeof service?.[method] !== 'function') {
            throw new Error(`StockCommandService missing required method: ${method}`);
        }
    });
};

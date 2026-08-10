/**
 * Delegated inventory provider contract (Phase 9, ADR 0038 port pattern).
 *
 * The read-side seam for a tenant that has set inventory_authority to
 * 'external_ims': DGFY still owns the local mirror/ledger (see
 * stockBearingPolicy.js's TRACKING_MODE.EXTERNAL_IMS branch - tracks_quantity
 * and emits_movements stay true), but the *authoritative* on-hand quantity
 * for a delegated item is asked of this provider. Mirrors
 * itemRepository.contract.js's shape: a required-method allowlist plus an
 * assertion function, so a mis-wired DI container fails loudly at startup/
 * test time instead of silently no-op'ing.
 */
export const DelegatedInventoryProviderContract = Object.freeze([
    'lookupStockLevel'
]);

export const assertDelegatedInventoryProviderContract = (provider) => {
    DelegatedInventoryProviderContract.forEach((method) => {
        if (typeof provider?.[method] !== 'function') {
            throw new Error(`DelegatedInventoryProvider missing required method: ${method}`);
        }
    });
};

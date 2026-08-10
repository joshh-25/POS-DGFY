/**
 * Default delegated-inventory-provider backend (Phase 9).
 *
 * There is no live external IMS integrated in this codebase yet - the
 * Phase 9 plan's earlier draft named the eventual product "SKUpervisor",
 * which collides with ADR 0006's name for this platform's *own* inventory
 * frontend (frontend/apps/skupervisor), so this adapter and every name
 * around it is deliberately neutral instead ("delegated inventory
 * provider" / "external IMS").
 *
 * This backend is intentionally a documented no-op: it always reports
 * "not found", the same graceful-degrade posture buildOpenFoodFactsProductRegistry
 * exercises when a lookup misses, so callers consistently fall back to the
 * local mirror count (or manual entry) rather than ever getting a fabricated
 * remote number. A real adapter (an HTTP client against an actual external
 * IMS) is future work once a tenant genuinely needs it and the Governance
 * PR's ADR 0035 compatibility-seam prerequisite is ratified.
 */
import { assertDelegatedInventoryProviderContract } from '../contracts/delegatedInventoryProvider.contract.js';

export const buildManualDelegatedInventoryProvider = () => ({
    name: 'manual_entry',
    lookupStockLevel: async (skuCode) => ({
        found: false,
        provider: 'manual_entry',
        sku_code: skuCode,
        quantity_on_hand: null,
        as_of: null,
        reason: 'No external IMS is configured for this tenant yet - use the local mirror count.'
    })
});

export const manualDelegatedInventoryProvider = buildManualDelegatedInventoryProvider();

// Self-check against the port contract, mirroring stockCommandService.js's
// and itemRepository.js's load-time self-checks.
assertDelegatedInventoryProviderContract(manualDelegatedInventoryProvider);

export default manualDelegatedInventoryProvider;

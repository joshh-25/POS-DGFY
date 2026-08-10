/**
 * Feeds geo_items / geo_store_items / geo_item_aliases from the same per-tenant
 * catalog snapshot the Storefront Discovery index reconciliation already builds
 * (see storefrontDiscoveryIndexService.js), instead of relying on tenants to call
 * POST /store/inventory/push themselves. This keeps the geo-search tables roughly
 * as fresh as the Discovery index (same job, same cadence) rather than introducing
 * a second, independently-lagging data source.
 *
 * Always called fire-and-forget by the caller — errors are logged, never thrown,
 * so a geo-sync failure can never fail a Discovery index reconciliation pass.
 */
import { resolveItemId, upsertStoreItem } from '../../../workers/geoInventoryWorker.js';
import { geoSearchRepository } from '../repositories/geoSearchRepository.js';
import { matchCuisineCategoryHeads } from '../../shared/utils/publicSearchAliasPolicy.js';
import logger from '../../../config/logger.js';

const syncSnapshotItem = async ({ tenantId, entry }) => {
    const itemName = String(entry?.item_name || '').trim();
    if (!itemName) return;

    const geoItemId = await resolveItemId(itemName, tenantId);
    if (!geoItemId) return;

    const inStock = Array.isArray(entry?.in_stock_location_ids) && entry.in_stock_location_ids.length > 0;
    await upsertStoreItem({
        tenantId,
        locationId: null, // reconciliation snapshot is tenant-wide, not per-location
        itemId: geoItemId,
        skuCode: null,
        price: null,
        quantity: 0,
        inStock,
        storefrontVisible: true
    });

    const categoryHeads = matchCuisineCategoryHeads(`${itemName} ${entry?.category || ''}`);
    for (const head of categoryHeads) {
        await geoSearchRepository.ensureApprovedAlias(geoItemId, head);
    }
};

export const syncTenantGeoCatalog = async ({ tenantId, itemSearchSnapshot = [] }) => {
    if (!tenantId || !Array.isArray(itemSearchSnapshot) || itemSearchSnapshot.length === 0) return;

    for (const entry of itemSearchSnapshot) {
        try {
            await syncSnapshotItem({ tenantId, entry });
        } catch (error) {
            logger.warn('[GeoCatalogSync] Failed to sync catalog item', {
                tenantId,
                itemName: entry?.item_name || null,
                error: error?.message || 'unknown_error'
            });
        }
    }
};

export default { syncTenantGeoCatalog };

import { Op } from 'sequelize';
import dbStore from '../../../utils/dbStore.js';

const DRIFT_TOLERANCE = 0.0001;
const VALUATION_CACHE_TTL_MS = 60 * 1000;
const valuationCache = new Map();
const valuationCacheIndexByTenant = new Map();

const roundTo = (value, decimals = 4) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  const factor = 10 ** decimals;
  return Math.round(numeric * factor) / factor;
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parsePositiveInt = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const normalizeTenantId = () => (
  String(dbStore.getStore()?.tenantId || 'system')
);

const normalizeAuthEpoch = () => (
  String(dbStore.getStore()?.authEpoch || 'na')
);

const normalizeItemIds = (itemIds = []) => (
  [...new Set(
    itemIds
      .map((itemId) => Number(itemId))
      .filter((itemId) => Number.isInteger(itemId) && itemId > 0)
  )].sort((a, b) => a - b)
);

const buildValuationCacheKey = ({ tenantId, locationId = null, itemIds = [], authEpoch = 'na' }) => (
  `${tenantId}|${authEpoch}|${locationId ?? 'global'}|${itemIds.join(',')}`
);

const cloneMetricsMap = (sourceMap = new Map()) => new Map(
  Array.from(sourceMap.entries()).map(([key, value]) => ([
    key,
    value ? JSON.parse(JSON.stringify(value)) : value
  ]))
);

const getCachedValuationMetrics = (cacheKey) => {
  const cached = valuationCache.get(cacheKey);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    valuationCache.delete(cacheKey);
    return null;
  }
  return cloneMetricsMap(cached.metricsByItemId);
};

const indexCacheKey = ({ tenantId, cacheKey, itemIds = [], locationId = null }) => {
  const tenantIndex = valuationCacheIndexByTenant.get(tenantId) || new Map();
  tenantIndex.set(cacheKey, {
    itemIds: normalizeItemIds(itemIds),
    locationId: parsePositiveInt(locationId)
  });
  valuationCacheIndexByTenant.set(tenantId, tenantIndex);
};

const setCachedValuationMetrics = ({
  tenantId,
  locationId = null,
  itemIds = [],
  authEpoch = 'na',
  metricsByItemId = new Map()
}) => {
  const normalizedItemIds = normalizeItemIds(itemIds);
  if (normalizedItemIds.length === 0) return;

  const cacheKey = buildValuationCacheKey({
    tenantId,
    locationId,
    itemIds: normalizedItemIds,
    authEpoch
  });
  valuationCache.set(cacheKey, {
    expiresAt: Date.now() + VALUATION_CACHE_TTL_MS,
    metricsByItemId: cloneMetricsMap(metricsByItemId)
  });
  indexCacheKey({
    tenantId,
    cacheKey,
    itemIds: normalizedItemIds,
    locationId
  });
};

const removeCacheKey = ({ tenantId, cacheKey }) => {
  valuationCache.delete(cacheKey);
  const tenantIndex = valuationCacheIndexByTenant.get(tenantId);
  if (!tenantIndex) return;
  tenantIndex.delete(cacheKey);
  if (tenantIndex.size === 0) {
    valuationCacheIndexByTenant.delete(tenantId);
  }
};

const shouldInvalidateCacheEntry = ({
  entryItemIds = [],
  entryLocationId = null,
  requestedItemIds = [],
  requestedLocationIds = []
}) => {
  if (!Array.isArray(requestedItemIds) || requestedItemIds.length === 0) {
    return true;
  }
  const itemIdSet = new Set(requestedItemIds);
  const hasItemOverlap = entryItemIds.some((itemId) => itemIdSet.has(itemId));
  if (!hasItemOverlap) return false;
  if (!Array.isArray(requestedLocationIds) || requestedLocationIds.length === 0) {
    return true;
  }
  if (entryLocationId === null) return true;
  return requestedLocationIds.includes(entryLocationId);
};

const buildScopeMetrics = ({
  ledgerQty = 0,
  batchQty = 0,
  batchValue = 0,
  fallbackCost = 0
}) => {
  const normalizedLedgerQty = roundTo(ledgerQty, 4);
  const normalizedBatchQty = roundTo(batchQty, 4);
  const normalizedBatchValue = roundTo(batchValue, 4);
  const normalizedFallbackCost = roundTo(fallbackCost, 4);

  const hasOpenBatch = normalizedBatchQty > 0;
  const weightedAvgCost = hasOpenBatch
    ? roundTo(normalizedBatchValue / normalizedBatchQty, 4)
    : normalizedFallbackCost;
  const inventoryValue = hasOpenBatch
    ? normalizedBatchValue
    : roundTo(normalizedLedgerQty * normalizedFallbackCost, 4);
  const driftQty = roundTo(normalizedLedgerQty - normalizedBatchQty, 4);

  return {
    available_qty: hasOpenBatch ? normalizedBatchQty : normalizedLedgerQty,
    weighted_avg_cost: weightedAvgCost,
    inventory_value: inventoryValue,
    source: hasOpenBatch ? 'fifo_batches' : 'item_cost_fallback',
    diagnostics: {
      ledger_qty: normalizedLedgerQty,
      batch_qty: normalizedBatchQty,
      drift_qty: driftQty,
      has_drift: Math.abs(driftQty) > DRIFT_TOLERANCE,
      tolerance: DRIFT_TOLERANCE
    }
  };
};

const buildOpenBatchWhere = ({ itemIds = [], locationId = null }) => {
  const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
  const where = {
    item_id: { [Op.in]: itemIds }
  };

  if (typeof sequelize?.where === 'function' && typeof sequelize?.col === 'function') {
    where[Op.and] = [
      sequelize.where(
        sequelize.col('quantity'),
        Op.gt,
        sequelize.col('quantity_consumed')
      )
    ];
  }

  if (locationId !== null) {
    where.location_id = locationId;
  }

  return where;
};

const getBatchAggregateByItem = async ({ itemIds = [], locationId = null, transaction = null }) => {
  if (!Array.isArray(itemIds) || itemIds.length === 0) return new Map();

  const FIFOBatch = dbStore.get('FIFOBatch');
  const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
  if (
    !FIFOBatch?.findAll
    || typeof sequelize?.fn !== 'function'
    || typeof sequelize?.literal !== 'function'
  ) {
    return new Map();
  }

  const rows = await FIFOBatch.findAll({
    where: buildOpenBatchWhere({ itemIds, locationId }),
    attributes: [
      'item_id',
      [sequelize.fn('SUM', sequelize.literal('GREATEST(quantity - quantity_consumed, 0)')), 'batch_qty'],
      [sequelize.fn('SUM', sequelize.literal('GREATEST(quantity - quantity_consumed, 0) * COALESCE(cost_per_unit, 0)')), 'batch_value']
    ],
    group: ['item_id'],
    raw: true,
    ...(transaction ? { transaction } : {})
  });

  return rows.reduce((acc, row) => {
    acc.set(Number(row.item_id), {
      batch_qty: toNumber(row.batch_qty),
      batch_value: toNumber(row.batch_value)
    });
    return acc;
  }, new Map());
};

const getLocationStockByItem = async ({ itemIds = [], locationId, transaction = null }) => {
  const normalizedLocationId = parsePositiveInt(locationId);
  if (!normalizedLocationId || !Array.isArray(itemIds) || itemIds.length === 0) return new Map();

  const ItemLocationStock = dbStore.get('ItemLocationStock');
  if (!ItemLocationStock?.findAll) return new Map();

  const rows = await ItemLocationStock.findAll({
    where: {
      item_id: { [Op.in]: itemIds },
      location_id: normalizedLocationId
    },
    attributes: ['item_id', 'quantity_on_hand'],
    raw: true,
    ...(transaction ? { transaction } : {})
  });

  return rows.reduce((acc, row) => {
    acc.set(Number(row.item_id), toNumber(row.quantity_on_hand));
    return acc;
  }, new Map());
};

const buildDefaultCostMetrics = (item = {}, locationId = null) => {
  const fallbackCost = toNumber(item?.cost_per_unit);
  const globalLedgerQty = toNumber(item?.current_stock);
  const global = buildScopeMetrics({
    ledgerQty: globalLedgerQty,
    batchQty: 0,
    batchValue: 0,
    fallbackCost
  });

  const scopedLocationId = parsePositiveInt(locationId);
  return {
    global,
    ...(scopedLocationId ? {
      scoped: {
        location_id: scopedLocationId,
        ...buildScopeMetrics({
          ledgerQty: 0,
          batchQty: 0,
          batchValue: 0,
          fallbackCost
        })
      }
    } : {})
  };
};

export const getItemsCostMetrics = async ({
  items = [],
  locationId = null,
  transaction = null
}) => {
  const normalizedLocationId = parsePositiveInt(locationId);
  const itemRows = Array.isArray(items) ? items : [];
  const itemIds = normalizeItemIds(itemRows
    .map((item) => Number(item?.item_id || item?.id))
  );

  if (itemIds.length === 0) return new Map();

  const tenantId = normalizeTenantId();
  const authEpoch = normalizeAuthEpoch();
  const cacheKey = buildValuationCacheKey({
    tenantId,
    locationId: normalizedLocationId,
    itemIds,
    authEpoch
  });

  if (!transaction) {
    const cachedMetrics = getCachedValuationMetrics(cacheKey);
    if (cachedMetrics) return cachedMetrics;
  }

  const [globalBatchByItem, scopedBatchByItem, scopedStockByItem] = await Promise.all([
    getBatchAggregateByItem({ itemIds, transaction }),
    normalizedLocationId
      ? getBatchAggregateByItem({ itemIds, locationId: normalizedLocationId, transaction })
      : Promise.resolve(new Map()),
    normalizedLocationId
      ? getLocationStockByItem({ itemIds, locationId: normalizedLocationId, transaction })
      : Promise.resolve(new Map())
  ]);

  const metricsByItemId = new Map();

  itemRows.forEach((item) => {
    const itemId = Number(item?.item_id || item?.id);
    if (!Number.isInteger(itemId) || itemId <= 0) return;

    const fallbackCost = toNumber(item?.cost_per_unit);
    const globalLedgerQty = toNumber(item?.current_stock);
    const globalBatch = globalBatchByItem.get(itemId) || { batch_qty: 0, batch_value: 0 };
    const global = buildScopeMetrics({
      ledgerQty: globalLedgerQty,
      batchQty: globalBatch.batch_qty,
      batchValue: globalBatch.batch_value,
      fallbackCost
    });

    const itemMetrics = { global };

    if (normalizedLocationId) {
      const scopedBatch = scopedBatchByItem.get(itemId) || { batch_qty: 0, batch_value: 0 };
      const scopedLedgerQty = scopedStockByItem.get(itemId) || 0;
      itemMetrics.scoped = {
        location_id: normalizedLocationId,
        ...buildScopeMetrics({
          ledgerQty: scopedLedgerQty,
          batchQty: scopedBatch.batch_qty,
          batchValue: scopedBatch.batch_value,
          fallbackCost
        })
      };
    }

    metricsByItemId.set(itemId, itemMetrics);
  });

  if (!transaction) {
    setCachedValuationMetrics({
      tenantId,
      locationId: normalizedLocationId,
      itemIds,
      authEpoch,
      metricsByItemId
    });
  }

  return metricsByItemId;
};

export const getItemCostMetrics = async ({
  item = null,
  locationId = null,
  includeByLocation = false,
  transaction = null
}) => {
  if (!item || !item.item_id) {
    return buildDefaultCostMetrics({}, locationId);
  }

  const metricsByItemId = await getItemsCostMetrics({
    items: [item],
    locationId,
    transaction
  });

  const baseMetrics = metricsByItemId.get(Number(item.item_id))
    || buildDefaultCostMetrics(item, locationId);

  if (!includeByLocation) {
    return baseMetrics;
  }

  const byLocation = await getItemCostMetricsByLocation({
    item,
    transaction
  });

  return {
    ...baseMetrics,
    by_location: byLocation
  };
};

export const getItemCostMetricsByLocation = async ({
  item = null,
  transaction = null
}) => {
  if (!item || !item.item_id) return [];

  const ItemLocationStock = dbStore.get('ItemLocationStock');
  const TenantLocation = dbStore.get('TenantLocation');
  const FIFOBatch = dbStore.get('FIFOBatch');
  const itemId = Number(item.item_id);
  const fallbackCost = toNumber(item.cost_per_unit);

  const [locationStocks, batchRows] = await Promise.all([
    ItemLocationStock?.findAll
      ? ItemLocationStock.findAll({
        where: { item_id: itemId },
        include: [{
          model: TenantLocation,
          as: 'location',
          attributes: ['location_id', 'name'],
          required: false
        }],
        attributes: ['location_id', 'quantity_on_hand'],
        ...(transaction ? { transaction } : {})
      })
      : Promise.resolve([]),
    FIFOBatch?.findAll
      ? FIFOBatch.findAll({
        where: buildOpenBatchWhere({ itemIds: [itemId] }),
        attributes: ['location_id', 'quantity', 'quantity_consumed', 'cost_per_unit'],
        include: [{
          model: TenantLocation,
          as: 'location',
          attributes: ['location_id', 'name'],
          required: false
        }],
        ...(transaction ? { transaction } : {})
      })
      : Promise.resolve([])
  ]);

  const safeLocationStocks = Array.isArray(locationStocks) ? locationStocks : [];
  const safeBatchRows = Array.isArray(batchRows) ? batchRows : [];
  const locationRollup = new Map();

  safeLocationStocks.forEach((row) => {
    const payload = row.toJSON();
    const key = payload.location_id ?? 'unassigned';
    locationRollup.set(key, {
      location_id: payload.location_id ?? null,
      location_name: payload.location?.name || (payload.location_id ? `#${payload.location_id}` : 'Unassigned'),
      ledger_qty: toNumber(payload.quantity_on_hand),
      batch_qty: 0,
      batch_value: 0
    });
  });

  safeBatchRows.forEach((batch) => {
    const payload = batch.toJSON();
    const key = payload.location_id ?? 'unassigned';
    const availableQty = Math.max(0, toNumber(payload.quantity) - toNumber(payload.quantity_consumed));
    const batchValue = availableQty * toNumber(payload.cost_per_unit);
    if (availableQty <= 0) return;

    const existing = locationRollup.get(key) || {
      location_id: payload.location_id ?? null,
      location_name: payload.location?.name || (payload.location_id ? `#${payload.location_id}` : 'Unassigned'),
      ledger_qty: 0,
      batch_qty: 0,
      batch_value: 0
    };

    existing.batch_qty += availableQty;
    existing.batch_value += batchValue;
    locationRollup.set(key, existing);
  });

  return Array.from(locationRollup.values())
    .map((row) => ({
      location_id: row.location_id,
      location_name: row.location_name,
      ...buildScopeMetrics({
        ledgerQty: row.ledger_qty,
        batchQty: row.batch_qty,
        batchValue: row.batch_value,
        fallbackCost
      })
    }))
    .sort((a, b) => String(a.location_name || '').localeCompare(String(b.location_name || '')));
};

export const getWeightedInventoryValueOverview = async ({ transaction = null } = {}) => {
  const Item = dbStore.get('Item');
  const activeItems = await Item.findAll({
    where: { status: 'active', deleted_at: null },
    attributes: ['item_id', 'current_stock', 'cost_per_unit'],
    raw: true,
    ...(transaction ? { transaction } : {})
  });

  const metricsByItem = await getItemsCostMetrics({
    items: activeItems,
    transaction
  });

  let weightedTotalInventoryValue = 0;
  let weightedTotalAvailableQty = 0;
  let legacyTotalInventoryValue = 0;

  activeItems.forEach((item) => {
    const metrics = metricsByItem.get(Number(item.item_id));
    const global = metrics?.global;
    if (global) {
      weightedTotalInventoryValue += toNumber(global.inventory_value);
      weightedTotalAvailableQty += toNumber(global.available_qty);
    }
    legacyTotalInventoryValue += toNumber(item.current_stock) * toNumber(item.cost_per_unit);
  });

  return {
    weighted_total_inventory_value: roundTo(weightedTotalInventoryValue, 4),
    weighted_total_available_qty: roundTo(weightedTotalAvailableQty, 4),
    weighted_average_cost_per_unit: weightedTotalAvailableQty > 0
      ? roundTo(weightedTotalInventoryValue / weightedTotalAvailableQty, 4)
      : 0,
    legacy_total_inventory_value: roundTo(legacyTotalInventoryValue, 4)
  };
};

export const invalidateItemCostMetricsCache = ({
  tenantId = null,
  itemIds = [],
  locationIds = []
} = {}) => {
  const normalizedTenantId = tenantId ? String(tenantId) : normalizeTenantId();
  const tenantIndex = valuationCacheIndexByTenant.get(normalizedTenantId);
  if (!tenantIndex) return 0;

  const normalizedItemIds = normalizeItemIds(itemIds);
  const normalizedLocationIds = [...new Set(
    (Array.isArray(locationIds) ? locationIds : [])
      .map((locationId) => parsePositiveInt(locationId))
      .filter((locationId) => locationId !== null)
  )];

  let removedCount = 0;
  for (const [cacheKey, entry] of tenantIndex.entries()) {
    if (!shouldInvalidateCacheEntry({
      entryItemIds: entry.itemIds,
      entryLocationId: entry.locationId,
      requestedItemIds: normalizedItemIds,
      requestedLocationIds: normalizedLocationIds
    })) {
      continue;
    }
    removeCacheKey({ tenantId: normalizedTenantId, cacheKey });
    removedCount += 1;
  }

  return removedCount;
};

export default {
  getItemsCostMetrics,
  getItemCostMetrics,
  getItemCostMetricsByLocation,
  getWeightedInventoryValueOverview,
  invalidateItemCostMetricsCache
};

/**
 * The branch-inventory contract in one machine-readable place.
 *
 * This module is deliberately pure. It describes the operation boundaries and
 * evaluates evidence supplied by the read-only audit script; it never changes
 * settings, stock, movements, or historical records.
 */

export const MULTI_LOCATION_OPERATION_MATRIX = Object.freeze([
  Object.freeze({
    id: 'pos_catalog_read',
    endpoints: ['/api/v1/pos/catalog', '/api/v1/items'],
    authorization: 'authenticated + POS view permission (or inventory/catalog permission)',
    location: 'requested location_id; selected branch stock overlay',
    source_location: null,
    destination_location: null,
    ledger_effect: 'read item_location_stocks; no stock mutation',
    aggregate_effect: 'does not write items.current_stock'
  }),
  Object.freeze({
    id: 'storefront_catalog_read',
    endpoints: ['/api/v1/store/catalog'],
    authorization: 'tenant storefront context + public catalog policy',
    location: 'storefront location_id; selected branch stock overlay',
    source_location: null,
    destination_location: null,
    ledger_effect: 'read item_location_stocks; no stock mutation',
    aggregate_effect: 'does not write items.current_stock'
  }),
  Object.freeze({
    id: 'pos_sale_issue',
    endpoints: ['/api/v1/pos/checkouts'],
    authorization: 'authenticated + POS transact permission + paired terminal + open shift',
    location: 'active terminal shift location (checkout location is revalidated)',
    source_location: null,
    destination_location: 'active shift.location_id',
    ledger_effect: 'goods_issue stock movement at destination location; recipe/modifier issues use the same location',
    aggregate_effect: 'recompute items.current_stock as the sum of location balances'
  }),
  Object.freeze({
    id: 'online_order_reservation',
    endpoints: ['/api/v1/store/checkout'],
    authorization: 'store customer/guest checkout gates + selected branch availability',
    location: 'online order.location_id',
    source_location: null,
    destination_location: 'order.location_id',
    ledger_effect: 'create inventory_reservations and inventory_reservation_lines at the order location',
    aggregate_effect: 'reservation only; on-hand is unchanged until fulfillment'
  }),
  Object.freeze({
    id: 'online_order_completion',
    endpoints: ['/api/v1/pos/orders/:id/status'],
    authorization: 'authenticated + POS online-order permission + active shift',
    location: 'original online order.location_id; queue is shift-location scoped',
    source_location: null,
    destination_location: 'order.location_id',
    ledger_effect: 'goods_issue movement at the original order location; reservation converts',
    aggregate_effect: 'recompute items.current_stock as the sum of location balances'
  }),
  Object.freeze({
    id: 'stock_adjustment',
    endpoints: ['/api/v1/stock-movements', '/api/v1/stock-movements/bulk'],
    authorization: 'authenticated + stock:create_adjustment + location grant',
    location: 'request location_id; required when the multi-location flag is enabled with multiple active branches',
    source_location: null,
    destination_location: 'resolved movement location',
    ledger_effect: 'adjustment, purchase_receipt, return, production_output, goods_issue, or loss movement at one location',
    aggregate_effect: 'recompute items.current_stock from all item_location_stocks rows'
  }),
  Object.freeze({
    id: 'purchase_receive',
    endpoints: ['/api/v1/purchase-orders/:po_id/receive'],
    authorization: 'authenticated + orders:receive_po + local inventory-ledger ownership + location grant',
    location: 'required receipt location_id',
    source_location: null,
    destination_location: 'receipt.location_id',
    ledger_effect: 'purchase_receipt movement and FIFO batch at the receipt location',
    aggregate_effect: 'recompute items.current_stock from all location balances'
  }),
  Object.freeze({
    id: 'stock_transfer',
    endpoints: ['/api/v1/stock-movements (movement_type=transfer)'],
    authorization: 'authenticated + stock:create_adjustment + grants for both locations',
    location: 'source_location_id and destination_location_id; they must differ',
    source_location: 'request source_location_id',
    destination_location: 'request destination_location_id',
    ledger_effect: 'decrease source and increase destination; FIFO batches move location-by-location',
    aggregate_effect: 'aggregate total is unchanged after a successful transfer'
  }),
  Object.freeze({
    id: 'dispatch_issue',
    endpoints: ['/api/v1/dispatch-orders/:id/dispatch'],
    authorization: 'authenticated + dispatch:dispatch + location grant',
    location: 'requested dispatch location resolved by the inventory location policy',
    source_location: null,
    destination_location: 'resolved dispatch location',
    ledger_effect: 'goods_issue movement and FIFO consumption at the dispatch location',
    aggregate_effect: 'recompute items.current_stock from all location balances'
  }),
  Object.freeze({
    id: 'production_completion',
    endpoints: ['/api/v1/job-orders/:jo_id/complete'],
    authorization: 'authenticated + orders:complete_jo + grants for source and destination',
    location: 'source_location_id and destination_location_id are required and distinct',
    source_location: 'request source_location_id',
    destination_location: 'request destination_location_id',
    ledger_effect: 'production_consumption at source and production_output/FIFO batch at destination',
    aggregate_effect: 'recompute items.current_stock after both sides commit'
  }),
  Object.freeze({
    id: 'movement_void_or_sale_reversal',
    endpoints: ['/api/v1/stock-movements/:id/void', '/api/v1/pos/transactions/:id/void'],
    authorization: 'authenticated + source operation permission + original-location authorization',
    location: 'original movement or transaction location; never the current viewing branch',
    source_location: 'original movement source location for transfers',
    destination_location: 'original movement destination/location for transfers or issues',
    ledger_effect: 'audited counter-movement and FIFO restoration at the original location(s)',
    aggregate_effect: 'recompute items.current_stock from all location balances'
  })
]);

const asArray = (value) => (Array.isArray(value) ? value : []);
const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const hasPositiveCount = (value) => toNumber(value) > 0;

/**
 * Evaluate read-only evidence collected from one tenant.
 *
 * `findings` is intentionally stable and suitable for JSON artifacts and CI.
 * A disabled rollout flag is a warning, not a reason to mutate production.
 */
export const evaluateMultiLocationInventoryReadiness = ({
  settings = {},
  activeLocations = [],
  stockByLocation = [],
  movementCoverage = [],
  aggregateDriftRows = [],
  missingTables = [],
  tolerance = 0.0001
} = {}) => {
  const findings = [];
  const warnings = [];
  const locations = asArray(activeLocations);
  const requiredTables = new Set(asArray(missingTables).map((name) => String(name)));

  if (requiredTables.size > 0) {
    findings.push({
      code: 'REQUIRED_SCHEMA_MISSING',
      severity: 'blocking',
      details: { tables: [...requiredTables].sort() }
    });
  }

  if (locations.length === 0) {
    findings.push({
      code: 'NO_ACTIVE_LOCATIONS',
      severity: 'blocking',
      details: {}
    });
  }

  const noLocationSetting = String(settings.store_has_no_location ?? '').trim().toLowerCase();
  if (locations.length > 1 && ['1', 'true', 'yes', 'on'].includes(noLocationSetting)) {
    findings.push({
      code: 'NO_LOCATION_SETTING_CONFLICT',
      severity: 'blocking',
      details: {
        active_location_count: locations.length,
        setting_key: 'store_has_no_location',
        setting_value: settings.store_has_no_location
      }
    });
  }

  for (const row of asArray(movementCoverage)) {
    const missingLocationCount = toNumber(row.missing_location_count);
    const missingTransferCount = toNumber(row.missing_transfer_scope_count);
    if (hasPositiveCount(missingLocationCount) || hasPositiveCount(missingTransferCount)) {
      findings.push({
        code: 'UNSCOPED_STOCK_MOVEMENTS',
        severity: 'blocking',
        details: {
          movement_type: row.movement_type || null,
          total_count: toNumber(row.total_count),
          missing_location_count: missingLocationCount,
          missing_transfer_scope_count: missingTransferCount
        }
      });
    }
  }

  const driftRows = asArray(aggregateDriftRows).filter((row) => (
    Math.abs(toNumber(row.stock_drift)) > Number(tolerance)
  ));
  if (driftRows.length > 0) {
    findings.push({
      code: 'AGGREGATE_LOCATION_DRIFT',
      severity: 'blocking',
      details: {
        row_count: driftRows.length,
        max_abs_drift: driftRows.reduce((max, row) => Math.max(max, Math.abs(toNumber(row.stock_drift))), 0)
      }
    });
  }

  const flag = String(settings.multi_location_inventory_enabled ?? '').trim().toLowerCase();
  if (!['1', 'true', 'yes', 'on'].includes(flag)) {
    warnings.push({
      code: 'ROLLOUT_FLAG_DISABLED',
      severity: 'warning',
      details: {
        setting_key: 'multi_location_inventory_enabled',
        setting_value: settings.multi_location_inventory_enabled ?? null
      }
    });
  }

  return {
    status: findings.length === 0 ? 'ready_for_controlled_rollout_review' : 'blocked',
    operation_count: MULTI_LOCATION_OPERATION_MATRIX.length,
    active_location_count: locations.length,
    stock_by_location: asArray(stockByLocation),
    findings,
    warnings,
    rollout_flag_enabled: ['1', 'true', 'yes', 'on'].includes(flag)
  };
};

export default {
  MULTI_LOCATION_OPERATION_MATRIX,
  evaluateMultiLocationInventoryReadiness
};

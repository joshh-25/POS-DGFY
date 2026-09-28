import { describe, expect, it } from '@jest/globals';
import {
  MULTI_LOCATION_OPERATION_MATRIX,
  evaluateMultiLocationInventoryReadiness
} from '../src/modules/inventory/services/multiLocationInventoryReadiness.js';

describe('multi-location inventory readiness contract', () => {
  it('publishes a complete route, authorization, location, ledger, and aggregate matrix', () => {
    expect(MULTI_LOCATION_OPERATION_MATRIX.map((operation) => operation.id)).toEqual([
      'pos_catalog_read',
      'storefront_catalog_read',
      'pos_sale_issue',
      'online_order_reservation',
      'online_order_completion',
      'stock_adjustment',
      'purchase_receive',
      'stock_transfer',
      'dispatch_issue',
      'production_completion',
      'movement_void_or_sale_reversal'
    ]);
    for (const operation of MULTI_LOCATION_OPERATION_MATRIX) {
      expect(operation.id).toEqual(expect.any(String));
      expect(operation.endpoints.length).toBeGreaterThan(0);
      expect(operation.authorization).toEqual(expect.any(String));
      expect(operation.location).toEqual(expect.any(String));
      expect(operation).toHaveProperty('source_location');
      expect(operation).toHaveProperty('destination_location');
      expect(operation.ledger_effect).toEqual(expect.any(String));
      expect(operation.aggregate_effect).toEqual(expect.any(String));
    }
  });

  it('blocks conflicting no-location configuration and unscoped movements', () => {
    const result = evaluateMultiLocationInventoryReadiness({
      settings: {
        store_has_no_location: 'true',
        multi_location_inventory_enabled: 'false'
      },
      activeLocations: [{ location_id: 1 }, { location_id: 4 }],
      stockByLocation: [{ location_id: 1, quantity_on_hand: 10 }],
      movementCoverage: [{
        movement_type: 'goods_issue',
        total_count: 4,
        missing_location_count: 2,
        missing_transfer_scope_count: 0
      }]
    });

    expect(result.status).toBe('blocked');
    expect(result.findings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      'NO_LOCATION_SETTING_CONFLICT',
      'UNSCOPED_STOCK_MOVEMENTS'
    ]));
    expect(result.warnings[0].code).toBe('ROLLOUT_FLAG_DISABLED');
    expect(result.rollout_flag_enabled).toBe(false);
  });

  it('blocks aggregate drift but does not mutate or infer opening balances', () => {
    const stockByLocation = [{ location_id: 1, quantity_on_hand: 10 }];
    const result = evaluateMultiLocationInventoryReadiness({
      settings: { multi_location_inventory_enabled: 'true' },
      activeLocations: [{ location_id: 1 }],
      stockByLocation,
      aggregateDriftRows: [{ item_id: 73, stock_drift: 1.25 }]
    });

    expect(result.status).toBe('blocked');
    expect(result.findings[0]).toMatchObject({
      code: 'AGGREGATE_LOCATION_DRIFT',
      severity: 'blocking'
    });
    expect(stockByLocation).toEqual([{ location_id: 1, quantity_on_hand: 10 }]);
  });

  it('reports controlled-rollout readiness when evidence is complete', () => {
    const result = evaluateMultiLocationInventoryReadiness({
      settings: { multi_location_inventory_enabled: 'true', store_has_no_location: 'false' },
      activeLocations: [{ location_id: 1 }, { location_id: 4 }],
      stockByLocation: [
        { location_id: 1, quantity_on_hand: 10 },
        { location_id: 4, quantity_on_hand: 3 }
      ],
      movementCoverage: [
        { movement_type: 'goods_issue', total_count: 2, missing_location_count: 0, missing_transfer_scope_count: 0 }
      ],
      aggregateDriftRows: []
    });

    expect(result.status).toBe('ready_for_controlled_rollout_review');
    expect(result.findings).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.operation_count).toBe(MULTI_LOCATION_OPERATION_MATRIX.length);
  });
});

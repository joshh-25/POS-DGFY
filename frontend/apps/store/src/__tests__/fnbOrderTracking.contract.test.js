import { describe, expect, it, vi } from 'vitest';

import { createTrackingAdapterRegistry, fetchNormalizedTrackingEntity } from '../tracking/core.js';
import { fnbTrackingAdapter, getTrackingFlowForOrderMethod } from '../tracking/fnbAdapter.js';
import { extractTrackingMapCoordinates } from '../tracking/TrackingRouteMap.jsx';

describe('F&B storefront tracking contract', () => {
  it('normalizes F&B tracking PIN responses into timeline, totals, and line-item details', async () => {
    const requestJson = vi.fn().mockResolvedValue({
      status: 'preparing',
      status_label: 'Preparing',
      tracking_pin: 'SK-ABCD12',
      estimated_wait_minutes: 24,
      location: { name: 'Main', latitude: 10.7, longitude: 122.56 },
      order: {
        order_method: 'delivery',
        subtotal_amount: 250,
        delivery_fee: 20,
        service_fee_amount: 2.5,
        total_amount: 272.5,
        delivery_address: 'Iloilo City',
        items: [{ item_id: 10, item_name: 'Burger', quantity: 2, sale_price: 125 }]
      }
    });

    const registry = createTrackingAdapterRegistry([fnbTrackingAdapter]);
    const result = await fetchNormalizedTrackingEntity({
      registry,
      input: {
        mode: 'fnb',
        rawReference: 'sk-abcd12',
        storeSlug: 'demo-store'
      },
      requestJson
    });

    expect(requestJson).toHaveBeenCalledWith('/api/v1/store/track/SK-ABCD12', { storeSlug: 'demo-store' });
    expect(result.normalized).toMatchObject({
      mode: 'fnb',
      kind: 'order',
      reference: 'SK-ABCD12',
      statusCode: 'preparing',
      statusLabel: 'Preparing',
      orderMethod: 'delivery',
      etaMinutes: 24,
      subtotalAmount: 250,
      deliveryFee: 20,
      serviceFeeAmount: 2.5,
      totalAmount: 272.5,
      branchName: 'Main',
      deliveryAddress: 'Iloilo City'
    });
    expect(result.normalized.items).toEqual([
      expect.objectContaining({ name: 'Burger', qty: 2, amount: 250 })
    ]);
    expect(result.normalized.timeline.map((step) => step.id)).toEqual([
      'placed',
      'confirmed',
      'preparing',
      'out_for_delivery',
      'completed'
    ]);
  });

  it('keeps pickup and delivery tracking flows distinct', () => {
    expect(getTrackingFlowForOrderMethod('pickup').map((step) => step.id)).toContain('ready_for_pickup');
    expect(getTrackingFlowForOrderMethod('delivery').map((step) => step.id)).toContain('out_for_delivery');
  });

  it('extracts tracking map pins from tracking payloads with store fallbacks', () => {
    const pins = extractTrackingMapCoordinates(
      {
        raw: {
          order: {
            delivery_latitude: '10.72',
            delivery_longitude: '122.57'
          }
        }
      },
      { latitude: '10.70', longitude: '122.56' },
      null
    );

    expect(pins).toEqual({
      storePin: { latitude: 10.7, longitude: 122.56 },
      customerPin: { latitude: 10.72, longitude: 122.57 }
    });
  });
});
